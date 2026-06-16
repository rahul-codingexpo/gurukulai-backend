import FeeInvoice from "./feeInvoice.model.js";
import FeeType from "./feeType.model.js";
import Payment from "./payment.model.js";
import Student from "../student/student.model.js";
import { notifyFeeInvoiceWhatsApp } from "../../services/whatsapp/index.js";
import { writeFeeAudit, diffTrackedFields } from "./feeAudit/feeAudit.service.js";

const TRACKED_INVOICE_FIELDS = [
  "amount",
  "baseAmount",
  "discountPercent",
  "discountAmount",
  "paid",
  "status",
  "dueDate",
  "paidDate",
  "period",
  "remarks",
];

const populateInvoice = (q) =>
  q
    .populate("studentId", "name admissionNumber className section rollNumber phone parents")
    .populate("feeTypeId", "name code amount period");

/** Money rounding (2 decimals) */
export const roundMoney = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Request body `amount` is the base (pre-discount) amount.
 * Returns final payable in `amount`, plus discount breakdown.
 */
export const computeInvoiceAmounts = (baseAmount, discountPercent = 0) => {
  const base = roundMoney(baseAmount);
  const pct = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const discountAmount = roundMoney(base * (pct / 100));
  const finalAmount = roundMoney(base - discountAmount);
  return {
    baseAmount: base,
    discountPercent: pct,
    discountAmount,
    amount: finalAmount,
  };
};

const requireSchool = (req, res) => {
  if (!req.schoolId) {
    res.status(400).json({
      success: false,
      message:
        req.user?.roleId?.name === "SuperAdmin"
          ? "schoolId is required (query or body)"
          : "School context missing",
    });
    return false;
  }
  return true;
};

/** Generate next invoice number: INV-{YEAR}-{SEQ} */
async function getNextInvoiceNumber(schoolId) {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const last = await FeeInvoice.findOne({
    schoolId,
    invoiceNumber: new RegExp(`^${prefix}`),
  })
    .sort({ createdAt: -1 })
    .select("invoiceNumber")
    .lean();
  let seq = 1;
  if (last && last.invoiceNumber) {
    const m = last.invoiceNumber.match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

/** Mark overdue invoices (status Pending, dueDate < today) */
async function markOverdue(schoolId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await FeeInvoice.updateMany(
    {
      schoolId,
      status: "Pending",
      dueDate: { $lt: today },
    },
    { $set: { status: "Overdue" } }
  );
}

/** Create single invoice */
export const createInvoice = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const {
      studentId,
      feeTypeId,
      amount,
      dueDate,
      period,
      remarks,
      discountPercent = 0,
      status: requestedStatus,
    } = req.body || {};
    if (!studentId || !feeTypeId || amount == null || !dueDate) {
      return res.status(400).json({
        success: false,
        message: "studentId, feeTypeId, amount (base before discount) and dueDate are required",
      });
    }
    const pct = Number(discountPercent);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({
        success: false,
        message: "discountPercent must be between 0 and 100",
      });
    }
    if (Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "amount (base before discount) must be greater than 0",
      });
    }
    const computed = computeInvoiceAmounts(amount, pct);
    if (computed.amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Final payable after discount must be greater than 0",
      });
    }
    const periodStr = period ? String(period).trim() : "";
    const existing = await FeeInvoice.findOne({
      schoolId: req.schoolId,
      studentId,
      feeTypeId,
      period: periodStr,
      status: { $ne: "Cancelled" },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Invoice already exists for this student, fee type and period",
      });
    }
    const allowedStatuses = ["Paid", "Pending", "Overdue", "Partial"];
    const initialStatus = allowedStatuses.includes(requestedStatus)
      ? requestedStatus
      : "Pending";

    let paid = 0;
    let paidDate = null;
    if (initialStatus === "Paid") {
      paid = computed.amount;
      paidDate = new Date();
    }

    const invoiceNumber = await getNextInvoiceNumber(req.schoolId);
    const invoice = await FeeInvoice.create({
      schoolId: req.schoolId,
      invoiceNumber,
      studentId,
      feeTypeId,
      baseAmount: computed.baseAmount,
      discountPercent: computed.discountPercent,
      discountAmount: computed.discountAmount,
      amount: computed.amount,
      paid,
      status: initialStatus,
      paidDate,
      dueDate: new Date(dueDate),
      period: periodStr,
      remarks: remarks ? String(remarks).trim() : "",
    });
    const populated = await populateInvoice(FeeInvoice.findById(invoice._id));
    await writeFeeAudit({
      schoolId: req.schoolId,
      sourceType: "FeeInvoice",
      sourceId: invoice._id,
      action: "created",
      after: populated,
      user: req.user,
    });
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

/** Create bulk invoices for a class/section */
export const createBulkInvoices = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const {
      className,
      section,
      feeTypeId,
      amount,
      dueDate,
      period,
      remarks,
      discountPercent = 0,
    } = req.body || {};
    if (!className || section == null || !feeTypeId || amount == null || !dueDate) {
      return res.status(400).json({
        success: false,
        message: "className, section, feeTypeId, amount (base before discount) and dueDate are required",
      });
    }
    const pct = Number(discountPercent);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({
        success: false,
        message: "discountPercent must be between 0 and 100",
      });
    }
    if (Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "amount (base before discount) must be greater than 0",
      });
    }
    const computed = computeInvoiceAmounts(amount, pct);
    if (computed.amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Final payable after discount must be greater than 0",
      });
    }
    const students = await Student.find({
      schoolId: req.schoolId,
      className: String(className).trim(),
      section: String(section).trim(),
      status: "ACTIVE",
    }).select("_id");
    const periodStr = period ? String(period).trim() : "";
    let created = 0;
    let skipped = 0;
    const invoices = [];
    for (const s of students) {
      const exists = await FeeInvoice.findOne({
        schoolId: req.schoolId,
        studentId: s._id,
        feeTypeId,
        period: periodStr,
        status: { $ne: "Cancelled" },
      });
      if (exists) {
        skipped++;
        continue;
      }
      const invoiceNumber = await getNextInvoiceNumber(req.schoolId);
      const inv = await FeeInvoice.create({
        schoolId: req.schoolId,
        invoiceNumber,
        studentId: s._id,
        feeTypeId,
        baseAmount: computed.baseAmount,
        discountPercent: computed.discountPercent,
        discountAmount: computed.discountAmount,
        amount: computed.amount,
        paid: 0,
        status: "Pending",
        dueDate: new Date(dueDate),
        period: periodStr,
        remarks: remarks ? String(remarks).trim() : "",
      });
      created++;
      invoices.push(inv);
      const populatedInv = await populateInvoice(FeeInvoice.findById(inv._id)).lean();
      await writeFeeAudit({
        schoolId: req.schoolId,
        sourceType: "FeeInvoice",
        sourceId: inv._id,
        action: "created",
        after: populatedInv,
        user: req.user,
      });
    }
    res.status(201).json({
      success: true,
      data: {
        created,
        skipped,
        skippedReason:
          skipped > 0 ? "Already have invoice for this fee type and period" : undefined,
        invoices,
      },
    });
  } catch (error) {
    next(error);
  }
};

/** List invoices with filters and pagination; mark overdue before return */
export const getInvoices = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    await markOverdue(req.schoolId);
    const includeDeleted = String(req.query.includeDeleted || "").toLowerCase() === "true";
    const {
      status,
      studentId,
      feeTypeId,
      fromDate,
      toDate,
      search,
      page = 1,
      limit = 20,
    } = req.query;
    const filter = { schoolId: req.schoolId };
    if (!includeDeleted) filter.isDeleted = { $ne: true };
    if (status) filter.status = status;
    if (studentId) filter.studentId = studentId;
    if (feeTypeId) filter.feeTypeId = feeTypeId;
    if (fromDate || toDate) {
      filter.dueDate = {};
      if (fromDate) filter.dueDate.$gte = new Date(fromDate);
      if (toDate) filter.dueDate.$lte = new Date(toDate);
    }
    if (search && String(search).trim()) {
      const s = String(search).trim();
      const matchingStudents = await Student.find({
        schoolId: req.schoolId,
        name: new RegExp(s, "i"),
      })
        .select("_id")
        .lean();
      const ids = matchingStudents.map((x) => x._id);
      filter.$or = [
        { invoiceNumber: new RegExp(s, "i") },
        { studentId: { $in: ids } },
      ];
    }
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
    const total = await FeeInvoice.countDocuments(filter);
    const invoices = await FeeInvoice.find(filter)
      .populate("studentId", "name className section rollNumber phone")
      .populate("feeTypeId", "name code amount period")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.min(100, Math.max(1, parseInt(limit, 10))))
      .lean();
    res.json({
      success: true,
      data: {
        invoices,
        pagination: {
          total,
          page: Math.max(1, parseInt(page, 10)),
          limit: Math.max(1, parseInt(limit, 10)),
          totalPages: Math.ceil(total / Math.max(1, parseInt(limit, 10))),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/** Send fee invoice WhatsApp for one or more invoices (manual — not on create). */
export const sendInvoicesWhatsApp = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const { invoiceIds } = req.body || {};
    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "invoiceIds array is required",
      });
    }

    const uniqueIds = [...new Set(invoiceIds.map((id) => String(id)))];
    const invoices = await FeeInvoice.find({
      _id: { $in: uniqueIds },
      schoolId: req.schoolId,
      isDeleted: { $ne: true },
      status: { $ne: "Cancelled" },
    })
      .select("_id")
      .lean();

    if (invoices.length !== uniqueIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more invoices were not found or cannot be sent",
      });
    }

    const results = [];
    for (const inv of invoices) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await notifyFeeInvoiceWhatsApp(inv._id));
    }

    const sent = results.filter((r) => r && !r.skipped).length;
    const skipped = results.filter((r) => r?.skipped).length;

    res.json({
      success: true,
      data: { results, sent, skipped },
      message:
        sent > 0
          ? `WhatsApp sent for ${sent} invoice(s)${skipped ? `, ${skipped} skipped` : ""}`
          : "No WhatsApp messages were sent",
    });
  } catch (error) {
    next(error);
  }
};

/** Get single invoice with payment history */
export const getInvoiceById = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const invoice = await FeeInvoice.findOne({
      _id: req.params.id,
      schoolId: req.schoolId,
      isDeleted: { $ne: true },
    })
      .populate("studentId", "name className section rollNumber phone")
      .populate("feeTypeId", "name code amount period")
      .lean();
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    const payments = await Payment.find({
      invoiceId: invoice._id,
      schoolId: req.schoolId,
    })
      .populate("receivedBy", "name")
      .sort({ paymentDate: 1 })
      .lean();
    res.json({
      success: true,
      data: { invoice, payments },
    });
  } catch (error) {
    next(error);
  }
};

/** Update invoice (e.g. base amount, discount, dueDate); final amount must be >= paid */
export const updateInvoice = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const invoice = await FeeInvoice.findOne({
      _id: req.params.id,
      schoolId: req.schoolId,
      isDeleted: { $ne: true },
    });
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    const beforeSnap = await populateInvoice(
      FeeInvoice.findById(invoice._id),
    ).lean();
    const { amount, baseAmount, dueDate, period, remarks, status, discountPercent } =
      req.body || {};

    const hasPricingUpdate =
      baseAmount !== undefined ||
      amount !== undefined ||
      discountPercent !== undefined;

    if (hasPricingUpdate) {
      const prevBase =
        invoice.baseAmount != null ? invoice.baseAmount : invoice.amount;
      let base = prevBase;
      if (baseAmount !== undefined) base = Number(baseAmount);
      else if (amount !== undefined) base = Number(amount);

      let pct = invoice.discountPercent ?? 0;
      if (discountPercent !== undefined) pct = Number(discountPercent);

      if (Number.isNaN(base) || base <= 0) {
        return res.status(400).json({
          success: false,
          message: "Base amount must be greater than 0",
        });
      }
      if (Number.isNaN(pct) || pct < 0 || pct > 100) {
        return res.status(400).json({
          success: false,
          message: "discountPercent must be between 0 and 100",
        });
      }

      const computed = computeInvoiceAmounts(base, pct);
      if (computed.amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Final payable after discount must be greater than 0",
        });
      }
      if (computed.amount < invoice.paid) {
        return res.status(400).json({
          success: false,
          message: `Final amount cannot be less than already paid (₹${invoice.paid})`,
        });
      }

      invoice.baseAmount = computed.baseAmount;
      invoice.discountPercent = computed.discountPercent;
      invoice.discountAmount = computed.discountAmount;
      invoice.amount = computed.amount;
    }
    if (dueDate !== undefined) invoice.dueDate = new Date(dueDate);
    if (period !== undefined) invoice.period = String(period).trim();
    if (remarks !== undefined) invoice.remarks = String(remarks).trim();
    if (status !== undefined && ["Pending", "Overdue", "Partial", "Paid", "Cancelled"].includes(status)) {
      invoice.status = status;
    }
    if (invoice.paid >= invoice.amount) {
      invoice.status = "Paid";
      if (!invoice.paidDate) invoice.paidDate = new Date();
    } else if (invoice.paid > 0) {
      invoice.status = "Partial";
    }
    await invoice.save();
    const populated = await populateInvoice(FeeInvoice.findById(invoice._id)).lean();
    const changes = diffTrackedFields(beforeSnap, populated, TRACKED_INVOICE_FIELDS);
    if (changes.length) {
      await writeFeeAudit({
        schoolId: req.schoolId,
        sourceType: "FeeInvoice",
        sourceId: invoice._id,
        action: "updated",
        before: beforeSnap,
        after: populated,
        changes,
        user: req.user,
      });
    }
    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

/** Soft delete invoice — Admin, Principal only. Record stays in Fee Data History. */
export const deleteInvoice = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const invoice = await FeeInvoice.findOne({
      _id: req.params.id,
      schoolId: req.schoolId,
      isDeleted: { $ne: true },
    });
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    const beforeSnap = await populateInvoice(FeeInvoice.findById(invoice._id)).lean();
    invoice.isDeleted = true;
    invoice.deletedAt = new Date();
    invoice.deletedBy = req.user?._id;
    await invoice.save();
    await writeFeeAudit({
      schoolId: req.schoolId,
      sourceType: "FeeInvoice",
      sourceId: invoice._id,
      action: "deleted",
      before: beforeSnap,
      after: beforeSnap,
      user: req.user,
    });
    res.json({ success: true, message: "Invoice deleted" });
  } catch (error) {
    next(error);
  }
};

/** Restore a soft-deleted invoice — Admin, Principal only. */
export const restoreInvoice = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const invoice = await FeeInvoice.findOne({
      _id: req.params.id,
      schoolId: req.schoolId,
      isDeleted: true,
    });
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Deleted invoice not found",
      });
    }
    invoice.isDeleted = false;
    invoice.deletedAt = null;
    invoice.deletedBy = null;
    await invoice.save();
    const populated = await populateInvoice(FeeInvoice.findById(invoice._id)).lean();
    await writeFeeAudit({
      schoolId: req.schoolId,
      sourceType: "FeeInvoice",
      sourceId: invoice._id,
      action: "restored",
      after: populated,
      user: req.user,
    });
    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};
