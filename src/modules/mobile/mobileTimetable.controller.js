import Timetable from "../timetable/timetable.model.js";
import ClassTimetable from "../classTimetable/classTimetable.model.js";
import Student from "../student/student.model.js";
import Staff from "../staff/staff.model.js";
import ClassModel from "../academic/class.model.js";
import Section from "../academic/section.model.js";

const DAY_MAP = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Thr: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Monday: "Monday",
  Tuesday: "Tuesday",
  Wednesday: "Wednesday",
  Thursday: "Thursday",
  Friday: "Friday",
  Saturday: "Saturday",
};

const SHORT_DAY = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
};

const normalizeDay = (day) => {
  if (!day) return null;
  const key = String(day).trim();
  return DAY_MAP[key] || null;
};

/** GET /api/mobile/timetable?day=Mon */
export const getMobileTimetable = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    const inputDay = req.query.day || "Mon";
    const day = normalizeDay(inputDay);

    if (!day) {
      return res.status(400).json({
        success: false,
        message: "Invalid day. Use Mon/Tue/Wed/Thu/Fri/Sat or full day name",
      });
    }

    let schoolId = req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
    const filter = { day };
    const classIdFilter = {};
    const sectionIdFilter = {};

    if (["Student", "Parent"].includes(roleName)) {
      const student =
        roleName === "Student"
          ? await Student.findOne({ "studentLogin.userId": req.user._id }).select(
              "_id schoolId className section"
            )
          : await Student.findOne({ "parentLogin.userId": req.user._id }).select(
              "_id schoolId className section"
            );

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found for this user",
        });
      }

      schoolId = student.schoolId;
      filter.schoolId = schoolId;

      // Student model has className/section as string; timetable uses ObjectIds.
      const classes = await ClassModel.find({
        schoolId,
        name: student.className,
      }).select("_id");

      if (!classes.length) {
        return res.json({
          success: true,
          data: {
            selectedDay: SHORT_DAY[day],
            fullDay: day,
            slots: [],
          },
        });
      }

      const classIds = classes.map((c) => c._id);
      const sections = await Section.find({
        schoolId,
        classId: { $in: classIds },
        name: student.section,
      }).select("_id classId");

      if (!sections.length) {
        return res.json({
          success: true,
          data: {
            selectedDay: SHORT_DAY[day],
            fullDay: day,
            slots: [],
          },
        });
      }

      classIdFilter.$in = classIds;
      sectionIdFilter.$in = sections.map((s) => s._id);
    } else if (roleName === "Teacher") {
      filter.schoolId = schoolId;
      filter.teacherId = req.user._id;
    } else if (["Admin", "Principal", "Staff", "Accountant", "Librarian"].includes(roleName)) {
      filter.schoolId = schoolId;
      // For non-teacher staff/admin mobile pages, allow optional class/section query
      if (req.query.classId) classIdFilter.$in = [req.query.classId];
      if (req.query.sectionId) sectionIdFilter.$in = [req.query.sectionId];
      if (req.query.teacherId) filter.teacherId = req.query.teacherId;
    } else if (roleName === "SuperAdmin") {
      const selectedSchoolId = req.query.schoolId;
      if (!selectedSchoolId) {
        return res.status(400).json({
          success: false,
          message: "schoolId is required for SuperAdmin",
        });
      }
      filter.schoolId = selectedSchoolId;
      if (req.query.classId) classIdFilter.$in = [req.query.classId];
      if (req.query.sectionId) sectionIdFilter.$in = [req.query.sectionId];
      if (req.query.teacherId) filter.teacherId = req.query.teacherId;
    } else {
      return res.status(403).json({
        success: false,
        message: "Role not allowed",
      });
    }

    if (!filter.schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    // Preferred: Timetable (period based) -> map to time slots using Period.startTime/endTime
    const ttFilter = { schoolId: filter.schoolId, day: filter.day };
    if (filter.teacherId) ttFilter.teacherId = filter.teacherId;
    if (classIdFilter.$in) ttFilter.classId = classIdFilter;
    if (sectionIdFilter.$in) ttFilter.sectionId = sectionIdFilter;

    let slots = [];

    const ttEntries = await Timetable.find(ttFilter)
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name code")
      .populate("teacherId", "name")
      .populate("periodId", "periodNumber startTime endTime isBreak")
      .sort({ "periodId.periodNumber": 1 })
      .lean();

    if (ttEntries?.length) {
      slots = ttEntries
        .filter((e) => !e.periodId?.isBreak)
        .map((e) => ({
          _id: e._id,
          subject: e.subjectId?.name || "",
          subjectCode: e.subjectId?.code || "",
          className: e.classId?.name || "",
          section: e.sectionId?.name || "",
          teacherName: e.teacherId?.name || "",
          roomNumber: "",
          startTime: e.periodId?.startTime || "",
          endTime: e.periodId?.endTime || "",
          day: e.day,
          shortDay: SHORT_DAY[e.day] || e.day,
          periodNumber: e.periodId?.periodNumber ?? null,
        }))
        .sort((a, b) => (a.periodNumber ?? 0) - (b.periodNumber ?? 0));
    } else {
      // Fallback: ClassTimetable (explicit time range)
      const ctFilter = { ...filter };
      if (classIdFilter.$in) ctFilter.classId = classIdFilter;
      if (sectionIdFilter.$in) ctFilter.sectionId = sectionIdFilter;

      const ctEntries = await ClassTimetable.find(ctFilter)
        .populate("classId", "name")
        .populate("sectionId", "name")
        .populate("subjectId", "name code")
        .populate("teacherId", "name")
        .sort({ startTime: 1 })
        .lean();

      slots = ctEntries.map((e) => ({
        _id: e._id,
        subject: e.subjectId?.name || "",
        subjectCode: e.subjectId?.code || "",
        className: e.classId?.name || "",
        section: e.sectionId?.name || "",
        teacherName: e.teacherId?.name || "",
        roomNumber: e.roomNumber || "",
        startTime: e.startTime,
        endTime: e.endTime,
        day: e.day,
        shortDay: SHORT_DAY[e.day] || e.day,
        periodNumber: null,
      }));
    }

    res.json({
      success: true,
      data: {
        selectedDay: SHORT_DAY[day],
        fullDay: day,
        slots,
      },
    });
  } catch (error) {
    next(error);
  }
};

