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

/**
 * Update Session
 */
export const updateSession = async (req, res, next) => {
  try {
    const updates = { ...req.body };
    delete updates.schoolId;

    const session = await Session.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.schoolId },
      updates,
      { new: true, runValidators: true },
    );

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Session
 */
export const deleteSession = async (req, res, next) => {
  try {
    const session = await Session.findOneAndDelete({
      _id: req.params.id,
      schoolId: req.schoolId,
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    res.json({
      success: true,
      message: "Session deleted",
    });
  } catch (error) {
    next(error);
  }
};
