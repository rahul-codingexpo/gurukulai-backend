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
    const isSuperAdmin = req.user?.roleId?.name === "SuperAdmin";

    const filter = isSuperAdmin ? {} : { _id: req.user.schoolId };

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
    const roleName = req.user?.roleId?.name;

    // Security: non-SuperAdmin can update only their own school.
    if (roleName !== "SuperAdmin") {
      const mySchoolId = req.user?.schoolId?._id ?? req.user?.schoolId;
      if (!mySchoolId || String(mySchoolId) !== String(req.params.id)) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to update this school",
        });
      }
    }

    const update = { ...(req.body || {}) };

    // Canonicalize UPI id (accept aliases)
    const canonicalUpiId = update.upiId ?? update.paymentUpiId;
    if (canonicalUpiId !== undefined) {
      update.upiId = String(canonicalUpiId).trim();
    }
    delete update.paymentUpiId;
    if (update.payment) delete update.payment;

    // Canonicalize QR code (accept file uploads aliases)
    const qrFile =
      req.files?.qrCode?.[0] ||
      req.files?.paymentQr?.[0] ||
      req.file ||
      null;
    if (qrFile) {
      // Keep consistent with how logo is stored: /uploads/<filename>
      update.qrCode = `/uploads/${qrFile.filename}`;
    }
    delete update.paymentQr;

    // If user provided qrCode as a string in body, allow it
    if (req.body?.qrCode) {
      update.qrCode = String(req.body.qrCode).trim();
    }

    const school = await School.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });

    res.json({
      success: true,
      data: {
        ...school.toObject(),
        // Compatibility aliases for existing frontend implementations
        paymentUpiId: school.upiId,
        paymentQr: school.qrCode,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSchool = async (req, res, next) => {
  try {
    await School.findByIdAndDelete(req.params.id);
  } catch (error) {
    next(error);
  }
};