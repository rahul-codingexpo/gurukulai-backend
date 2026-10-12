import School from "./school.model.js";
import User from "../user/user.model.js";
import Role from "../auth/role.model.js";
import bcrypt from "bcryptjs";
import { sendSchoolWelcomeEmail } from "../../services/email.service.js";

export const onboardSchool = async (req, res, next) => {
  try {
    const { schoolName, email, phone, adminName, adminEmail, adminPassword } =
      req.body;

    /* 1️⃣ Create School */
    const school = await School.create({
      name: schoolName,
      email,
      phone,
    });

    // Send onboarding welcome email to the school email asynchronously
    if (school.email) {
      sendSchoolWelcomeEmail(school).catch((err) => {
        console.error(`Failed to send onboarding welcome email to school: ${school.email}`, err);
      });
    }

    /* 2️⃣ Find Admin Role */
    const adminRole = await Role.findOne({
      name: "Admin",
    });

    /* 3️⃣ Hash Password */
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    /* 4️⃣ Create School Admin */
    const admin = await User.create({
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      roleId: adminRole._id,
      schoolId: school._id,
    });

    res.status(201).json({
      success: true,
      school,
      admin,
    });
  } catch (error) {
    next(error);
  }
};
