import mongoose from "mongoose";
import { connectDB } from "../config/db.js";

import Role from "../modules/auth/role.model.js";
import User from "../modules/auth/user.model.js";
import { hashPassword } from "../utils/hash.js";

const seedAdmin = async () => {
  await connectDB();

  // Create Super Admin Role
  let role = await Role.findOne({ name: "SuperAdmin" });

  if (!role) {
    role = await Role.create({
      name: "SuperAdmin",
      permissions: ["ALL"],
    });
  }

  // Create Admin User
  const existingUser = await User.findOne({
    email: "admin@gurukul.ai",
  });

  if (!existingUser) {
    const password = await hashPassword("123456");

    await User.create({
      name: "Super Admin",
      email: "admin@gurukul.ai",
      password,
      roleId: role._id,
      status: "ACTIVE",
    });

    console.log("✅ Super Admin Created");
  } else {
    console.log("⚠️ Admin already exists");
  }

  mongoose.connection.close();
};

seedAdmin();
