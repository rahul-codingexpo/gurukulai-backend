export const injectSchool = (req, res, next) => {
  const roleName = req.user?.roleId?.name;

  // SuperAdmin: allow selecting school via query/body
  if (!req.user.schoolId && roleName === "SuperAdmin") {
    const selected =
      req.query.schoolId || req.body.schoolId || req.params.schoolId;
    req.schoolId = selected || null;
    return next();
  }

  // Other roles: always scoped to their own school
  if (req.user.schoolId && req.user.schoolId._id) {
    req.schoolId = req.user.schoolId._id;
  } else {
    req.schoolId = req.user.schoolId || null;
  }

  next();
};
