import StudentAttendance from "./studentAttendance.model.js";
import Student from "../student/student.model.js";

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

    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

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
 * Get student attendance by date (optional: class/section filters via query).
 * Response includes student name, roll number, class, status, marked by teacher.
 */
export const getStudentAttendanceByDate = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query). Example: ?schoolId=..."
            : "School context missing",
      });
    }

    const { date, className, section } = req.query;
    if (!date) {
      return res.status(400).json({
        success: false,
        message: "date is required (query)",
      });
    }

    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    const filter = { schoolId, date: dateOnly };
    if (className || section) {
      const studentFilter = { schoolId };
      if (className) studentFilter.className = className;
      if (section) studentFilter.section = section;
      const students = await Student.find(studentFilter).select("_id");
      filter.studentId = { $in: students.map((s) => s._id) };
    }

    const records = await StudentAttendance.find(filter)
      .populate("studentId", "name rollNumber className section")
      .populate("markedBy", "name")
      .sort({ "studentId.name": 1 });

    const data = records.map((r) => ({
      _id: r._id,
      date: r.date,
      studentName: r.studentId?.name,
      rollNumber: r.studentId?.rollNumber,
      class: r.studentId?.className,
      section: r.studentId?.section,
      status: r.status,
      markedBy: r.markedBy?.name,
      studentId: r.studentId?._id,
      markedById: r.markedBy?._id,
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
