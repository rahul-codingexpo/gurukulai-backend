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
