import Section from "./section.model.js";

export const createSection = async (req, res, next) => {
  try {
    const section = await Section.create({
      ...req.body,
      schoolId: req.schoolId,
    });

    res.status(201).json({
      success: true,
      data: section,
    });
  } catch (error) {
    next(error);
  }
};

export const getSections = async (req, res, next) => {
  try {
    const sections = await Section.find({
      schoolId: req.schoolId,
    })
      .populate("classId")
      .populate("classTeacherId");

    res.json({
      success: true,
      data: sections,
    });
  } catch (error) {
    next(error);
  }
};

export const updateSection = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, classId, classTeacherId, sessionId } = req.body;

    const section = await Section.findOne({
      _id: id,
      schoolId: req.schoolId,
    });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    if (name !== undefined) section.name = name;
    if (classId !== undefined) section.classId = classId;
    if (classTeacherId !== undefined) section.classTeacherId = classTeacherId;
    if (sessionId !== undefined) section.sessionId = sessionId;

    await section.save();

    res.json({
      success: true,
      data: section,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSection = async (req, res, next) => {
  try {
    const { id } = req.params;

    const deleted = await Section.findOneAndDelete({
      _id: id,
      schoolId: req.schoolId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    res.json({
      success: true,
      message: "Section deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
