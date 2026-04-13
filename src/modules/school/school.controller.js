import School from "./school.model.js";
import mongoose from "mongoose";
import { uploadedFileUrl } from "../../utils/uploadFile.util.js";
import { deleteFromSpacesByUrl } from "../../utils/spacesFile.util.js";

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
    const logoFile =
      req.files?.logo?.[0] ||
      req.files?.schoolLogo?.[0] ||
      req.file ||
      null;

    if (logoFile) {
      logoPath = uploadedFileUrl(logoFile);
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

    const schoolDoc = await School.findById(req.params.id);
    if (!schoolDoc) {
      return res.status(404).json({
        success: false,
        message: "School not found",
      });
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
    const logoFile =
      req.files?.logo?.[0] ||
      req.files?.schoolLogo?.[0] ||
      null;
    const qrFile =
      req.files?.qrCode?.[0] ||
      req.files?.paymentQr?.[0] ||
      req.file ||
      null;
    if (logoFile) {
      update.logo = uploadedFileUrl(logoFile);
    }
    if (qrFile) {
      update.qrCode = uploadedFileUrl(qrFile);
    }
    delete update.paymentQr;

    // If user provided qrCode as a string in body, allow it
    if (req.body?.qrCode) {
      update.qrCode = String(req.body.qrCode).trim();
    }

    const school = await School.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });

    if (logoFile && schoolDoc.logo && schoolDoc.logo !== update.logo) {
      await deleteFromSpacesByUrl(schoolDoc.logo);
    }
    if (qrFile && schoolDoc.qrCode && schoolDoc.qrCode !== update.qrCode) {
      await deleteFromSpacesByUrl(schoolDoc.qrCode);
    }

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
    const schoolId = req.params.id;
    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({
        success: false,
        message: "School not found",
      });
    }

    const modelNames = mongoose.modelNames().filter((name) => name !== "School");

    const deleteTasks = modelNames.map(async (name) => {
      const Model = mongoose.model(name);
      // Only cascade on models that actually store school ownership.
      if (!Model.schema.path("schoolId")) return;
      await Model.deleteMany({ schoolId });
    });

    await Promise.all(deleteTasks);
    await School.deleteOne({ _id: schoolId });

    if (school.logo) await deleteFromSpacesByUrl(school.logo);
    if (school.qrCode) await deleteFromSpacesByUrl(school.qrCode);

    return res.json({
      success: true,
      message: "School and related data deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};