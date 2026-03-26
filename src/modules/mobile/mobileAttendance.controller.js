import Student from "../student/student.model.js";
import Staff from "../staff/staff.model.js";
import StudentAttendance from "../attendance/studentAttendance.model.js";
import StaffAttendance from "../attendance/staffAttendance.model.js";

const roleNameOf = (req) => req.user?.roleId?.name;

const resolveStudentForSelf = async (req) => {
  const roleName = roleNameOf(req);
  if (roleName === "Student") {
    return Student.findOne({ "studentLogin.userId": req.user._id }).select(
      "_id schoolId admissionNumber name className section rollNumber"
    );
  }
  if (roleName === "Parent") {
    return Student.findOne({ "parentLogin.userId": req.user._id }).select(
      "_id schoolId admissionNumber name className section rollNumber"
    );
  }
  return null;
};

const resolveStaffForSelf = async (req) => {
  const roleName = roleNameOf(req);
  if (!["Staff", "Teacher", "Principal"].includes(roleName)) return null;
  return Staff.findOne({ userId: req.user._id }).select("_id schoolId name designation");
};

const startEndOfMonth = (year, month) => {
  // month: 1-12
  const start = new Date(year, month - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const pct = (present, total) => {
  if (!total) return 0;
  return Math.round((present / total) * 100);
};

/** GET /api/mobile/attendance/student?month=11&year=2025 */
export const getMobileStudentAttendanceMonth = async (req, res, next) => {
  try {
    const student = await resolveStudentForSelf(req);
    if (!student) {
      return res.status(403).json({
        success: false,
        message: "Only Student/Parent can access this endpoint",
      });
    }

    const month = parseInt(req.query.month, 10);
    const year = parseInt(req.query.year, 10);
    if (!month || month < 1 || month > 12 || !year) {
      return res.status(400).json({
        success: false,
        message: "month (1-12) and year are required",
      });
    }

    const { start, end } = startEndOfMonth(year, month);

    const records = await StudentAttendance.find({
      schoolId: student.schoolId,
      studentId: student._id,
      date: { $gte: start, $lte: end },
    })
      .select("date status")
      .sort({ date: -1 })
      .lean();

    const totalDays = records.length;
    const present = records.filter((r) => r.status === "Present").length;
    const absent = totalDays - present;

    res.json({
      success: true,
      data: {
        student: {
          _id: student._id,
          name: student.name,
          admissionNumber: student.admissionNumber,
          className: student.className,
          section: student.section,
          rollNumber: student.rollNumber,
        },
        summary: {
          totalDays,
          present,
          absent,
          percentage: pct(present, totalDays),
        },
        days: records.map((r) => ({
          date: r.date,
          status: r.status, // Present/Absent
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/mobile/attendance/staff?month=11&year=2025 */
export const getMobileStaffAttendanceMonth = async (req, res, next) => {
  try {
    const staff = await resolveStaffForSelf(req);
    if (!staff) {
      return res.status(403).json({
        success: false,
        message: "Only Staff/Teacher/Principal can access this endpoint",
      });
    }

    const month = parseInt(req.query.month, 10);
    const year = parseInt(req.query.year, 10);
    if (!month || month < 1 || month > 12 || !year) {
      return res.status(400).json({
        success: false,
        message: "month (1-12) and year are required",
      });
    }

    const { start, end } = startEndOfMonth(year, month);

    const records = await StaffAttendance.find({
      schoolId: staff.schoolId,
      staffId: staff._id,
      date: { $gte: start, $lte: end },
    })
      .select("date status entryTime exitTime")
      .sort({ date: -1 })
      .lean();

    const totalDays = records.length;
    const present = records.filter((r) => r.status === "Present").length;
    const absent = totalDays - present;

    res.json({
      success: true,
      data: {
        staff: {
          _id: staff._id,
          name: staff.name,
          designation: staff.designation,
        },
        summary: {
          totalDays,
          present,
          absent,
          percentage: pct(present, totalDays),
        },
        days: records.map((r) => ({
          date: r.date,
          status: r.status,
          entryTime: r.entryTime,
          exitTime: r.exitTime,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/mobile/attendance/teacher/students?className=5&section=A */
export const getTeacherStudentsForMarking = async (req, res, next) => {
  try {
    const roleName = roleNameOf(req);
    if (!["Teacher", "Admin", "Principal"].includes(roleName)) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    const schoolId = req.user?.schoolId?._id ?? req.user?.schoolId;
    if (!schoolId) {
      return res.status(400).json({ success: false, message: "School context missing" });
    }

    const { className, section } = req.query;
    if (!className) {
      return res.status(400).json({ success: false, message: "className is required" });
    }

    const filter = { schoolId, className: String(className).trim() };
    if (section) filter.section = String(section).trim();

    const students = await Student.find(filter)
      .select("_id name admissionNumber rollNumber className section")
      .sort({ section: 1, rollNumber: 1, name: 1 })
      .lean();

    res.json({ success: true, data: students });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/mobile/attendance/teacher/mark-students
 * Body: { date: "YYYY-MM-DD", entries: [ { studentId, status } ] }
 * Teacher can send 1 entry (one-by-one) or many (bulk).
 */
export const teacherMarkStudentAttendance = async (req, res, next) => {
  try {
    const roleName = roleNameOf(req);
    if (!["Teacher", "Admin", "Principal"].includes(roleName)) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    const schoolId = req.user?.schoolId?._id ?? req.user?.schoolId;
    if (!schoolId) {
      return res.status(400).json({ success: false, message: "School context missing" });
    }

    const { date, entries, studentId, status } = req.body || {};
    if (!date) {
      return res.status(400).json({ success: false, message: "date is required" });
    }

    const dateOnly = new Date(date);
    if (Number.isNaN(dateOnly.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date" });
    }
    dateOnly.setHours(0, 0, 0, 0);

    let normalizedEntries = [];
    if (Array.isArray(entries)) {
      normalizedEntries = entries;
    } else if (studentId && status) {
      normalizedEntries = [{ studentId, status }];
    } else {
      return res.status(400).json({
        success: false,
        message: "Send entries[] or { studentId, status }",
      });
    }

    // Upsert bulk
    const toUpsert = normalizedEntries.map((e) => ({
      updateOne: {
        filter: { schoolId, date: dateOnly, studentId: e.studentId },
        update: {
          schoolId,
          date: dateOnly,
          studentId: e.studentId,
          status: e.status === "Absent" ? "Absent" : "Present",
          markedBy: req.user._id,
        },
        upsert: true,
      },
    }));

    await StudentAttendance.bulkWrite(toUpsert);

    const records = await StudentAttendance.find({
      schoolId,
      date: dateOnly,
      studentId: { $in: normalizedEntries.map((e) => e.studentId) },
    })
      .populate("studentId", "name rollNumber className section")
      .populate("markedBy", "name")
      .lean();

    res.json({ success: true, data: records });
  } catch (error) {
    next(error);
  }
};

