import mongoose from "mongoose";
import School from "../modules/school/school.model.js";

const BRANCH_ACCOUNTING_ROLES = new Set(["Admin", "Principal", "Accountant"]);

/**
 * Resolve all campus school IDs that share a branch with the given school.
 * Standalone schools (no branchId) return only themselves.
 */
export const resolveBranchSchoolIds = async (schoolId) => {
  if (!schoolId) return [];

  const id = schoolId._id || schoolId;
  const school = await School.findById(id).select("branchId").lean();
  if (!school) return [id];

  if (!school.branchId) return [school._id];

  const campuses = await School.find({ branchId: school.branchId }).select("_id").lean();
  return campuses.map((s) => s._id);
};

export const isBranchAccountingRole = (roleName) =>
  BRANCH_ACCOUNTING_ROLES.has(roleName);

export const getRequestedSchoolId = (req) =>
  req.query?.schoolId || req.body?.schoolId || req.params?.schoolId || null;

export const schoolIdInList = (id, ids = []) =>
  Boolean(id) && ids.some((x) => String(x) === String(id));

/**
 * Value to use in queries: single id or { $in: [...] }.
 */
export const schoolIdMatchValue = (req) => {
  if (Array.isArray(req.schoolIds) && req.schoolIds.length > 1) {
    return { $in: req.schoolIds };
  }
  if (Array.isArray(req.schoolIds) && req.schoolIds.length === 1) {
    return req.schoolIds[0];
  }
  return req.schoolId;
};

/** Coerce schoolId (or { $in }) to ObjectId(s) for reliable Mongo queries/aggregations. */
export const normalizeSchoolIdForQuery = (schoolId) => {
  if (!schoolId) return null;

  const toObjectId = (value) => {
    const raw = value?._id || value;
    if (!raw) return null;
    if (raw instanceof mongoose.Types.ObjectId) return raw;
    const str = String(raw);
    if (!mongoose.Types.ObjectId.isValid(str)) return raw;
    return new mongoose.Types.ObjectId(str);
  };

  if (typeof schoolId === "object" && schoolId.$in) {
    const ids = (schoolId.$in || []).map(toObjectId).filter(Boolean);
    return ids.length ? { $in: ids } : null;
  }

  return toObjectId(schoolId);
};

/**
 * Build a Mongo filter for schoolId from req (after injectSchool / injectBranchSchoolScope).
 */
export const schoolIdFilter = (req) => ({
  schoolId: schoolIdMatchValue(req),
});

/**
 * True if targetSchoolId is within the caller's allowed school scope.
 */
export const isSchoolInScope = (req, targetSchoolId) => {
  if (!targetSchoolId || !req.schoolId) return false;
  const target = String(targetSchoolId._id || targetSchoolId);
  if (Array.isArray(req.schoolIds) && req.schoolIds.length > 0) {
    return req.schoolIds.some((id) => String(id) === target);
  }
  return String(req.schoolId) === target;
};
