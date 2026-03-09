import Class from "./class.model.js";

export const createClass = async (req, res, next) => {
  try {
    const newClass = await Class.create({
      ...req.body,
      schoolId: req.schoolId,
    });

    res.status(201).json({
      success: true,
      data: newClass,
    });
  } catch (error) {
    next(error);
  }
};

export const getClasses = async (req, res, next) => {
  try {
    const classes = await Class.find({
      schoolId: req.schoolId,
    }).populate("sessionId");

    res.json({
      success: true,
      data: classes,
    });
  } catch (error) {
    next(error);
  }
};
