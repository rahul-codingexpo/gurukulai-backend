import Staff from "./staff.model.js";
import User from "../user/user.model.js";
import Role from "../auth/role.model.js";
import bcrypt from "bcryptjs";

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

    const schoolId = req.user.schoolId; // ✅ JWT se

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

    const staff = await Staff.create({
      name,
      email,
      phone,
      salary,
      designation,
      joiningDate,
      status,
      userId: user?._id,
      schoolId,
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
    const schoolId = req.user.schoolId; // JWT se schoolId

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
    const staff = await Staff.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

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
