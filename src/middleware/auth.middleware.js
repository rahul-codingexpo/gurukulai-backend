import jwt from "jsonwebtoken";
import User from "../modules/user/user.model.js";
import School from "../modules/school/school.model.js";

export const protect = async (req, res, next) => {
  try {
    let token;

    // ✅ Get token from header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, token missing",
      });
    }

    // ✅ Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Attach user to request
    const user = await User.findById(decoded.id)
      .populate("roleId")
      .select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // Reject sessions for users whose school was disabled after login.
    const roleName = user?.roleId?.name;
    const schoolRef = user?.schoolId?._id || user?.schoolId;
    if (roleName !== "SuperAdmin" && schoolRef) {
      const school = await School.findById(schoolRef).select("status");
      if (!school || String(school.status || "").toUpperCase() === "INACTIVE") {
        return res.status(403).json({
          success: false,
          message: "This school is disabled. Please contact support.",
        });
      }
    }

    req.user = user;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};
