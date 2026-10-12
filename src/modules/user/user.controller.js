import User from "./user.model.js";
import Role from "../auth/role.model.js";
import bcrypt from "bcryptjs";

const ADMIN_PRINCIPAL_ROLES = ["Admin", "Principal"];

const getAdminPrincipalRoleIds = async () => {
  const roles = await Role.find({ name: { $in: ADMIN_PRINCIPAL_ROLES } }).select("_id name");
  return roles;
};

const findSchoolAdminOrPrincipal = async (userId, schoolId) => {
  const roles = await getAdminPrincipalRoleIds();
  const roleIds = roles.map((r) => r._id);
  if (!roleIds.length) return null;

  return User.findOne({
    _id: userId,
    schoolId,
    roleId: { $in: roleIds },
  }).populate("roleId", "name");
};

const toSafeUser = async (userId) =>
  User.findById(userId).populate("roleId", "name").select("-password").lean();

/**
 * SuperAdmin lists Admin / Principal users for a school
 */
export const getSchoolAdmins = async (req, res, next) => {
  try {
    const schoolId = req.query.schoolId;
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "schoolId query parameter is required",
      });
    }

    const roles = await getAdminPrincipalRoleIds();

    const roleIds = roles.map((r) => r._id);
    if (!roleIds.length) {
      return res.json({ success: true, data: [] });
    }

    const users = await User.find({
      schoolId,
      roleId: { $in: roleIds },
    })
      .populate("roleId", "name")
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * SuperAdmin creates School Admin
 */

export const createAdmin = async (req, res, next) => {
  try {
    const { name, email, phone, schoolId, password } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "name is required",
      });
    }
    if (!email || !String(email).trim()) {
      return res.status(400).json({
        success: false,
        message: "email is required",
      });
    }
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "schoolId is required",
      });
    }
    if (!password || !String(password).trim()) {
      return res.status(400).json({
        success: false,
        message: "password is required",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    /* 1️⃣ Check existing user */

    const existingUser = await User.findOne({ email: normalizedEmail });

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
      name: String(name).trim(),
      email: normalizedEmail,
      ...(phone ? { phone: String(phone).trim() } : {}),
      password: hashedPassword,
      roleId: role._id,
      schoolId,
    });

    const safe = await User.findById(admin._id)
      .populate("roleId", "name")
      .select("-password")
      .lean();

    res.status(201).json({
      success: true,
      message: "Admin assigned successfully",
      data: safe,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * SuperAdmin updates Admin / Principal for a school (email, password optional)
 */
export const updateSchoolAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { schoolId, name, email, phone, password } = req.body;

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "schoolId is required",
      });
    }

    const user = await findSchoolAdminOrPrincipal(id, schoolId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Admin or Principal not found for this school",
      });
    }

    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName) {
        return res.status(400).json({
          success: false,
          message: "name cannot be empty",
        });
      }
      user.name = trimmedName;
    }

    if (email !== undefined) {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({
          success: false,
          message: "email is required",
        });
      }

      const emailTaken = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: user._id },
      });
      if (emailTaken) {
        return res.status(400).json({
          success: false,
          message: "Email is already in use",
        });
      }
      user.email = normalizedEmail;
    }

    if (phone !== undefined) {
      const trimmedPhone = String(phone).trim();
      user.phone = trimmedPhone || undefined;
    }

    if (password !== undefined && String(password).trim()) {
      user.password = await bcrypt.hash(String(password).trim(), 10);
    }

    await user.save();

    const safe = await toSafeUser(user._id);

    res.json({
      success: true,
      message: "User updated successfully",
      data: safe,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * SuperAdmin deletes Admin / Principal for a school
 */
export const deleteSchoolAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const schoolId = req.query.schoolId;

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "schoolId query parameter is required",
      });
    }

    const user = await findSchoolAdminOrPrincipal(id, schoolId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Admin or Principal not found for this school",
      });
    }

    await User.deleteOne({ _id: user._id });

    res.json({
      success: true,
      message: "User deleted successfully",
      data: { id: user._id },
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
