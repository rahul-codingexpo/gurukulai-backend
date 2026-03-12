import School from "./school.model.js";

/**
 * Create School
 * Only SuperAdmin
 */
// export const createSchool = async (req, res, next) => {
//   try {
//     const school = await School.create(req.body);

//     res.status(201).json({
//       success: true,
//       data: school,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

export const createSchool = async (req, res, next) => {
  try {
    let logoPath = null;

    if (req.file) {
      logoPath = `/uploads/${req.file.filename}`;
    }

    const school = await School.create({
      ...req.body,
      logo: logoPath,
    });

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
// export const getSchools = async (req, res, next) => {
//   try {
//     const schools = await School.find();

//     res.json({
//       success: true,
//       data: schools,
//     });
//   } catch (error) {
//     next(error);
//   }
// };
export const getSchools = async (req, res, next) => {
  try {
    const filter =
      req.user.role === "SuperAdmin" ? {} : { _id: req.user.schoolId };

    const schools = await School.find(filter);

    res.json({
      success: true,
      data: schools,
    });
  } catch (err) {
    next(err);
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
