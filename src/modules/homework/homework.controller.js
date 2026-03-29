import Homework from "./homework.model.js";

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

const parseOptionalMaxScore = (v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
};

/** Assign homework – Teacher, Admin, Principal */
export const createHomework = async (req, res, next) => {
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
    const topic =
      body.topic !== undefined ? String(body.topic).trim() : "";
    const maxScoreParsed = parseOptionalMaxScore(body.maxScore);
    const date = body.date ? new Date(body.date) : new Date();
    const dueDate = body.dueDate ? new Date(body.dueDate) : null;
    const url = body.url || "";

    if (!classId || !sectionId || !subjectId || !title || !dueDate) {
      return res.status(400).json({
        success: false,
        message:
          "classId, sectionId, subjectId, title and dueDate are required",
      });
    }

    if (new Date(dueDate) < date) {
      return res.status(400).json({
        success: false,
        message: "dueDate must be on or after date",
      });
    }

    const downloadable = parseBoolean(body.downloadable);
    const sendSmsToStudents = parseBoolean(body.sendSmsToStudents);
    const sendSmsToParents = parseBoolean(body.sendSmsToParents);

    const filePaths = [];
    if (req.files && req.files.files && Array.isArray(req.files.files)) {
      req.files.files.forEach((f) => {
        filePaths.push(`/uploads/${f.filename}`);
      });
    } else if (req.files && req.files.files) {
      filePaths.push(`/uploads/${req.files.files.filename}`);
    }

    const homework = await Homework.create({
      schoolId,
      classId,
      sectionId,
      subjectId,
      title,
      topic,
      ...(maxScoreParsed !== undefined ? { maxScore: maxScoreParsed } : {}),
      description,
      date,
      dueDate,
      url,
      files: filePaths,
      downloadable: downloadable !== false,
      sendSmsToStudents: sendSmsToStudents === true,
      sendSmsToParents: sendSmsToParents === true,
      createdBy: req.user._id,
    });

    const populated = await Homework.findById(homework._id)
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

/** List homework – all authenticated; optional filters */
export const getHomework = async (req, res, next) => {
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

    const list = await Homework.find(filter)
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name code")
      .populate("createdBy", "name")
      .sort({ dueDate: 1, createdAt: -1 });

    res.json({
      success: true,
      data: list,
    });
  } catch (error) {
    next(error);
  }
};

/** Get one by id */
export const getHomeworkById = async (req, res, next) => {
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

    const homework = await Homework.findOne({
      _id: req.params.id,
      schoolId,
    })
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name code type")
      .populate("createdBy", "name");

    if (!homework) {
      return res.status(404).json({
        success: false,
        message: "Homework not found",
      });
    }

    res.json({
      success: true,
      data: homework,
    });
  } catch (error) {
    next(error);
  }
};

/** Update homework – Teacher, Admin, Principal */
export const updateHomework = async (req, res, next) => {
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

    const homework = await Homework.findOne({
      _id: req.params.id,
      schoolId,
    });

    if (!homework) {
      return res.status(404).json({
        success: false,
        message: "Homework not found",
      });
    }

    const body = req.body || {};
    if (body.classId !== undefined) homework.classId = body.classId;
    if (body.sectionId !== undefined) homework.sectionId = body.sectionId;
    if (body.subjectId !== undefined) homework.subjectId = body.subjectId;
    if (body.title !== undefined) homework.title = body.title;
    if (body.topic !== undefined) homework.topic = String(body.topic).trim();
    if (body.maxScore !== undefined) {
      if (body.maxScore === null || body.maxScore === "") {
        homework.set("maxScore", undefined);
      } else {
        const n = parseOptionalMaxScore(body.maxScore);
        if (n !== undefined) homework.maxScore = n;
      }
    }
    if (body.description !== undefined) homework.description = body.description;
    if (body.date !== undefined) homework.date = new Date(body.date);
    if (body.dueDate !== undefined) homework.dueDate = new Date(body.dueDate);
    if (body.url !== undefined) homework.url = body.url;
    if (parseBoolean(body.downloadable) !== undefined)
      homework.downloadable = parseBoolean(body.downloadable);
    if (parseBoolean(body.sendSmsToStudents) !== undefined)
      homework.sendSmsToStudents = parseBoolean(body.sendSmsToStudents);
    if (parseBoolean(body.sendSmsToParents) !== undefined)
      homework.sendSmsToParents = parseBoolean(body.sendSmsToParents);

    if (req.files && req.files.files) {
      const newPaths = Array.isArray(req.files.files)
        ? req.files.files.map((f) => `/uploads/${f.filename}`)
        : [`/uploads/${req.files.files.filename}`];
      homework.files = [...(homework.files || []), ...newPaths];
    }

    await homework.save();

    const populated = await Homework.findById(homework._id)
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

/** Delete homework – Teacher, Admin, Principal */
export const deleteHomework = async (req, res, next) => {
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

    const deleted = await Homework.findOneAndDelete({
      _id: req.params.id,
      schoolId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Homework not found",
      });
    }

    res.json({
      success: true,
      message: "Homework deleted",
    });
  } catch (error) {
    next(error);
  }
};
