import StudyMaterial from "./studyMaterial.model.js";
import { uploadedFileUrl } from "../../utils/uploadFile.util.js";

const resolveSchoolId = (req) => {
  const roleName = req.user?.roleId?.name;
  if (roleName === "SuperAdmin") {
    return (
      req.query.schoolId ||
      req.body.schoolId ||
      req.params.schoolId ||
      null
    );
  }
  return req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
};

const parseBoolean = (v) => {
  if (v === true || v === "true" || v === "1" || v === 1) return true;
  if (v === false || v === "false" || v === "0" || v === 0) return false;
  return undefined;
};

/** Create – Admin, Principal, Teacher */
export const createStudyMaterial = async (req, res, next) => {
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

    const body = req.body || {};
    const classId = body.classId;
    const sectionId = body.sectionId;
    const subjectId = body.subjectId;
    const title = body.title;
    const description = body.description || "";
    const url = body.url || "";
    const downloadable = parseBoolean(body.downloadable);
    if (downloadable === undefined) body.downloadable = true;

    if (!classId || !sectionId || !subjectId || !title) {
      return res.status(400).json({
        success: false,
        message:
          "classId, sectionId, subjectId and title are required",
      });
    }

    const filePaths = [];
    if (req.files && req.files.files && Array.isArray(req.files.files)) {
      req.files.files.forEach((f) => {
        filePaths.push(uploadedFileUrl(f));
      });
    } else if (req.files && req.files.files) {
      filePaths.push(uploadedFileUrl(req.files.files));
    }

    const material = await StudyMaterial.create({
      schoolId,
      classId,
      sectionId,
      subjectId,
      title,
      description,
      url,
      downloadable: downloadable !== false,
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
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

/** List – all users; optional filters: classId, sectionId, subjectId */
export const getStudyMaterials = async (req, res, next) => {
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

    const { classId, sectionId, subjectId } = req.query;
    const filter = { schoolId };
    if (classId) filter.classId = classId;
    if (sectionId) filter.sectionId = sectionId;
    if (subjectId) filter.subjectId = subjectId;

    const materials = await StudyMaterial.find(filter)
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name code")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: materials,
    });
  } catch (error) {
    next(error);
  }
};

/** Get one by id – all users */
export const getStudyMaterialById = async (req, res, next) => {
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

    const material = await StudyMaterial.findOne({
      _id: req.params.id,
      schoolId,
    })
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name code type")
      .populate("createdBy", "name");

    if (!material) {
      return res.status(404).json({
        success: false,
        message: "Study material not found",
      });
    }

    res.json({
      success: true,
      data: material,
    });
  } catch (error) {
    next(error);
  }
};

/** Update – Admin, Principal, Teacher */
export const updateStudyMaterial = async (req, res, next) => {
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

    const material = await StudyMaterial.findOne({
      _id: req.params.id,
      schoolId,
    });

    if (!material) {
      return res.status(404).json({
        success: false,
        message: "Study material not found",
      });
    }

    const body = req.body || {};
    if (body.classId !== undefined) material.classId = body.classId;
    if (body.sectionId !== undefined) material.sectionId = body.sectionId;
    if (body.subjectId !== undefined) material.subjectId = body.subjectId;
    if (body.title !== undefined) material.title = body.title;
    if (body.description !== undefined) material.description = body.description;
    if (body.url !== undefined) material.url = body.url;
    if (parseBoolean(body.downloadable) !== undefined)
      material.downloadable = parseBoolean(body.downloadable);

    if (req.files && req.files.files) {
      const filePaths = Array.isArray(req.files.files)
        ? req.files.files.map((f) => uploadedFileUrl(f))
        : [uploadedFileUrl(req.files.files)];
      material.files = [...(material.files || []), ...filePaths];
    }

    await material.save();

    const populated = await StudyMaterial.findById(material._id)
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name code")
      .populate("createdBy", "name");

    res.json({
      success: true,
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

/** Delete – Admin, Principal, Teacher */
export const deleteStudyMaterial = async (req, res, next) => {
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

    const deleted = await StudyMaterial.findOneAndDelete({
      _id: req.params.id,
      schoolId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Study material not found",
      });
    }

    res.json({
      success: true,
      message: "Study material deleted",
    });
  } catch (error) {
    next(error);
  }
};
