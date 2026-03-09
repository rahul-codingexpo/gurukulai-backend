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
