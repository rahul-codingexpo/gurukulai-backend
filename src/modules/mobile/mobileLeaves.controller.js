import Student from "../student/student.model.js";
import Staff from "../staff/staff.model.js";
import StudentLeave from "../leaves/studentLeave.model.js";
import StaffLeave from "../leaves/staffLeave.model.js";

const roleNameOf = (req) => req.user?.roleId?.name;
const isApprover = (role) => ["Admin", "Principal", "Teacher"].includes(role);

const resolveStudentSelf = async (req) => {
  const role = roleNameOf(req);
  if (role === "Student") {
    return Student.findOne({ "studentLogin.userId": req.user._id }).select("_id schoolId");
  }
  if (role === "Parent") {
    return Student.findOne({ "parentLogin.userId": req.user._id }).select("_id schoolId");
  }
  return null;
};

const resolveStaffSelf = async (req) => {
  const role = roleNameOf(req);
  if (["Staff", "Teacher", "Principal"].includes(role)) {
    return Staff.findOne({ userId: req.user._id }).select("_id schoolId");
  }
  return null;
};

const dateOnly = (d) => {
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? null : x;
};

/** POST /api/mobile/leaves/me/apply */
export const applyMyLeaveMobile = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    const { reason, leaveFrom, leaveTo, leaveType = "student" } = req.body || {};
    if (!reason || !leaveFrom || !leaveTo) {
      return res.status(400).json({
        success: false,
        message: "reason, leaveFrom and leaveTo are required",
      });
    }
    const from = dateOnly(leaveFrom);
    const to = dateOnly(leaveTo);
    if (!from || !to || to < from) {
      return res.status(400).json({
        success: false,
        message: "Invalid leave date range",
      });
    }

    // Student/Parent -> student leave
    if (["Student", "Parent"].includes(role) || leaveType === "student") {
      const student = await resolveStudentSelf(req);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found",
        });
      }
      const leave = await StudentLeave.create({
        schoolId: student.schoolId,
        studentId: student._id,
        appliedDate: new Date(),
        reason,
        leaveFrom: from,
        leaveTo: to,
        status: "Unapproved",
      });
      return res.status(201).json({ success: true, data: leave });
    }

    // Staff/Teacher/Principal -> staff leave
    const staff = await resolveStaffSelf(req);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff profile not found",
      });
    }
    const leave = await StaffLeave.create({
      schoolId: staff.schoolId,
      staffId: staff._id,
      appliedDate: new Date(),
      reason,
      leaveFrom: from,
      leaveTo: to,
      status: "Unapproved",
    });
    return res.status(201).json({ success: true, data: leave });
  } catch (error) {
    next(error);
  }
};

/** GET /api/mobile/leaves/me?type=student|staff&status=Approved|Unapproved */
export const getMyLeavesMobile = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    const { type, status } = req.query || {};

    if (["Student", "Parent"].includes(role) || type === "student") {
      const student = await resolveStudentSelf(req);
      if (!student) return res.status(404).json({ success: false, message: "Student profile not found" });
      const filter = { schoolId: student.schoolId, studentId: student._id };
      if (status) filter.status = status;
      const leaves = await StudentLeave.find(filter)
        .populate("approvedBy", "name")
        .sort({ appliedDate: -1 })
        .lean();
      return res.json({ success: true, data: leaves });
    }

    const staff = await resolveStaffSelf(req);
    if (!staff) return res.status(404).json({ success: false, message: "Staff profile not found" });
    const filter = { schoolId: staff.schoolId, staffId: staff._id };
    if (status) filter.status = status;
    const leaves = await StaffLeave.find(filter)
      .populate("approvedBy", "name")
      .sort({ appliedDate: -1 })
      .lean();
    return res.json({ success: true, data: leaves });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/mobile/leaves/me/:id */
export const updateMyLeaveMobile = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    const { reason, leaveFrom, leaveTo, type } = req.body || {};

    if (["Student", "Parent"].includes(role) || type === "student") {
      const student = await resolveStudentSelf(req);
      if (!student) return res.status(404).json({ success: false, message: "Student profile not found" });
      const leave = await StudentLeave.findOne({ _id: req.params.id, schoolId: student.schoolId, studentId: student._id });
      if (!leave) return res.status(404).json({ success: false, message: "Leave not found" });
      // Once reviewed by teacher/admin/principal, student/parent cannot edit
      if (leave.approvedBy) {
        return res.status(400).json({
          success: false,
          message: "Leave is already reviewed and cannot be edited",
        });
      }
      if (reason !== undefined) leave.reason = reason;
      if (leaveFrom !== undefined) leave.leaveFrom = dateOnly(leaveFrom);
      if (leaveTo !== undefined) leave.leaveTo = dateOnly(leaveTo);
      if (new Date(leave.leaveTo) < new Date(leave.leaveFrom)) {
        return res.status(400).json({ success: false, message: "Invalid leave date range" });
      }
      await leave.save();
      return res.json({ success: true, data: leave });
    }

    const staff = await resolveStaffSelf(req);
    if (!staff) return res.status(404).json({ success: false, message: "Staff profile not found" });
    const leave = await StaffLeave.findOne({ _id: req.params.id, schoolId: staff.schoolId, staffId: staff._id });
    if (!leave) return res.status(404).json({ success: false, message: "Leave not found" });
    // Once reviewed by teacher/admin/principal, staff cannot edit
    if (leave.approvedBy) {
      return res.status(400).json({
        success: false,
        message: "Leave is already reviewed and cannot be edited",
      });
    }
    if (reason !== undefined) leave.reason = reason;
    if (leaveFrom !== undefined) leave.leaveFrom = dateOnly(leaveFrom);
    if (leaveTo !== undefined) leave.leaveTo = dateOnly(leaveTo);
    if (new Date(leave.leaveTo) < new Date(leave.leaveFrom)) {
      return res.status(400).json({ success: false, message: "Invalid leave date range" });
    }
    await leave.save();
    return res.json({ success: true, data: leave });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/mobile/leaves/me/:id?type=student|staff */
export const deleteMyLeaveMobile = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    const { type } = req.query || {};

    if (["Student", "Parent"].includes(role) || type === "student") {
      const student = await resolveStudentSelf(req);
      if (!student) return res.status(404).json({ success: false, message: "Student profile not found" });
      const leave = await StudentLeave.findOne({
        _id: req.params.id,
        schoolId: student.schoolId,
        studentId: student._id,
      });
      if (!leave) return res.status(404).json({ success: false, message: "Leave not found" });
      // Once reviewed by teacher/admin/principal, student/parent cannot delete
      if (leave.approvedBy) {
        return res.status(400).json({
          success: false,
          message: "Leave is already reviewed and cannot be deleted",
        });
      }
      await leave.deleteOne();
      return res.json({ success: true, message: "Leave deleted" });
    }

    const staff = await resolveStaffSelf(req);
    if (!staff) return res.status(404).json({ success: false, message: "Staff profile not found" });
    const leave = await StaffLeave.findOne({
      _id: req.params.id,
      schoolId: staff.schoolId,
      staffId: staff._id,
    });
    if (!leave) return res.status(404).json({ success: false, message: "Leave not found" });
    if (leave.approvedBy) {
      return res.status(400).json({
        success: false,
        message: "Leave is already reviewed and cannot be deleted",
      });
    }
    await leave.deleteOne();
    return res.json({ success: true, message: "Leave deleted" });
  } catch (error) {
    next(error);
  }
};

/** GET /api/mobile/leaves/pending?type=student|staff (for approvers) */
export const listPendingLeavesMobile = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (!isApprover(role)) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }
    const schoolId = req.user?.schoolId?._id ?? req.user?.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, message: "School context missing" });

    const { type = "student" } = req.query || {};
    if (type === "student") {
      const items = await StudentLeave.find({ schoolId, status: "Unapproved" })
        .populate("studentId", "name admissionNumber className section")
        .sort({ appliedDate: -1 })
        .lean();
      return res.json({ success: true, data: items });
    }
    const items = await StaffLeave.find({ schoolId, status: "Unapproved" })
      .populate("staffId", "name phone designation")
      .sort({ appliedDate: -1 })
      .lean();
    return res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/mobile/leaves/:id/status { type, status } (approver action) */
export const approveRejectLeaveMobile = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (!isApprover(role)) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }
    const schoolId = req.user?.schoolId?._id ?? req.user?.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, message: "School context missing" });

    const { type = "student", status } = req.body || {};
    if (!["Approved", "Unapproved"].includes(status)) {
      return res.status(400).json({ success: false, message: "status must be Approved or Unapproved" });
    }

    if (type === "student") {
      const leave = await StudentLeave.findOne({ _id: req.params.id, schoolId });
      if (!leave) return res.status(404).json({ success: false, message: "Leave not found" });
      leave.status = status;
      leave.approvedBy = req.user._id;
      leave.approvedAt = status === "Approved" ? new Date() : null;
      await leave.save();
      return res.json({ success: true, data: leave });
    }

    const leave = await StaffLeave.findOne({ _id: req.params.id, schoolId });
    if (!leave) return res.status(404).json({ success: false, message: "Leave not found" });
    leave.status = status;
    leave.approvedBy = req.user._id;
    leave.approvedAt = status === "Approved" ? new Date() : null;
    await leave.save();
    return res.json({ success: true, data: leave });
  } catch (error) {
    next(error);
  }
};

// -----------------------------
// Clean separated wrappers
// -----------------------------

export const applyStudentLeaveMobile = (req, res, next) => {
  req.body = { ...(req.body || {}), leaveType: "student" };
  return applyMyLeaveMobile(req, res, next);
};

export const getStudentLeavesMobile = (req, res, next) => {
  req.query = { ...(req.query || {}), type: "student" };
  return getMyLeavesMobile(req, res, next);
};

export const updateStudentLeaveMobile = (req, res, next) => {
  req.body = { ...(req.body || {}), type: "student" };
  return updateMyLeaveMobile(req, res, next);
};

export const deleteStudentLeaveMobile = (req, res, next) => {
  req.query = { ...(req.query || {}), type: "student" };
  return deleteMyLeaveMobile(req, res, next);
};

export const listPendingStudentLeavesMobile = (req, res, next) => {
  req.query = { ...(req.query || {}), type: "student" };
  return listPendingLeavesMobile(req, res, next);
};

export const updateStudentLeaveStatusMobile = (req, res, next) => {
  req.body = { ...(req.body || {}), type: "student" };
  return approveRejectLeaveMobile(req, res, next);
};

export const applyStaffLeaveMobile = (req, res, next) => {
  req.body = { ...(req.body || {}), leaveType: "staff" };
  return applyMyLeaveMobile(req, res, next);
};

export const getStaffLeavesMobile = (req, res, next) => {
  req.query = { ...(req.query || {}), type: "staff" };
  return getMyLeavesMobile(req, res, next);
};

export const updateStaffLeaveMobile = (req, res, next) => {
  req.body = { ...(req.body || {}), type: "staff" };
  return updateMyLeaveMobile(req, res, next);
};

export const deleteStaffLeaveMobile = (req, res, next) => {
  req.query = { ...(req.query || {}), type: "staff" };
  return deleteMyLeaveMobile(req, res, next);
};

export const listPendingStaffLeavesMobile = (req, res, next) => {
  req.query = { ...(req.query || {}), type: "staff" };
  return listPendingLeavesMobile(req, res, next);
};

export const updateStaffLeaveStatusMobile = (req, res, next) => {
  req.body = { ...(req.body || {}), type: "staff" };
  return approveRejectLeaveMobile(req, res, next);
};

