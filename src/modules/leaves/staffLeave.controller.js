import StaffLeave from "./staffLeave.model.js";
import Staff from "../staff/staff.model.js";

const resolveSchoolId = (req) => {
  const roleName = req.user?.roleId?.name;
  if (roleName === "SuperAdmin") {
    return req.query.schoolId || req.body.schoolId || req.params.schoolId || null;
  }
  return req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
};

/** Admin/Principal manage all school staff leaves; Staff/Teacher only their own. */
const canManageSchoolStaffLeaves = (roleName) =>
  ["Admin", "Principal", "SuperAdmin"].includes(roleName);

const isSelfServiceStaffRole = (roleName) =>
  ["Staff", "Teacher"].includes(roleName);

const resolveLinkedStaff = async (userId) =>
  Staff.findOne({ userId }).select("_id schoolId phone name designation");

/** Apply for leave (Staff/Teacher own) or create on behalf (Admin/Principal/SuperAdmin). */
export const createStaffLeave = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    let schoolId = resolveSchoolId(req);
    let staffId = req.body.staffId;

    if (isSelfServiceStaffRole(roleName)) {
      const staff = await resolveLinkedStaff(req.user._id);
      if (!staff) {
        return res.status(404).json({
          success: false,
          message: "Staff profile not found for this user",
        });
      }
      schoolId = staff.schoolId;
      staffId = staff._id;
    } else if (canManageSchoolStaffLeaves(roleName)) {
      if (!staffId) {
        return res.status(400).json({
          success: false,
          message: "staffId is required when creating leave for staff/teacher",
        });
      }
      const staffQuery = { _id: staffId };
      if (schoolId) staffQuery.schoolId = schoolId;
      const staffMember = await Staff.findOne(staffQuery).select("_id schoolId");
      if (!staffMember) {
        return res.status(404).json({
          success: false,
          message: schoolId
            ? "Staff member not found in this school"
            : "Staff member not found (provide schoolId for SuperAdmin)",
        });
      }
      schoolId = staffMember.schoolId;
      staffId = staffMember._id;
    }

    if (!schoolId || !staffId) {
      return res.status(400).json({
        success: false,
        message:
          roleName === "SuperAdmin"
            ? "schoolId and staffId are required"
            : "School/staff context missing",
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

    const leave = await StaffLeave.create({
      schoolId,
      staffId,
      appliedDate: new Date(),
      reason,
      leaveFrom: from,
      leaveTo: to,
      status: "Unapproved",
    });

    const populated = await StaffLeave.findById(leave._id).populate(
      "staffId",
      "name phone designation"
    );

    res.status(201).json({
      success: true,
      data: formatStaffLeave(populated),
    });
  } catch (error) {
    next(error);
  }
};

/** List: Staff/Teacher see own; Admin/Principal/SuperAdmin see all for school */
export const getStaffLeaves = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    let schoolId = resolveSchoolId(req);
    let staffIdFilter = null;

    if (isSelfServiceStaffRole(roleName)) {
      const staff = await resolveLinkedStaff(req.user._id);
      if (!staff) {
        return res.status(404).json({
          success: false,
          message: "Staff profile not found for this user",
        });
      }
      schoolId = staff.schoolId;
      staffIdFilter = staff._id;
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

    const { staffId, status } = req.query;
    const filter = { schoolId };
    if (staffIdFilter) filter.staffId = staffIdFilter;
    else if (staffId) filter.staffId = staffId;
    if (status) filter.status = status;

    const leaves = await StaffLeave.find(filter)
      .populate("staffId", "name phone designation")
      .populate("approvedBy", "name")
      .sort({ appliedDate: -1 });

    res.json({
      success: true,
      data: leaves.map(formatStaffLeave),
    });
  } catch (error) {
    next(error);
  }
};

export const getStaffLeaveById = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    let schoolId = resolveSchoolId(req);
    let staffIdFilter = null;

    if (isSelfServiceStaffRole(roleName)) {
      const staff = await resolveLinkedStaff(req.user._id);
      if (!staff) {
        return res.status(404).json({
          success: false,
          message: "Staff profile not found for this user",
        });
      }
      schoolId = staff.schoolId;
      staffIdFilter = staff._id;
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
    if (staffIdFilter) filter.staffId = staffIdFilter;

    const leave = await StaffLeave.findOne(filter)
      .populate("staffId", "name phone designation")
      .populate("approvedBy", "name");

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Staff leave not found",
      });
    }

    res.json({
      success: true,
      data: formatStaffLeave(leave),
    });
  } catch (error) {
    next(error);
  }
};

/** Update (edit) – applicant or Admin/Principal */
export const updateStaffLeave = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    let schoolId = resolveSchoolId(req);
    const leave = await StaffLeave.findById(req.params.id).populate(
      "staffId",
      "name phone designation"
    );

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Staff leave not found",
      });
    }

    if (isSelfServiceStaffRole(roleName)) {
      const staff = await resolveLinkedStaff(req.user._id);
      if (!staff || !leave.staffId._id.equals(staff._id)) {
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

    const populated = await StaffLeave.findById(leave._id)
      .populate("staffId", "name phone designation")
      .populate("approvedBy", "name");

    res.json({
      success: true,
      data: formatStaffLeave(populated),
    });
  } catch (error) {
    next(error);
  }
};

/** Approve/Unapprove – Admin, Principal, Teacher only */
export const updateStaffLeaveStatus = async (req, res, next) => {
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

    const leave = await StaffLeave.findOne({
      _id: req.params.id,
      schoolId,
    });

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Staff leave not found",
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

    const populated = await StaffLeave.findById(leave._id)
      .populate("staffId", "name phone designation")
      .populate("approvedBy", "name");

    res.json({
      success: true,
      data: formatStaffLeave(populated),
    });
  } catch (error) {
    next(error);
  }
};

/** Delete – applicant or Admin/Principal */
export const deleteStaffLeave = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    let schoolId = resolveSchoolId(req);

    const leave = await StaffLeave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Staff leave not found",
      });
    }

    if (isSelfServiceStaffRole(roleName)) {
      const staff = await resolveLinkedStaff(req.user._id);
      if (!staff || !leave.staffId.equals(staff._id)) {
        return res.status(403).json({
          success: false,
          message: "You can only delete your own leave",
        });
      }
    } else if (!canManageSchoolStaffLeaves(roleName)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to delete this leave",
      });
    } else if (leave.schoolId.toString() !== schoolId?.toString()) {
      return res.status(403).json({
        success: false,
        message: "Leave not found in your school",
      });
    }

    await StaffLeave.findByIdAndDelete(req.params.id);
    res.json({
      success: true,
      message: "Staff leave deleted",
    });
  } catch (error) {
    next(error);
  }
};

function formatStaffLeave(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    _id: d._id,
    staffId: d.staffId?._id,
    staffIdPhone: d.staffId?.phone,
    name: d.staffId?.name,
    role: d.staffId?.designation,
    appliedDate: d.appliedDate,
    reason: d.reason,
    leaveFrom: d.leaveFrom,
    leaveTo: d.leaveTo,
    status: d.status,
    approvedBy: d.approvedBy?.name,
    approvedAt: d.approvedAt,
    schoolId: d.schoolId,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}
