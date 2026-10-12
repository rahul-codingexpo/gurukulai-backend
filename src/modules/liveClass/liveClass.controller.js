import LiveClass from "./liveClass.model.js";

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

const populateLiveClass = (doc) =>
  doc
    .populate("classId", "name")
    .populate("sectionIds", "name")
    .populate("subjectId", "name code")
    .populate("teacherId", "name");

/** Create live class – Teacher, Admin, Principal */
export const createLiveClass = async (req, res, next) => {
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

    const {
      title,
      classId,
      sectionIds,
      date,
      time,
      subjectId,
      teacherId,
      classLink,
    } = req.body || {};

    if (!title || !classId || !date || !time || !subjectId || !teacherId) {
      return res.status(400).json({
        success: false,
        message:
          "title, classId, date, time, subjectId and teacherId are required",
      });
    }

    const liveClass = await LiveClass.create({
      schoolId,
      title: title.trim(),
      classId,
      sectionIds: Array.isArray(sectionIds) ? sectionIds : [],
      date: new Date(date),
      time: String(time).trim(),
      subjectId,
      teacherId,
      classLink: classLink ? String(classLink).trim() : "",
    });

    const populated = await populateLiveClass(
      LiveClass.findById(liveClass._id)
    );

    res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

/** List live classes – all authenticated; optional filters */
export const getLiveClasses = async (req, res, next) => {
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

    const { classId, subjectId, teacherId, dateFrom, dateTo } = req.query;
    const filter = { schoolId };

    if (classId) filter.classId = classId;
    if (subjectId) filter.subjectId = subjectId;
    if (teacherId) filter.teacherId = teacherId;
    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = new Date(dateFrom);
      if (dateTo) filter.date.$lte = new Date(dateTo);
    }

    const list = await LiveClass.find(filter)
      .populate("classId", "name")
      .populate("sectionIds", "name")
      .populate("subjectId", "name code")
      .populate("teacherId", "name")
      .sort({ date: 1, time: 1 });

    res.json({
      success: true,
      data: list,
    });
  } catch (error) {
    next(error);
  }
};

/** Get one live class by id */
export const getLiveClassById = async (req, res, next) => {
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

    const liveClass = await LiveClass.findOne({
      _id: req.params.id,
      schoolId,
    });
    if (!liveClass) {
      return res.status(404).json({
        success: false,
        message: "Live class not found",
      });
    }

    const populated = await populateLiveClass(
      LiveClass.findById(liveClass._id)
    );

    res.json({
      success: true,
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

/** Update live class */
export const updateLiveClass = async (req, res, next) => {
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

    const liveClass = await LiveClass.findOne({
      _id: req.params.id,
      schoolId,
    });
    if (!liveClass) {
      return res.status(404).json({
        success: false,
        message: "Live class not found",
      });
    }

    const {
      title,
      classId,
      sectionIds,
      date,
      time,
      subjectId,
      teacherId,
      classLink,
    } = req.body || {};

    if (title !== undefined) liveClass.title = title.trim();
    if (classId !== undefined) liveClass.classId = classId;
    if (sectionIds !== undefined)
      liveClass.sectionIds = Array.isArray(sectionIds) ? sectionIds : [];
    if (date !== undefined) liveClass.date = new Date(date);
    if (time !== undefined) liveClass.time = String(time).trim();
    if (subjectId !== undefined) liveClass.subjectId = subjectId;
    if (teacherId !== undefined) liveClass.teacherId = teacherId;
    if (classLink !== undefined) liveClass.classLink = String(classLink).trim();

    await liveClass.save();

    const populated = await populateLiveClass(
      LiveClass.findById(liveClass._id)
    );

    res.json({
      success: true,
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

/** Delete live class */
export const deleteLiveClass = async (req, res, next) => {
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

    const deleted = await LiveClass.findOneAndDelete({
      _id: req.params.id,
      schoolId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Live class not found",
      });
    }

    res.json({
      success: true,
      message: "Live class deleted",
    });
  } catch (error) {
    next(error);
  }
};
