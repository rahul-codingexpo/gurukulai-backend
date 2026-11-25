import ClassDiary from "./classDiary.model.js";
import { uploadedFileUrl } from "../../utils/uploadFile.util.js";
import { deleteFromSpacesByUrl } from "../../utils/spacesFile.util.js";

const resolveSchoolId = (req) => {
  const roleName = req.user?.roleId?.name;
  if (roleName === "SuperAdmin") {
    return (
      req.query.schoolId ||
      req.body?.schoolId ||
      req.params.schoolId ||
      null
    );
  }
  return req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
};

const roleNameOf = (req) => req.user?.roleId?.name;

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const normalizePhotoPath = (storedPath) => {
  let value = String(storedPath || "").trim().replace(/\\/g, "/");
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("uploads/")) value = `/${value}`;
  if (!value.includes("/")) return `/uploads/study-materials/${value}`;
  const bare = value.match(/^\/uploads\/([^/]+)$/);
  if (bare && bare[1].includes(".")) {
    return `/uploads/study-materials/${bare[1]}`;
  }
  return value.startsWith("/") ? value : `/${value}`;
};

const serializeEntry = (doc) => {
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  return {
    id: String(plain._id),
    _id: String(plain._id),
    schoolId: plain.schoolId,
    classId: plain.classId?._id ?? plain.classId ?? null,
    className: plain.classId?.name || "",
    sectionId: plain.sectionId?._id ?? plain.sectionId ?? null,
    sectionName: plain.sectionId?.name || "",
    subjectId: plain.subjectId?._id ?? plain.subjectId ?? null,
    subjectName: plain.subjectName || plain.subjectId?.name || "",
    date: plain.date,
    topic: plain.topic || "",
    topicPhoto: normalizePhotoPath(plain.topicPhoto),
    classworkPhoto: normalizePhotoPath(plain.classworkPhoto),
    createdBy: String(plain.createdBy?._id ?? plain.createdBy ?? ""),
    teacherName: plain.createdBy?.name || "",
    authorName: plain.createdBy?.name || "",
    createdAt: plain.createdAt || null,
    updatedAt: plain.updatedAt || null,
  };
};

const pickUploaded = (req, field) => {
  const files = req.files?.[field];
  if (!files) return "";
  const file = Array.isArray(files) ? files[0] : files;
  return uploadedFileUrl(file) || "";
};

/** GET /api/class-diary */
export const listClassDiary = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          roleNameOf(req) === "SuperAdmin"
            ? "schoolId is required (query)"
            : "School context missing",
      });
    }

    const filter = { schoolId };
    const classId = String(req.query.classId || "").trim();
    const sectionId = String(req.query.sectionId || "").trim();
    const subjectId = String(req.query.subjectId || "").trim();
    const subjectName = String(req.query.subjectName || "").trim();
    const dateRaw = String(req.query.date || "").trim();

    if (classId) filter.classId = classId;
    if (sectionId) {
      filter.$or = [
        { sectionId: null },
        { sectionId: { $exists: false } },
        { sectionId },
      ];
    }

    if (dateRaw) {
      const day = new Date(dateRaw);
      if (!Number.isNaN(day.getTime())) {
        filter.date = { $gte: startOfDay(day), $lte: endOfDay(day) };
      }
    }

    if (subjectId) {
      filter.subjectId = subjectId;
    } else if (subjectName) {
      filter.subjectName = new RegExp(
        `^${subjectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i",
      );
    }

    const rows = await ClassDiary.find(filter)
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name")
      .populate("createdBy", "name")
      .sort({ date: -1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: rows.map(serializeEntry),
    });
  } catch (error) {
    next(error);
  }
};

/** POST /api/class-diary */
export const createClassDiary = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          roleNameOf(req) === "SuperAdmin"
            ? "schoolId is required (query or body)"
            : "School context missing",
      });
    }

    const body = req.body || {};
    const classId = String(body.classId || "").trim();
    const sectionId = String(body.sectionId || "").trim() || null;
    const subjectId = String(body.subjectId || "").trim() || null;
    const subjectName = String(body.subjectName || "").trim();
    const topic = String(body.topic || "").trim();
    const dateRaw = String(body.date || "").trim();

    if (!classId || !topic) {
      return res.status(400).json({
        success: false,
        message: "classId and topic are required",
      });
    }

    const date = dateRaw ? new Date(dateRaw) : new Date();
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date",
      });
    }

    const topicPhoto = pickUploaded(req, "topicPhoto");
    const classworkPhoto = pickUploaded(req, "classworkPhoto");

    const entry = await ClassDiary.create({
      schoolId,
      classId,
      sectionId,
      subjectId,
      subjectName,
      date: startOfDay(date),
      topic,
      topicPhoto,
      classworkPhoto,
      createdBy: req.user._id,
    });

    const populated = await ClassDiary.findById(entry._id)
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name")
      .populate("createdBy", "name");

    res.status(201).json({
      success: true,
      data: serializeEntry(populated),
    });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/class-diary/:id */
export const deleteClassDiary = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          roleNameOf(req) === "SuperAdmin"
            ? "schoolId is required (query)"
            : "School context missing",
      });
    }

    const entry = await ClassDiary.findOne({
      _id: req.params.id,
      schoolId,
    });

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Entry not found",
      });
    }

    const role = roleNameOf(req);
    const isManager = ["Admin", "Principal", "SuperAdmin"].includes(role);
    if (!isManager && String(entry.createdBy) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own entries",
      });
    }

    if (entry.topicPhoto) await deleteFromSpacesByUrl(entry.topicPhoto);
    if (entry.classworkPhoto) await deleteFromSpacesByUrl(entry.classworkPhoto);
    await entry.deleteOne();

    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    next(error);
  }
};
