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
const optionalTrimmedValue = (value) => {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed === "" ? undefined : trimmed;
};

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

  if (salary !== undefined && salary !== null && salary !== "") {
    const salaryNum = Number(salary);
    if (Number.isNaN(salaryNum)) return "salary must be a number";
    if (salaryNum < 0) return "salary must be >= 0";
  }

  if (joiningDate !== undefined && joiningDate !== null && joiningDate !== "") {
    const jd = new Date(joiningDate);
    if (Number.isNaN(jd.getTime())) return "joiningDate must be a valid date";
  }

  if (status !== undefined && status !== null && status !== "") {
    const normalizedStatus = String(status).trim().toUpperCase();
    if (!["ACTIVE", "INACTIVE"].includes(normalizedStatus)) {
      return "status must be ACTIVE or INACTIVE";
    }
  }

  return null;
};

/**
 * Create or update linked User login for staff (same rules as createStaff).
 * - New login: requires both username and password.
 * - Existing login: update username and/or password when provided.
 */
const syncStaffLoginUser = async ({
  existingStaff,
  username,
  password,
  name,
  email,
  phone,
  designation,
}) => {
  const normalizedUsername = optionalTrimmedValue(username);
  const normalizedPassword = optionalTrimmedValue(password);
  const normalizedEmail = optionalTrimmedValue(email);
  const normalizedPhone = optionalTrimmedValue(phone);
  const normalizedDesignation = designation
    ? String(designation).trim()
    : existingStaff.designation;
  const resolvedName = name ? String(name).trim() : existingStaff.name;
  const schoolId = existingStaff.schoolId;

  const resolveRole = async () => {
    const role = await Role.findOne({ name: normalizedDesignation });
    if (!role) {
      const err = new Error("Role not found");
      err.statusCode = 404;
      throw err;
    }
    return role;
  };

  if (existingStaff.userId) {
    const linkedUser = await User.findById(existingStaff.userId);
    if (!linkedUser) {
      existingStaff.userId = undefined;
    } else {
      const userUpdate = { name: resolvedName };
      if (email !== undefined) {
        userUpdate.email = normalizedEmail;
      }
      if (phone !== undefined) {
        userUpdate.phone = normalizedPhone;
      }
      if (normalizedUsername) {
        userUpdate.username = normalizedUsername;
      }
      if (normalizedPassword) {
        userUpdate.password = await bcrypt.hash(normalizedPassword, 10);
      }
      if (designation) {
        const role = await resolveRole();
        userUpdate.roleId = role._id;
      }
      await User.findByIdAndUpdate(existingStaff.userId, userUpdate);
      return existingStaff.userId;
    }
  }

  if (normalizedUsername && normalizedPassword) {
    const role = await resolveRole();
    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);
    const user = await User.create({
      name: resolvedName,
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      ...(normalizedPhone ? { phone: normalizedPhone } : {}),
      username: normalizedUsername,
      password: hashedPassword,
      roleId: role._id,
      schoolId,
    });
    return user._id;
  }

  return existingStaff.userId || null;
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
    const normalizedEmail = optionalTrimmedValue(email);
    const normalizedPhone = optionalTrimmedValue(phone);
    const normalizedDesignation = String(designation).trim();
    const normalizedStatus = optionalTrimmedValue(status)?.toUpperCase();
    const normalizedJoiningDate = optionalTrimmedValue(joiningDate);
    const salaryNum =
      salary !== undefined && salary !== null && salary !== ""
        ? Number(salary)
        : undefined;

    const schoolId = resolveSchoolId(req); // SuperAdmin can target a school

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    const payloadError = validateCreatePayload({
      name,
      designation: normalizedDesignation,
      salary,
      joiningDate,
      status: normalizedStatus,
    });
    if (payloadError) {
      return res.status(400).json({
        success: false,
        message: payloadError,
      });
    }

    const photoFile = getUploadedFile(req.files, "photo");
    if (photoFile && !photoFile?.mimetype?.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        message: "photo must be an image file",
      });
    }

    for (const docField of ["aadharDocument", "panDocument", "experienceDocument"]) {
      const f = getUploadedFile(req.files, docField);
      if (!f) continue;
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
      const role = await Role.findOne({ name: normalizedDesignation });

      if (!role) {
        return res.status(404).json({
          success: false,
          message: "Role not found",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      user = await User.create({
        name,
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
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
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      ...(normalizedPhone ? { phone: normalizedPhone } : {}),
      ...(salaryNum !== undefined ? { salary: salaryNum } : {}),
      designation: normalizedDesignation,
      ...(normalizedJoiningDate ? { joiningDate: new Date(normalizedJoiningDate) } : {}),
      ...(normalizedStatus ? { status: normalizedStatus } : {}),
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
    const { username, password, schoolId: _schoolId, ...staffFields } = req.body;
    const updatePayload = { ...staffFields };
    const existingStaff = await Staff.findById(req.params.id);
    if (!existingStaff) {
      return res.status(404).json({
        success: false,
        message: "Staff not found",
      });
    }

    if (updatePayload.email !== undefined) {
      updatePayload.email = optionalTrimmedValue(updatePayload.email);
    }
    if (updatePayload.phone !== undefined) {
      updatePayload.phone = optionalTrimmedValue(updatePayload.phone);
    }

    let linkedUserId;
    try {
      linkedUserId = await syncStaffLoginUser({
        existingStaff,
        username,
        password,
        name: updatePayload.name,
        email: updatePayload.email,
        phone: updatePayload.phone,
        designation: updatePayload.designation,
      });
    } catch (err) {
      if (err.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: err.message,
        });
      }
      throw err;
    }

    if (linkedUserId && String(linkedUserId) !== String(existingStaff.userId || "")) {
      updatePayload.userId = linkedUserId;
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
    }).populate("userId", "username email");

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
