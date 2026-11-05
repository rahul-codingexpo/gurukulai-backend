import ClassModel from "../academic/class.model.js";
import Section from "../academic/section.model.js";

const roleNameOf = (req) => req.user?.roleId?.name;

const resolveSchoolId = (req) =>
  req.user?.schoolId?._id ?? req.user?.schoolId ?? null;

/** GET /api/mobile/classes */
export const listMobileClasses = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (!["Teacher", "Staff", "Student", "Parent"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Not allowed",
      });
    }

    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    const classes = await ClassModel.find({ schoolId })
      .populate("sessionId", "name")
      .sort({ name: 1 })
      .lean();

    res.json({
      success: true,
      data: classes.map((c) => ({
        _id: c._id,
        id: String(c._id),
        name: c.name || "",
        sessionId: c.sessionId
          ? {
              _id: c.sessionId._id,
              id: String(c.sessionId._id),
              name: c.sessionId.name || "",
            }
          : { _id: "", id: "", name: "" },
      })),
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/mobile/sections?classId= */
export const listMobileSections = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (!["Teacher", "Staff", "Student", "Parent"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Not allowed",
      });
    }

    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    const filter = { schoolId };
    if (req.query.classId) {
      filter.classId = req.query.classId;
    }

    const sections = await Section.find(filter)
      .populate("classId", "name sessionId")
      .sort({ name: 1 })
      .lean();

    res.json({
      success: true,
      data: sections.map((s) => ({
        _id: s._id,
        id: String(s._id),
        name: s.name || "",
        classId: s.classId
          ? {
              _id: s.classId._id,
              name: s.classId.name || "",
              sessionId: String(
                s.classId.sessionId?._id ?? s.classId.sessionId ?? "",
              ),
            }
          : { _id: "", name: "", sessionId: "" },
      })),
    });
  } catch (error) {
    next(error);
  }
};
