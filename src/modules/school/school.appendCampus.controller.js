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

const validatePerson = (person, label) => {
  if (!person || typeof person !== "object") {
    return `${label} details are required`;
  }
  for (const field of ["name", "email", "phone", "password"]) {
    if (!person[field] || !String(person[field]).trim()) {
      return `${label} ${field} is required`;
    }
  }
  return null;
};

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
 * Admin / Principal / SuperAdmin: append a campus school to the caller's branch.
 * If the home school has no branchId, create a Branch and link home + new campus.
 *
 * Body (multipart):
 *   schools: [{ ...schoolFields, principal, admin }]  (one campus recommended)
 *   branchName?: string (used only when creating a new branch)
 *   homeSchoolId?: string (SuperAdmin only)
 * Files: logo_0 (optional)
 */
export const appendBranchCampus = async (req, res, next) => {
  const createdSchoolIds = [];
  const createdUserIds = [];
  let createdBranchId = null;
  let linkedHomeSchoolId = null;

  try {
    const roleName = req.user?.roleId?.name;
    const schools = parseSchoolsBody(req.body?.schools);
    const logoByIndex = mapLogoFilesByIndex(req.files);

    if (!Array.isArray(schools) || schools.length === 0) {
      return res.status(400).json({
        success: false,
        message: "schools array with at least one campus is required",
      });
    }

    // Append flow supports one campus per request (UI sends one).
    const item = schools[0] || {};
    const schoolPayload = pickSchoolPayload(item);

    if (!schoolPayload.schoolCode || !schoolPayload.name) {
      return res.status(400).json({
        success: false,
        message: "schoolCode and name are required",
      });
    }

    const principalErr = validatePerson(item.principal, "Principal");
    if (principalErr) {
      return res.status(400).json({ success: false, message: principalErr });
    }
    const adminErr = validatePerson(item.admin, "Admin");
    if (adminErr) {
      return res.status(400).json({ success: false, message: adminErr });
    }

    const principalEmail = String(item.principal.email).trim().toLowerCase();
    const adminEmail = String(item.admin.email).trim().toLowerCase();
    if (principalEmail === adminEmail) {
      return res.status(400).json({
        success: false,
        message: "Principal and Admin emails must be different",
      });
    }

    let homeId = req.user?.schoolId?._id || req.user?.schoolId;
    if (roleName === "SuperAdmin") {
      const requestedHome = req.body?.homeSchoolId;
      if (requestedHome) homeId = requestedHome;
    }

    if (!homeId) {
      return res.status(400).json({
        success: false,
        message: "Home school context is required to add a campus",
      });
    }

    const homeSchool = await School.findById(homeId);
    if (!homeSchool) {
      return res.status(404).json({
        success: false,
        message: "Home school not found",
      });
    }

    // Non-SuperAdmin may only append under their own home school.
    if (roleName !== "SuperAdmin") {
      const mySchoolId = req.user?.schoolId?._id || req.user?.schoolId;
      if (!mySchoolId || String(mySchoolId) !== String(homeSchool._id)) {
        return res.status(403).json({
          success: false,
          message: "You can only add campuses to your own school branch",
        });
      }
    }

    const adminRole = await Role.findOne({ name: "Admin" });
    const principalRole = await Role.findOne({ name: "Principal" });
    if (!adminRole || !principalRole) {
      return res.status(404).json({
        success: false,
        message: "Admin or Principal role not found",
      });
    }

    const codeTaken = await School.findOne({
      schoolCode: schoolPayload.schoolCode,
    })
      .select("_id schoolCode")
      .lean();
    if (codeTaken) {
      return res.status(400).json({
        success: false,
        message: `School code already exists: ${schoolPayload.schoolCode}`,
      });
    }

    const existingUsers = await User.find({
      email: { $in: [principalEmail, adminEmail] },
    })
      .select("email")
      .lean();
    if (existingUsers.length) {
      return res.status(400).json({
        success: false,
        message: `User already exists: ${existingUsers.map((u) => u.email).join(", ")}`,
      });
    }

    let branch = null;
    if (homeSchool.branchId) {
      branch = await Branch.findById(homeSchool.branchId);
      if (!branch) {
        return res.status(400).json({
          success: false,
          message: "Home school branch record is missing",
        });
      }
    } else {
      const branchName =
        String(req.body?.branchName || "").trim() ||
        String(homeSchool.name || "School Branch").trim();
      branch = await Branch.create({
        name: branchName,
        status: "ACTIVE",
      });
      createdBranchId = branch._id;
      homeSchool.branchId = branch._id;
      await homeSchool.save();
      linkedHomeSchoolId = homeSchool._id;
    }

    const logoFile = logoByIndex[0];
    if (logoFile) {
      const logoUrl = uploadedFileUrl(logoFile);
      if (logoUrl) schoolPayload.logo = logoUrl;
      else delete schoolPayload.logo;
    } else {
      delete schoolPayload.logo;
    }

    const school = await School.create({
      ...schoolPayload,
      branchId: branch._id,
    });
    createdSchoolIds.push(school._id);

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

    if (school.email) {
      sendSchoolWelcomeEmail(school).catch((err) => {
        console.error(
          `Failed to send onboarding welcome email to school: ${school.email}`,
          err,
        );
      });
    }

    res.status(201).json({
      success: true,
      message: "Campus added to branch successfully",
      data: {
        branch,
        school,
        schools: [school],
        users: users.map((u) => ({
          _id: u._id,
          name: u.name,
          email: u.email,
          roleId: u.roleId,
          schoolId: u.schoolId,
        })),
        homeSchoolLinked: Boolean(linkedHomeSchoolId),
      },
    });
  } catch (error) {
    try {
      if (createdUserIds.length) await User.deleteMany({ _id: { $in: createdUserIds } });
      if (createdSchoolIds.length) await School.deleteMany({ _id: { $in: createdSchoolIds } });
      if (linkedHomeSchoolId && createdBranchId) {
        await School.updateOne(
          { _id: linkedHomeSchoolId },
          { $set: { branchId: null } },
        );
      }
      if (createdBranchId) await Branch.deleteOne({ _id: createdBranchId });
    } catch (cleanupErr) {
      console.error("appendBranchCampus cleanup failed", cleanupErr);
    }
    next(error);
  }
};
