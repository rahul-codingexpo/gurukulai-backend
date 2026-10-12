import mongoose from "mongoose";

export const TRANSPORT_ROLES = ["SuperAdmin", "Admin", "Principal"];

export const roleNameOf = (req) => req.user?.roleId?.name;

export const resolveSchoolId = (req) => {
  const role = roleNameOf(req);
  if (role === "SuperAdmin") {
    return (
      req.query.schoolId ||
      req.body?.schoolId ||
      req.params?.schoolId ||
      req.schoolId ||
      null
    );
  }
  return req.schoolId || req.user?.schoolId?._id || req.user?.schoolId || null;
};

export const toObjectId = (value) => {
  if (!value) return null;
  const raw = value._id || value;
  if (raw instanceof mongoose.Types.ObjectId) return raw;
  const str = String(raw);
  if (!mongoose.Types.ObjectId.isValid(str)) return null;
  return new mongoose.Types.ObjectId(str);
};

export const ok = (res, payload = {}) => res.json({ success: true, ...payload });

export const fail = (res, status, message, extra) =>
  res.status(status).json({
    success: false,
    message,
    ...(extra || {}),
  });

export const parseDateOnly = (value) => {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const dt = new Date(`${s}T00:00:00.000Z`);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

export const toISODateOnly = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

export const normalizeStatus = (value, fallback = "active") => {
  const s = String(value || fallback).trim().toLowerCase();
  if (s === "inactive") return "inactive";
  return "active";
};

export const isActiveStatus = (status) =>
  String(status || "active").toLowerCase() === "active";

export async function nextSequentialCode(Model, schoolId, prefix, field, pad = 3) {
  const latest = await Model.findOne({ schoolId })
    .sort({ createdAt: -1 })
    .select(field)
    .lean();
  let nextNum = 1;
  if (latest?.[field]) {
    const match = String(latest[field]).match(/(\d+)\s*$/);
    if (match) nextNum = Number(match[1]) + 1;
  }
  return `${prefix}-${String(nextNum).padStart(pad, "0")}`;
}

export const studentSnapshotFromDoc = (student) => {
  const parent = student?.parents?.father || student?.parents?.mother || student?.parents?.guardian || {};
  return {
    studentName: student?.name || "",
    admissionNumber: student?.admissionNumber || "",
    className: student?.className || "",
    section: student?.section || "",
    parentName: parent?.name || student?.parents?.father?.name || student?.parents?.mother?.name || "",
    parentMobile:
      parent?.mobile ||
      parent?.phone ||
      student?.parents?.father?.mobile ||
      student?.parents?.mother?.mobile ||
      "",
  };
};
