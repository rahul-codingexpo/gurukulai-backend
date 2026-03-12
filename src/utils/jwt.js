import jwt from "jsonwebtoken";
import { ENV } from "../config/env.js";

export const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      // roleId: user.roleId,
      role: user.roleId?.name,
      schoolId: user.schoolId,
    },
    ENV.JWT_SECRET,
    { expiresIn: "7d" },
  );
};
