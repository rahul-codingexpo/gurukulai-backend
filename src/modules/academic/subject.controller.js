import Subject from "./subject.model.js";

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
