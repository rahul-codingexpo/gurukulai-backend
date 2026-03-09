import User from "../user/user.model.js";
import { comparePassword } from "../../utils/hash.js";
import { generateToken } from "../../utils/jwt.js";

export const loginService = async ({ email, password }) => {
  const user = await User.findOne({ email })
    .select("+password")
    .populate("roleId");

  if (!user) {
    throw new Error("User not found");
  }

  const isMatch = await comparePassword(password, user.password);

  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  const token = generateToken(user);
  // ✅ remove sensitive fields
  const userObj = user.toObject();
  delete userObj.password;

  return {
    token,
    user: userObj,
  };
};
