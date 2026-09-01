import mongoose from "mongoose";
import Student from "../student/student.model.js";
import TransportBus from "./bus.model.js";
import TransportDriver from "./driver.model.js";
import TransportConductor from "./conductor.model.js";
import TransportRoute from "./route.model.js";
import BusRouteAssignment from "./busRouteAssignment.model.js";
import BusStaffAssignment from "./busStaffAssignment.model.js";
import StudentTransportAssignment from "./studentTransportAssignment.model.js";
import {
  resolveSchoolId,
  toObjectId,
  ok,
  fail,
  parseDateOnly,
  toISODateOnly,
  normalizeStatus,
  isActiveStatus,
  nextSequentialCode,
  studentSnapshotFromDoc,
} from "./transport.util.js";

const notDeleted = { isDeleted: { $ne: true } };

const requireSchool = (req, res) => {
  const schoolId = toObjectId(resolveSchoolId(req));
  if (!schoolId) {
    fail(res, 400, "School context missing");
    return null;
  }
  return schoolId;
};

const buildSearchFilter = (search, fields) => {
  if (!search) return {};
  const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return { $or: fields.map((f) => ({ [f]: rx })) };
};

// ─── Buses ───────────────────────────────────────────────────────────────────

export const listBuses = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const status = req.query.status ? normalizeStatus(req.query.status) : null;
    const filter = { schoolId, ...notDeleted };
    if (status) filter.status = status;
    Object.assign(filter, buildSearchFilter(req.query.search, ["busIdentity", "busName", "registrationNumber"]));
    const items = await TransportBus.find(filter).sort({ createdAt: -1 }).lean();
    return ok(res, { data: items });
  } catch (err) {
    next(err);
  }
};

export const createBus = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const body = req.body || {};
    const busIdentity = String(body.busIdentity || "").trim();
    const registrationNumber = String(body.registrationNumber || "").trim();
    const seatingCapacity = Number(body.seatingCapacity);
    if (!busIdentity) return fail(res, 400, "busIdentity is required");
    if (!registrationNumber) return fail(res, 400, "registrationNumber is required");
    if (!Number.isFinite(seatingCapacity) || seatingCapacity < 1) {
      return fail(res, 400, "seatingCapacity must be at least 1");
    }
    const busCode = await nextSequentialCode(TransportBus, schoolId, "BUS", "busCode");
    const doc = await TransportBus.create({
      schoolId,
      busCode,
      busIdentity,
      busName: String(body.busName || "").trim(),
      registrationNumber,
      busType: String(body.busType || "").trim(),
      seatingCapacity,
      model: String(body.model || "").trim(),
      photoUrl: String(body.photoUrl || "").trim(),
      fitnessValidTill: parseDateOnly(body.fitnessValidTill),
      insuranceExpiryDate: parseDateOnly(body.insuranceExpiryDate),
      permitExpiryDate: parseDateOnly(body.permitExpiryDate),
      gpsAvailable: Boolean(body.gpsAvailable),
      gpsDeviceId: String(body.gpsDeviceId || "").trim(),
      status: normalizeStatus(body.status),
      remarks: String(body.remarks || "").trim(),
      createdBy: req.user?._id,
    });
    return ok(res, { data: doc, message: "Bus created" });
  } catch (err) {
    if (err?.code === 11000) return fail(res, 409, "Bus identity or registration number already exists");
    next(err);
  }
};

export const updateBus = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const bus = await TransportBus.findOne({ _id: req.params.id, schoolId, ...notDeleted });
    if (!bus) return fail(res, 404, "Bus not found");
    const body = req.body || {};
    const fields = [
      "busIdentity", "busName", "registrationNumber", "busType", "model", "photoUrl",
      "gpsDeviceId", "remarks",
    ];
    fields.forEach((f) => {
      if (body[f] !== undefined) bus[f] = String(body[f]).trim();
    });
    if (body.seatingCapacity !== undefined) {
      const cap = Number(body.seatingCapacity);
      if (!Number.isFinite(cap) || cap < 1) return fail(res, 400, "Invalid seatingCapacity");
      bus.seatingCapacity = cap;
    }
    if (body.gpsAvailable !== undefined) bus.gpsAvailable = Boolean(body.gpsAvailable);
    if (body.status !== undefined) bus.status = normalizeStatus(body.status);
    if (body.fitnessValidTill !== undefined) bus.fitnessValidTill = parseDateOnly(body.fitnessValidTill);
    if (body.insuranceExpiryDate !== undefined) bus.insuranceExpiryDate = parseDateOnly(body.insuranceExpiryDate);
    if (body.permitExpiryDate !== undefined) bus.permitExpiryDate = parseDateOnly(body.permitExpiryDate);
    await bus.save();
    return ok(res, { data: bus, message: "Bus updated" });
  } catch (err) {
    if (err?.code === 11000) return fail(res, 409, "Bus identity or registration number already exists");
    next(err);
  }
};

export const deactivateBus = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const bus = await TransportBus.findOne({ _id: req.params.id, schoolId, ...notDeleted });
    if (!bus) return fail(res, 404, "Bus not found");
    bus.status = "inactive";
    await bus.save();
    return ok(res, { data: bus, message: "Bus deactivated" });
  } catch (err) {
    next(err);
  }
};

// ─── Drivers ─────────────────────────────────────────────────────────────────

export const listDrivers = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const filter = { schoolId, ...notDeleted };
    if (req.query.status) filter.status = normalizeStatus(req.query.status);
    Object.assign(filter, buildSearchFilter(req.query.search, ["name", "mobile", "licenceNumber"]));
    const items = await TransportDriver.find(filter).sort({ createdAt: -1 }).lean();
    return ok(res, { data: items });
  } catch (err) {
    next(err);
  }
};

export const createDriver = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const mobile = String(body.mobile || "").trim();
    if (!name || !mobile) return fail(res, 400, "name and mobile are required");
    const driverCode = await nextSequentialCode(TransportDriver, schoolId, "DRV", "driverCode");
    const doc = await TransportDriver.create({
      schoolId,
      driverCode,
      name,
      mobile,
      photoUrl: String(body.photoUrl || "").trim(),
      alternateMobile: String(body.alternateMobile || "").trim(),
      address: String(body.address || "").trim(),
      licenceNumber: String(body.licenceNumber || "").trim(),
      licenceType: String(body.licenceType || "").trim(),
      licenceIssueDate: parseDateOnly(body.licenceIssueDate),
      licenceExpiryDate: parseDateOnly(body.licenceExpiryDate),
      joiningDate: parseDateOnly(body.joiningDate),
      experience: String(body.experience || "").trim(),
      emergencyContactName: String(body.emergencyContactName || "").trim(),
      emergencyContactNumber: String(body.emergencyContactNumber || "").trim(),
      status: normalizeStatus(body.status),
      remarks: String(body.remarks || "").trim(),
      createdBy: req.user?._id,
    });
    return ok(res, { data: doc, message: "Driver created" });
  } catch (err) {
    next(err);
  }
};

export const updateDriver = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const driver = await TransportDriver.findOne({ _id: req.params.id, schoolId, ...notDeleted });
    if (!driver) return fail(res, 404, "Driver not found");
    const body = req.body || {};
    const fields = [
      "name", "mobile", "alternateMobile", "address", "photoUrl", "licenceNumber",
      "licenceType", "experience", "emergencyContactName", "emergencyContactNumber", "remarks",
    ];
    fields.forEach((f) => {
      if (body[f] !== undefined) driver[f] = String(body[f]).trim();
    });
    if (body.status !== undefined) driver.status = normalizeStatus(body.status);
    if (body.licenceIssueDate !== undefined) driver.licenceIssueDate = parseDateOnly(body.licenceIssueDate);
    if (body.licenceExpiryDate !== undefined) driver.licenceExpiryDate = parseDateOnly(body.licenceExpiryDate);
    if (body.joiningDate !== undefined) driver.joiningDate = parseDateOnly(body.joiningDate);
    await driver.save();
    return ok(res, { data: driver, message: "Driver updated" });
  } catch (err) {
    next(err);
  }
};

export const deactivateDriver = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const driver = await TransportDriver.findOne({ _id: req.params.id, schoolId, ...notDeleted });
    if (!driver) return fail(res, 404, "Driver not found");
    driver.status = "inactive";
    await driver.save();
    return ok(res, { data: driver, message: "Driver deactivated" });
  } catch (err) {
    next(err);
  }
};

// ─── Conductors ──────────────────────────────────────────────────────────────

export const listConductors = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const filter = { schoolId, ...notDeleted };
    if (req.query.status) filter.status = normalizeStatus(req.query.status);
    Object.assign(filter, buildSearchFilter(req.query.search, ["name", "mobile", "idProofNumber"]));
    const items = await TransportConductor.find(filter).sort({ createdAt: -1 }).lean();
    return ok(res, { data: items });
  } catch (err) {
    next(err);
  }
};

export const createConductor = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const mobile = String(body.mobile || "").trim();
    if (!name || !mobile) return fail(res, 400, "name and mobile are required");
    const conductorCode = await nextSequentialCode(TransportConductor, schoolId, "CON", "conductorCode");
    const doc = await TransportConductor.create({
      schoolId,
      conductorCode,
      name,
      mobile,
      photoUrl: String(body.photoUrl || "").trim(),
      alternateMobile: String(body.alternateMobile || "").trim(),
      address: String(body.address || "").trim(),
      idProofNumber: String(body.idProofNumber || "").trim(),
      joiningDate: parseDateOnly(body.joiningDate),
      experience: String(body.experience || "").trim(),
      emergencyContactName: String(body.emergencyContactName || "").trim(),
      emergencyContactNumber: String(body.emergencyContactNumber || "").trim(),
      status: normalizeStatus(body.status),
      remarks: String(body.remarks || "").trim(),
      createdBy: req.user?._id,
    });
    return ok(res, { data: doc, message: "Conductor created" });
  } catch (err) {
    next(err);
  }
};

export const updateConductor = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const conductor = await TransportConductor.findOne({ _id: req.params.id, schoolId, ...notDeleted });
    if (!conductor) return fail(res, 404, "Conductor not found");
    const body = req.body || {};
    const fields = [
      "name", "mobile", "alternateMobile", "address", "photoUrl", "idProofNumber",
      "experience", "emergencyContactName", "emergencyContactNumber", "remarks",
    ];
    fields.forEach((f) => {
      if (body[f] !== undefined) conductor[f] = String(body[f]).trim();
    });
    if (body.status !== undefined) conductor.status = normalizeStatus(body.status);
    if (body.joiningDate !== undefined) conductor.joiningDate = parseDateOnly(body.joiningDate);
    await conductor.save();
    return ok(res, { data: conductor, message: "Conductor updated" });
  } catch (err) {
    next(err);
  }
};

export const deactivateConductor = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const conductor = await TransportConductor.findOne({ _id: req.params.id, schoolId, ...notDeleted });
    if (!conductor) return fail(res, 404, "Conductor not found");
    conductor.status = "inactive";
    await conductor.save();
    return ok(res, { data: conductor, message: "Conductor deactivated" });
  } catch (err) {
    next(err);
  }
};

// ─── Routes ──────────────────────────────────────────────────────────────────

const normalizeStops = (stops = []) => {
  if (!Array.isArray(stops)) return [];
  return stops
    .map((s, idx) => ({
      stopName: String(s.stopName || "").trim(),
      stopSequence: Number(s.stopSequence) || idx + 1,
      pickupTime: String(s.pickupTime || "").trim(),
      dropTime: String(s.dropTime || "").trim(),
      distance: s.distance != null && s.distance !== "" ? Number(s.distance) : null,
      latitude: s.latitude != null && s.latitude !== "" ? Number(s.latitude) : null,
      longitude: s.longitude != null && s.longitude !== "" ? Number(s.longitude) : null,
      status: normalizeStatus(s.status || "active"),
      _id: s._id && mongoose.Types.ObjectId.isValid(s._id) ? s._id : undefined,
    }))
    .filter((s) => s.stopName)
    .sort((a, b) => a.stopSequence - b.stopSequence);
};

export const listRoutes = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const filter = { schoolId, ...notDeleted };
    if (req.query.status) filter.status = normalizeStatus(req.query.status);
    Object.assign(filter, buildSearchFilter(req.query.search, ["routeName", "routeCode", "startPoint", "endPoint"]));
    const items = await TransportRoute.find(filter).sort({ createdAt: -1 }).lean();
    return ok(res, { data: items });
  } catch (err) {
    next(err);
  }
};

export const createRoute = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const body = req.body || {};
    const routeName = String(body.routeName || "").trim();
    if (!routeName) return fail(res, 400, "routeName is required");
    const routeCode = await nextSequentialCode(TransportRoute, schoolId, "RT", "routeCode");
    const stops = normalizeStops(body.stops);
    const doc = await TransportRoute.create({
      schoolId,
      routeCode,
      routeName,
      routeDescription: String(body.routeDescription || "").trim(),
      startPoint: String(body.startPoint || "").trim(),
      endPoint: String(body.endPoint || "").trim(),
      stops,
      status: normalizeStatus(body.status),
      remarks: String(body.remarks || "").trim(),
      createdBy: req.user?._id,
    });
    return ok(res, { data: doc, message: "Route created" });
  } catch (err) {
    if (err?.code === 11000) return fail(res, 409, "Route code already exists");
    next(err);
  }
};

export const updateRoute = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const route = await TransportRoute.findOne({ _id: req.params.id, schoolId, ...notDeleted });
    if (!route) return fail(res, 404, "Route not found");
    const body = req.body || {};
    ["routeName", "routeDescription", "startPoint", "endPoint", "remarks"].forEach((f) => {
      if (body[f] !== undefined) route[f] = String(body[f]).trim();
    });
    if (body.status !== undefined) route.status = normalizeStatus(body.status);
    if (body.stops !== undefined) route.stops = normalizeStops(body.stops);
    await route.save();
    return ok(res, { data: route, message: "Route updated" });
  } catch (err) {
    next(err);
  }
};

export const updateRouteStops = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const route = await TransportRoute.findOne({ _id: req.params.id, schoolId, ...notDeleted });
    if (!route) return fail(res, 404, "Route not found");
    route.stops = normalizeStops(req.body?.stops);
    await route.save();
    return ok(res, { data: route, message: "Route stops updated" });
  } catch (err) {
    next(err);
  }
};

export const deactivateRoute = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const route = await TransportRoute.findOne({ _id: req.params.id, schoolId, ...notDeleted });
    if (!route) return fail(res, 404, "Route not found");
    route.status = "inactive";
    await route.save();
    return ok(res, { data: route, message: "Route deactivated" });
  } catch (err) {
    next(err);
  }
};

// ─── Helpers for assignments ─────────────────────────────────────────────────

const getRouteStop = (route, stopId) => {
  if (!route?.stops?.length || !stopId) return null;
  return route.stops.find((s) => String(s._id) === String(stopId)) || null;
};

const countActiveStudentsOnBus = async (schoolId, busId, excludeAssignmentId = null) => {
  const filter = { schoolId, busId, status: "active" };
  if (excludeAssignmentId) filter._id = { $ne: excludeAssignmentId };
  return StudentTransportAssignment.countDocuments(filter);
};

const endPrimaryStaff = async (schoolId, busId, staffType) => {
  await BusStaffAssignment.updateMany(
    { schoolId, busId, staffType, status: "active", isPrimary: true },
    { status: "inactive", effectiveTo: new Date() },
  );
};

// ─── Bus-Route Assignments ───────────────────────────────────────────────────

export const listBusRouteAssignments = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const filter = { schoolId };
    if (req.query.busId) filter.busId = req.query.busId;
    if (req.query.routeId) filter.routeId = req.query.routeId;
    if (req.query.status) filter.status = normalizeStatus(req.query.status);
    else if (req.query.includeHistory !== "true") filter.status = "active";
    const items = await BusRouteAssignment.find(filter)
      .populate("busId", "busIdentity busName registrationNumber status")
      .populate("routeId", "routeName routeCode status")
      .sort({ createdAt: -1 })
      .lean();
    return ok(res, { data: items });
  } catch (err) {
    next(err);
  }
};

export const createBusRouteAssignment = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const body = req.body || {};
    const busId = toObjectId(body.busId);
    const routeId = toObjectId(body.routeId);
    if (!busId || !routeId) return fail(res, 400, "busId and routeId are required");
    const bus = await TransportBus.findOne({ _id: busId, schoolId, ...notDeleted });
    const route = await TransportRoute.findOne({ _id: routeId, schoolId, ...notDeleted });
    if (!bus) return fail(res, 404, "Bus not found");
    if (!route) return fail(res, 404, "Route not found");
    if (!isActiveStatus(bus.status)) return fail(res, 400, "Cannot assign inactive bus");
    if (!isActiveStatus(route.status)) return fail(res, 400, "Cannot assign inactive route");
    const doc = await BusRouteAssignment.create({
      schoolId,
      busId,
      routeId,
      shift: body.shift || "Morning",
      startTime: String(body.startTime || "").trim(),
      endTime: String(body.endTime || "").trim(),
      effectiveFrom: parseDateOnly(body.effectiveFrom) || new Date(),
      effectiveTo: parseDateOnly(body.effectiveTo),
      status: normalizeStatus(body.status),
      createdBy: req.user?._id,
    });
    return ok(res, { data: doc, message: "Bus-route assignment created" });
  } catch (err) {
    next(err);
  }
};

export const updateBusRouteAssignment = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const doc = await BusRouteAssignment.findOne({ _id: req.params.id, schoolId });
    if (!doc) return fail(res, 404, "Assignment not found");
    const body = req.body || {};
    if (body.shift !== undefined) doc.shift = body.shift;
    if (body.startTime !== undefined) doc.startTime = String(body.startTime).trim();
    if (body.endTime !== undefined) doc.endTime = String(body.endTime).trim();
    if (body.effectiveFrom !== undefined) doc.effectiveFrom = parseDateOnly(body.effectiveFrom);
    if (body.effectiveTo !== undefined) doc.effectiveTo = parseDateOnly(body.effectiveTo);
    if (body.status !== undefined) doc.status = normalizeStatus(body.status);
    await doc.save();
    return ok(res, { data: doc, message: "Assignment updated" });
  } catch (err) {
    next(err);
  }
};

// ─── Staff Assignments ───────────────────────────────────────────────────────

export const listBusStaffAssignments = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const filter = { schoolId };
    if (req.query.busId) filter.busId = req.query.busId;
    if (req.query.staffType) filter.staffType = req.query.staffType;
    if (req.query.status) filter.status = normalizeStatus(req.query.status);
    if (req.query.includeHistory !== "true") filter.status = filter.status || "active";
    const items = await BusStaffAssignment.find(filter).sort({ createdAt: -1 }).lean();
    const enriched = await Promise.all(
      items.map(async (row) => {
        let staff = null;
        if (row.staffType === "driver") {
          staff = await TransportDriver.findById(row.staffId).select("name mobile status driverCode").lean();
        } else {
          staff = await TransportConductor.findById(row.staffId).select("name mobile status conductorCode").lean();
        }
        const bus = await TransportBus.findById(row.busId).select("busIdentity busName registrationNumber").lean();
        return { ...row, staff, bus };
      }),
    );
    return ok(res, { data: enriched });
  } catch (err) {
    next(err);
  }
};

export const createBusStaffAssignment = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const body = req.body || {};
    const busId = toObjectId(body.busId);
    const staffId = toObjectId(body.staffId);
    const staffType = String(body.staffType || "").toLowerCase();
    if (!busId || !staffId) return fail(res, 400, "busId and staffId are required");
    if (!["driver", "conductor"].includes(staffType)) return fail(res, 400, "staffType must be driver or conductor");
    const bus = await TransportBus.findOne({ _id: busId, schoolId, ...notDeleted });
    if (!bus) return fail(res, 404, "Bus not found");
    if (!isActiveStatus(bus.status)) return fail(res, 400, "Cannot assign to inactive bus");
    const StaffModel = staffType === "driver" ? TransportDriver : TransportConductor;
    const staff = await StaffModel.findOne({ _id: staffId, schoolId, ...notDeleted });
    if (!staff) return fail(res, 404, `${staffType} not found`);
    if (!isActiveStatus(staff.status)) return fail(res, 400, `Cannot assign inactive ${staffType}`);
    if (body.isPrimary !== false) {
      await endPrimaryStaff(schoolId, busId, staffType);
    }
    const doc = await BusStaffAssignment.create({
      schoolId,
      busId,
      staffType,
      staffId,
      shift: body.shift || "Both",
      isPrimary: body.isPrimary !== false,
      effectiveFrom: parseDateOnly(body.effectiveFrom) || new Date(),
      effectiveTo: parseDateOnly(body.effectiveTo),
      status: "active",
      createdBy: req.user?._id,
    });
    return ok(res, { data: doc, message: "Staff assignment created" });
  } catch (err) {
    next(err);
  }
};

export const updateBusStaffAssignment = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const doc = await BusStaffAssignment.findOne({ _id: req.params.id, schoolId });
    if (!doc) return fail(res, 404, "Assignment not found");
    const body = req.body || {};
    if (body.status === "inactive") {
      doc.status = "inactive";
      doc.effectiveTo = parseDateOnly(body.effectiveTo) || new Date();
    }
    if (body.shift !== undefined) doc.shift = body.shift;
    await doc.save();
    return ok(res, { data: doc, message: "Staff assignment updated" });
  } catch (err) {
    next(err);
  }
};

// ─── Student Assignments ─────────────────────────────────────────────────────

export const listStudentAssignments = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const filter = { schoolId };
    if (req.query.busId) filter.busId = req.query.busId;
    if (req.query.routeId) filter.routeId = req.query.routeId;
    if (req.query.studentId) filter.studentId = req.query.studentId;
    if (req.query.className) filter.className = req.query.className;
    if (req.query.section) filter.section = req.query.section;
    if (req.query.includeHistory !== "true") filter.status = "active";
    else if (req.query.status) filter.status = normalizeStatus(req.query.status);
    Object.assign(filter, buildSearchFilter(req.query.search, ["studentName", "admissionNumber", "parentName", "parentMobile"]));
    const items = await StudentTransportAssignment.find(filter).sort({ createdAt: -1 }).lean();
    return ok(res, { data: items });
  } catch (err) {
    next(err);
  }
};

const validateStudentAssignmentPayload = async (schoolId, body, excludeId = null) => {
  const studentId = toObjectId(body.studentId);
  const busId = toObjectId(body.busId);
  const routeId = toObjectId(body.routeId);
  const pickupStopId = body.pickupStopId;
  const dropStopId = body.dropStopId;
  if (!studentId || !busId || !routeId || !pickupStopId || !dropStopId) {
    return { error: "studentId, busId, routeId, pickupStopId and dropStopId are required" };
  }
  const student = await Student.findOne({ _id: studentId, schoolId }).lean();
  if (!student) return { error: "Student not found" };
  const bus = await TransportBus.findOne({ _id: busId, schoolId, ...notDeleted });
  if (!bus) return { error: "Bus not found" };
  if (!isActiveStatus(bus.status)) return { error: "Cannot assign student to inactive bus" };
  const route = await TransportRoute.findOne({ _id: routeId, schoolId, ...notDeleted });
  if (!route) return { error: "Route not found" };
  if (!isActiveStatus(route.status)) return { error: "Cannot assign student to inactive route" };
  const pickupStop = getRouteStop(route, pickupStopId);
  const dropStop = getRouteStop(route, dropStopId);
  if (!pickupStop) return { error: "Pickup stop must belong to selected route" };
  if (!dropStop) return { error: "Drop stop must belong to selected route" };
  const activeExisting = await StudentTransportAssignment.findOne({
    schoolId,
    studentId,
    status: "active",
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  });
  if (activeExisting) return { error: "Student already has an active transport assignment" };
  const activeCount = await countActiveStudentsOnBus(schoolId, busId, excludeId);
  if (activeCount >= bus.seatingCapacity) {
    return { error: "Bus capacity is full.", status: 409 };
  }
  return { student, bus, route, pickupStop, dropStop };
};

export const createStudentAssignment = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const validation = await validateStudentAssignmentPayload(schoolId, req.body);
    if (validation.error) return fail(res, validation.status || 400, validation.error);
    const { student, route, pickupStop, dropStop } = validation;
    const snapshot = studentSnapshotFromDoc(student);
    const doc = await StudentTransportAssignment.create({
      schoolId,
      studentId: student._id,
      ...snapshot,
      busId: req.body.busId,
      routeId: req.body.routeId,
      pickupStopId: pickupStop._id,
      dropStopId: dropStop._id,
      pickupStopName: pickupStop.stopName,
      dropStopName: dropStop.stopName,
      pickupTime: String(req.body.pickupTime || pickupStop.pickupTime || "").trim(),
      dropTime: String(req.body.dropTime || dropStop.dropTime || "").trim(),
      transportType: req.body.transportType || "Both",
      effectiveFrom: parseDateOnly(req.body.effectiveFrom) || new Date(),
      effectiveTo: parseDateOnly(req.body.effectiveTo),
      status: "active",
      createdBy: req.user?._id,
    });
    return ok(res, { data: doc, message: "Student transport assignment created" });
  } catch (err) {
    next(err);
  }
};

export const transferStudentAssignment = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const existing = await StudentTransportAssignment.findOne({
      _id: req.params.id,
      schoolId,
      status: "active",
    });
    if (!existing) return fail(res, 404, "Active assignment not found");
    existing.status = "inactive";
    existing.effectiveTo = parseDateOnly(req.body?.effectiveTo) || new Date();
    await existing.save();
    const validation = await validateStudentAssignmentPayload(schoolId, req.body);
    if (validation.error) return fail(res, validation.status || 400, validation.error);
    const { student, pickupStop, dropStop } = validation;
    const snapshot = studentSnapshotFromDoc(student);
    const doc = await StudentTransportAssignment.create({
      schoolId,
      studentId: student._id,
      ...snapshot,
      busId: req.body.busId,
      routeId: req.body.routeId,
      pickupStopId: pickupStop._id,
      dropStopId: dropStop._id,
      pickupStopName: pickupStop.stopName,
      dropStopName: dropStop.stopName,
      pickupTime: String(req.body.pickupTime || pickupStop.pickupTime || "").trim(),
      dropTime: String(req.body.dropTime || dropStop.dropTime || "").trim(),
      transportType: req.body.transportType || existing.transportType,
      effectiveFrom: parseDateOnly(req.body.effectiveFrom) || new Date(),
      effectiveTo: parseDateOnly(req.body.effectiveTo),
      status: "active",
      createdBy: req.user?._id,
    });
    return ok(res, { data: { previous: existing, current: doc }, message: "Student transferred" });
  } catch (err) {
    next(err);
  }
};

export const deactivateStudentAssignment = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const doc = await StudentTransportAssignment.findOne({ _id: req.params.id, schoolId, status: "active" });
    if (!doc) return fail(res, 404, "Active assignment not found");
    doc.status = "inactive";
    doc.effectiveTo = new Date();
    await doc.save();
    return ok(res, { data: doc, message: "Assignment ended" });
  } catch (err) {
    next(err);
  }
};

export const listBusStudents = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const busId = req.params.id;
    const bus = await TransportBus.findOne({ _id: busId, schoolId, ...notDeleted }).lean();
    if (!bus) return fail(res, 404, "Bus not found");
    const students = await StudentTransportAssignment.find({ schoolId, busId, status: "active" })
      .sort({ className: 1, section: 1, studentName: 1 })
      .lean();
    return ok(res, { data: { bus, students, assignedCount: students.length } });
  } catch (err) {
    next(err);
  }
};

export const listRouteStudents = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const routeId = req.params.id;
    const route = await TransportRoute.findOne({ _id: routeId, schoolId, ...notDeleted }).lean();
    if (!route) return fail(res, 404, "Route not found");
    const students = await StudentTransportAssignment.find({ schoolId, routeId, status: "active" })
      .sort({ className: 1, section: 1, studentName: 1 })
      .lean();
    const activeBusRoute = await BusRouteAssignment.findOne({ schoolId, routeId, status: "active" })
      .populate("busId", "busIdentity busName registrationNumber seatingCapacity status")
      .lean();
    let driver = null;
    let conductor = null;
    if (activeBusRoute?.busId?._id) {
      const busId = activeBusRoute.busId._id;
      const driverAssign = await BusStaffAssignment.findOne({
        schoolId, busId, staffType: "driver", status: "active", isPrimary: true,
      }).lean();
      const conductorAssign = await BusStaffAssignment.findOne({
        schoolId, busId, staffType: "conductor", status: "active", isPrimary: true,
      }).lean();
      if (driverAssign) driver = await TransportDriver.findById(driverAssign.staffId).lean();
      if (conductorAssign) conductor = await TransportConductor.findById(conductorAssign.staffId).lean();
    }
    return ok(res, {
      data: {
        route,
        bus: activeBusRoute?.busId || null,
        driver,
        conductor,
        students,
        assignedCount: students.length,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const listUnassignedStudents = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const assignedIds = await StudentTransportAssignment.distinct("studentId", {
      schoolId,
      status: "active",
    });
    const filter = { schoolId, _id: { $nin: assignedIds } };
    if (req.query.className) filter.className = req.query.className;
    if (req.query.section) filter.section = req.query.section;
    Object.assign(filter, buildSearchFilter(req.query.search, ["name", "admissionNumber"]));
    const students = await Student.find(filter)
      .select("name admissionNumber className section parents")
      .sort({ className: 1, section: 1, name: 1 })
      .limit(Math.min(Number(req.query.limit) || 100, 500))
      .lean();
    return ok(res, { data: students, total: students.length });
  } catch (err) {
    next(err);
  }
};

// ─── Dashboard ───────────────────────────────────────────────────────────────

export const getTransportDashboard = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const [totalBuses, activeBuses, totalRoutes, totalDrivers, totalConductors] = await Promise.all([
      TransportBus.countDocuments({ schoolId, ...notDeleted }),
      TransportBus.countDocuments({ schoolId, ...notDeleted, status: "active" }),
      TransportRoute.countDocuments({ schoolId, ...notDeleted }),
      TransportDriver.countDocuments({ schoolId, ...notDeleted }),
      TransportConductor.countDocuments({ schoolId, ...notDeleted }),
    ]);
    const transportStudents = await StudentTransportAssignment.countDocuments({ schoolId, status: "active" });
    const assignedStudentIds = await StudentTransportAssignment.distinct("studentId", { schoolId, status: "active" });
    const totalStudents = await Student.countDocuments({ schoolId });
    const unassignedStudents = Math.max(0, totalStudents - assignedStudentIds.length);
    const buses = await TransportBus.find({ schoolId, ...notDeleted }).sort({ busIdentity: 1 }).lean();
    const busSummaries = await Promise.all(
      buses.map(async (bus) => {
        const studentCount = await StudentTransportAssignment.countDocuments({
          schoolId, busId: bus._id, status: "active",
        });
        const routeAssign = await BusRouteAssignment.findOne({
          schoolId, busId: bus._id, status: "active",
        }).populate("routeId", "routeName routeCode").lean();
        const driverAssign = await BusStaffAssignment.findOne({
          schoolId, busId: bus._id, staffType: "driver", status: "active", isPrimary: true,
        }).lean();
        const conductorAssign = await BusStaffAssignment.findOne({
          schoolId, busId: bus._id, staffType: "conductor", status: "active", isPrimary: true,
        }).lean();
        let driverName = "—";
        let conductorName = "—";
        if (driverAssign) {
          const d = await TransportDriver.findById(driverAssign.staffId).select("name").lean();
          driverName = d?.name || "—";
        }
        if (conductorAssign) {
          const c = await TransportConductor.findById(conductorAssign.staffId).select("name").lean();
          conductorName = c?.name || "—";
        }
        return {
          busId: bus._id,
          busIdentity: bus.busIdentity,
          busName: bus.busName,
          registrationNumber: bus.registrationNumber,
          routeName: routeAssign?.routeId?.routeName || "—",
          routeCode: routeAssign?.routeId?.routeCode || "",
          driverName,
          conductorName,
          studentCount,
          seatingCapacity: bus.seatingCapacity,
          status: bus.status,
        };
      }),
    );
    return ok(res, {
      data: {
        summary: {
          totalBuses,
          activeBuses,
          inactiveBuses: totalBuses - activeBuses,
          totalRoutes,
          totalDrivers,
          totalConductors,
          transportStudents,
          unassignedStudents,
        },
        busSummaries,
      },
    });
  } catch (err) {
    next(err);
  }
};
