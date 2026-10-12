import StudyMaterial from "../studyMaterials/studyMaterial.model.js";
import Student from "../student/student.model.js";
import ClassModel from "../academic/class.model.js";
import Section from "../academic/section.model.js";
import { uploadedFileUrl } from "../../utils/uploadFile.util.js";
import { normalizeFileUrlList } from "../../utils/spacesPublicUrl.util.js";

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

const resolveStudentClassSectionIds = async (student) => {
  const schoolId = student.schoolId;
  const classes = await ClassModel.find({
    schoolId,
    name: student.className,
  }).select("_id");

  if (!classes.length) {
    return { classIds: [], sectionIds: [] };
  }

  const classIds = classes.map((c) => c._id);
  const sections = await Section.find({
    schoolId,
    classId: { $in: classIds },
    name: student.section,
  }).select("_id");

  return { classIds, sectionIds: sections.map((s) => s._id) };
};

const toMobileMaterial = (doc) => {
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  const files = normalizeFileUrlList(plain.files || []);
  const url = (plain.url || "").trim();
  const className = plain.classId?.name || plain.className || "";
  const subjectName = plain.subjectId?.name || plain.subject || "";
  const sectionName = plain.sectionId?.name || plain.section || "";

  return {
    id: String(plain._id),
    _id: String(plain._id),
    title: plain.title || "",
    description: plain.description || "",
    classId: plain.classId?._id ?? plain.classId ?? null,
    className,
    sectionId: plain.sectionId?._id ?? plain.sectionId ?? null,
    sectionName,
    subjectId: plain.subjectId?._id ?? plain.subjectId ?? null,
    subject: subjectName,
    subjectName,
    url: url || null,
    files,
    fileUrl: files[0] || url || null,
    downloadable: plain.downloadable !== false,
    createdAt: plain.createdAt || null,
    uploadedAt: plain.createdAt || null,
  };
};

/** GET /api/mobile/study-materials */
export const listMobileStudyMaterials = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    const filter = { schoolId };

    if (role === "Student" || role === "Parent") {
      const student = await resolveStudentSelf(req);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found",
        });
      }
      const { classIds, sectionIds } = await resolveStudentClassSectionIds(student);
      if (!classIds.length || !sectionIds.length) {
        return res.json({ success: true, data: [] });
      }
      filter.classId = { $in: classIds };
      filter.sectionId = { $in: sectionIds };
    } else if (role === "Teacher" || role === "Staff") {
      if (req.query.classId) filter.classId = req.query.classId;
      if (req.query.sectionId) filter.sectionId = req.query.sectionId;
      if (req.query.subjectId) filter.subjectId = req.query.subjectId;
    } else {
      return res.status(403).json({
        success: false,
        message: "Not allowed",
      });
    }

    const materials = await StudyMaterial.find(filter)
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name code")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: materials.map(toMobileMaterial),
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/mobile/study-materials/:id */
export const getMobileStudyMaterialById = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    const material = await StudyMaterial.findOne({
      _id: req.params.id,
      schoolId,
    })
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name code")
      .populate("createdBy", "name");

    if (!material) {
      return res.status(404).json({
        success: false,
        message: "Study material not found",
      });
    }

    if (role === "Student" || role === "Parent") {
      const student = await resolveStudentSelf(req);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found",
        });
      }
      const { classIds, sectionIds } = await resolveStudentClassSectionIds(student);
      const okClass = classIds.some(
        (id) => String(id) === String(material.classId?._id ?? material.classId),
      );
      const okSection = sectionIds.some(
        (id) => String(id) === String(material.sectionId?._id ?? material.sectionId),
      );
      if (!okClass || !okSection) {
        return res.status(403).json({
          success: false,
          message: "Not allowed to view this study material",
        });
      }
    } else if (!["Teacher", "Staff"].includes(role)) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    res.json({
      success: true,
      data: toMobileMaterial(material),
    });
  } catch (error) {
    next(error);
  }
};

/** POST /api/mobile/study-materials — Teacher/Staff upload */
export const createMobileStudyMaterial = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (!["Teacher", "Staff"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Only Teacher or Staff can upload study materials",
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
    const { classId, sectionId, subjectId, title } = body;
    if (!classId || !sectionId || !subjectId || !title) {
      return res.status(400).json({
        success: false,
        message: "classId, sectionId, subjectId and title are required",
      });
    }

    const filePaths = [];
    if (req.files?.files && Array.isArray(req.files.files)) {
      req.files.files.forEach((f) => filePaths.push(uploadedFileUrl(f)));
    } else if (req.files?.files) {
      filePaths.push(uploadedFileUrl(req.files.files));
    }

    const material = await StudyMaterial.create({
      schoolId,
      classId,
      sectionId,
      subjectId,
      title,
      description: body.description || "",
      url: body.url || "",
      downloadable: body.downloadable !== false && body.downloadable !== "false",
      files: filePaths,
      createdBy: req.user._id,
    });

    const populated = await StudyMaterial.findById(material._id)
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name code")
      .populate("createdBy", "name");

    res.status(201).json({
      success: true,
      data: toMobileMaterial(populated),
    });
  } catch (error) {
    next(error);
  }
};
