import User from "./user.model.js";
import Role from "../auth/role.model.js";
import bcrypt from "bcryptjs";

/**
 * SuperAdmin creates School Admin
 */

export const createAdmin = async (req, res, next) => {
  try {
    const { name, email, phone, schoolId, password } = req.body;

    /* 1️⃣ Check existing user */

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    /* 2️⃣ Find Admin Role */

    const role = await Role.findOne({ name: "Admin" });

    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Admin role not found",
      });
    }

    /* 3️⃣ Hash Password */

    const hashedPassword = await bcrypt.hash(password, 10);

    /* 4️⃣ Create Admin */

    const admin = await User.create({
      name,
      email,
      phone,
      password: hashedPassword,
      roleId: role._id,
      schoolId,
    });

    res.status(201).json({
      success: true,
      data: admin,
    });
  } catch (error) {
    next(error);
  }
};

export const createPrincipal = async (req, res, next) => {
  try {
    const { name, email, phone, schoolId, password } = req.body;

    /* 1️⃣ Check existing user */

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    /* 2️⃣ Find Principal Role */

    const role = await Role.findOne({ name: "Principal" });

    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Principal role not found",
      });
    }

    /* 3️⃣ Hash Password */

    const hashedPassword = await bcrypt.hash(password, 10);

    /* 4️⃣ Create Principal */

    const principal = await User.create({
      name,
      email,
      phone,
      password: hashedPassword,
      roleId: role._id,
      schoolId,
    });

    res.status(201).json({
      success: true,
      data: principal,
    });
  } catch (error) {
    next(error);
  }
};
