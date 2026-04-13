import fs from "fs";
import path from "path";
import TransferCertificate from "./tc.model.js";
import Student from "../student/student.model.js";
import { uploadedFileUrl } from "../../utils/uploadFile.util.js";

const resolveSchoolId = (req) => {
  const roleName = req.user?.roleId?.name;
  if (roleName === "SuperAdmin") {
    return req.query.schoolId || req.body.schoolId || req.params.schoolId || null;
  }
  return req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
};

const toDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toStr = (v) => (v === undefined || v === null ? "" : String(v).trim());

const requireSchool = (req, res) => {
  const schoolId = resolveSchoolId(req);
  if (!schoolId) {
    res.status(400).json({
      success: false,
      message:
        req.user?.roleId?.name === "SuperAdmin"
          ? "schoolId is required (query or body)"
          : "School context missing",
    });
    return null;
  }
  return schoolId;
};

const linkStudent = async ({ schoolId, studentId, admissionNumber }) => {
  let resolvedStudentId = studentId || null;
  let resolvedAdmissionNumber = toStr(admissionNumber);

  if (!resolvedStudentId && !resolvedAdmissionNumber) {
    const err = new Error("At least one of studentId or admissionNumber is required");
    err.statusCode = 400;
    throw err;
  }

  if (resolvedAdmissionNumber && !resolvedStudentId) {
    const studentByAdmission = await Student.findOne({
      schoolId,
      admissionNumber: resolvedAdmissionNumber,
    }).select("_id admissionNumber");

    if (studentByAdmission) {
      resolvedStudentId = studentByAdmission._id;
      resolvedAdmissionNumber = studentByAdmission.admissionNumber;
    }
  }

  if (resolvedStudentId) {
    const student = await Student.findOne({
      _id: resolvedStudentId,
      schoolId,
    }).select("_id admissionNumber");

    if (!student) {
      const err = new Error("Student not found in this school");
      err.statusCode = 400;
      throw err;
    }

    resolvedStudentId = student._id;
    if (!resolvedAdmissionNumber) resolvedAdmissionNumber = student.admissionNumber || "";
  }

  return {
    studentId: resolvedStudentId,
    admissionNumber: resolvedAdmissionNumber,
  };
};

const validateGeneratedContent = (content = {}) => {
  const required = [
    "studentName",
    "fatherName",
    "motherName",
    "classLastAttended",
    "section",
    "leavingDate",
    "reasonForLeaving",
  ];

  const missing = required.filter((key) => !toStr(content[key]));
  if (missing.length) {
    const err = new Error(`Missing required content fields: ${missing.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }
};

const buildGeneratedContent = (content = {}) => ({
  studentName: toStr(content.studentName),
  rollNumber: toStr(content.rollNumber),
  dob: toDate(content.dob),
  fatherName: toStr(content.fatherName),
  motherName: toStr(content.motherName),
  classLastAttended: toStr(content.classLastAttended),
  section: toStr(content.section),
  academicSession: toStr(content.academicSession),
  admissionDate: toDate(content.admissionDate),
  leavingDate: toDate(content.leavingDate),
  reasonForLeaving: toStr(content.reasonForLeaving),
  conduct: toStr(content.conduct) || "Good",
  feesCleared: toStr(content.feesCleared) || "Yes",
  resultStatus: toStr(content.resultStatus),
  remarks: toStr(content.remarks),
  notes: toStr(content.notes),
});

const removeLocalFileIfExists = (filePath) => {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
};

export const uploadTC = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "tcFile is required",
      });
    }

    const { tcNumber, issueDate, admissionNumber, studentId, notes } = req.body || {};

    if (!tcNumber || !issueDate) {
      removeLocalFileIfExists(req.file.path);
      return res.status(400).json({
        success: false,
        message: "tcNumber and issueDate are required",
      });
    }

    const issueDateObj = toDate(issueDate);
    if (!issueDateObj) {
      removeLocalFileIfExists(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Invalid issueDate",
      });
    }

    const linked = await linkStudent({
      schoolId,
      studentId,
      admissionNumber,
    });

    const tc = await TransferCertificate.create({
      schoolId,
      studentId: linked.studentId,
      admissionNumber: linked.admissionNumber,
      mode: "UPLOAD",
      tcNumber: toStr(tcNumber),
      issueDate: issueDateObj,
      status: "ACTIVE",
      file: {
        path: uploadedFileUrl(req.file),
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
      content: {
        notes: toStr(notes),
      },
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    return res.status(201).json({
      success: true,
      message: "TC uploaded successfully",
      data: tc,
    });
  } catch (error) {
    if (error?.code === 11000) {
      removeLocalFileIfExists(req.file?.path);
      return res.status(409).json({
        success: false,
        message: "tcNumber already exists in this school",
      });
    }
    next(error);
  }
};

export const createGeneratedTC = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const { tcNumber, issueDate, studentId, admissionNumber, content = {} } = req.body || {};

    if (!tcNumber || !issueDate) {
      return res.status(400).json({
        success: false,
        message: "tcNumber and issueDate are required",
      });
    }

    const issueDateObj = toDate(issueDate);
    if (!issueDateObj) {
      return res.status(400).json({
        success: false,
        message: "Invalid issueDate",
      });
    }

    validateGeneratedContent(content);

    const linked = await linkStudent({ schoolId, studentId, admissionNumber });

    const tc = await TransferCertificate.create({
      schoolId,
      studentId: linked.studentId,
      admissionNumber: linked.admissionNumber,
      mode: "GENERATED",
      tcNumber: toStr(tcNumber),
      issueDate: issueDateObj,
      status: "ACTIVE",
      content: buildGeneratedContent(content),
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    return res.status(201).json({
      success: true,
      message: "TC created successfully",
      data: tc,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "tcNumber already exists in this school",
      });
    }
    next(error);
  }
};

export const getTCList = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const {
      studentId,
      admissionNumber,
      tcNumber,
      mode,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
    } = req.query;

    const filter = { schoolId };
    if (studentId) filter.studentId = studentId;
    if (admissionNumber) filter.admissionNumber = admissionNumber;
    if (tcNumber) filter.tcNumber = new RegExp(String(tcNumber).trim(), "i");
    if (mode) filter.mode = mode;

    if (fromDate || toDate) {
      filter.issueDate = {};
      if (fromDate) filter.issueDate.$gte = new Date(fromDate);
      if (toDate) filter.issueDate.$lte = new Date(toDate);
    }

    const pageNo = Math.max(1, parseInt(page, 10) || 1);
    const limitNo = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNo - 1) * limitNo;

    const [items, total] = await Promise.all([
      TransferCertificate.find(filter)
        .populate("studentId", "name admissionNumber className section rollNumber")
        .sort({ issueDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNo)
        .lean(),
      TransferCertificate.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        items,
        pagination: {
          page: pageNo,
          limit: limitNo,
          total,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTCById = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const tc = await TransferCertificate.findOne({
      _id: req.params.id,
      schoolId,
    })
      .populate("studentId", "name admissionNumber className section rollNumber")
      .lean();

    if (!tc) {
      return res.status(404).json({
        success: false,
        message: "TC record not found",
      });
    }

    return res.json({ success: true, data: tc });
  } catch (error) {
    next(error);
  }
};

export const updateTC = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const tc = await TransferCertificate.findOne({
      _id: req.params.id,
      schoolId,
    });

    if (!tc) {
      return res.status(404).json({
        success: false,
        message: "TC record not found",
      });
    }

    const body = req.body || {};

    if (body.tcNumber !== undefined) tc.tcNumber = toStr(body.tcNumber);
    if (body.issueDate !== undefined) {
      const d = toDate(body.issueDate);
      if (!d) {
        return res.status(400).json({ success: false, message: "Invalid issueDate" });
      }
      tc.issueDate = d;
    }

    if (body.admissionNumber !== undefined || body.studentId !== undefined) {
      const linked = await linkStudent({
        schoolId,
        studentId: body.studentId !== undefined ? body.studentId : tc.studentId,
        admissionNumber:
          body.admissionNumber !== undefined
            ? body.admissionNumber
            : tc.admissionNumber,
      });
      tc.studentId = linked.studentId;
      tc.admissionNumber = linked.admissionNumber;
    }

    if (tc.mode === "GENERATED" && body.content && typeof body.content === "object") {
      const merged = {
        ...(tc.content?.toObject ? tc.content.toObject() : tc.content || {}),
        ...body.content,
      };

      // For generated mode we keep critical fields valid.
      validateGeneratedContent(merged);
      tc.content = buildGeneratedContent(merged);
    } else if (body.notes !== undefined) {
      const existing = tc.content?.toObject ? tc.content.toObject() : tc.content || {};
      tc.content = { ...existing, notes: toStr(body.notes) };
    }

    tc.updatedBy = req.user?._id || null;

    await tc.save();

    return res.json({
      success: true,
      message: "TC updated successfully",
      data: tc,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "tcNumber already exists in this school",
      });
    }
    next(error);
  }
};

export const updateTCStatus = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const { status } = req.body || {};
    if (!["ACTIVE", "CANCELLED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status must be ACTIVE or CANCELLED",
      });
    }

    const tc = await TransferCertificate.findOneAndUpdate(
      { _id: req.params.id, schoolId },
      {
        status,
        updatedBy: req.user?._id || null,
      },
      { new: true }
    );

    if (!tc) {
      return res.status(404).json({
        success: false,
        message: "TC record not found",
      });
    }

    return res.json({
      success: true,
      message: "TC status updated",
      data: tc,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTC = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const tc = await TransferCertificate.findOneAndDelete({
      _id: req.params.id,
      schoolId,
    });

    if (!tc) {
      return res.status(404).json({
        success: false,
        message: "TC record not found",
      });
    }

    if (tc.mode === "UPLOAD" && tc.file?.path) {
      const fullPath = path.join(process.cwd(), tc.file.path.replace(/^\//, ""));
      removeLocalFileIfExists(fullPath);
    }

    return res.json({
      success: true,
      message: "TC deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const downloadTCFile = async (req, res, next) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const tc = await TransferCertificate.findOne({
      _id: req.params.id,
      schoolId,
    }).lean();

    if (!tc) {
      return res.status(404).json({ success: false, message: "TC record not found" });
    }

    if (tc.mode !== "UPLOAD" || !tc.file?.path) {
      return res.status(400).json({
        success: false,
        message: "Download is available only for uploaded TC files",
      });
    }

    if (/^https?:\/\//i.test(tc.file.path)) {
      return res.redirect(tc.file.path);
    }

    const fullPath = path.join(process.cwd(), tc.file.path.replace(/^\//, ""));
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: "File not found on server" });
    }
    return res.download(fullPath, tc.file.originalName || path.basename(fullPath));
  } catch (error) {
    next(error);
  }
};
