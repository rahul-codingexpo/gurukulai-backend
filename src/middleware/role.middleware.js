export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      // user attached by protect middleware
      const user = req.user;

      if (!user || !user.roleId) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      const userRole = user.roleId.name;

      // SuperAdmin bypass (optional)
      if (userRole === "SuperAdmin") {
        return next();
      }

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission",
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Authorization failed",
      });
    }
  };
};
