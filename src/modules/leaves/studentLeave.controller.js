import StudentLeave from "./studentLeave.model.js";
import Student from "../student/student.model.js";

const resolveSchoolId = (req) => {
  const roleName = req.user?.roleId?.name;
  if (roleName === "SuperAdmin") {
    return req.query.schoolId || req.body.schoolId || req.params.schoolId || null;
  }
  return req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
};

/** Apply for leave (Student applies own) or create (Admin/Principal/Teacher for a student) */
export const createStudentLeave = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    let schoolId = resolveSchoolId(req);
    let studentId = req.body.studentId;

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
      studentId = student._id;
    }

    if (!schoolId || !studentId) {
      return res.status(400).json({
        success: false,
        message:
          roleName === "SuperAdmin"
            ? "schoolId and studentId are required"
            : "School/student context missing",
      });
    }

    const { reason, leaveFrom, leaveTo } = req.body;
    if (!reason || !leaveFrom || !leaveTo) {
      return res.status(400).json({
        success: false,
        message: "reason, leaveFrom and leaveTo are required",
      });
    }

    const from = new Date(leaveFrom);
    const to = new Date(leaveTo);
    if (to < from) {
      return res.status(400).json({
        success: false,
        message: "leaveTo must be on or after leaveFrom",
      });
    }

    const leave = await StudentLeave.create({
      schoolId,
      studentId,
      appliedDate: new Date(),
      reason,
      leaveFrom: from,
      leaveTo: to,
      status: "Unapproved",
    });

    const populated = await StudentLeave.findById(leave._id)
      .populate("studentId", "name admissionNumber className section");

    res.status(201).json({
      success: true,
      data: formatStudentLeave(populated),
    });
  } catch (error) {
    next(error);
  }
};

/** List: Student sees own, others see by schoolId (+ optional studentId filter) */
export const getStudentLeaves = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    let schoolId = resolveSchoolId(req);
    let studentIdFilter = null;

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
      studentIdFilter = student._id;
    }

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          roleName === "SuperAdmin"
            ? "schoolId is required (query)"
            : "School context missing",
      });
    }

    const { studentId, status } = req.query;
    const filter = { schoolId };
    if (studentIdFilter) filter.studentId = studentIdFilter;
    else if (studentId) filter.studentId = studentId;
    if (status) filter.status = status;

    const leaves = await StudentLeave.find(filter)
      .populate("studentId", "name admissionNumber className section")
      .populate("approvedBy", "name")
      .sort({ appliedDate: -1 });

    res.json({
      success: true,
      data: leaves.map(formatStudentLeave),
    });
  } catch (error) {
    next(error);
  }
};

export const getStudentLeaveById = async (req, res, next) => {
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
            ? "schoolId is required (query)"
            : "School context missing",
      });
    }

    const filter = { _id: req.params.id, schoolId };
    if (req._resolvedStudentId) filter.studentId = req._resolvedStudentId;

    const leave = await StudentLeave.findOne(filter)
      .populate("studentId", "name admissionNumber className section")
      .populate("approvedBy", "name");

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Student leave not found",
      });
    }

    res.json({
      success: true,
      data: formatStudentLeave(leave),
    });
  } catch (error) {
    next(error);
  }
};

/** Update (edit) – applicant or Admin/Principal/Teacher */
export const updateStudentLeave = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    let schoolId = resolveSchoolId(req);
    const leave = await StudentLeave.findById(req.params.id).populate(
      "studentId",
      "name admissionNumber className section"
    );

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Student leave not found",
      });
    }

    if (roleName === "Student") {
      const student = await Student.findOne({
        "studentLogin.userId": req.user._id,
      }).select("_id");
      if (!student || !leave.studentId._id.equals(student._id)) {
        return res.status(403).json({
          success: false,
          message: "You can only edit your own leave",
        });
      }
      schoolId = leave.schoolId;
    } else if (leave.schoolId.toString() !== schoolId?.toString()) {
      return res.status(403).json({
        success: false,
        message: "Leave not found in your school",
      });
    }

    const { reason, leaveFrom, leaveTo } = req.body;
    if (reason !== undefined) leave.reason = reason;
    if (leaveFrom !== undefined) leave.leaveFrom = new Date(leaveFrom);
    if (leaveTo !== undefined) leave.leaveTo = new Date(leaveTo);
    if (new Date(leave.leaveTo) < new Date(leave.leaveFrom)) {
      return res.status(400).json({
        success: false,
        message: "leaveTo must be on or after leaveFrom",
      });
    }
    await leave.save();

    const populated = await StudentLeave.findById(leave._id)
      .populate("studentId", "name admissionNumber className section")
      .populate("approvedBy", "name");

    res.json({
      success: true,
      data: formatStudentLeave(populated),
    });
  } catch (error) {
    next(error);
  }
};

/** Approve/Unapprove – Admin, Principal, Teacher only */
export const updateStudentLeaveStatus = async (req, res, next) => {
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

    const leave = await StudentLeave.findOne({
      _id: req.params.id,
      schoolId,
    });

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Student leave not found",
      });
    }

    const { status } = req.body;
    if (!status || !["Approved", "Unapproved"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status must be Approved or Unapproved",
      });
    }

    leave.status = status;
    leave.approvedBy = req.user._id;
    leave.approvedAt = new Date();
    await leave.save();

    const populated = await StudentLeave.findById(leave._id)
      .populate("studentId", "name admissionNumber className section")
      .populate("approvedBy", "name");

    res.json({
      success: true,
      data: formatStudentLeave(populated),
    });
  } catch (error) {
    next(error);
  }
};

/** Delete – applicant or Admin/Principal/Teacher */
export const deleteStudentLeave = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    let schoolId = resolveSchoolId(req);

    const leave = await StudentLeave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Student leave not found",
      });
    }

    if (roleName === "Student") {
      const student = await Student.findOne({
        "studentLogin.userId": req.user._id,
      }).select("_id");
      if (!student || !leave.studentId.equals(student._id)) {
        return res.status(403).json({
          success: false,
          message: "You can only delete your own leave",
        });
      }
    } else {
      if (leave.schoolId.toString() !== schoolId?.toString()) {
        return res.status(403).json({
          success: false,
          message: "Leave not found in your school",
        });
      }
    }

    await StudentLeave.findByIdAndDelete(req.params.id);
    res.json({
      success: true,
      message: "Student leave deleted",
    });
  } catch (error) {
    next(error);
  }
};

function formatStudentLeave(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    _id: d._id,
    admissionNumber: d.studentId?.admissionNumber,
    studentName: d.studentId?.name,
    class: d.studentId?.className,
    section: d.studentId?.section,
    appliedDate: d.appliedDate,
    reason: d.reason,
    leaveFrom: d.leaveFrom,
    leaveTo: d.leaveTo,
    status: d.status,
    approvedBy: d.approvedBy?.name,
    approvedAt: d.approvedAt,
    studentId: d.studentId?._id,
    schoolId: d.schoolId,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}
