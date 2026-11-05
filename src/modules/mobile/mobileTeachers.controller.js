import Staff from "../staff/staff.model.js";

const roleNameOf = (req) => req.user?.roleId?.name;

const resolveSchoolId = (req) =>
  req.user?.schoolId?._id ?? req.user?.schoolId ?? null;

/** GET /api/mobile/teachers */
export const listMobileTeachers = async (req, res, next) => {
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

    const staff = await Staff.find({
      schoolId,
      status: "ACTIVE",
    })
      .select("name email phone designation customDesignation photoUrl")
      .sort({ name: 1 })
      .lean();

    res.json({
      success: true,
      data: staff.map((s) => {
        const label =
          s.designation === "Other" && s.customDesignation
            ? s.customDesignation
            : s.designation || "";
        return {
          _id: s._id,
          id: String(s._id),
          name: s.name || "",
          email: s.email || "",
          phone: s.phone || "",
          subject: label,
          designation: s.designation || "",
          customDesignation: s.customDesignation || "",
          photo: s.photoUrl || "",
          photoUrl: s.photoUrl || "",
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};
