export const injectSchool = (req, res, next) => {
  // SuperAdmin can access everything
  if (!req.user.schoolId) {
    req.schoolId = null;
    return next();
  }

  // attach school scope
  req.schoolId = req.user.schoolId._id;

  next();
};
