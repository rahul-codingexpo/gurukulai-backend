// import Student from "./student.model.js";
// import User from "../user/user.model.js";
// import Role from "../auth/role.model.js";
// import bcrypt from "bcryptjs";

// export const createAdmission = async (req, res, next) => {
//   try {
//     const schoolId = req.user.schoolId;

//     const studentPhoto = req.files?.studentPhoto?.[0]?.path || null;

//     const fatherIdProof = req.files?.fatherIdProof?.[0]?.path || null;

//     const motherIdProof = req.files?.motherIdProof?.[0]?.path || null;

//     const parentSignature = req.files?.parentSignature?.[0]?.path || null;

//     const {
//       name,
//       gender,
//       dob,
//       admissionNumber,
//       rollNumber,
//       className,
//       section,
//       admissionDate,
//       //   photo,
//       parents,
//       previousSchool,
//       //   documents,
//       feeStructure,
//       studentLogin,
//       parentLogin,
//     } = req.body;

//     /* Create Student */

//     const student = await Student.create({
//       schoolId,
//       name,
//       gender,
//       dob,
//       admissionNumber,
//       rollNumber,
//       className,
//       section,
//       admissionDate,
//       photo: studentPhoto,
//       parents,
//       previousSchool,
//       documents: {
//         fatherIdProof: fatherIdProof,
//         motherIdProof: motherIdProof,
//         parentSignature: parentSignature,
//         studentPhoto: studentPhoto,
//       },
//       feeStructure,
//     });

//     /* STUDENT LOGIN */

//     if (studentLogin?.type === "NEW_USER") {
//       const role = await Role.findOne({ name: "Student" });

//       const password = await bcrypt.hash(studentLogin.password, 10);

//       const user = await User.create({
//         name,
//         username: admissionNumber,
//         password,
//         roleId: role._id,
//         schoolId,
//       });

//       student.studentLogin = {
//         enabled: true,
//         userId: user._id,
//       };
//     }

//     /* PARENT LOGIN */

//     if (parentLogin?.type === "NEW_USER") {
//       const role = await Role.findOne({ name: "Parent" });

//       const password = await bcrypt.hash(parentLogin.password, 10);

//       const user = await User.create({
//         name: parents.father.name,
//         username: parents.father.phone,
//         password,
//         roleId: role._id,
//         schoolId,
//       });

//       student.parentLogin = {
//         enabled: true,
//         userId: user._id,
//       };
//     }

//     await student.save();

//     res.status(201).json({
//       success: true,
//       data: student,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

//====improved version with better structure and error handling===
import Student from "./student.model.js";
import User from "../user/user.model.js";
import Role from "../auth/role.model.js";
import StudentAttendance from "../attendance/studentAttendance.model.js";
import StudentLeave from "../leaves/studentLeave.model.js";
import HomeworkSubmission from "../homework/homeworkSubmission.model.js";
import ExamMark from "../exam/examMark.model.js";
import FeeInvoice from "../accounting/feeInvoice.model.js";
import Payment from "../accounting/payment.model.js";
import PastFeeRecord from "../accounting/pastFees/pastFeeRecord.model.js";
import Wallet from "../wallet/wallet.model.js";
import WalletPayment from "../wallet/walletPayment.model.js";
import Promotion from "../promote/promotion.model.js";
import TransferCertificate from "../tc/tc.model.js";
import bcrypt from "bcryptjs";
import XLSX from "xlsx";
import fs from "fs";
import { uploadedFileUrl } from "../../utils/uploadFile.util.js";
import { deleteFromSpacesByUrl } from "../../utils/spacesFile.util.js";

const DEFAULT_STUDENT_PASSWORD =
  process.env.DEFAULT_STUDENT_PASSWORD ||
  process.env.DEFAULT_USER_PASSWORD ||
  "12345";
const DEFAULT_PARENT_PASSWORD =
  process.env.DEFAULT_PARENT_PASSWORD ||
  process.env.DEFAULT_USER_PASSWORD ||
  "123456";

const resolveDefaultPassword = (kind) => {
  const raw = kind === "parent" ? DEFAULT_PARENT_PASSWORD : DEFAULT_STUDENT_PASSWORD;
  return String(raw ?? "").trim() || (kind === "parent" ? "123456" : "12345");
};

const buildPlaceholderEmail = (namespace, uniqueValue) => {
  const safe = String(uniqueValue || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "");
  return `${namespace}.${safe || Date.now()}@local.invalid`;
};

/* Helper function for safe JSON parsing */
const parseJSON = (data, defaultValue) => {
  if (!data) return defaultValue;
  if (typeof data === "string") return JSON.parse(data);
  return data;
};

// `address` is expected to be a plain string, but some clients may still send JSON.
// We only attempt JSON.parse when it looks like an object/array; otherwise keep it as raw text.
const safeParseAddressPayload = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (typeof value === "object") return value;
  return String(value);
};

const resolveSchoolId = (req) => {
  const roleName = req.user?.roleId?.name;
  if (roleName === "SuperAdmin") {
    return req.query.schoolId || req.body.schoolId || req.params.schoolId || null;
  }
  return req.user.schoolId;
};

const toOptionalString = (value) => {
  if (value === undefined || value === null) return undefined;
  const str = String(value).trim();
  return str ? str : undefined;
};

const toOptionalNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const toOptionalDate = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const normalizeStudentStatus = (value) => {
  const raw = toOptionalString(value);
  if (!raw) return undefined;
  const normalized = raw.toUpperCase();
  return ["ACTIVE", "INACTIVE", "SUSPENDED"].includes(normalized)
    ? normalized
    : undefined;
};

/* CREATE ADMISSION */

export const createAdmission = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);

    /* FILES */

    const studentPhoto = uploadedFileUrl(req.files?.studentPhoto?.[0]) || null;
    const fatherIdProof = uploadedFileUrl(req.files?.fatherIdProof?.[0]) || null;
    const motherIdProof = uploadedFileUrl(req.files?.motherIdProof?.[0]) || null;
    const parentSignature = uploadedFileUrl(req.files?.parentSignature?.[0]) || null;
    const fatherPhoto = uploadedFileUrl(req.files?.fatherPhoto?.[0]) || null;
    const motherPhoto = uploadedFileUrl(req.files?.motherPhoto?.[0]) || null;
    const marksheetPhoto = uploadedFileUrl(req.files?.marksheetPhoto?.[0]) || null;
    const reportC = uploadedFileUrl(req.files?.reportC?.[0]) || null;
    const cc = uploadedFileUrl(req.files?.cc?.[0]) || null;
    const tc = uploadedFileUrl(req.files?.tc?.[0]) || null;
    const dobCertificate = uploadedFileUrl(req.files?.dobCertificate?.[0]) || null;

    /* PARSE BODY SAFELY */

    const parents = parseJSON(req.body.parents, {});
    const previousSchool = parseJSON(req.body.previousSchool, {});
    const feeStructure = parseJSON(req.body.feeStructure, []);
    const studentLogin = parseJSON(req.body.studentLogin, {});
    const parentLogin = parseJSON(req.body.parentLogin, {});
    const addressPayload = safeParseAddressPayload(req.body.address);

    const {
      name,
      gender,
      dob,
      phone, // optional: student phone (if you want phone login for student)
      admissionNumber,
      rollNumber,
      className,
      section,
      admissionDate,
      currentAddress,
      permanentAddress,
      route,
      group,
      referredBy,
      fatherQualification,
      fatherOccupation,
      fatherMobileNumber,
      fatherDob,
      motherQualification,
      motherOccupation,
      motherDob,
      parentsAnniversaryDate,
      lastSchoolName,
      lastExam,
      lastExamYear,
      marks,
      board,
      formNo,
      remarks,
      hostelRoomNo,
      bedNo,
      schoolStatus,
      discountDate,
      scholarshipNo,
      feeBalance,
      bloodGroup,
      height,
      weight,
      visionLeft,
      visionRight,
      dentalHygiene,
      additionalField1,
      additionalField2,
      aadharCardNo,
      busNo,
      status,
    } = req.body;

    // Store only a single address string (not current/permanent split)
    let addressValue = "";
    if (typeof addressPayload === "string") {
      addressValue = addressPayload;
    } else if (addressPayload && typeof addressPayload === "object") {
      addressValue =
        addressPayload.address ??
        addressPayload.current ??
        addressPayload.currentAddress ??
        addressPayload.permanent ??
        addressPayload.permanentAddress ??
        "";
    } else {
      addressValue = currentAddress ?? permanentAddress ?? "";
    }

    const address = String(addressValue ?? "").trim();

    /* CHECK DUPLICATE ADMISSION */

    const existing = await Student.findOne({
      admissionNumber,
      schoolId,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Admission number already exists",
      });
    }

    /* CREATE STUDENT */

    const student = await Student.create({
      schoolId,
      name,
      gender,
      dob,
      phone,
      admissionNumber,
      rollNumber,
      className,
      section,
      admissionDate,
      address,
      parents,
      previousSchool,
      documents: {
        fatherIdProof,
        motherIdProof,
        parentSignature,
        studentPhoto,
        marksheetPhoto: marksheetPhoto || toOptionalString(req.body.marksheetPhoto),
        reportC: reportC || toOptionalString(req.body.reportC),
        cc: cc || toOptionalString(req.body.cc),
        tc: tc || toOptionalString(req.body.tc),
        dobCertificate: dobCertificate || toOptionalString(req.body.dobCertificate),
      },
      feeStructure,
      route: toOptionalString(route),
      group: toOptionalString(group),
      referredBy: toOptionalString(referredBy),
      formNo: toOptionalString(formNo),
      remarks: toOptionalString(remarks),
      hostelRoomNo: toOptionalString(hostelRoomNo),
      bedNo: toOptionalString(bedNo),
      schoolStatus: toOptionalString(schoolStatus),
      discountDate: toOptionalDate(discountDate),
      scholarshipNo: toOptionalString(scholarshipNo),
      feeBalance: toOptionalNumber(feeBalance),
      bloodGroup: toOptionalString(bloodGroup),
      height: toOptionalString(height),
      weight: toOptionalString(weight),
      visionLeft: toOptionalString(visionLeft),
      visionRight: toOptionalString(visionRight),
      dentalHygiene: toOptionalString(dentalHygiene),
      additionalField1: toOptionalString(additionalField1),
      additionalField2: toOptionalString(additionalField2),
      aadharCardNo: toOptionalString(aadharCardNo),
      busNo: toOptionalString(busNo),
      status: normalizeStudentStatus(status),
      previousSchool: {
        ...previousSchool,
        schoolName: toOptionalString(lastSchoolName) || previousSchool?.schoolName,
        lastExam: toOptionalString(lastExam) || previousSchool?.lastExam,
        lastExamYear: toOptionalNumber(lastExamYear) || previousSchool?.lastExamYear,
        marks: toOptionalString(marks) || previousSchool?.marks,
        board: toOptionalString(board) || previousSchool?.board,
      },
      parents: {
        ...parents,
        father: {
          ...(parents?.father || {}),
          qualification:
            toOptionalString(fatherQualification) || parents?.father?.qualification,
          occupation: toOptionalString(fatherOccupation) || parents?.father?.occupation,
          phone: toOptionalString(fatherMobileNumber) || parents?.father?.phone,
          dob: toOptionalDate(fatherDob) || parents?.father?.dob,
          photo: fatherPhoto || toOptionalString(req.body.fatherPhoto) || parents?.father?.photo,
        },
        mother: {
          ...(parents?.mother || {}),
          qualification:
            toOptionalString(motherQualification) || parents?.mother?.qualification,
          occupation: toOptionalString(motherOccupation) || parents?.mother?.occupation,
          dob: toOptionalDate(motherDob) || parents?.mother?.dob,
          photo: motherPhoto || toOptionalString(req.body.motherPhoto) || parents?.mother?.photo,
        },
        anniversaryDate:
          toOptionalDate(parentsAnniversaryDate) || parents?.anniversaryDate,
      },
    });

    /* STUDENT LOGIN */

    // if (studentLogin?.type === "NEW_USER") {
    //   const role = await Role.findOne({ name: "Student" });

    //   const password = await bcrypt.hash(studentLogin.password, 10);

    //   const user = await User.create({
    //     name,
    //     username: admissionNumber,
    //     password,
    //     roleId: role._id,
    //     schoolId,
    //   });

    //   student.studentLogin = {
    //     enabled: true,
    //     userId: user._id,
    //   };
    // }

    if (studentLogin?.type === "NEW_USER") {
      const role = await Role.findOne({ name: "Student" });

      if (!role) {
        return res.status(500).json({
          success: false,
          message: "Student role not found",
        });
      }

      const passwordPlain =
        (typeof studentLogin?.password === "string" && studentLogin.password.trim()) ||
        resolveDefaultPassword("student");
      const password = await bcrypt.hash(passwordPlain, 10);

      // Keep username = admissionNumber so admission-number login always works.
      // Phone login works via `phone` field in auth lookup.
      const studentPhone = phone || undefined;
      const studentUsername = admissionNumber;
      const studentEmail =
        req.body.email ||
        buildPlaceholderEmail("student", admissionNumber);

      const user = await User.create({
        name,
        username: studentUsername,
        phone: studentPhone,
        email: studentEmail,
        password,
        roleId: role._id,
        schoolId,
      });

      student.studentLogin = {
        enabled: true,
        userId: user._id,
      };
    }

    /* PARENT LOGIN */

    // if (parentLogin?.type === "NEW_USER" && parents?.father?.phone) {
    //   const role = await Role.findOne({ name: "Parent" });

    //   let user = await User.findOne({
    //     username: parents.father.phone,
    //     schoolId,
    //   });

    //   if (!user) {
    //     const password = await bcrypt.hash(parentLogin.password, 10);

    //     user = await User.create({
    //       name: parents.father.name,
    //       username: parents.father.phone,
    //       password,
    //       roleId: role._id,
    //       schoolId,
    //     });
    //   }

    //   student.parentLogin = {
    //     enabled: true,
    //     userId: user._id,
    //   };
    // }

    if (parentLogin?.type === "NEW_USER" && parents?.father?.phone) {
      const role = await Role.findOne({ name: "Parent" });

      if (!role) {
        return res.status(500).json({
          success: false,
          message: "Parent role not found",
        });
      }

      let user = await User.findOne({
        $or: [{ phone: parents.father.phone }, { username: parents.father.phone }],
        schoolId,
      });

      if (!user) {
        const passwordPlain =
          (typeof parentLogin?.password === "string" && parentLogin.password.trim()) ||
          resolveDefaultPassword("parent");
        const password = await bcrypt.hash(passwordPlain, 10);
        const parentEmail =
          parents?.father?.email ||
          buildPlaceholderEmail("parent", parents.father.phone);

        user = await User.create({
          name: parents.father.name,
          username: parents.father.phone,
          phone: parents.father.phone,
          email: parentEmail,
          password,
          roleId: role._id,
          schoolId,
        });
      }

      student.parentLogin = {
        enabled: true,
        userId: user._id,
      };
    }

    await student.save();

    res.status(201).json({
      success: true,
      data: student,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk student admission via Excel/CSV (.xlsx/.xls/.csv)
 *
 * Expected excel columns (header row required):
 * - name, gender, dob, admissionNumber, rollNumber, className, section, admissionDate
 * - fatherName, fatherPhone, fatherOccupation
 * - motherName, motherPhone, motherOccupation
 * Optional:
 * - studentPhone (if you want student login via phone)
 * - fatherEmail (for parent user email; placeholder will be used if missing)
 * - motherEmail (not used for login currently; included for future)
 * - currentAddress, permanentAddress (student residence)
 *
 * Request (multipart/form-data):
 * - excelFile: Excel/CSV file
 * - studentLogin: JSON string (e.g. {"type":"NEW_USER","password":"123456"}) [optional]
 * - parentLogin: JSON string (e.g. {"type":"NEW_USER","password":"123456"}) [optional]
 */
export const bulkCreateStudentsFromExcel = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query or body)"
            : "School context missing",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File is required (.xlsx, .xls, or .csv) under field `excelFile`",
      });
    }

    const studentLogin = parseJSON(req.body.studentLogin, {});
    const parentLogin = parseJSON(req.body.parentLogin, {});

    const wantStudentLogin = studentLogin?.type === "NEW_USER";
    const wantParentLogin = parentLogin?.type === "NEW_USER";

    // Passwords are optional: if not provided, defaults will be used.

    const workbook = req.file.buffer
      ? XLSX.read(req.file.buffer, { type: "buffer", cellDates: true })
      : XLSX.readFile(req.file.path, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Each row becomes an object with keys from the header row.
    // `defval: ""` prevents undefined values.
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const normalizeKey = (k) => String(k || "").trim().toLowerCase();

    const pick = (row, keys) => {
      for (const k of keys) {
        const nk = normalizeKey(k);
        // direct match
        if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
          return row[k];
        }
        // case-insensitive match
        const matchKey = Object.keys(row).find((rk) => normalizeKey(rk) === nk);
        if (matchKey) {
          const v = row[matchKey];
          if (v !== undefined && v !== null && String(v).trim() !== "") return v;
        }
      }
      return undefined;
    };

    const toDate = (v) => {
      if (!v) return null;
      if (v instanceof Date) return v;
      // Excel might give serial date number
      if (typeof v === "number") {
        const parsed = XLSX.SSF.parse_date_code(v);
        if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
      }
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const toStr = (v) => (v === undefined || v === null ? "" : String(v).trim());
    const toMaybeStr = (v) => {
      const s = toStr(v);
      return s ? s : undefined;
    };

    // If excel is huge, these caches reduce DB hits.
    const roleStudent = wantStudentLogin ? await Role.findOne({ name: "Student" }) : null;
    const roleParent = wantParentLogin ? await Role.findOne({ name: "Parent" }) : null;

    if (wantStudentLogin && !roleStudent) {
      return res.status(500).json({
        success: false,
        message: "Student role not found",
      });
    }
    if (wantParentLogin && !roleParent) {
      return res.status(500).json({
        success: false,
        message: "Parent role not found",
      });
    }

    const studentPasswordPlain =
      (typeof studentLogin?.password === "string" && studentLogin.password.trim()) ||
      resolveDefaultPassword("student");
    const parentPasswordPlain =
      (typeof parentLogin?.password === "string" && parentLogin.password.trim()) ||
      resolveDefaultPassword("parent");

    const studentPasswordHash = wantStudentLogin
      ? await bcrypt.hash(studentPasswordPlain, 10)
      : null;
    const parentPasswordHash = wantParentLogin
      ? await bcrypt.hash(parentPasswordPlain, 10)
      : null;

    // Precheck duplicates by admissionNumber
    const admissionNumbers = rows
      .map((r) => toStr(pick(r, ["admissionNumber", "admission number", "Admission Number", "AdmissionNo", "Admission No"])))
      .filter((x) => x);

    const existingStudents = await Student.find(
      { schoolId, admissionNumber: { $in: admissionNumbers } },
      { admissionNumber: 1 }
    ).lean();
    const existingSet = new Set(existingStudents.map((s) => s.admissionNumber));

    // Parent user cache: phone/username -> userId
    const parentUserCache = new Map();

    const created = [];
    const errors = [];
    const skipped = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNo = i + 2; // assuming first row is header

      try {
        const name = pick(row, ["name", "studentName", "Student Name", "Name"]);
        const gender = pick(row, ["gender", "Gender"]);
        const dobRaw = pick(row, ["dob", "DOB", "dateOfBirth", "Date of Birth"]);
        const admissionNumber = pick(row, ["admissionNumber", "Admission Number", "AdmissionNo", "Admission No"]);
        const rollNumber = pick(row, ["rollNumber", "Roll Number", "Roll No", "Roll No."]);
        const className = pick(row, ["className", "Class Name", "class", "grade", "Grade"]);
        const section = pick(row, ["section", "Section", "sec", "Section Name"]);
        const admissionDateRaw = pick(row, ["admissionDate", "Admission Date", "admission date", "Date"]);

        const fatherName = pick(row, ["fatherName", "Father Name", "father.name", "Father"]);
        const fatherPhone = pick(row, ["fatherPhone", "Father Phone"]);
        const fatherOccupation = pick(row, ["fatherOccupation", "Father Occupation"]);
        const fatherEmail = pick(row, ["fatherEmail", "Father Email"]);

        const motherName = pick(row, ["motherName", "Mother Name", "mother.name", "Mother"]);
        const motherPhone = pick(row, ["motherPhone", "Mother Phone"]);
        const motherOccupation = pick(row, ["motherOccupation", "Mother Occupation"]);

        const route = pick(row, ["route", "Route"]);
        const group = pick(row, ["group", "Group"]);
        const referredBy = pick(row, ["referredBy", "Refered By", "Referred By"]);
        const fatherQualification = pick(row, ["fatherQualification", "Father Qualification"]);
        const fatherDobRaw = pick(row, ["fatherDob", "Father DOB"]);
        const motherQualification = pick(row, ["motherQualification", "Mother Qualification"]);
        const motherDobRaw = pick(row, ["motherDob", "Mother DOB"]);
        const parentsAnniversaryDateRaw = pick(row, [
          "parentsAnniversaryDate",
          "Parents Anniversary Dates",
        ]);
        const lastSchoolName = pick(row, ["lastSchoolName", "Last School Name"]);
        const lastExam = pick(row, ["lastExam", "Last Exam"]);
        const lastExamYear = pick(row, ["lastExamYear", "Last Exam Year"]);
        const status = pick(row, ["status", "Status"]);
        const marks = pick(row, ["marks", "Marks"]);
        const board = pick(row, ["board", "Board"]);
        const formNo = pick(row, ["formNo", "Form No"]);
        const remarks = pick(row, ["remarks", "Remarks"]);
        const hostelRoomNo = pick(row, ["hostelRoomNo", "Hostel Room No"]);
        const bedNo = pick(row, ["bedNo", "Bed No"]);
        const schoolStatus = pick(row, ["schoolStatus", "School Status"]);
        const discountDateRaw = pick(row, ["discountDate", "Discount Date"]);
        const scholarshipNo = pick(row, ["scholarshipNo", "Scholarship No"]);
        const feeBalance = pick(row, ["feeBalance", "Fee Balance"]);
        const bloodGroup = pick(row, ["bloodGroup", "Blood Group"]);
        const height = pick(row, ["height", "Height"]);
        const weight = pick(row, ["weight", "Weight"]);
        const visionLeft = pick(row, ["visionLeft", "Vision Left"]);
        const visionRight = pick(row, ["visionRight", "Vision Right"]);
        const dentalHygiene = pick(row, ["dentalHygiene", "Dental Hygeine"]);
        const additionalField1 = pick(row, ["additionalField1", "Additional Feild 1"]);
        const additionalField2 = pick(row, ["additionalField2", "Additional Feild 2"]);
        const aadharCardNo = pick(row, ["aadharCardNo", "Aadhar Card No"]);
        const busNo = pick(row, ["busNo", "Bus No"]);

        if (!name || !admissionNumber || !className || !section || !admissionDateRaw || !fatherName || !fatherPhone || !motherName || !motherPhone) {
          errors.push({
            rowNo,
            reason: "Missing required fields (name, admissionNumber, className, section, admissionDate, fatherName/fatherPhone, motherName/motherPhone)",
          });
          continue;
        }

        const normalizedAdmissionNumber = toStr(admissionNumber);
        if (existingSet.has(normalizedAdmissionNumber)) {
          skipped.push({
            rowNo,
            admissionNumber: normalizedAdmissionNumber,
            reason: "Admission number already exists",
          });
          continue;
        }

        const dob = toDate(dobRaw);
        const admissionDate = toDate(admissionDateRaw);
        const fatherDob = toDate(fatherDobRaw);
        const motherDob = toDate(motherDobRaw);
        const parentsAnniversaryDate = toDate(parentsAnniversaryDateRaw);
        const discountDate = toDate(discountDateRaw);

        if (!admissionDate) {
          errors.push({ rowNo, admissionNumber: normalizedAdmissionNumber, reason: "Invalid admissionDate" });
          continue;
        }

        const studentPhone = toMaybeStr(pick(row, ["studentPhone", "student phone", "Student Phone", "phone"]));

        const currentAddr = toMaybeStr(
          pick(row, [
            "currentAddress",
            "Current Address",
            "current address",
            "address",
            "Address",
          ]),
        );
        const permanentAddr = toMaybeStr(
          pick(row, [
            "permanentAddress",
            "Permanent Address",
            "permanent address",
          ]),
        );
        const addressVal = currentAddr || permanentAddr || "";

        // Create Student
        const student = await Student.create({
          schoolId,
          name: toStr(name),
          gender: toMaybeStr(gender),
          dob: dob || undefined,
          admissionNumber: normalizedAdmissionNumber,
          rollNumber: toMaybeStr(rollNumber),
          className: toStr(className),
          section: toStr(section),
          admissionDate,
          address: addressVal,
          parents: {
            father: {
              name: toStr(fatherName),
              phone: toStr(fatherPhone),
              qualification: toMaybeStr(fatherQualification),
              occupation: toMaybeStr(fatherOccupation),
              email: toMaybeStr(fatherEmail),
              dob: fatherDob || undefined,
            },
            mother: {
              name: toStr(motherName),
              phone: toStr(motherPhone),
              qualification: toMaybeStr(motherQualification),
              occupation: toMaybeStr(motherOccupation),
              dob: motherDob || undefined,
            },
            anniversaryDate: parentsAnniversaryDate || undefined,
          },
          previousSchool: {
            schoolName: toMaybeStr(lastSchoolName),
            lastExam: toMaybeStr(lastExam),
            lastExamYear: toOptionalNumber(lastExamYear),
            marks: toMaybeStr(marks),
            board: toMaybeStr(board),
          },
          status: normalizeStudentStatus(status),
          route: toMaybeStr(route),
          group: toMaybeStr(group),
          referredBy: toMaybeStr(referredBy),
          formNo: toMaybeStr(formNo),
          remarks: toMaybeStr(remarks),
          hostelRoomNo: toMaybeStr(hostelRoomNo),
          bedNo: toMaybeStr(bedNo),
          schoolStatus: toMaybeStr(schoolStatus),
          discountDate: discountDate || undefined,
          scholarshipNo: toMaybeStr(scholarshipNo),
          feeBalance: toOptionalNumber(feeBalance),
          bloodGroup: toMaybeStr(bloodGroup),
          height: toMaybeStr(height),
          weight: toMaybeStr(weight),
          visionLeft: toMaybeStr(visionLeft),
          visionRight: toMaybeStr(visionRight),
          dentalHygiene: toMaybeStr(dentalHygiene),
          additionalField1: toMaybeStr(additionalField1),
          additionalField2: toMaybeStr(additionalField2),
          aadharCardNo: toMaybeStr(aadharCardNo),
          busNo: toMaybeStr(busNo),
        });

        // STUDENT LOGIN
        if (wantStudentLogin) {
          const studentUsername = normalizedAdmissionNumber;
          const studentEmail = buildPlaceholderEmail("student", normalizedAdmissionNumber);

          const user = await User.create({
            name: toStr(name),
            username: studentUsername,
            phone: studentPhone || undefined,
            email: studentEmail,
            password: studentPasswordHash,
            roleId: roleStudent._id,
            schoolId,
          });

          student.studentLogin = {
            enabled: true,
            userId: user._id,
          };
          await student.save();
        }

        // PARENT LOGIN (using father phone as per your createAdmission logic)
        if (wantParentLogin) {
          const parentKey = toStr(fatherPhone);
          let parentUserId = parentUserCache.get(parentKey);

          if (!parentUserId) {
            let user = await User.findOne({
              $or: [{ phone: parentKey }, { username: parentKey }],
              schoolId,
            });

            if (!user) {
              const parentEmail =
                toMaybeStr(fatherEmail) || buildPlaceholderEmail("parent", parentKey);

              user = await User.create({
                name: toStr(fatherName),
                username: parentKey,
                phone: parentKey,
                email: parentEmail,
                password: parentPasswordHash,
                roleId: roleParent._id,
                schoolId,
              });
            }

            parentUserId = user._id;
            parentUserCache.set(parentKey, parentUserId);
          }

          student.parentLogin = {
            enabled: true,
            userId: parentUserId,
          };
          await student.save();
        }

        created.push({ rowNo, studentId: student._id, admissionNumber: normalizedAdmissionNumber });
      } catch (rowErr) {
        errors.push({
          rowNo,
          reason: rowErr?.message || "Row processing error",
        });
      }
    }

    if (req.file.path) {
      fs.unlink(req.file.path, () => {});
    }

    return res.json({
      success: true,
      data: {
        createdCount: created.length,
        skippedCount: skipped.length,
        errorCount: errors.length,
        created,
        skipped,
        errors: errors.length ? errors : undefined,
      },
    });
  } catch (error) {
    next(error);
  }
};

/* GET ALL STUDENTS */

export const getStudents = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);

    const students = await Student.find({ schoolId });

    res.json({
      success: true,
      data: students,
    });
  } catch (error) {
    next(error);
  }
};

/* GET SINGLE STUDENT */

export const getStudentById = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const studentId = req.params.id;

    const student = await Student.findOne({ _id: studentId, schoolId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    res.json({
      success: true,
      data: student,
    });
  } catch (error) {
    next(error);
  }
};

/* UPDATE STUDENT */

export const updateStudent = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const studentId = req.params.id;

    const student = await Student.findOne({ _id: studentId, schoolId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const parents = parseJSON(req.body.parents);
    const previousSchool = parseJSON(req.body.previousSchool);
    const feeStructure = parseJSON(req.body.feeStructure);
    const addressPayload = safeParseAddressPayload(req.body.address);
    const studentLogin = parseJSON(req.body.studentLogin, null);
    const parentLogin = parseJSON(req.body.parentLogin, null);

    const {
      name,
      gender,
      dob,
      rollNumber,
      className,
      section,
      currentAddress,
      permanentAddress,
      phone,
      admissionNumber,
      admissionDate,
      route,
      group,
      referredBy,
      fatherQualification,
      fatherOccupation,
      fatherMobileNumber,
      fatherDob,
      motherQualification,
      motherOccupation,
      motherDob,
      parentsAnniversaryDate,
      lastSchoolName,
      lastExam,
      lastExamYear,
      marks,
      board,
      formNo,
      remarks,
      hostelRoomNo,
      bedNo,
      schoolStatus,
      discountDate,
      scholarshipNo,
      feeBalance,
      bloodGroup,
      height,
      weight,
      visionLeft,
      visionRight,
      dentalHygiene,
      additionalField1,
      additionalField2,
      aadharCardNo,
      busNo,
      status,
    } = req.body;

    // Phone fallback: if phone not provided, allow studentLogin.phone to fill it.
    const effectivePhone =
      phone !== undefined && phone !== null && String(phone).trim()
        ? phone
        : studentLogin?.phone ?? undefined;

    if (name) student.name = name;
    if (gender) student.gender = gender;
    if (dob) student.dob = dob;
    if (rollNumber) student.rollNumber = rollNumber;
    if (className) student.className = className;
    if (section) student.section = section;
    if (parents) student.parents = parents;
    if (previousSchool) student.previousSchool = previousSchool;
    if (feeStructure) student.feeStructure = feeStructure;

    // Store only one address string
    if (addressPayload !== null && addressPayload !== undefined) {
      let addrVal = "";
      if (typeof addressPayload === "string") {
        addrVal = addressPayload;
      } else if (typeof addressPayload === "object") {
        addrVal =
          addressPayload.address ??
          addressPayload.current ??
          addressPayload.currentAddress ??
          addressPayload.permanent ??
          addressPayload.permanentAddress ??
          "";
      }
      student.address = String(addrVal ?? "").trim();
    } else if (currentAddress !== undefined || permanentAddress !== undefined) {
      const addrVal = currentAddress ?? permanentAddress ?? "";
      student.address = String(addrVal).trim();
    }

    // Persist additional editable fields (used by admission edit UI)
    if (effectivePhone !== undefined) {
      student.phone =
        effectivePhone === null ? undefined : String(effectivePhone).trim();
    }

    if (admissionNumber !== undefined) {
      const newAdmissionNumber = String(admissionNumber).trim();

      if (!newAdmissionNumber) {
        return res.status(400).json({
          success: false,
          message: "admissionNumber cannot be empty",
        });
      }

      if (newAdmissionNumber !== student.admissionNumber) {
        const duplicate = await Student.findOne({
          schoolId,
          admissionNumber: newAdmissionNumber,
          _id: { $ne: student._id },
        });

        if (duplicate) {
          return res.status(400).json({
            success: false,
            message: "Admission number already exists",
          });
        }
      }

      student.admissionNumber = newAdmissionNumber;
    }

    if (admissionDate !== undefined) {
      const parsed = new Date(admissionDate);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({
          success: false,
          message: "admissionDate must be a valid date",
        });
      }
      student.admissionDate = parsed;
    }

    if (route !== undefined) student.route = toOptionalString(route);
    if (group !== undefined) student.group = toOptionalString(group);
    if (referredBy !== undefined) student.referredBy = toOptionalString(referredBy);
    if (formNo !== undefined) student.formNo = toOptionalString(formNo);
    if (remarks !== undefined) student.remarks = toOptionalString(remarks);
    if (hostelRoomNo !== undefined) student.hostelRoomNo = toOptionalString(hostelRoomNo);
    if (bedNo !== undefined) student.bedNo = toOptionalString(bedNo);
    if (schoolStatus !== undefined) student.schoolStatus = toOptionalString(schoolStatus);
    if (discountDate !== undefined) student.discountDate = toOptionalDate(discountDate);
    if (scholarshipNo !== undefined) student.scholarshipNo = toOptionalString(scholarshipNo);
    if (feeBalance !== undefined) student.feeBalance = toOptionalNumber(feeBalance);
    if (bloodGroup !== undefined) student.bloodGroup = toOptionalString(bloodGroup);
    if (height !== undefined) student.height = toOptionalString(height);
    if (weight !== undefined) student.weight = toOptionalString(weight);
    if (visionLeft !== undefined) student.visionLeft = toOptionalString(visionLeft);
    if (visionRight !== undefined) student.visionRight = toOptionalString(visionRight);
    if (dentalHygiene !== undefined) student.dentalHygiene = toOptionalString(dentalHygiene);
    if (additionalField1 !== undefined) student.additionalField1 = toOptionalString(additionalField1);
    if (additionalField2 !== undefined) student.additionalField2 = toOptionalString(additionalField2);
    if (aadharCardNo !== undefined) student.aadharCardNo = toOptionalString(aadharCardNo);
    if (busNo !== undefined) student.busNo = toOptionalString(busNo);
    if (status !== undefined) student.status = normalizeStudentStatus(status) || student.status;

    const nextPreviousSchool = student.previousSchool || {};
    if (lastSchoolName !== undefined) nextPreviousSchool.schoolName = toOptionalString(lastSchoolName);
    if (lastExam !== undefined) nextPreviousSchool.lastExam = toOptionalString(lastExam);
    if (lastExamYear !== undefined) nextPreviousSchool.lastExamYear = toOptionalNumber(lastExamYear);
    if (marks !== undefined) nextPreviousSchool.marks = toOptionalString(marks);
    if (board !== undefined) nextPreviousSchool.board = toOptionalString(board);
    if (Object.keys(nextPreviousSchool).length) student.previousSchool = nextPreviousSchool;

    student.parents = student.parents || {};
    student.parents.father = student.parents.father || {};
    student.parents.mother = student.parents.mother || {};
    if (fatherQualification !== undefined) {
      student.parents.father.qualification = toOptionalString(fatherQualification);
    }
    if (fatherOccupation !== undefined) {
      student.parents.father.occupation = toOptionalString(fatherOccupation);
    }
    if (fatherMobileNumber !== undefined) {
      student.parents.father.phone = toOptionalString(fatherMobileNumber);
    }
    if (fatherDob !== undefined) {
      student.parents.father.dob = toOptionalDate(fatherDob);
    }
    if (motherQualification !== undefined) {
      student.parents.mother.qualification = toOptionalString(motherQualification);
    }
    if (motherOccupation !== undefined) {
      student.parents.mother.occupation = toOptionalString(motherOccupation);
    }
    if (motherDob !== undefined) {
      student.parents.mother.dob = toOptionalDate(motherDob);
    }
    if (parentsAnniversaryDate !== undefined) {
      student.parents.anniversaryDate = toOptionalDate(parentsAnniversaryDate);
    }

    // Persist login references (no credential/user creation in PUT).
    if (studentLogin && typeof studentLogin === "object") {
      student.studentLogin = student.studentLogin || {};
      if (studentLogin.enabled !== undefined) {
        student.studentLogin.enabled = Boolean(studentLogin.enabled);
      }
      if (studentLogin.userId) {
        student.studentLogin.userId = studentLogin.userId;
      }
    }
    if (parentLogin && typeof parentLogin === "object") {
      student.parentLogin = student.parentLogin || {};
      if (parentLogin.enabled !== undefined) {
        student.parentLogin.enabled = Boolean(parentLogin.enabled);
      }
      if (parentLogin.userId) {
        student.parentLogin.userId = parentLogin.userId;
      }
    }

    // Persist uploaded documents if they were provided in multipart/form-data.
    // (PUT route already applies multer fields for these keys.)
    const fileToUploadPath = (f) => uploadedFileUrl(f);
    if (req.files?.studentPhoto?.[0]) {
      student.documents = student.documents || {};
      const old = student.documents.studentPhoto;
      student.documents.studentPhoto = fileToUploadPath(req.files.studentPhoto[0]);
      if (old && old !== student.documents.studentPhoto) {
        await deleteFromSpacesByUrl(old);
      }
    }
    if (req.files?.fatherIdProof?.[0]) {
      student.documents = student.documents || {};
      const old = student.documents.fatherIdProof;
      student.documents.fatherIdProof = fileToUploadPath(req.files.fatherIdProof[0]);
      if (old && old !== student.documents.fatherIdProof) {
        await deleteFromSpacesByUrl(old);
      }
    }
    if (req.files?.motherIdProof?.[0]) {
      student.documents = student.documents || {};
      const old = student.documents.motherIdProof;
      student.documents.motherIdProof = fileToUploadPath(req.files.motherIdProof[0]);
      if (old && old !== student.documents.motherIdProof) {
        await deleteFromSpacesByUrl(old);
      }
    }
    if (req.files?.parentSignature?.[0]) {
      student.documents = student.documents || {};
      const old = student.documents.parentSignature;
      student.documents.parentSignature = fileToUploadPath(req.files.parentSignature[0]);
      if (old && old !== student.documents.parentSignature) {
        await deleteFromSpacesByUrl(old);
      }
    }
    if (req.files?.fatherPhoto?.[0]) {
      student.parents = student.parents || {};
      student.parents.father = student.parents.father || {};
      const old = student.parents.father.photo;
      student.parents.father.photo = fileToUploadPath(req.files.fatherPhoto[0]);
      if (old && old !== student.parents.father.photo) {
        await deleteFromSpacesByUrl(old);
      }
    }
    if (req.files?.motherPhoto?.[0]) {
      student.parents = student.parents || {};
      student.parents.mother = student.parents.mother || {};
      const old = student.parents.mother.photo;
      student.parents.mother.photo = fileToUploadPath(req.files.motherPhoto[0]);
      if (old && old !== student.parents.mother.photo) {
        await deleteFromSpacesByUrl(old);
      }
    }
    if (req.files?.marksheetPhoto?.[0]) {
      student.documents = student.documents || {};
      const old = student.documents.marksheetPhoto;
      student.documents.marksheetPhoto = fileToUploadPath(req.files.marksheetPhoto[0]);
      if (old && old !== student.documents.marksheetPhoto) {
        await deleteFromSpacesByUrl(old);
      }
    }
    if (req.files?.reportC?.[0]) {
      student.documents = student.documents || {};
      const old = student.documents.reportC;
      student.documents.reportC = fileToUploadPath(req.files.reportC[0]);
      if (old && old !== student.documents.reportC) {
        await deleteFromSpacesByUrl(old);
      }
    }
    if (req.files?.cc?.[0]) {
      student.documents = student.documents || {};
      const old = student.documents.cc;
      student.documents.cc = fileToUploadPath(req.files.cc[0]);
      if (old && old !== student.documents.cc) {
        await deleteFromSpacesByUrl(old);
      }
    }
    if (req.files?.tc?.[0]) {
      student.documents = student.documents || {};
      const old = student.documents.tc;
      student.documents.tc = fileToUploadPath(req.files.tc[0]);
      if (old && old !== student.documents.tc) {
        await deleteFromSpacesByUrl(old);
      }
    }
    if (req.files?.dobCertificate?.[0]) {
      student.documents = student.documents || {};
      const old = student.documents.dobCertificate;
      student.documents.dobCertificate = fileToUploadPath(req.files.dobCertificate[0]);
      if (old && old !== student.documents.dobCertificate) {
        await deleteFromSpacesByUrl(old);
      }
    }

    await student.save();

    res.json({
      success: true,
      data: student,
    });
  } catch (error) {
    next(error);
  }
};

/* UPDATE STATUS */

export const updateStudentStatus = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const studentId = req.params.id;

    const { status } = req.body;
    const suspension = parseJSON(req.body.suspension);

    const student = await Student.findOne({ _id: studentId, schoolId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    if (status) student.status = status;
    if (suspension) student.suspension = suspension;

    await student.save();

    res.json({
      success: true,
      data: student,
    });
  } catch (error) {
    next(error);
  }
};

/* SUSPEND STUDENT */

export const updateStudentSuspension = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const studentId = req.params.id;

    const suspension = parseJSON(req.body.suspension);

    const student = await Student.findOne({ _id: studentId, schoolId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    student.suspension = suspension;

    await student.save();

    res.json({
      success: true,
      data: student,
    });
  } catch (error) {
    next(error);
  }
};

/* DELETE STUDENT */

export const deleteStudent = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const studentId = req.params.id;

    const student = await Student.findOne({
      _id: studentId,
      schoolId,
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const linkedStudentUserId = student.studentLogin?.userId || null;
    const linkedParentUserId = student.parentLogin?.userId || null;

    // Delete all child records that directly reference this student.
    await Promise.all([
      StudentAttendance.deleteMany({ schoolId, studentId }),
      StudentLeave.deleteMany({ schoolId, studentId }),
      HomeworkSubmission.deleteMany({ schoolId, studentId }),
      ExamMark.deleteMany({ schoolId, studentId }),
      Payment.deleteMany({ schoolId, studentId }),
      FeeInvoice.deleteMany({ schoolId, studentId }),
      PastFeeRecord.deleteMany({ schoolId, studentId }),
      WalletPayment.deleteMany({ schoolId, studentId }),
      Wallet.deleteMany({ schoolId, studentId }),
      Promotion.deleteMany({ schoolId, studentId }),
      TransferCertificate.deleteMany({ schoolId, studentId }),
    ]);

    // Delete linked student login user, if present.
    if (linkedStudentUserId) {
      await User.deleteOne({ _id: linkedStudentUserId, schoolId });
    }

    // Delete linked parent login user only if no other student uses it.
    if (linkedParentUserId) {
      const siblingsUsingSameParent = await Student.countDocuments({
        schoolId,
        _id: { $ne: student._id },
        "parentLogin.userId": linkedParentUserId,
      });
      if (siblingsUsingSameParent === 0) {
        await User.deleteOne({ _id: linkedParentUserId, schoolId });
      }
    }

    await student.deleteOne();

    res.json({
      success: true,
      message: "Student deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
