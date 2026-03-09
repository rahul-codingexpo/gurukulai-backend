import School from "./school.model.js";

/**
 * Create School
 * Only SuperAdmin
 */
export const createSchool = async (req, res, next) => {
  try {
    const school = await School.create(req.body);

    res.status(201).json({
      success: true,
      data: school,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get All Schools
 */
export const getSchools = async (req, res, next) => {
  try {
    const schools = await School.find();

    res.json({
      success: true,
      data: schools,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update School
 */
export const updateSchool = async (req, res, next) => {
  try {
    const school = await School.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    res.json({
      success: true,
      data: school,
    });
  } catch (error) {
    next(error);
  }
};
