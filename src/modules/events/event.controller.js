import Event from "./event.model.js";
import School from "../school/school.model.js";
import Student from "../student/student.model.js";
import Staff from "../staff/staff.model.js";
import { normalizeWhatsAppPhone } from "../../utils/phone.util.js";
import {
  applyLiveEventStatus,
  deriveEventStatus,
  persistStaleEventStatuses,
} from "../../utils/eventStatus.util.js";

const resolveSchoolId = (req) => {
  const roleName = req.user?.roleId?.name;
  if (roleName === "SuperAdmin") {
    return req.query.schoolId || req.body.schoolId || req.params.schoolId || null;
  }
  return req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
};

export const createEvent = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required in body for creating an event"
            : "School context missing",
      });
    }
    const userId = req.user._id;

    const {
      title,
      description,
      location,
      startAt,
      endAt,
      organizationFor,
    } = req.body;

    if (!title || !startAt || !endAt) {
      return res.status(400).json({
        success: false,
        message: "title, startAt and endAt are required",
      });
    }

    if (new Date(endAt).getTime() < new Date(startAt).getTime()) {
      return res.status(400).json({
        success: false,
        message: "endAt must be after startAt",
      });
    }

    const event = await Event.create({
      schoolId,
      title,
      description,
      location,
      startAt,
      endAt,
      organizationFor,
      status: deriveEventStatus(startAt, endAt),
      createdBy: userId,
    });

    res.status(201).json({
      success: true,
      data: applyLiveEventStatus(event),
    });
  } catch (error) {
    next(error);
  }
};

export const getEvents = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query or body). Example: ?schoolId=..."
            : "School context missing",
      });
    }
    const { status, organizationFor, from, to } = req.query;

    const filter = { schoolId };
    if (organizationFor) filter.organizationFor = organizationFor;
    if (from || to) {
      filter.startAt = {};
      if (from) filter.startAt.$gte = new Date(from);
      if (to) filter.startAt.$lte = new Date(to);
    }

    const events = await Event.find(filter).sort({ startAt: 1 });
    const now = new Date();
    persistStaleEventStatuses(events, now);
    let data = events.map((event) => applyLiveEventStatus(event, now));
    if (status) {
      const wanted = String(status).trim().toUpperCase();
      data = data.filter((event) => event.status === wanted);
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getEventById = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query or body)"
            : "School context missing",
      });
    }
    const { id } = req.params;

    const event = await Event.findOne({ _id: id, schoolId });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    res.json({
      success: true,
      data: applyLiveEventStatus(event),
    });
  } catch (error) {
    next(error);
  }
};

export const updateEvent = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query or body)"
            : "School context missing",
      });
    }
    const { id } = req.params;

    const event = await Event.findOne({ _id: id, schoolId });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const {
      title,
      description,
      location,
      startAt,
      endAt,
      organizationFor,
    } = req.body;

    if (title !== undefined) event.title = title;
    if (description !== undefined) event.description = description;
    if (location !== undefined) event.location = location;
    if (organizationFor !== undefined) event.organizationFor = organizationFor;
    if (startAt !== undefined) event.startAt = startAt;
    if (endAt !== undefined) event.endAt = endAt;

    if (new Date(event.endAt).getTime() < new Date(event.startAt).getTime()) {
      return res.status(400).json({
        success: false,
        message: "endAt must be after startAt",
      });
    }

    event.status = deriveEventStatus(event.startAt, event.endAt);
    await event.save();

    res.json({
      success: true,
      data: applyLiveEventStatus(event),
    });
  } catch (error) {
    next(error);
  }
};

export const deleteEvent = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query or body)"
            : "School context missing",
      });
    }
    const { id } = req.params;

    const deleted = await Event.findOneAndDelete({ _id: id, schoolId });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    res.json({
      success: true,
      message: "Event deleted",
    });
  } catch (error) {
    next(error);
  }
};

const formatEventWhen = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
};

const buildEventWhatsAppMessage = ({ schoolName, event, greeting }) => {
  const live = applyLiveEventStatus(event);
  const audience = Array.isArray(event.organizationFor) && event.organizationFor.length
    ? event.organizationFor.join(", ")
    : "All";
  return [
    `*Event — ${schoolName}*`,
    "",
    greeting,
    "",
    `You are invited to *${event.title || "an event"}*.`,
    event.description ? `\n${String(event.description).trim()}` : "",
    "",
    `*Start:* ${formatEventWhen(event.startAt)}`,
    `*End:* ${formatEventWhen(event.endAt)}`,
    `*Venue:* ${event.location || "—"}`,
    `*For:* ${audience}`,
    `*Status:* ${live.status}`,
    "",
    "Thank you.",
  ].join("\n");
};

const addRecipient = (list, seen, { name, subtitle, phone }) => {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized || seen.has(normalized)) return false;
  seen.add(normalized);
  list.push({
    name: name || "Recipient",
    subtitle: subtitle || "",
    phone: normalized,
  });
  return true;
};

export const prepareEventWhatsApp = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query or body)"
            : "School context missing",
      });
    }

    const event = await Event.findOne({ _id: req.params.id, schoolId }).lean();
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const audience = String(req.body?.audience || req.query?.audience || "PARENTS")
      .trim()
      .toUpperCase();
    if (!["STUDENTS", "PARENTS", "STAFF"].includes(audience)) {
      return res.status(400).json({
        success: false,
        message: "audience must be STUDENTS, PARENTS, or STAFF",
      });
    }

    const school = await School.findById(schoolId).select("name").lean();
    const schoolName = school?.name || "School";
    const greeting =
      audience === "STUDENTS"
        ? "Dear Student,"
        : audience === "STAFF"
          ? "Dear Staff,"
          : "Dear Parent/Guardian,";
    const message = buildEventWhatsAppMessage({ schoolName, event, greeting });

    const recipients = [];
    const seen = new Set();
    let skippedWithoutPhone = 0;

    if (audience === "STAFF") {
      const staffRows = await Staff.find({ schoolId, status: "ACTIVE" })
        .select("name phone designation")
        .lean();
      for (const staff of staffRows) {
        const added = addRecipient(recipients, seen, {
          name: staff.name,
          subtitle: staff.designation || "Staff",
          phone: staff.phone,
        });
        if (!added) skippedWithoutPhone += 1;
      }
    } else {
      const students = await Student.find({ schoolId, status: "ACTIVE" })
        .select("name className section phone admissionNumber parents")
        .lean();
      for (const student of students) {
        const classLabel = [student.className, student.section].filter(Boolean).join(" - ");
        const subtitle = [student.admissionNumber, classLabel].filter(Boolean).join(" · ");
        if (audience === "STUDENTS") {
          const added = addRecipient(recipients, seen, {
            name: student.name,
            subtitle,
            phone: student.phone,
          });
          if (!added) skippedWithoutPhone += 1;
        } else {
          const fatherPhone = student.parents?.father?.phone;
          const motherPhone = student.parents?.mother?.phone;
          const fatherName = student.parents?.father?.name;
          const motherName = student.parents?.mother?.name;
          const before = recipients.length;
          addRecipient(recipients, seen, {
            name: fatherName || `${student.name || "Student"} (Father)`,
            subtitle: subtitle ? `Father · ${subtitle}` : "Father",
            phone: fatherPhone,
          });
          addRecipient(recipients, seen, {
            name: motherName || `${student.name || "Student"} (Mother)`,
            subtitle: subtitle ? `Mother · ${subtitle}` : "Mother",
            phone: motherPhone,
          });
          if (recipients.length === before) skippedWithoutPhone += 1;
        }
      }
    }

    const withUrls = recipients.map((row) => ({
      ...row,
      waUrl: `https://web.whatsapp.com/send?phone=${row.phone}&text=${encodeURIComponent(message)}`,
    }));

    return res.json({
      success: true,
      data: {
        audience,
        eventTitle: event.title,
        message,
        waUrlWithoutPhone: `https://web.whatsapp.com/send?text=${encodeURIComponent(message)}`,
        recipients: withUrls,
        skippedWithoutPhone,
      },
    });
  } catch (error) {
    next(error);
  }
};


