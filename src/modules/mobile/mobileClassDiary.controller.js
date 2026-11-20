import ClassDiary from "../classDiary/classDiary.model.js";
import Student from "../student/student.model.js";
import { uploadedFileUrl } from "../../utils/uploadFile.util.js";
import { deleteFromSpacesByUrl } from "../../utils/spacesFile.util.js";
import { resolveStudentClassSectionIds } from "../../utils/resolveClassByName.util.js";

const roleNameOf = (req) => req.user?.roleId?.name;

const resolveSchoolId = (req) =>
  req.user?.schoolId?._id ?? req.user?.schoolId ?? null;

const resolveStudentSelf = async (req) => {
  const role = roleNameOf(req);
  if (role === "Student") {
    return Student.findOne({ "studentLogin.userId": req.user._id })
      .select("_id schoolId className section")
      .lean();
  }
  if (role === "Parent") {
    return Student.findOne({ "parentLogin.userId": req.user._id })
      .select("_id schoolId className section")
      .lean();
  }
  return null;
};

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
    date: plain.date,
    topic: plain.topic || "",
    topicPhoto: normalizePhotoPath(plain.topicPhoto),
    classworkPhoto: normalizePhotoPath(plain.classworkPhoto),
    createdBy: plain.createdBy?._id ?? plain.createdBy ?? null,
    teacherName: plain.createdBy?.name || "",
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

/** GET /api/mobile/class-diary?classId=&sectionId=&date= */
export const listMobileClassDiary = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (!["Teacher", "Staff", "Student", "Parent"].includes(role)) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    const filter = { schoolId };
    const classId = String(req.query.classId || "").trim();
    const sectionId = String(req.query.sectionId || "").trim();
    const dateRaw = String(req.query.date || "").trim();

    if (role === "Student" || role === "Parent") {
      const student = await resolveStudentSelf(req);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found",
        });
      }
      const { classIds, sectionIds } = await resolveStudentClassSectionIds(student);
      if (!classIds.length) {
        return res.json({ success: true, data: [] });
      }
      filter.classId = { $in: classIds };
      if (sectionIds.length) {
        filter.$or = [
          { sectionId: null },
          { sectionId: { $exists: false } },
          { sectionId: { $in: sectionIds } },
        ];
      }
      if (classId && !classIds.some((id) => String(id) === classId)) {
        return res.status(403).json({
          success: false,
          message: "Not allowed to view this class diary",
        });
      }
      if (classId) filter.classId = classId;
    } else {
      if (classId) filter.classId = classId;
      if (sectionId) {
        filter.$or = [
          { sectionId: null },
          { sectionId: { $exists: false } },
          { sectionId },
        ];
      }
    }

    if (dateRaw) {
      const day = new Date(dateRaw);
      if (!Number.isNaN(day.getTime())) {
        filter.date = { $gte: startOfDay(day), $lte: endOfDay(day) };
      }
    }

    const rows = await ClassDiary.find(filter)
      .populate("classId", "name")
      .populate("sectionId", "name")
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

/** POST /api/mobile/class-diary — Teacher only */
export const createMobileClassDiary = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (role !== "Teacher") {
      return res.status(403).json({
        success: false,
        message: "Only teachers can add class diary entries",
      });
    }

    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    const body = req.body || {};
    const classId = String(body.classId || "").trim();
    const sectionId = String(body.sectionId || "").trim() || null;
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
      date: startOfDay(date),
      topic,
      topicPhoto,
      classworkPhoto,
      createdBy: req.user._id,
    });

    const populated = await ClassDiary.findById(entry._id)
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("createdBy", "name");

    res.status(201).json({
      success: true,
      data: serializeEntry(populated),
    });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/mobile/class-diary/:id — Teacher, own entries */
export const deleteMobileClassDiary = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (role !== "Teacher") {
      return res.status(403).json({
        success: false,
        message: "Only teachers can delete class diary entries",
      });
    }

    const schoolId = resolveSchoolId(req);
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

    if (String(entry.createdBy) !== String(req.user._id)) {
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
