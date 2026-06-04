import Subject from "./subject.model.js";
import Class from "./class.model.js";

const populateSubject = (query) =>
  query.populate("classId").populate("sessionId");

/** Bulk create same subject for multiple classes (one Subject row per class). */
export const createSubjectsBulk = async (req, res, next) => {
  try {
    const { name, code, type, sessionId, classIds } = req.body || {};
    const trimmedName = String(name || "").trim();

    if (!trimmedName) {
      return res.status(400).json({
        success: false,
        message: "Subject name is required",
      });
    }
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "sessionId is required",
      });
    }
    if (!Array.isArray(classIds) || classIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "classIds must be a non-empty array",
      });
    }

    const uniqueClassIds = [
      ...new Set(classIds.map((id) => String(id)).filter(Boolean)),
    ];

    const classes = await Class.find({
      _id: { $in: uniqueClassIds },
      schoolId: req.schoolId,
    }).select("_id name");

    const classById = new Map(classes.map((c) => [String(c._id), c]));
    const created = [];
    const skipped = [];

    for (const classId of uniqueClassIds) {
      const cls = classById.get(classId);
      if (!cls) {
        skipped.push({
          classId,
          className: null,
          reason: "Class not found in this school",
        });
        continue;
      }

      const exists = await Subject.findOne({
        schoolId: req.schoolId,
        classId: cls._id,
        name: trimmedName,
      }).select("_id");

      if (exists) {
        skipped.push({
          classId: cls._id,
          className: cls.name,
          reason: "Subject already exists for this class",
        });
        continue;
      }

      try {
        const subject = await Subject.create({
          name: trimmedName,
          code: code ? String(code).trim() : undefined,
          type: type ? String(type).trim() : "Theory",
          classId: cls._id,
          sessionId,
          schoolId: req.schoolId,
        });
        const populated = await populateSubject(Subject.findById(subject._id));
        created.push(populated);
      } catch (err) {
        if (err?.code === 11000) {
          skipped.push({
            classId: cls._id,
            className: cls.name,
            reason: "Subject already exists for this class",
          });
        } else {
          throw err;
        }
      }
    }

    if (created.length === 0 && skipped.length > 0) {
      return res.status(409).json({
        success: false,
        message: "No subjects were created. All selected classes were skipped.",
        data: { created, skipped },
      });
    }

    res.status(201).json({
      success: true,
      message: `Created ${created.length} subject(s)${skipped.length ? `, skipped ${skipped.length}` : ""}`,
      data: { created, skipped },
    });
  } catch (error) {
    next(error);
  }
};

export const createSubject = async (req, res, next) => {
  try {
    const subject = await Subject.create({
      ...req.body,
      schoolId: req.schoolId,
    });

    res.status(201).json({
      success: true,
      data: subject,
    });
  } catch (error) {
    next(error);
  }
};

export const updateSubject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, type, classId, sessionId } = req.body;

    const subject = await Subject.findOne({
      _id: id,
      schoolId: req.schoolId,
    });

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }

    if (name !== undefined) subject.name = name;
    if (code !== undefined) subject.code = code;
    if (type !== undefined) subject.type = type;
    if (classId !== undefined) subject.classId = classId;
    if (sessionId !== undefined) subject.sessionId = sessionId;

    await subject.save();

    res.json({
      success: true,
      data: subject,
    });
  } catch (error) {
    next(error);
  }
};

export const getSubjects = async (req, res, next) => {
  try {
    const subjects = await Subject.find({
      schoolId: req.schoolId,
    })
      .populate("classId")
      .populate("sessionId");

    res.json({
      success: true,
      data: subjects,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSubject = async (req, res, next) => {
  try {
    await Subject.findOneAndDelete({
      _id: req.params.id,
      schoolId: req.schoolId,
    });

    res.json({
      success: true,
      message: "Subject deleted",
    });
  } catch (error) {
    next(error);
  }
};
