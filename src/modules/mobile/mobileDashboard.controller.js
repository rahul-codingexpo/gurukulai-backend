import Student from "../student/student.model.js";
import Event from "../events/event.model.js";
import EventRead from "./eventRead.model.js";

const resolveSchoolId = async (req) => {
  const roleName = req.user?.roleId?.name;

  // Student/Parent: resolve school from linked student record (consistent with attendance/leaves)
  if (roleName === "Student") {
    const student = await Student.findOne({
      "studentLogin.userId": req.user._id,
    }).select("schoolId");
    return student?.schoolId ?? null;
  }

  if (roleName === "Parent") {
    const student = await Student.findOne({
      "parentLogin.userId": req.user._id,
    }).select("schoolId");
    return student?.schoolId ?? null;
  }

  // SuperAdmin can optionally pass schoolId (mobile usually won't, but keep consistent)
  if (roleName === "SuperAdmin") {
    return req.query.schoolId || req.body?.schoolId || null;
  }

  return req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
};

const resolveProfilePhoto = async (req) => {
  const roleName = req.user?.roleId?.name;

  // Student: use studentPhoto if available
  if (roleName === "Student") {
    const student = await Student.findOne({
      "studentLogin.userId": req.user._id,
    }).select("documents.studentPhoto");
    return student?.documents?.studentPhoto ?? null;
  }

  // Parent: if no parent photo in schema, use student's photo as fallback
  if (roleName === "Parent") {
    const student = await Student.findOne({
      "parentLogin.userId": req.user._id,
    }).select("documents.studentPhoto");
    return student?.documents?.studentPhoto ?? null;
  }

  // Staff/Teacher/Admin/Principal: no explicit photo field in current schema
  return null;
};

const roleToOrgFor = (roleName) => {
  switch (roleName) {
    case "Student":
      return "STUDENTS";
    case "Parent":
      return "PARENTS";
    case "Teacher":
      return "TEACHERS";
    case "Accountant":
      return "ACCOUNTANTS";
    case "Librarian":
      return "LIBRARIANS";
    case "Staff":
      return "STAFF";
    default:
      return "ALL";
  }
};

/** GET /api/mobile/dashboard */
export const getMobileDashboard = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    const schoolId = await resolveSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          roleName === "SuperAdmin"
            ? "schoolId is required for SuperAdmin"
            : "School context missing",
      });
    }

    const profilePhoto = await resolveProfilePhoto(req);

    const orgFor = roleToOrgFor(roleName);
    const now = new Date();

    const events = await Event.find({
      schoolId,
      status: { $in: ["UPCOMING", "ONGOING"] },
      organizationFor: { $in: ["ALL", orgFor] },
      endAt: { $gte: now },
    })
      .select("title description location startAt endAt organizationFor status")
      .sort({ startAt: 1 })
      .limit(10)
      .lean();

    res.json({
      success: true,
      data: {
        user: {
          _id: req.user._id,
          name: req.user.name,
          role: roleName,
          profilePhoto,
        },
        events,
      },
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/mobile/events/:id */
export const getMobileEventById = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    const schoolId = await resolveSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          roleName === "SuperAdmin"
            ? "schoolId is required for SuperAdmin"
            : "School context missing",
      });
    }

    const orgFor = roleToOrgFor(roleName);

    const event = await Event.findOne({
      _id: req.params.id,
      schoolId,
      organizationFor: { $in: ["ALL", orgFor] },
    }).lean();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    return res.json({
      success: true,
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/mobile/events?filter=all|read|unread */
export const listMobileEvents = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    const schoolId = await resolveSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          roleName === "SuperAdmin"
            ? "schoolId is required for SuperAdmin"
            : "School context missing",
      });
    }

    const orgFor = roleToOrgFor(roleName);
    const { filter = "all", status } = req.query || {};

    const eventFilter = {
      schoolId,
      organizationFor: { $in: ["ALL", orgFor] },
    };
    if (status) eventFilter.status = status;

    // Read/unread filtering uses EventRead mapping for this user.
    if (filter === "read" || filter === "unread") {
      const reads = await EventRead.find({ schoolId, userId: req.user._id })
        .select("eventId")
        .lean();
      const readIds = reads.map((r) => r.eventId);
      eventFilter._id =
        filter === "read" ? { $in: readIds } : { $nin: readIds };
    }

    const events = await Event.find(eventFilter)
      .select("title description location startAt endAt organizationFor status")
      .sort({ startAt: 1 })
      .limit(200)
      .lean();

    // Attach `isRead` flag for UI convenience
    const readSet =
      filter === "read"
        ? new Set(events.map((e) => String(e._id)))
        : new Set(
            (
              await EventRead.find({ schoolId, userId: req.user._id })
                .select("eventId")
                .lean()
            ).map((r) => String(r.eventId))
          );

    res.json({
      success: true,
      data: events.map((e) => ({ ...e, isRead: readSet.has(String(e._id)) })),
    });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/mobile/events/:id/read */
export const markMobileEventRead = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    const schoolId = await resolveSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          roleName === "SuperAdmin"
            ? "schoolId is required for SuperAdmin"
            : "School context missing",
      });
    }

    const orgFor = roleToOrgFor(roleName);

    // ensure event exists and allowed for audience
    const exists = await Event.findOne({
      _id: req.params.id,
      schoolId,
      organizationFor: { $in: ["ALL", orgFor] },
    }).select("_id");

    if (!exists) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    await EventRead.findOneAndUpdate(
      { eventId: req.params.id, userId: req.user._id },
      { $set: { schoolId, eventId: req.params.id, userId: req.user._id, readAt: new Date() } },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Marked as read" });
  } catch (error) {
    next(error);
  }
};

