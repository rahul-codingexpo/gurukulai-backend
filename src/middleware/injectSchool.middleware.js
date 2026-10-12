import {
  resolveBranchSchoolIds,
  isBranchAccountingRole,
  getRequestedSchoolId,
  schoolIdInList,
} from "../utils/branchScope.util.js";

export const injectSchool = (req, res, next) => {
  const roleName = req.user?.roleId?.name;

  // SuperAdmin: allow selecting school via query/body
  if (!req.user.schoolId && roleName === "SuperAdmin") {
    const selected =
      req.query.schoolId || req.body.schoolId || req.params.schoolId;
    req.schoolId = selected || null;
    req.schoolIds = selected ? [selected] : [];
    return next();
  }

  // Other roles: always scoped to their own school
  if (req.user.schoolId && req.user.schoolId._id) {
    req.schoolId = req.user.schoolId._id;
  } else {
    req.schoolId = req.user.schoolId || null;
  }

  req.schoolIds = req.schoolId ? [req.schoolId] : [];
  next();
};

/**
 * Accounting-only middleware: Admin/Principal/Accountant may work on any
 * campus in their branch group. If they pass a schoolId that belongs to the
 * branch, scope is that campus; otherwise it stays on their home school.
 * Must run after protect (and typically after/with injectSchool).
 */
export const injectBranchSchoolScope = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;

    // Ensure base schoolId is set
    if (!req.schoolId) {
      if (!req.user?.schoolId && roleName === "SuperAdmin") {
        const selected =
          req.query.schoolId || req.body.schoolId || req.params.schoolId;
        req.schoolId = selected || null;
      } else if (req.user?.schoolId?._id) {
        req.schoolId = req.user.schoolId._id;
      } else {
        req.schoolId = req.user?.schoolId || null;
      }
    }

    if (!req.schoolId) {
      req.schoolIds = [];
      return next();
    }

    if (isBranchAccountingRole(roleName)) {
      const branchIds = await resolveBranchSchoolIds(req.schoolId);
      const requested = getRequestedSchoolId(req);
      if (requested && schoolIdInList(requested, branchIds)) {
        req.schoolId = requested;
        req.schoolIds = [requested];
      } else {
        req.schoolIds = [req.schoolId];
      }
    } else {
      req.schoolIds = [req.schoolId];
    }

    next();
  } catch (err) {
    next(err);
  }
};
