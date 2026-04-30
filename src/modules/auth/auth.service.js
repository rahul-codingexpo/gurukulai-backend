import User from "../user/user.model.js";
import Student from "../student/student.model.js";
import Staff from "../staff/staff.model.js";
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
  "Accountant",
  "Librarian",
]);
/** Login with email, phone, or username (same checks as students/parents/staff). */
const emailPhoneUsernameRoles = new Set(["Teacher"]);
const usernamePhoneRoles = new Set(["Student", "Parent", "Staff"]);
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeLoginIdentifier = (value) => String(value || "").trim();
const isEmailPath = ({ loginId, email }) =>
  Boolean(email) || normalizeLoginIdentifier(loginId).includes("@");
const isValidEmail = (value) => emailRegex.test(normalizeLoginIdentifier(value).toLowerCase());

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
  const normalizedLogin = String(resolvedLoginId).trim().toLowerCase();

  if (roleName && emailPhoneUsernameRoles.has(roleName)) {
    const matchesEmail =
      user.email && normalizedLogin === String(user.email).toLowerCase();
    const matchesPhone =
      user.phone && String(resolvedLoginId) === String(user.phone);
    const matchesUsername =
      user.username && String(resolvedLoginId) === String(user.username);
    if (!matchesEmail && !matchesPhone && !matchesUsername) {
      const err = new Error("Email, phone, or username required for this role");
      err.statusCode = 401;
      throw err;
    }
    return;
  }

  if (roleName && emailOnlyRoles.has(roleName)) {
    if (!user.email || normalizedLogin !== String(user.email).toLowerCase()) {
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

const enrichLoginUserForMobile = async (user) => {
  const roleName = user?.roleId?.name;
  const userId = user?._id;

  if (!roleName || !userId) return {};

  if (roleName === "Student") {
    const student = await Student.findOne({ "studentLogin.userId": userId })
      .select("name admissionNumber className section rollNumber documents.studentPhoto")
      .lean();

    return {
      profilePhoto: student?.documents?.studentPhoto || null,
      profileDetails: {
        displayName: student?.name || user.name || "",
        admissionNumber: student?.admissionNumber || "",
        className: student?.className || "",
        section: student?.section || "",
        rollNumber: student?.rollNumber || "",
      },
    };
  }

  if (roleName === "Parent") {
    const student = await Student.findOne({ "parentLogin.userId": userId })
      .select("name admissionNumber className section rollNumber documents.studentPhoto parents")
      .lean();

    return {
      profilePhoto: student?.documents?.studentPhoto || null,
      profileDetails: {
        displayName: user.name || null,
        relation: "Parent",
        childName: student?.name || null,
        admissionNumber: student?.admissionNumber || null,
        className: student?.className || null,
        section: student?.section || null,
        rollNumber: student?.rollNumber || null,
        fatherName: student?.parents?.father?.name || null,
        fatherPhone: student?.parents?.father?.phone || null,
        motherName: student?.parents?.mother?.name || null,
        motherPhone: student?.parents?.mother?.phone || null,
      },
    };
  }

  if (roleName === "Teacher") {
    const staff = await Staff.findOne({ userId })
      .select("name designation photoUrl")
      .lean();

    return {
      profilePhoto: staff?.photoUrl || null,
      profileDetails: {
        displayName: staff?.name || user.name || "",
        designation: staff?.designation || "Teacher",
        staffId: staff?._id ? String(staff._id) : "",
      },
    };
  }

  return {};
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

  const loginThroughEmailPath = isEmailPath({ loginId, email });
  let user = null;

  if (loginThroughEmailPath) {
    const normalizedEmail = normalizeLoginIdentifier(resolvedLoginId).toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      const err = new Error("Invalid email");
      err.statusCode = 400;
      throw err;
    }

    user = await User.findOne({ email: normalizedEmail })
      .select("+password +passwordReset.otpHash +passwordReset.expiresAt +passwordReset.lastSentAt")
      .populate("roleId");

    if (!user) {
      const err = new Error("Email not registered");
      err.statusCode = 401;
      throw err;
    }
  } else {
    user = await findUserByLoginId(resolvedLoginId);
  }

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
    const err = new Error("Invalid password");
    err.statusCode = 401;
    throw err;
  }

  const token = generateToken(user);
  // ✅ remove sensitive fields
  const userObj = user.toObject();
  delete userObj.password;
  const mobileProfileInfo = await enrichLoginUserForMobile(user);

  return {
    token,
    user: {
      ...userObj,
      ...mobileProfileInfo,
    },
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
