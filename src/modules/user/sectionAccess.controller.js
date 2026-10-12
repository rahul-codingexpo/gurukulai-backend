import User from "./user.model.js";
import Role from "../auth/role.model.js";
import Staff from "../staff/staff.model.js";
import {
  ASSIGNABLE_SECTION_SET,
  CONTROLLABLE_STAFF_ROLES,
} from "./sectionAccess.constants.js";

const resolveSchoolId = (req) => {
  const roleName = req.user?.roleId?.name;
  if (roleName === "SuperAdmin") {
    return req.query.schoolId || req.body.schoolId || null;
  }
  return req.user?.schoolId?._id || req.user?.schoolId || null;
};

/**
 * GET /users/section-access
 * Lists staff users (Teacher, Accountant, Staff, Librarian) for the school
 * with their allowedSections. Optional ?role=Teacher|Accountant|Staff|Librarian|all
 */
export const listSectionAccess = async (req, res, next) => {
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

    const roleFilter = String(req.query.role || "all").trim();
    const rolesToFind =
      roleFilter && roleFilter.toLowerCase() !== "all"
        ? CONTROLLABLE_STAFF_ROLES.includes(roleFilter)
          ? [roleFilter]
          : []
        : CONTROLLABLE_STAFF_ROLES;

    if (!rolesToFind.length) {
      return res.status(400).json({
        success: false,
        message: `role must be one of: ${CONTROLLABLE_STAFF_ROLES.join(", ")}, or all`,
      });
    }

    const roles = await Role.find({ name: { $in: rolesToFind } })
      .select("_id name")
      .lean();
    const roleIds = roles.map((r) => r._id);
    if (!roleIds.length) {
      return res.json({ success: true, data: [] });
    }

    const users = await User.find({
      schoolId,
      roleId: { $in: roleIds },
      status: { $ne: "INACTIVE" },
    })
      .populate("roleId", "name")
      .select("name email phone roleId status allowedSections createdAt")
      .sort({ name: 1 })
      .lean();

    const userIds = users.map((u) => u._id);
    const staffRows = userIds.length
      ? await Staff.find({
          schoolId,
          userId: { $in: userIds },
        })
          .select("userId photoUrl")
          .lean()
      : [];

    const photoByUserId = new Map(
      staffRows.map((s) => [String(s.userId), s.photoUrl || null]),
    );

    res.json({
      success: true,
      data: users.map((u) => ({
        ...u,
        photoUrl: photoByUserId.get(String(u._id)) || null,
        // null/undefined = unrestricted; expose as null for UI clarity
        allowedSections: Array.isArray(u.allowedSections) ? u.allowedSections : null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /users/:id/section-access
 * Body: { allowedSections: string[] | null }
 * null clears restrictions (full menu). Array sets exact access.
 */
export const updateSectionAccess = async (req, res, next) => {
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

    const { id } = req.params;
    const { allowedSections } = req.body || {};

    const user = await User.findOne({ _id: id, schoolId }).populate(
      "roleId",
      "name",
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Staff user not found in this school",
      });
    }

    const roleName = user.roleId?.name;
    if (!CONTROLLABLE_STAFF_ROLES.includes(roleName)) {
      return res.status(400).json({
        success: false,
        message: `Cannot manage section access for role: ${roleName}`,
      });
    }

    if (allowedSections === null || allowedSections === undefined) {
      await User.updateOne({ _id: user._id }, { $unset: { allowedSections: "" } });
    } else if (!Array.isArray(allowedSections)) {
      return res.status(400).json({
        success: false,
        message: "allowedSections must be an array of section ids, or null to clear",
      });
    } else {
      const cleaned = [
        ...new Set(
          allowedSections
            .map((s) => String(s || "").trim())
            .filter((s) => ASSIGNABLE_SECTION_SET.has(s)),
        ),
      ];
      await User.updateOne({ _id: user._id }, { $set: { allowedSections: cleaned } });
    }

    const fresh = await User.findById(user._id)
      .populate("roleId", "name")
      .select("name email phone roleId status allowedSections")
      .lean();

    res.json({
      success: true,
      message: "Section access updated",
      data: {
        ...fresh,
        allowedSections: Array.isArray(fresh.allowedSections)
          ? fresh.allowedSections
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};
