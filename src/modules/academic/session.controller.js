import Session from "./session.model.js";

/**
 * Create Session
 */
export const createSession = async (req, res, next) => {
  try {
    const session = await Session.create({
      ...req.body,
      schoolId: req.schoolId, // 🔥 auto inject
    });

    res.status(201).json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get All Sessions (School Scoped)
 */
export const getSessions = async (req, res, next) => {
  try {
    const sessions = await Session.find({
      schoolId: req.schoolId,
    });

    res.json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Activate Session (only one active per school)
 */
export const activateSession = async (req, res, next) => {
  try {
    // deactivate old session
    await Session.updateMany({ schoolId: req.schoolId }, { isActive: false });

    // activate selected
    const session = await Session.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.schoolId },
      { isActive: true },
      { new: true },
    );

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
};
