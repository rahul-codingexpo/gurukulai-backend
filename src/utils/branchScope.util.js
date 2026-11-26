import mongoose from "mongoose";
import School from "../modules/school/school.model.js";

const BRANCH_ACCOUNTING_ROLES = new Set(["Admin", "Principal", "Accountant"]);

/**
 * Resolve all campus school IDs that share a branch with the given school.
 * Standalone schools (no branchId) return only themselves.
 * Also includes schools with the same name (common when campuses were
 * created without a shared branchId — breaks QR + wallet proof matching).
 */
export const resolveBranchSchoolIds = async (schoolId) => {
  if (!schoolId) return [];

  const id = schoolId._id || schoolId;
  const school = await School.findById(id).select("branchId name").lean();
  if (!school) return [id];

  const out = [];
  const push = (value) => {
    const raw = value?._id || value;
    if (!raw) return;
    const key = String(raw);
    if (!out.some((x) => String(x) === key)) out.push(raw);
  };

  push(school._id);

  if (school.branchId) {
    const campuses = await School.find({ branchId: school.branchId })
      .select("_id")
      .lean();
    campuses.forEach((s) => push(s._id));
  }

  const name = String(school.name || "").trim();
  if (name) {
    // Match "Angels Public School" and "Angels Public School Begusarai"
    // Also first 2 tokens ("Angels Public") so typos/truncation still link campuses.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const baseName = name
      .replace(/\s+(begusarai|campus|branch)\s*$/i, "")
      .trim();
    const baseEscaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tokens = name.split(/\s+/).filter((w) => w.length > 1);
    const shortPrefix = tokens.slice(0, Math.min(2, tokens.length)).join(" ");
    const shortEscaped = shortPrefix
      ? shortPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      : "";

    const orClauses = [
      { name: new RegExp(`^${escaped}$`, "i") },
      { name: new RegExp(`^${escaped}`, "i") },
    ];
    if (baseEscaped && baseEscaped.toLowerCase() !== escaped.toLowerCase()) {
      orClauses.push({ name: new RegExp(`^${baseEscaped}`, "i") });
    }
    if (
      shortEscaped &&
      shortEscaped.toLowerCase() !== escaped.toLowerCase() &&
      shortEscaped.toLowerCase() !== baseEscaped.toLowerCase()
    ) {
      orClauses.push({ name: new RegExp(`^${shortEscaped}`, "i") });
    }

    const sameName = await School.find({ $or: orClauses }).select("_id").lean();
    sameName.forEach((s) => push(s._id));
  }

  return out.length ? out : [id];
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
