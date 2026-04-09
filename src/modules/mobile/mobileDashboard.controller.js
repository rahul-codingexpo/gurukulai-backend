import Student from "../student/student.model.js";
import Staff from "../staff/staff.model.js";
import Timetable from "../timetable/timetable.model.js";
import ClassTimetable from "../classTimetable/classTimetable.model.js";
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

  if (roleName === "Teacher" || roleName === "Staff") {
    const staff = await Staff.findOne({ userId: req.user._id }).select("photoUrl");
    return staff?.photoUrl ?? null;
  }

  // Admin/Principal/etc.
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

const SHORT_DAY = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
};

const parseTimeToMinutes = (t) => {
  if (!t) return null;
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

const isCurrentSlot = (startTime, endTime) => {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null) return false;
  return cur >= start && cur < end;
};

const getTodayWeekday = () => {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[new Date().getDay()];
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

/** GET /api/mobile/dashboard/teacher */
export const getTeacherDashboard = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    if (roleName !== "Teacher") {
      return res.status(403).json({
        success: false,
        message: "Only Teacher can access this endpoint",
      });
    }

    const schoolId = await resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    const profilePhoto = await resolveProfilePhoto(req);
    const today = getTodayWeekday();
    const now = new Date();

    // Timetable preview (today)
    const timetableFilter = {
      schoolId,
      day: today,
      teacherId: req.user._id,
    };

    const ttEntries = await Timetable.find(timetableFilter)
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name code")
      .populate("periodId", "periodNumber startTime endTime isBreak")
      .sort({ "periodId.periodNumber": 1 })
      .lean();

    let todayTimetable = [];
    if (ttEntries?.length) {
      todayTimetable = ttEntries
        .filter((e) => !e.periodId?.isBreak)
        .map((e) => ({
          _id: e._id,
          subject: e.subjectId?.name || null,
          subjectCode: e.subjectId?.code || null,
          className: e.classId?.name || null,
          section: e.sectionId?.name || null,
          startTime: e.periodId?.startTime || null,
          endTime: e.periodId?.endTime || null,
          periodNumber: e.periodId?.periodNumber ?? null,
          isNow: isCurrentSlot(e.periodId?.startTime, e.periodId?.endTime),
        }))
        .sort((a, b) => (a.periodNumber ?? 0) - (b.periodNumber ?? 0));
    } else {
      const ctEntries = await ClassTimetable.find(timetableFilter)
        .populate("classId", "name")
        .populate("sectionId", "name")
        .populate("subjectId", "name code")
        .sort({ startTime: 1 })
        .lean();

      todayTimetable = ctEntries.map((e) => ({
        _id: e._id,
        subject: e.subjectId?.name || null,
        subjectCode: e.subjectId?.code || null,
        className: e.classId?.name || null,
        section: e.sectionId?.name || null,
        startTime: e.startTime || null,
        endTime: e.endTime || null,
        periodNumber: null,
        isNow: isCurrentSlot(e.startTime, e.endTime),
      }));
    }

    // Recent announcements/events
    const announcements = await Event.find({
      schoolId,
      status: { $in: ["UPCOMING", "ONGOING"] },
      organizationFor: { $in: ["ALL", "TEACHERS"] },
      endAt: { $gte: now },
    })
      .select("title description location startAt endAt organizationFor status createdAt")
      .sort({ startAt: 1, createdAt: -1 })
      .limit(4)
      .lean();

    return res.json({
      success: true,
      data: {
        user: {
          _id: req.user._id,
          name: req.user.name || null,
          role: roleName,
          profilePhoto,
        },
        quickActions: [
          { key: "markAttendance", label: "Mark Attendance", endpoint: "/api/mobile/attendance/teacher/mark-students" },
          { key: "studentAttendance", label: "Student Attendance", endpoint: "/api/mobile/attendance/teacher/students" },
          { key: "addHomework", label: "Add Homework", endpoint: "/api/mobile/homework" },
          { key: "applyLeave", label: "Apply Leave", endpoint: "/api/mobile/leaves/staff/me/apply" },
        ],
        todayTimetable: {
          selectedDay: SHORT_DAY[today] || today,
          fullDay: today,
          total: todayTimetable.length,
          slots: todayTimetable.slice(0, 4),
          hasMore: todayTimetable.length > 4,
          moreCount: Math.max(todayTimetable.length - 4, 0),
        },
        announcements,
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

