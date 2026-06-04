import StudentAttendance from "./studentAttendance.model.js";
import Student from "../student/student.model.js";
import Section from "../academic/section.model.js";
import {
  parseDateOnlyLocal,
  dateOnlyRange,
  attendanceStudentIdKey,
} from "../../utils/dateOnly.util.js";

const MANAGER_ROLES = ["Admin", "Principal", "SuperAdmin", "Teacher"];

const toDateOnly = (input) => parseDateOnlyLocal(input);

const displayAttendanceStatus = (record) => {
  if (!record) return null;
  const markType = record.markType;
  if (markType && ["Present", "Absent", "Late"].includes(markType)) return markType;
  return record.status || null;
};

/** Resolve roster students for web/mobile-aligned class+section filters. */
const resolveStudentsForSectionFilter = async ({
  schoolId,
  sectionId,
  className,
  section,
}) => {
  if (sectionId) {
    const sectionDoc = await Section.findOne({ _id: sectionId, schoolId })
      .populate("classId", "name")
      .lean();
    if (!sectionDoc) return [];

    const masterClass = String(sectionDoc.classId?.name || "").trim();
    const masterSection = String(sectionDoc.name || "").trim();

    let students = await Student.find({
      schoolId,
      ...(masterClass ? { className: masterClass } : {}),
      ...(masterSection ? { section: masterSection } : {}),
    })
      .select("_id name rollNumber className section admissionNumber")
      .sort({ rollNumber: 1, name: 1 })
      .lean();

    if (students.length === 0 && masterSection) {
      const bySection = await Student.find({
        schoolId,
        section: masterSection,
      })
        .select("_id name rollNumber className section admissionNumber")
        .sort({ rollNumber: 1, name: 1 })
        .lean();

      if (!masterClass) return bySection;

      students = bySection.filter((s) => {
        const cn = String(s.className || "").trim();
        return (
          cn === masterClass ||
          cn.includes(masterClass) ||
          masterClass.includes(cn)
        );
      });
    }

    return students;
  }

  if (className || section) {
    const studentFilter = { schoolId };
    if (className) studentFilter.className = String(className).trim();
    if (section) studentFilter.section = String(section).trim();
    return Student.find(studentFilter)
      .select("_id name rollNumber className section admissionNumber")
      .sort({ rollNumber: 1, name: 1 })
      .lean();
  }

  return [];
};

const resolveSchoolId = (req) => {
  const roleName = req.user?.roleId?.name;
  if (roleName === "SuperAdmin") {
    return req.query.schoolId || req.body.schoolId || req.params.schoolId || null;
  }
  return req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
};

/**
 * Mark student attendance (single or bulk).
 * Body: { date, entries: [ { studentId, status } ] } or { date, studentId, status }
 * markedBy = req.user._id (teacher)
 */
export const markStudentAttendance = async (req, res, next) => {
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

    const markedBy = req.user._id;
    const { date, studentId, status, entries } = req.body;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "date is required",
      });
    }

    const dateOnly = toDateOnly(date);
    if (!dateOnly) {
      return res.status(400).json({
        success: false,
        message: "Invalid date",
      });
    }

    if (entries && Array.isArray(entries)) {
      const toUpsert = entries.map((e) => ({
        updateOne: {
          filter: {
            schoolId,
            date: dateOnly,
            studentId: e.studentId,
          },
          update: {
            schoolId,
            date: dateOnly,
            studentId: e.studentId,
            status: e.status === "Absent" ? "Absent" : "Present",
            markedBy,
          },
          upsert: true,
        },
      }));
      await StudentAttendance.bulkWrite(toUpsert);
      const records = await StudentAttendance.find({
        schoolId,
        date: dateOnly,
        studentId: { $in: entries.map((e) => e.studentId) },
      })
        .populate("studentId", "name rollNumber className section")
        .populate("markedBy", "name");
      return res.status(200).json({
        success: true,
        data: records,
      });
    }

    if (!studentId || !status) {
      return res.status(400).json({
        success: false,
        message: "studentId and status (Present/Absent) are required",
      });
    }

    const record = await StudentAttendance.findOneAndUpdate(
      { schoolId, date: dateOnly, studentId },
      {
        schoolId,
        date: dateOnly,
        studentId,
        status: status === "Absent" ? "Absent" : "Present",
        markedBy,
      },
      { upsert: true, new: true }
    )
      .populate("studentId", "name rollNumber className section")
      .populate("markedBy", "name");

    res.status(200).json({
      success: true,
      data: record,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get student attendance.
 * - Student: own history (date range supported).
 * - Admin/Principal/SuperAdmin/Teacher + date + sectionId/class: full class roster with status (incl. pending).
 */
export const getStudentAttendanceByDate = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    let schoolId = resolveSchoolId(req);

    if (roleName === "Student") {
      const student = await Student.findOne({
        "studentLogin.userId": req.user._id,
      }).select("_id schoolId");
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found for this user",
        });
      }
      schoolId = student.schoolId;
      req._resolvedStudentId = student._id;
    }

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          roleName === "SuperAdmin"
            ? "schoolId is required (query). Example: ?schoolId=..."
            : "School context missing",
      });
    }

    const { date, dateFrom, dateTo, studentId, className, section, sectionId } =
      req.query;

    const dateOnly = date ? toDateOnly(date) : null;
    const isManagerView =
      MANAGER_ROLES.includes(roleName) &&
      !req._resolvedStudentId &&
      dateOnly &&
      (sectionId || className || section);

    if (isManagerView) {
      const students = await resolveStudentsForSectionFilter({
        schoolId,
        sectionId,
        className,
        section,
      });

      if (!students.length) {
        return res.json({
          success: true,
          data: [],
          summary: {
            total: 0,
            present: 0,
            absent: 0,
            late: 0,
            pending: 0,
            marked: 0,
          },
        });
      }

      const studentIds = students.map((s) => s._id);
      const { start, end } = dateOnlyRange(dateOnly);
      const records = await StudentAttendance.find({
        schoolId,
        date: { $gte: start, $lte: end },
        studentId: { $in: studentIds },
      })
        .populate("markedBy", "name email username")
        .lean();

      const byStudent = new Map(
        records.map((r) => [attendanceStudentIdKey(r.studentId), r]),
      );

      const markedByLabel = (user) => {
        if (!user || typeof user !== "object") return null;
        const n = String(user.name || "").trim();
        if (n) return n;
        const u = String(user.username || "").trim();
        if (u) return u;
        const e = String(user.email || "").trim();
        return e || null;
      };

      const data = students.map((s) => {
        const rec = byStudent.get(attendanceStudentIdKey(s._id));
        const status = displayAttendanceStatus(rec);
        return {
          _id: rec?._id,
          date: dateOnly,
          studentId: s._id,
          studentName: s.name,
          rollNumber: s.rollNumber,
          admissionNumber: s.admissionNumber,
          class: s.className,
          section: s.section,
          status: status || "Pending",
          markedBy: markedByLabel(rec?.markedBy),
          markedById: rec?.markedBy?._id,
          isMarked: Boolean(rec),
        };
      });

      const present = data.filter((r) => r.status === "Present").length;
      const absent = data.filter((r) => r.status === "Absent").length;
      const late = data.filter((r) => r.status === "Late").length;
      const pending = data.filter((r) => r.status === "Pending").length;

      return res.json({
        success: true,
        data,
        summary: {
          total: data.length,
          present,
          absent,
          late,
          pending,
          marked: data.length - pending,
        },
      });
    }

    const filter = { schoolId };

    if (req._resolvedStudentId) {
      filter.studentId = req._resolvedStudentId;
    } else if (studentId) {
      filter.studentId = studentId;
    }

    if (dateOnly) {
      const { start, end } = dateOnlyRange(dateOnly);
      filter.date = { $gte: start, $lte: end };
    } else if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) {
        const d = toDateOnly(dateFrom);
        if (d) filter.date.$gte = d;
      }
      if (dateTo) {
        const d = toDateOnly(dateTo);
        if (d) {
          const { end } = dateOnlyRange(d);
          filter.date.$lte = end;
        }
      }
    } else {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 365);
      start.setHours(0, 0, 0, 0);
      filter.date = { $gte: start, $lte: end };
    }

    if (!req._resolvedStudentId && (sectionId || className || section)) {
      const students = await resolveStudentsForSectionFilter({
        schoolId,
        sectionId,
        className,
        section,
      });
      filter.studentId = { $in: students.map((s) => s._id) };
    }

    const records = await StudentAttendance.find(filter)
      .populate("studentId", "name rollNumber className section")
      .populate("markedBy", "name email username")
      .sort({ date: -1, "studentId.name": 1 });

    const markedByLabel = (user) => {
      if (!user || typeof user !== "object") return null;
      return (
        String(user.name || "").trim() ||
        String(user.username || "").trim() ||
        String(user.email || "").trim() ||
        null
      );
    };

    const data = records.map((r) => ({
      _id: r._id,
      date: r.date,
      studentName: r.studentId?.name,
      rollNumber: r.studentId?.rollNumber,
      class: r.studentId?.className,
      section: r.studentId?.section,
      status: displayAttendanceStatus(r) || r.status,
      markedBy: markedByLabel(r.markedBy),
      studentId: r.studentId?._id,
      markedById: r.markedBy?._id,
      isMarked: true,
    }));

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const updateStudentAttendance = async (req, res, next) => {
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

    const record = await StudentAttendance.findOne({
      _id: req.params.id,
      schoolId,
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Student attendance record not found",
      });
    }

    const { status } = req.body;
    if (status !== undefined) record.status = status === "Absent" ? "Absent" : "Present";
    record.markedBy = req.user._id;
    await record.save();

    const populated = await StudentAttendance.findById(record._id)
      .populate("studentId", "name rollNumber className section")
      .populate("markedBy", "name");

    res.json({
      success: true,
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteStudentAttendance = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query)"
            : "School context missing",
      });
    }

    const deleted = await StudentAttendance.findOneAndDelete({
      _id: req.params.id,
      schoolId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Student attendance record not found",
      });
    }

    res.json({
      success: true,
      message: "Student attendance record deleted",
    });
  } catch (error) {
    next(error);
  }
};
