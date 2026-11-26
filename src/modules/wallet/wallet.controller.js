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
import { resolveBranchSchoolIds } from "../../utils/branchScope.util.js";

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
 * Falls back across branch campuses and same-name schools (admin often
 * saves QR on a different campus document than the student's schoolId).
 * Returns paymentSchoolId = school that owns the QR/UPI (for proof uploads).
 */
const resolveSchoolPaymentSetup = async (primarySchoolId, userSchoolId) => {
  const seedIds = [];
  const pushSeed = (id) => {
    const s = id?._id ?? id;
    if (!s) return;
    if (!seedIds.some((x) => String(x) === String(s))) seedIds.push(s);
  };
  pushSeed(primarySchoolId);
  pushSeed(userSchoolId);

  const related = [];
  for (const seed of seedIds) {
    const ids = await resolveBranchSchoolIds(seed);
    ids.forEach((id) => {
      if (!related.some((x) => String(x) === String(id))) related.push(id);
    });
  }
  if (!related.length) related.push(...seedIds);

  let upiId = "";
  let qrCode = "";
  let paymentSchoolId = primarySchoolId?._id ?? primarySchoolId ?? null;
  let schools = await School.find({ _id: { $in: related } })
    .select("upiId qrCode name")
    .lean();

  // Prefer the campus that actually has the standee/QR image saved.
  let withQr = schools.find((s) => String(s.qrCode || "").trim());
  let withUpi = schools.find((s) => String(s.upiId || "").trim());

  // Last resort: any school whose name starts with the same 2 words and has a QR.
  // Covers typos ("Schooh") / truncated campus names that miss exact branch links.
  if (!withQr) {
    const seedSchool = await School.findById(
      primarySchoolId?._id ?? primarySchoolId ?? userSchoolId?._id ?? userSchoolId,
    )
      .select("name")
      .lean();
    const tokens = String(seedSchool?.name || "")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 1);
    const shortPrefix = tokens.slice(0, Math.min(2, tokens.length)).join(" ");
    if (shortPrefix) {
      const escaped = shortPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const fuzzy = await School.find({
        name: new RegExp(`^${escaped}`, "i"),
        qrCode: { $exists: true, $nin: [null, ""] },
      })
        .select("upiId qrCode name")
        .lean();
      if (fuzzy.length) {
        withQr = fuzzy[0];
        schools = [...schools, ...fuzzy];
      }
    }
  }

  if (withQr) {
    paymentSchoolId = withQr._id;
    qrCode = String(withQr.qrCode).trim();
    if (withQr.upiId) upiId = String(withQr.upiId).trim();
  }
  if (!upiId && withUpi) {
    if (!paymentSchoolId) paymentSchoolId = withUpi._id;
    upiId = String(withUpi.upiId).trim();
  }

  // Self-heal: copy standee onto the student/user school so /schools + next reads work.
  if (qrCode) {
    const targets = [];
    const pushTarget = (id) => {
      const raw = id?._id ?? id;
      if (!raw) return;
      if (String(raw) === String(paymentSchoolId)) return;
      if (!targets.some((x) => String(x) === String(raw))) targets.push(raw);
    };
    pushTarget(primarySchoolId);
    pushTarget(userSchoolId);
    if (targets.length) {
      await School.updateMany(
        {
          _id: { $in: targets },
          $or: [
            { qrCode: { $exists: false } },
            { qrCode: null },
            { qrCode: "" },
          ],
        },
        {
          $set: {
            qrCode,
            ...(upiId ? { upiId } : {}),
          },
        },
      );
    }
  }

  return { upiId, qrCode, paymentSchoolId };
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
    const { upiId, qrCode, paymentSchoolId } = await resolveSchoolPaymentSetup(
      schoolId,
      userSchoolId
    );

    res.json({
      success: true,
      data: {
        schoolId,
        paymentSchoolId: paymentSchoolId || schoolId,
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

    const studentSchoolId = student.schoolId;
    const userSchoolId = req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
    const setup = await resolveSchoolPaymentSetup(
      studentSchoolId,
      userSchoolId
    );
    // Store under the campus that owns School Payment Setup so Fee Invoices
    // admin list (scoped to that school) sees the proof immediately.
    const schoolId = setup.paymentSchoolId || studentSchoolId;
    const qrCode = setup.qrCode || "";

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

    const payment = await WalletPayment.create({
      schoolId,
      studentId: student._id,
      utrId: utr,
      amount: amt,
      reason: why,
      qrCode,
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

    // Proofs may be stored on the payment-setup campus (not student.schoolId).
    const filter = { studentId: student._id };
    const { page = 1, limit = 20 } = req.query || {};

    const pageNo = Math.max(1, parseInt(page, 10) || 1);
    const limitNo = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNo - 1) * limitNo;

    const total = await WalletPayment.countDocuments(filter);

    const payments = await WalletPayment.find(filter)
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

