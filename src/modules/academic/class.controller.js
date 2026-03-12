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

export const updateClass = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, sessionId } = req.body;

    const cls = await Class.findOne({
      _id: id,
      schoolId: req.schoolId,
    });

    if (!cls) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    if (name !== undefined) cls.name = name;
    if (sessionId !== undefined) cls.sessionId = sessionId;

    await cls.save();

    res.json({
      success: true,
      data: cls,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteClass = async (req, res, next) => {
  try {
    const { id } = req.params;

    const deleted = await Class.findOneAndDelete({
      _id: id,
      schoolId: req.schoolId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    res.json({
      success: true,
      message: "Class deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
