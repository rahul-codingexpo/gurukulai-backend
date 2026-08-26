import bcrypt from "bcryptjs";
import Branch from "./branch.model.js";
import School from "./school.model.js";
import User from "../user/user.model.js";
import Role from "../auth/role.model.js";
import { sendSchoolWelcomeEmail } from "../../services/email.service.js";
import { uploadedFileUrl } from "../../utils/uploadFile.util.js";

const SCHOOL_FIELDS = [
  "schoolCode",
  "name",
  "logo",
  "yearEstablished",
  "affiliation",
  "address",
  "city",
  "state",
  "pincode",
  "phone",
  "email",
  "website",
  "registrationNumber",
  "udiseNumber",
  "runUnder",
  "status",
  "upiId",
  "qrCode",
];

const isDataUrlLogo = (value) =>
  typeof value === "string" && /^data:image\//i.test(value.trim());

const pickSchoolPayload = (raw = {}) => {
  const payload = {};
  for (const key of SCHOOL_FIELDS) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") {
      // Never persist base64 data-URL logos from JSON body
      if (key === "logo" && isDataUrlLogo(raw[key])) continue;
      payload[key] = raw[key];
    }
  }
  if (payload.schoolCode) {
    payload.schoolCode = String(payload.schoolCode).trim().toUpperCase();
  }
  if (payload.email) {
    payload.email = String(payload.email).trim().toLowerCase();
  }
  if (payload.yearEstablished !== undefined) {
    payload.yearEstablished = parseInt(payload.yearEstablished, 10);
  }
  if (!payload.status) payload.status = "ACTIVE";
  return payload;
};

const validatePerson = (person, label, index) => {
  if (!person || typeof person !== "object") {
    return `Campus ${index + 1}: ${label} details are required`;
  }
  for (const field of ["name", "email", "phone", "password"]) {
    if (!person[field] || !String(person[field]).trim()) {
      return `Campus ${index + 1}: ${label} ${field} is required`;
    }
  }
  return null;
};

/** Map multipart files logo_0, logo_1, ... to campus index → file */
const mapLogoFilesByIndex = (files) => {
  const map = {};
  const list = Array.isArray(files) ? files : [];
  for (const file of list) {
    const m = String(file.fieldname || "").match(/^logo_(\d+)$/);
    if (!m) continue;
    map[Number(m[1])] = file;
  }
  return map;
};

const parseSchoolsBody = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }
  return null;
};

/**
 * SuperAdmin onboards a branch group with one or more campus schools.
 * Each campus gets its own Principal + Admin.
 * Body (JSON or multipart):
 *   branchName, schools: [{ ...schoolFields, principal, admin }]
 * Multipart files: logo_0, logo_1, ... (optional per campus index)
 */
export const branchOnboard = async (req, res, next) => {
  const createdSchoolIds = [];
  const createdUserIds = [];
  let createdBranchId = null;

  try {
    const branchName = req.body?.branchName;
    const schools = parseSchoolsBody(req.body?.schools);
    const logoByIndex = mapLogoFilesByIndex(req.files);

    if (!branchName || !String(branchName).trim()) {
      return res.status(400).json({
        success: false,
        message: "branchName is required",
      });
    }

    if (!Array.isArray(schools) || schools.length === 0) {
      return res.status(400).json({
        success: false,
        message: "schools array with at least one campus is required",
      });
    }

    const adminRole = await Role.findOne({ name: "Admin" });
    const principalRole = await Role.findOne({ name: "Principal" });

    if (!adminRole || !principalRole) {
      return res.status(404).json({
        success: false,
        message: "Admin or Principal role not found",
      });
    }

    const schoolCodes = new Set();
    const emails = new Set();

    for (let i = 0; i < schools.length; i++) {
      const item = schools[i] || {};
      const schoolPayload = pickSchoolPayload(item);

      if (!schoolPayload.schoolCode || !schoolPayload.name) {
        return res.status(400).json({
          success: false,
          message: `Campus ${i + 1}: schoolCode and name are required`,
        });
      }

      if (schoolCodes.has(schoolPayload.schoolCode)) {
        return res.status(400).json({
          success: false,
          message: `Duplicate schoolCode in request: ${schoolPayload.schoolCode}`,
        });
      }
      schoolCodes.add(schoolPayload.schoolCode);

      const principalErr = validatePerson(item.principal, "Principal", i);
      if (principalErr) {
        return res.status(400).json({ success: false, message: principalErr });
      }

      const adminErr = validatePerson(item.admin, "Admin", i);
      if (adminErr) {
        return res.status(400).json({ success: false, message: adminErr });
      }

      const principalEmail = String(item.principal.email).trim().toLowerCase();
      const adminEmail = String(item.admin.email).trim().toLowerCase();

      if (principalEmail === adminEmail) {
        return res.status(400).json({
          success: false,
          message: `Campus ${i + 1}: Principal and Admin emails must be different`,
        });
      }

      for (const email of [principalEmail, adminEmail]) {
        if (emails.has(email)) {
          return res.status(400).json({
            success: false,
            message: `Duplicate email in request: ${email}`,
          });
        }
        emails.add(email);
      }
    }

    const existingCodes = await School.find({
      schoolCode: { $in: [...schoolCodes] },
    })
      .select("schoolCode")
      .lean();

    if (existingCodes.length) {
      return res.status(400).json({
        success: false,
        message: `School code already exists: ${existingCodes.map((s) => s.schoolCode).join(", ")}`,
      });
    }

    const existingUsers = await User.find({
      email: { $in: [...emails] },
    })
      .select("email")
      .lean();

    if (existingUsers.length) {
      return res.status(400).json({
        success: false,
        message: `User already exists: ${existingUsers.map((u) => u.email).join(", ")}`,
      });
    }

    const branch = await Branch.create({
      name: String(branchName).trim(),
      status: "ACTIVE",
    });
    createdBranchId = branch._id;

    const createdCampuses = [];

    for (let i = 0; i < schools.length; i++) {
      const item = schools[i];
      const schoolPayload = pickSchoolPayload(item);

      const logoFile = logoByIndex[i];
      if (logoFile) {
        const logoUrl = uploadedFileUrl(logoFile);
        if (logoUrl) schoolPayload.logo = logoUrl;
      } else {
        // Prefer uploaded file; drop empty / data-URL leftovers
        delete schoolPayload.logo;
      }

      const school = await School.create({
        ...schoolPayload,
        branchId: branch._id,
      });
      createdSchoolIds.push(school._id);

      const principalEmail = String(item.principal.email).trim().toLowerCase();
      const adminEmail = String(item.admin.email).trim().toLowerCase();

      const principalHash = await bcrypt.hash(String(item.principal.password).trim(), 10);
      const adminHash = await bcrypt.hash(String(item.admin.password).trim(), 10);

      const users = await User.insertMany([
        {
          name: String(item.principal.name).trim(),
          email: principalEmail,
          phone: String(item.principal.phone).trim(),
          password: principalHash,
          roleId: principalRole._id,
          schoolId: school._id,
        },
        {
          name: String(item.admin.name).trim(),
          email: adminEmail,
          phone: String(item.admin.phone).trim(),
          password: adminHash,
          roleId: adminRole._id,
          schoolId: school._id,
        },
      ]);
      createdUserIds.push(...users.map((u) => u._id));

      createdCampuses.push(school);

      if (school.email) {
        sendSchoolWelcomeEmail(school).catch((err) => {
          console.error(
            `Failed to send onboarding welcome email to school: ${school.email}`,
            err,
          );
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Branch onboarded with ${createdCampuses.length} campus(es)`,
      data: {
        branch,
        schools: createdCampuses,
      },
    });
  } catch (error) {
    // Best-effort rollback if something failed mid-way
    try {
      if (createdUserIds.length) await User.deleteMany({ _id: { $in: createdUserIds } });
      if (createdSchoolIds.length) await School.deleteMany({ _id: { $in: createdSchoolIds } });
      if (createdBranchId) await Branch.deleteOne({ _id: createdBranchId });
    } catch (cleanupErr) {
      console.error("branchOnboard cleanup failed", cleanupErr);
    }
    next(error);
  }
};
