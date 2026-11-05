import Student from "../student/student.model.js";
import StudentTransportAssignment from "../transport/studentTransportAssignment.model.js";
import BusStaffAssignment from "../transport/busStaffAssignment.model.js";
import Driver from "../transport/driver.model.js";
import Conductor from "../transport/conductor.model.js";

const roleNameOf = (req) => req.user?.roleId?.name;

const resolveStudentSelf = async (req) => {
  const role = roleNameOf(req);
  if (role === "Student") {
    return Student.findOne({ "studentLogin.userId": req.user._id }).lean();
  }
  if (role === "Parent") {
    return Student.findOne({ "parentLogin.userId": req.user._id }).lean();
  }
  return null;
};

const pickStaff = async (schoolId, busId, staffType) => {
  const assignment = await BusStaffAssignment.findOne({
    schoolId,
    busId,
    staffType,
    status: "active",
  })
    .sort({ isPrimary: -1, updatedAt: -1 })
    .lean();

  if (!assignment?.staffId) return null;

  const Model = staffType === "driver" ? Driver : Conductor;
  const person = await Model.findById(assignment.staffId)
    .select("name mobile phone photoUrl")
    .lean();
  if (!person) return null;

  return {
    id: String(person._id),
    name: person.name || "",
    mobile: person.mobile || person.phone || "",
    photoUrl: person.photoUrl || "",
  };
};

/** GET /api/mobile/transport */
export const getMobileTransport = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (role !== "Student" && role !== "Parent") {
      return res.status(403).json({
        success: false,
        message: "Only Student and Parent can view transport details",
      });
    }

    const student = await resolveStudentSelf(req);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const assignment = await StudentTransportAssignment.findOne({
      schoolId: student.schoolId,
      studentId: student._id,
      status: "active",
    })
      .populate(
        "busId",
        "busIdentity busName registrationNumber photoUrl seatingCapacity busCode status",
      )
      .populate(
        "routeId",
        "routeCode routeName startPoint endPoint status",
      )
      .lean();

    if (!assignment) {
      return res.json({
        success: true,
        data: {
          assigned: false,
          assignment: null,
          bus: null,
          route: null,
          driver: null,
          conductor: null,
        },
      });
    }

    const bus = assignment.busId;
    const route = assignment.routeId;
    const busId = bus?._id ?? assignment.busId;

    const [driver, conductor] = await Promise.all([
      pickStaff(student.schoolId, busId, "driver"),
      pickStaff(student.schoolId, busId, "conductor"),
    ]);

    res.json({
      success: true,
      data: {
        assigned: true,
        assignment: {
          id: String(assignment._id),
          transportType: assignment.transportType || "Both",
          pickupStopName: assignment.pickupStopName || "",
          dropStopName: assignment.dropStopName || "",
          pickupTime: assignment.pickupTime || "",
          dropTime: assignment.dropTime || "",
          effectiveFrom: assignment.effectiveFrom || null,
          effectiveTo: assignment.effectiveTo || null,
        },
        bus: bus
          ? {
              id: String(bus._id),
              busIdentity: bus.busIdentity || bus.busCode || "",
              busName: bus.busName || "",
              registrationNumber: bus.registrationNumber || "",
              photoUrl: bus.photoUrl || "",
              seatingCapacity: bus.seatingCapacity ?? null,
            }
          : null,
        route: route
          ? {
              id: String(route._id),
              routeCode: route.routeCode || "",
              routeName: route.routeName || "",
              startPoint: route.startPoint || "",
              endPoint: route.endPoint || "",
            }
          : null,
        driver,
        conductor,
      },
    });
  } catch (error) {
    next(error);
  }
};
