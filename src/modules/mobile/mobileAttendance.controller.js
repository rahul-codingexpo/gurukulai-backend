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

const toDateOnly = (input) => {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

const hhmmNow = () => {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
};

const daysInMonth = (year, month) => new Date(year, month, 0).getDate();
const monthShort = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const format12h = (hhmm) => {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mm = m[2];
  const ap = h >= 12 ? "PM" : "AM";
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${mm} ${ap}`;
};

const dateLabel = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getDate()).padStart(2, "0")} ${monthShort[d.getMonth()]}`;
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

    const { className, section, date, filter = "all", search = "" } = req.query;
    if (!className) {
      return res.status(400).json({ success: false, message: "className is required" });
    }
    const selectedDate = toDateOnly(date || new Date());
    if (!selectedDate) {
      return res.status(400).json({ success: false, message: "Invalid date" });
    }
    const filterKey = String(filter).toLowerCase();
    if (!["all", "present", "absent", "late", "pending"].includes(filterKey)) {
      return res.status(400).json({
        success: false,
        message: "filter must be one of all, present, absent, late, pending",
      });
    }

    const studentQuery = { schoolId, className: String(className).trim() };
    if (section) studentQuery.section = String(section).trim();
    if (search) studentQuery.name = { $regex: String(search).trim(), $options: "i" };

    const students = await Student.find(studentQuery)
      .select("_id name admissionNumber rollNumber className section")
      .sort({ section: 1, rollNumber: 1, name: 1 })
      .lean();
    const studentIds = students.map((s) => s._id);
    const records = studentIds.length
      ? await StudentAttendance.find({
          schoolId,
          date: selectedDate,
          studentId: { $in: studentIds },
        })
          .select("studentId status markType updatedAt")
          .lean()
      : [];
    const byStudent = new Map(records.map((r) => [String(r.studentId), r]));

    const mapped = students.map((s) => {
      const rec = byStudent.get(String(s._id));
      const markType = rec?.markType || rec?.status || null;
      return {
        _id: s._id,
        name: s.name || null,
        rollNumber: s.rollNumber || null,
        admissionNumber: s.admissionNumber || null,
        className: s.className || null,
        section: s.section || null,
        status: markType,
        markedAt: rec?.updatedAt || null,
        markedTime: rec?.updatedAt ? format12h(`${String(new Date(rec.updatedAt).getHours()).padStart(2, "0")}:${String(new Date(rec.updatedAt).getMinutes()).padStart(2, "0")}`) : null,
      };
    });

    const present = mapped.filter((s) => s.status === "Present").length;
    const absent = mapped.filter((s) => s.status === "Absent").length;
    const late = mapped.filter((s) => s.status === "Late").length;
    const pending = mapped.filter((s) => !s.status).length;

    const filteredStudents =
      filterKey === "all"
        ? mapped
        : mapped.filter((s) =>
            filterKey === "pending" ? !s.status : String(s.status).toLowerCase() === filterKey
          );

    res.json({
      success: true,
      data: {
        className: String(className).trim(),
        section: section ? String(section).trim() : null,
        date: selectedDate,
        dateLabel: dateLabel(selectedDate),
        summary: { present, absent, late, pending, total: mapped.length },
        students: filteredStudents,
      },
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/mobile/attendance/teacher/classes */
export const getTeacherStudentAttendanceClasses = async (req, res, next) => {
  try {
    const roleName = roleNameOf(req);
    if (!["Teacher", "Admin", "Principal"].includes(roleName)) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }
    const schoolId = req.user?.schoolId?._id ?? req.user?.schoolId;
    if (!schoolId) {
      return res.status(400).json({ success: false, message: "School context missing" });
    }

    const rows = await Student.aggregate([
      { $match: { schoolId } },
      { $group: { _id: { className: "$className", section: "$section" }, count: { $sum: 1 } } },
      { $sort: { "_id.className": 1, "_id.section": 1 } },
    ]);

    return res.json({
      success: true,
      data: rows.map((r) => ({
        className: r._id.className || null,
        section: r._id.section || null,
        studentCount: r.count || 0,
      })),
    });
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
          markType: e.status === "Late" ? "Late" : e.status === "Absent" ? "Absent" : "Present",
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

    const normalized = records.map((r) => ({
      _id: r._id,
      studentId: r.studentId?._id || r.studentId,
      name: r.studentId?.name || null,
      rollNumber: r.studentId?.rollNumber || null,
      className: r.studentId?.className || null,
      section: r.studentId?.section || null,
      status: r.markType || r.status,
      markedBy: r.markedBy?.name || null,
      markedAt: r.updatedAt || null,
    }));

    const present = normalized.filter((r) => r.status === "Present").length;
    const absent = normalized.filter((r) => r.status === "Absent").length;
    const late = normalized.filter((r) => r.status === "Late").length;

    res.json({
      success: true,
      message: "Student attendance submitted successfully",
      data: {
        summary: { present, absent, late, totalMarked: normalized.length },
        records: normalized,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/mobile/attendance/teacher/self
 * Body: { date?: "YYYY-MM-DD", status: "Present" | "Absent" | "Late", entryTime?, exitTime? }
 */
export const teacherMarkSelfAttendance = async (req, res, next) => {
  try {
    const roleName = roleNameOf(req);
    if (roleName !== "Teacher") {
      return res.status(403).json({
        success: false,
        message: "Only Teacher can mark self attendance from mobile",
      });
    }

    const staff = await resolveStaffForSelf(req);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Teacher profile not found",
      });
    }

    const { date, status, entryTime, exitTime } = req.body || {};
    const selectedStatus = String(status || "").trim();
    if (!["Present", "Absent", "Late"].includes(selectedStatus)) {
      return res.status(400).json({
        success: false,
        message: "status must be one of Present, Absent, Late",
      });
    }

    const dateOnly = toDateOnly(date || new Date());
    if (!dateOnly) {
      return res.status(400).json({
        success: false,
        message: "Invalid date",
      });
    }

    const persistedStatus = selectedStatus === "Absent" ? "Absent" : "Present";
    const computedEntryTime =
      entryTime !== undefined
        ? entryTime
        : selectedStatus === "Present" || selectedStatus === "Late"
          ? hhmmNow()
          : "";
    const computedExitTime = exitTime !== undefined ? exitTime : "";

    const record = await StaffAttendance.findOneAndUpdate(
      { schoolId: staff.schoolId, date: dateOnly, staffId: staff._id },
      {
        schoolId: staff.schoolId,
        date: dateOnly,
        staffId: staff._id,
        status: persistedStatus,
        markType: selectedStatus,
        entryTime: computedEntryTime || "",
        exitTime: computedExitTime || "",
      },
      { upsert: true, new: true }
    ).lean();

    return res.json({
      success: true,
      message: "Attendance marked successfully",
      data: {
        _id: record._id,
        date: record.date,
        status: record.status,
        markType: record.markType || record.status,
        checkIn: record.entryTime || null,
        checkOut: record.exitTime || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/mobile/attendance/teacher/self?month=11&year=2026&filter=all|present|absent|late
 */
export const getTeacherSelfAttendanceMonth = async (req, res, next) => {
  try {
    const roleName = roleNameOf(req);
    if (roleName !== "Teacher") {
      return res.status(403).json({
        success: false,
        message: "Only Teacher can access self attendance from mobile",
      });
    }

    const staff = await resolveStaffForSelf(req);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Teacher profile not found",
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

    const filterKey = String(req.query.filter || "all").toLowerCase();
    if (!["all", "present", "absent", "late"].includes(filterKey)) {
      return res.status(400).json({
        success: false,
        message: "filter must be one of all, present, absent, late",
      });
    }

    const { start, end } = startEndOfMonth(year, month);
    const records = await StaffAttendance.find({
      schoolId: staff.schoolId,
      staffId: staff._id,
      date: { $gte: start, $lte: end },
    })
      .select("date status markType entryTime exitTime")
      .sort({ date: -1 })
      .lean();

    const normalized = records.map((r) => {
      const markType = r.markType || r.status;
      return {
        _id: r._id,
        date: r.date,
        markType,
        status: r.status,
        checkIn: r.entryTime || null,
        checkOut: r.exitTime || null,
      };
    });

    const presentCount = normalized.filter((r) => r.markType === "Present").length;
    const absentCount = normalized.filter((r) => r.markType === "Absent").length;
    const lateCount = normalized.filter((r) => r.markType === "Late").length;
    const totalMarked = normalized.length;
    const pending = Math.max(daysInMonth(year, month) - totalMarked, 0);

    const filteredDays =
      filterKey === "all"
        ? normalized
        : normalized.filter((r) => r.markType.toLowerCase() === filterKey);

    return res.json({
      success: true,
      data: {
        teacher: {
          _id: staff._id,
          name: staff.name,
          designation: staff.designation,
        },
        summary: {
          present: presentCount,
          absent: absentCount,
          late: lateCount,
          pending,
          totalMarked,
        },
        days: filteredDays,
      },
    });
  } catch (error) {
    next(error);
  }
};

