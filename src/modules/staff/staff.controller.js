import Staff from "./staff.model.js";
import User from "../user/user.model.js";
import Role from "../auth/role.model.js";
import bcrypt from "bcryptjs";
import { uploadedFileUrl } from "../../utils/uploadFile.util.js";
import { deleteFromSpacesByUrl } from "../../utils/spacesFile.util.js";

const resolveSchoolId = (req) => {
  const roleName = req.user?.roleId?.name;
  if (roleName === "SuperAdmin") {
    return req.query.schoolId || req.body.schoolId || req.params.schoolId || null;
  }
  return req.user.schoolId;
};

const allowedDocumentMimeTypes = new Set([
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]);

const getUploadedFile = (files, fieldName) => files?.[fieldName]?.[0] ?? null;

const uploadsUrlFromFile = (file) => uploadedFileUrl(file);

const validateCreatePayload = (payload) => {
  const { name, designation, salary, joiningDate, status } = payload;

  if (!name || String(name).trim() === "") {
    return "name is required";
  }

  if (
    !designation ||
    !["Principal", "Teacher", "Staff"].includes(String(designation).trim())
  ) {
    return "designation must be Principal, Teacher, or Staff";
  }

  const salaryNum = Number(salary);
  if (salary === undefined || salary === null || salary === "" || Number.isNaN(salaryNum)) {
    return "salary is required and must be a number";
  }
  if (salaryNum < 0) return "salary must be >= 0";

  if (!joiningDate) return "joiningDate is required";
  const jd = new Date(joiningDate);
  if (Number.isNaN(jd.getTime())) return "joiningDate must be a valid date";

  if (!status || !["ACTIVE", "INACTIVE"].includes(String(status).trim())) {
    return "status must be ACTIVE or INACTIVE";
  }

  return null;
};

/**
 * Create Staff (Teacher / Principal / Staff)
 * Only Admin
 */

// export const createStaff = async (req, res, next) => {
//   try {
//     const {
//       name,
//       email,
//       phone,
//       salary,
//       designation,
//       joiningDate,
//       status,
//       username,
//       password,
//       schoolId,
//     } = req.body;

//     let user = null;

//     /* 1️⃣ If login required create user */

//     if (username && password) {
//       const role = await Role.findOne({
//         name: designation,
//       });

//       if (!role) {
//         return res.status(404).json({
//           success: false,
//           message: "Role not found",
//         });
//       }

//       const hashedPassword = await bcrypt.hash(password, 10);

//       user = await User.create({
//         name,
//         email,
//         phone,
//         username,
//         password: hashedPassword,
//         roleId: role._id,
//         schoolId,
//       });
//     }

//     /* 2️⃣ Create Staff */

//     const staff = await Staff.create({
//       name,
//       email,
//       phone,
//       salary,
//       designation,
//       joiningDate,
//       status,
//       userId: user?._id,
//       schoolId,
//     });

//     res.status(201).json({
//       success: true,
//       data: staff,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

export const createStaff = async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      salary,
      designation,
      joiningDate,
      status,
      username,
      password,
    } = req.body;

    const schoolId = resolveSchoolId(req); // SuperAdmin can target a school

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    const payloadError = validateCreatePayload({
      name,
      designation,
      salary,
      joiningDate,
      status,
    });
    if (payloadError) {
      return res.status(400).json({
        success: false,
        message: payloadError,
      });
    }

    // Required document fields
    const requiredDocs = [
      "photo",
      "aadharDocument",
      "panDocument",
      "experienceDocument",
    ];

    const missingDocs = requiredDocs.filter(
      (f) => !getUploadedFile(req.files, f),
    );
    if (missingDocs.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required document(s): ${missingDocs.join(", ")}`,
      });
    }

    // Validate mime types
    const photoFile = getUploadedFile(req.files, "photo");
    if (!photoFile?.mimetype?.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        message: "photo must be an image file",
      });
    }

    for (const docField of ["aadharDocument", "panDocument", "experienceDocument"]) {
      const f = getUploadedFile(req.files, docField);
      const ok =
        allowedDocumentMimeTypes.has(f?.mimetype) ||
        // allow images if frontend uploads images for docs
        f?.mimetype?.startsWith("image/");
      if (!ok) {
        return res.status(400).json({
          success: false,
          message: `${docField} must be a PDF/DOC/DOCX (or image) file`,
        });
      }
    }

    let user = null;

    if (username && password) {
      const role = await Role.findOne({ name: designation });

      if (!role) {
        return res.status(404).json({
          success: false,
          message: "Role not found",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      user = await User.create({
        name,
        email,
        phone,
        username,
        password: hashedPassword,
        roleId: role._id,
        schoolId,
      });
    }

    const photoUrl = uploadsUrlFromFile(getUploadedFile(req.files, "photo"));
    const aadharDocumentUrl = uploadsUrlFromFile(
      getUploadedFile(req.files, "aadharDocument"),
    );
    const panDocumentUrl = uploadsUrlFromFile(
      getUploadedFile(req.files, "panDocument"),
    );
    const experienceDocumentUrl = uploadsUrlFromFile(
      getUploadedFile(req.files, "experienceDocument"),
    );

    const staff = await Staff.create({
      name,
      email,
      phone,
      salary: Number(salary),
      designation: String(designation).trim(),
      joiningDate: new Date(joiningDate),
      status: String(status).trim(),
      userId: user?._id,
      schoolId,
      photoUrl,
      aadharDocumentUrl,
      panDocumentUrl,
      experienceDocumentUrl,
    });

    res.status(201).json({
      success: true,
      data: staff,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Staff List
 */

// export const getStaff = async (req, res, next) => {
//   try {
//     const { schoolId } = req.query;

//     const staff = await Staff.find({ schoolId }).populate(
//       "userId",
//       "username email",
//     );

//     res.json({
//       success: true,
//       data: staff,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

export const getStaff = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);

    const staff = await Staff.find({ schoolId }).populate(
      "userId",
      "username email",
    );

    res.json({
      success: true,
      data: staff,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Staff
 */

export const updateStaff = async (req, res, next) => {
  try {
    const updatePayload = { ...req.body };
    const existingStaff = await Staff.findById(req.params.id);
    if (!existingStaff) {
      return res.status(404).json({
        success: false,
        message: "Staff not found",
      });
    }

    if (updatePayload.salary !== undefined) {
      const salaryNum = Number(updatePayload.salary);
      updatePayload.salary = Number.isNaN(salaryNum) ? updatePayload.salary : salaryNum;
    }

    if (updatePayload.joiningDate !== undefined) {
      const jd = new Date(updatePayload.joiningDate);
      if (!Number.isNaN(jd.getTime())) updatePayload.joiningDate = jd;
    }

    if (req.files?.photo?.[0]) {
      updatePayload.photoUrl = uploadsUrlFromFile(req.files.photo[0]);
    }
    if (req.files?.aadharDocument?.[0]) {
      updatePayload.aadharDocumentUrl = uploadsUrlFromFile(
        req.files.aadharDocument[0],
      );
    }
    if (req.files?.panDocument?.[0]) {
      updatePayload.panDocumentUrl = uploadsUrlFromFile(
        req.files.panDocument[0],
      );
    }
    if (req.files?.experienceDocument?.[0]) {
      updatePayload.experienceDocumentUrl = uploadsUrlFromFile(
        req.files.experienceDocument[0],
      );
    }

    const staff = await Staff.findByIdAndUpdate(req.params.id, updatePayload, {
      new: true,
    });

    if (
      updatePayload.photoUrl &&
      existingStaff.photoUrl &&
      existingStaff.photoUrl !== updatePayload.photoUrl
    ) {
      await deleteFromSpacesByUrl(existingStaff.photoUrl);
    }
    if (
      updatePayload.aadharDocumentUrl &&
      existingStaff.aadharDocumentUrl &&
      existingStaff.aadharDocumentUrl !== updatePayload.aadharDocumentUrl
    ) {
      await deleteFromSpacesByUrl(existingStaff.aadharDocumentUrl);
    }
    if (
      updatePayload.panDocumentUrl &&
      existingStaff.panDocumentUrl &&
      existingStaff.panDocumentUrl !== updatePayload.panDocumentUrl
    ) {
      await deleteFromSpacesByUrl(existingStaff.panDocumentUrl);
    }
    if (
      updatePayload.experienceDocumentUrl &&
      existingStaff.experienceDocumentUrl &&
      existingStaff.experienceDocumentUrl !== updatePayload.experienceDocumentUrl
    ) {
      await deleteFromSpacesByUrl(existingStaff.experienceDocumentUrl);
    }

    res.json({
      success: true,
      data: staff,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Staff
 */

export const deleteStaff = async (req, res, next) => {
  try {
    await Staff.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Staff deleted",
    });
  } catch (error) {
    next(error);
  }
};
