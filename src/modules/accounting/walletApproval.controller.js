import WalletPayment from "../wallet/walletPayment.model.js";
import Wallet from "../wallet/wallet.model.js";
import FeeInvoice from "./feeInvoice.model.js";

const ensureSchoolId = (req, res) => {
  if (!req.schoolId) {
    res.status(400).json({
      success: false,
      message:
        req.user?.roleId?.name === "SuperAdmin"
          ? "schoolId is required (query)"
          : "School context missing",
    });
    return null;
  }
  return req.schoolId;
};

/** GET /api/wallet-payments (Admin/Principal/Accountant) */
export const listWalletPayments = async (req, res, next) => {
  try {
    const schoolId = ensureSchoolId(req, res);
    if (!schoolId) return;

    const { status = "PENDING", studentId, page = 1, limit = 20 } = req.query;
    const filter = { schoolId };
    if (status) filter.status = status;
    if (studentId) filter.studentId = studentId;

    const pageNo = Math.max(1, parseInt(page, 10) || 1);
    const limitNo = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNo - 1) * limitNo;

    const total = await WalletPayment.countDocuments(filter);
    const items = await WalletPayment.find(filter)
      .populate("studentId", "name admissionNumber className section rollNumber")
      .populate("approvedBy", "name")
      .populate("rejectedBy", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNo)
      .lean();

    res.json({
      success: true,
      data: {
        items,
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

/**
 * PUT /api/wallet-payments/:id/approve
 * Applies payment amount + existing wallet credit to dues and marks APPROVED.
 */
export const approveWalletPayment = async (req, res, next) => {
  try {
    const schoolId = ensureSchoolId(req, res);
    if (!schoolId) return;

    const payment = await WalletPayment.findOne({
      _id: req.params.id,
      schoolId,
    });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }
    if (payment.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: `Only PENDING payments can be approved (current: ${payment.status})`,
      });
    }

    const wallet = await Wallet.findOneAndUpdate(
      { schoolId, studentId: payment.studentId },
      { $setOnInsert: { credit: 0 } },
      { upsert: true, new: true }
    );

    // Apply to invoices due till now
    const now = new Date();
    const invoices = await FeeInvoice.find({
      schoolId,
      studentId: payment.studentId,
      status: { $in: ["Pending", "Partial", "Overdue"] },
      dueDate: { $lte: now },
    }).sort({ dueDate: 1, createdAt: 1 });

    let creditAvailable = Number(wallet.credit) + Number(payment.amount);
    let totalApplied = 0;

    for (const inv of invoices) {
      const remaining = Number(inv.amount) - Number(inv.paid);
      if (remaining <= 0) continue;
      if (creditAvailable <= 0) break;

      const applied = Math.min(remaining, creditAvailable);
      inv.paid = Number(inv.paid) + applied;
      totalApplied += applied;
      creditAvailable -= applied;

      // eslint-disable-next-line no-await-in-loop
      await inv.save();
    }

    const leftoverCreditAfter = Math.max(0, creditAvailable);
    wallet.credit = leftoverCreditAfter;
    await wallet.save();

    payment.status = "APPROVED";
    payment.approvedBy = req.user?._id ?? null;
    payment.approvedAt = new Date();
    payment.appliedToInvoices = totalApplied;
    payment.leftoverCreditAfter = leftoverCreditAfter;
    await payment.save();

    return res.json({
      success: true,
      message: "Payment approved",
      data: payment,
    });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/wallet-payments/:id/reject */
export const rejectWalletPayment = async (req, res, next) => {
  try {
    const schoolId = ensureSchoolId(req, res);
    if (!schoolId) return;

    const { reason = "" } = req.body || {};

    const payment = await WalletPayment.findOne({
      _id: req.params.id,
      schoolId,
    });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }
    if (payment.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: `Only PENDING payments can be rejected (current: ${payment.status})`,
      });
    }

    payment.status = "REJECTED";
    payment.rejectedBy = req.user?._id ?? null;
    payment.rejectedAt = new Date();
    payment.rejectionReason = String(reason).trim();
    await payment.save();

    return res.json({
      success: true,
      message: "Payment rejected",
      data: payment,
    });
  } catch (error) {
    next(error);
  }
};

