import mongoose from "mongoose";
import { connectDB } from "../config/db.js";

import Role from "../modules/auth/role.model.js";
import User from "../modules/user/user.model.js";
import { hashPassword } from "../utils/hash.js";

const seedAdmin = async () => {
  await connectDB();

  // Roles list
  const roles = [
    "SuperAdmin",
    "Admin",
    "Principal",
    "Teacher",
    "Accountant",
    "Librarian",
    "Staff",
    "Student",
    "Parent",
  ];

  // Create roles if not exists
  for (const roleName of roles) {
    const existingRole = await Role.findOne({ name: roleName });

    if (!existingRole) {
      await Role.create({
        name: roleName,
        permissions: ["ALL"],
      });

      console.log(`✅ Role created: ${roleName}`);
    }
  }

  // Super Admin Role
  const superAdminRole = await Role.findOne({ name: "SuperAdmin" });

  // Create Super Admin User
  const existingUser = await User.findOne({
    email: "admin@gurukul.ai",
  });

  if (!existingUser) {
    const password = await hashPassword("123456");

    await User.create({
      name: "Super Admin",
      email: "admin@gurukul.ai",
      password,
      roleId: superAdminRole._id,
      status: "ACTIVE",
    });

    console.log("✅ Super Admin Created");
  } else {
    console.log("⚠️ Super Admin already exists");
  }

  mongoose.connection.close();
};

seedAdmin();
