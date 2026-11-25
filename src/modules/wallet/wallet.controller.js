import Wallet from "./wallet.model.js";
import WalletPayment from "./walletPayment.model.js";
import Student from "../student/student.model.js";
import School from "../school/school.model.js";
import FeeInvoice from "../accounting/feeInvoice.model.js";
import { uploadedFileUrl } from "../../utils/uploadFile.util.js";
import { isSchoolInScope } from "../../utils/branchScope.util.js";
import {
  getStudentAdvance,
  addStudentAdvance,
  useStudentAdvance,
} from "./walletAdvance.util.js";

const resolveStudentForSelf = async (req) => {
  const roleName = req.user?.roleId?.name;

  if (roleName === "Student") {
    const student = await Student.findOne({
      "studentLogin.userId": req.user._id,
    }).select("_id schoolId");
    return student;
  }

  if (roleName === "Parent") {
    const student = await Student.findOne({
      "parentLogin.userId": req.user._id,
    }).select("_id schoolId");
    return student;
  }

  return null;
};

const parseNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Resolve UPI + QR for a student school.
 * If the campus school has no QR, fall back to another school in the same
 * branch (admin often saves payment setup on one campus only).
 */
const resolveSchoolPaymentSetup = async (primarySchoolId, userSchoolId) => {
  const ids = [];
  const pushId = (id) => {
    const s = id?._id ?? id;
    if (!s) return;
    const key = String(s);
    if (!ids.some((x) => String(x) === key)) ids.push(s);
  };
  pushId(primarySchoolId);
  pushId(userSchoolId);

  let upiId = "";
  let qrCode = "";
  let branchId = null;

  for (const id of ids) {
    const school = await School.findById(id).select("upiId qrCode branchId").lean();
    if (!school) continue;
    if (!branchId && school.branchId) branchId = school.branchId;
    if (!upiId && school.upiId) upiId = String(school.upiId).trim();
    if (!qrCode && school.qrCode) qrCode = String(school.qrCode).trim();
    if (upiId && qrCode) {
      return { upiId, qrCode };
    }
  }

  if (branchId && (!upiId || !qrCode)) {
    const siblings = await School.find({
      branchId,
      $or: [
        { qrCode: { $exists: true, $nin: [null, ""] } },
        { upiId: { $exists: true, $nin: [null, ""] } },
      ],
    })
      .select("upiId qrCode")
      .lean();

    for (const school of siblings) {
      if (!upiId && school.upiId) upiId = String(school.upiId).trim();
      if (!qrCode && school.qrCode) qrCode = String(school.qrCode).trim();
      if (upiId && qrCode) break;
    }
  }

  return { upiId, qrCode };
};

/** GET /api/wallet/me */
export const getMyWallet = async (req, res, next) => {
  try {
    const student = await resolveStudentForSelf(req);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found for this user",
      });
    }

    const schoolId = student.schoolId;
    const wallet = await Wallet.findOne({ schoolId, studentId: student._id });
    const credit = wallet?.credit ?? 0;

    const now = new Date();
    // Due remaining for invoices that are already due.
    const dueInvoices = await FeeInvoice.find(
      {
        schoolId,
        studentId: student._id,
        status: { $in: ["Pending", "Partial", "Overdue"] },
        dueDate: { $lte: now },
      },
      { amount: 1, paid: 1 }
    ).lean();

    const dueRemaining = dueInvoices.reduce(
      (sum, inv) => sum + (Number(inv.amount) - Number(inv.paid)),
      0
    );

    const walletBalance = credit - dueRemaining; // positive = credit, negative = owing

    const userSchoolId = req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
    const { upiId, qrCode } = await resolveSchoolPaymentSetup(
      schoolId,
      userSchoolId
    );

    res.json({
      success: true,
      data: {
        schoolId,
        studentId: student._id,
        upiId,
        qrCode,
        // Aliases used by admin "School Payment Setup" / older clients
        paymentUpiId: upiId,
        paymentQr: qrCode,
        credit,
        dueRemaining,
        walletBalance,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/wallet/payments/upload
 * multipart/form-data:
 * - amount (number) required
 * - paymentScreenshot (file) required
 * - reason (text) optional — why payment was made (mobile)
 * - utrId (text) optional — auto-generated if omitted when reason is present
 */
export const uploadWalletPayment = async (req, res, next) => {
  try {
    const student = await resolveStudentForSelf(req);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found for this user",
      });
    }

    const schoolId = student.schoolId;

    const { utrId, amount, reason } = req.body || {};
    const why = String(reason || "").trim();
    let utr = String(utrId || "").trim();
    const amt = parseNumber(amount);

    if (!utr) {
      // Mobile proof flow sends reason without bank UTR; keep uniqueness for schema.
      utr = `APP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!amt || amt <= 0) {
      return res.status(400).json({ success: false, message: "amount must be > 0" });
    }
    if (!why && !String(utrId || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "reason or utrId is required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "paymentScreenshot file is required",
      });
    }

    // Get current QR snapshot (so UI can show what was used).
    const school = await School.findById(schoolId).select("upiId qrCode");
    const qrCodeSnapshot = school?.qrCode ?? "";

    const payment = await WalletPayment.create({
      schoolId,
      studentId: student._id,
      utrId: utr,
      amount: amt,
      reason: why,
      qrCode: qrCodeSnapshot,
      paymentScreenshot: uploadedFileUrl(req.file),
      status: "PENDING",
      appliedToInvoices: 0,
      leftoverCreditAfter: 0,
      createdBy: req.user?._id ?? null,
    });

    res.status(201).json({
      success: true,
      data: {
        status: "PENDING",
        payment,
      },
    });
  } catch (error) {
    // If we created inv.save() updates already, just return error.
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "UTR already uploaded for this school",
      });
    }
    next(error);
  }
};

/** GET /api/wallet/payments */
export const getMyWalletPayments = async (req, res, next) => {
  try {
    const student = await resolveStudentForSelf(req);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found for this user",
      });
    }

    const schoolId = student.schoolId;
    const { page = 1, limit = 20 } = req.query || {};

    const pageNo = Math.max(1, parseInt(page, 10) || 1);
    const limitNo = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNo - 1) * limitNo;

    const total = await WalletPayment.countDocuments({ schoolId, studentId: student._id });

    const payments = await WalletPayment.find({ schoolId, studentId: student._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNo)
      .lean();

    res.json({
      success: true,
      data: {
        items: payments,
        pagination: {
          page: pageNo,
          limit: limitNo,
          total,
          totalPages: Math.ceil(total / limitNo),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const resolveStudentForStaff = async (req, studentId) => {
  if (!studentId) return null;
  const student = await Student.findById(studentId).select("_id schoolId name");
  if (!student) return null;
  if (req.schoolId && !isSchoolInScope(req, student.schoolId)) {
    return null;
  }
  return student;
};

/** GET /api/wallet/students/:studentId/advance */
export const getStudentAdvanceBalance = async (req, res, next) => {
  try {
    const student = await resolveStudentForStaff(req, req.params.studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    const advanceBalance = await getStudentAdvance(student.schoolId, student._id);
    res.json({
      success: true,
      data: {
        studentId: student._id,
        schoolId: student.schoolId,
        advanceBalance,
        credit: advanceBalance,
      },
    });
  } catch (error) {
    next(error);
  }
};

/** POST /api/wallet/students/:studentId/advance  body: { amount } */
export const creditStudentAdvance = async (req, res, next) => {
  try {
    const student = await resolveStudentForStaff(req, req.params.studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    const amount = parseNumber(req.body?.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "amount must be greater than 0",
      });
    }
    const advanceBalance = await addStudentAdvance(
      student.schoolId,
      student._id,
      amount,
    );
    res.json({
      success: true,
      data: {
        studentId: student._id,
        schoolId: student.schoolId,
        added: Math.round(amount * 100) / 100,
        advanceBalance,
      },
    });
  } catch (error) {
    next(error);
  }
};

/** POST /api/wallet/students/:studentId/advance/use  body: { amount } */
export const applyStudentAdvance = async (req, res, next) => {
  try {
    const student = await resolveStudentForStaff(req, req.params.studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    const amount = parseNumber(req.body?.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "amount must be greater than 0",
      });
    }
    const { used, remaining } = await useStudentAdvance(
      student.schoolId,
      student._id,
      amount,
    );
    res.json({
      success: true,
      data: {
        studentId: student._id,
        schoolId: student.schoolId,
        used,
        advanceBalance: remaining,
      },
    });
  } catch (error) {
    next(error);
  }
};

