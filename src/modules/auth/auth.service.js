import User from "../user/user.model.js";
import Student from "../student/student.model.js";
import { comparePassword } from "../../utils/hash.js";
import { generateToken } from "../../utils/jwt.js";
import crypto from "crypto";

const sha256 = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

const generateOtp6 = () => String(Math.floor(100000 + Math.random() * 900000));

const emailOnlyRoles = new Set([
  "SuperAdmin",
  "Admin",
  "Principal",
  "Teacher",
  "Accountant",
  "Librarian",
]);
const usernamePhoneRoles = new Set(["Student", "Parent", "Staff"]);

const findUserByLoginId = async (resolvedLoginId) => {
  const normalizedEmail = String(resolvedLoginId).trim().toLowerCase();

  const directUser = await User.findOne({
    $or: [
      { email: normalizedEmail },
      { phone: resolvedLoginId },
      { username: resolvedLoginId },
    ],
  })
    .select("+password +passwordReset.otpHash +passwordReset.expiresAt +passwordReset.lastSentAt")
    .populate("roleId");

  if (directUser) return directUser;

  // Backward-compatible fallback: older student users may have username=phone.
  // Allow admission number login by resolving Student -> studentLogin.userId.
  const linkedStudent = await Student.findOne({
    admissionNumber: String(resolvedLoginId).trim(),
    "studentLogin.enabled": true,
    "studentLogin.userId": { $ne: null },
  }).select("studentLogin.userId");

  if (!linkedStudent?.studentLogin?.userId) return null;

  return User.findById(linkedStudent.studentLogin.userId)
    .select("+password +passwordReset.otpHash +passwordReset.expiresAt +passwordReset.lastSentAt")
    .populate("roleId");
};

const enforceIdentifierByRole = ({ user, resolvedLoginId }) => {
  const roleName = user?.roleId?.name;
  const normalizedEmail = String(resolvedLoginId).trim().toLowerCase();

  if (roleName && emailOnlyRoles.has(roleName)) {
    if (!user.email || normalizedEmail !== String(user.email).toLowerCase()) {
      const err = new Error("Email login required for this role");
      err.statusCode = 401;
      throw err;
    }
  }

  if (roleName && usernamePhoneRoles.has(roleName)) {
    const matchesPhone =
      user.phone && String(resolvedLoginId) === String(user.phone);
    const matchesUsername =
      user.username && String(resolvedLoginId) === String(user.username);
    if (!matchesPhone && !matchesUsername) {
      const err = new Error("Phone/username login required for this role");
      err.statusCode = 401;
      throw err;
    }
  }
};

export const loginService = async (body = {}) => {
  const { loginId, email, phone, username, password } = body;

  // Backward compatibility: allow { email } / { phone } / { username } too
  const resolvedLoginId = loginId || email || phone || username;

  if (!resolvedLoginId) {
    const err = new Error("loginId, email, phone or username is required");
    err.statusCode = 400;
    throw err;
  }

  if (!password) {
    const err = new Error("password is required");
    err.statusCode = 400;
    throw err;
  }

  const user = await findUserByLoginId(resolvedLoginId);

  if (!user) {
    const err = new Error("Invalid credentials");
    err.statusCode = 401;
    throw err;
  }

  try {
    enforceIdentifierByRole({ user, resolvedLoginId });
  } catch (e) {
    e.statusCode = 401;
    throw e;
  }

  const isMatch = await comparePassword(password, user.password);

  if (!isMatch) {
    const err = new Error("Invalid credentials");
    err.statusCode = 401;
    throw err;
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

export const forgotPasswordService = async (body = {}) => {
  const { loginId, email, phone, username } = body;
  const resolvedLoginId = loginId || email || phone || username;

  if (!resolvedLoginId) throw new Error("loginId is required");

  const user = await findUserByLoginId(resolvedLoginId);

  // Don't leak whether user exists
  if (!user) {
    return { message: "If account exists, OTP has been sent" };
  }

  // Enforce identifier type by role (same as login)
  enforceIdentifierByRole({ user, resolvedLoginId });

  // Basic cooldown: 30s
  const now = Date.now();
  const lastSent = user.passwordReset?.lastSentAt?.getTime?.() || 0;
  if (lastSent && now - lastSent < 30_000) {
    return { message: "OTP recently sent. Please wait and try again." };
  }

  const otp = generateOtp6();
  user.passwordReset = {
    otpHash: sha256(otp),
    expiresAt: new Date(now + 10 * 60 * 1000), // 10 min
    lastSentAt: new Date(now),
  };
  await user.save();

  // In production you'd send OTP via SMS/Email. For now, return it for testing.
  const includeOtp =
    process.env.RETURN_RESET_OTP === "true" ||
    (process.env.NODE_ENV && process.env.NODE_ENV !== "production");
  return {
    message: "If account exists, OTP has been sent",
    ...(includeOtp ? { otp } : {}),
  };
};

export const resetPasswordService = async (body = {}) => {
  const { loginId, email, phone, username, otp, newPassword } = body;
  const resolvedLoginId = loginId || email || phone || username;

  if (!resolvedLoginId) throw new Error("loginId is required");
  if (!otp) throw new Error("otp is required");
  if (!newPassword) throw new Error("newPassword is required");

  const user = await findUserByLoginId(resolvedLoginId);

  if (!user) throw new Error("Invalid OTP");

  // Enforce identifier type by role (same as login)
  enforceIdentifierByRole({ user, resolvedLoginId });

  const otpHash = user.passwordReset?.otpHash;
  const expiresAt = user.passwordReset?.expiresAt;
  if (!otpHash || !expiresAt) throw new Error("Invalid OTP");
  if (Date.now() > expiresAt.getTime()) throw new Error("OTP expired");

  if (sha256(otp) !== otpHash) throw new Error("Invalid OTP");

  // set new password (same hashing approach used elsewhere: bcrypt compare in login)
  // We hash here using bcrypt directly to avoid circular util imports.
  // (Keeping dependency consistent: bcryptjs is already used in project.)
  const bcrypt = await import("bcryptjs");
  user.password = await bcrypt.default.hash(newPassword, 10);
  user.passwordReset = { otpHash: undefined, expiresAt: undefined, lastSentAt: undefined };
  await user.save();

  return { message: "Password reset successful" };
};
