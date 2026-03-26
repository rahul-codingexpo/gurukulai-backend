import fs from "fs";
import path from "path";

import Wallet from "./wallet.model.js";
import WalletPayment from "./walletPayment.model.js";
import Student from "../student/student.model.js";
import School from "../school/school.model.js";
import FeeInvoice from "../accounting/feeInvoice.model.js";

const resolveSchoolId = (req) => {
  return req.schoolId ?? req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
};

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

    const school = await School.findById(schoolId).select("upiId qrCode");

    res.json({
      success: true,
      data: {
        schoolId,
        studentId: student._id,
        upiId: school?.upiId ?? "",
        qrCode: school?.qrCode ?? "",
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
 * - utrId (text) required
 * - amount (number) required
 * - paymentScreenshot (file) required
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

    const { utrId, amount } = req.body || {};
    const utr = String(utrId || "").trim();
    const amt = parseNumber(amount);

    if (!utr) {
      return res.status(400).json({ success: false, message: "utrId is required" });
    }
    if (!amt || amt <= 0) {
      return res.status(400).json({ success: false, message: "amount must be > 0" });
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
      qrCode: qrCodeSnapshot,
      paymentScreenshot: `/uploads/wallet/${req.file.filename}`,
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

