import FeeInvoice from "./feeInvoice.model.js";
import FeeType from "./feeType.model.js";
import Payment from "./payment.model.js";
import Student from "../student/student.model.js";

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
    const { studentId, feeTypeId, amount, dueDate, period, remarks } = req.body || {};
    if (!studentId || !feeTypeId || amount == null || !dueDate) {
      return res.status(400).json({
        success: false,
        message: "studentId, feeTypeId, amount and dueDate are required",
      });
    }
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "amount must be greater than 0",
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
    const invoiceNumber = await getNextInvoiceNumber(req.schoolId);
    const invoice = await FeeInvoice.create({
      schoolId: req.schoolId,
      invoiceNumber,
      studentId,
      feeTypeId,
      amount: Number(amount),
      paid: 0,
      status: "Pending",
      dueDate: new Date(dueDate),
      period: periodStr,
      remarks: remarks ? String(remarks).trim() : "",
    });
    const populated = await FeeInvoice.findById(invoice._id)
      .populate("studentId", "name className section rollNumber phone")
      .populate("feeTypeId", "name code amount period");
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

/** Create bulk invoices for a class/section */
export const createBulkInvoices = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const { className, section, feeTypeId, amount, dueDate, period, remarks } =
      req.body || {};
    if (!className || section == null || !feeTypeId || amount == null || !dueDate) {
      return res.status(400).json({
        success: false,
        message: "className, section, feeTypeId, amount and dueDate are required",
      });
    }
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "amount must be greater than 0",
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
        amount: Number(amount),
        paid: 0,
        status: "Pending",
        dueDate: new Date(dueDate),
        period: periodStr,
        remarks: remarks ? String(remarks).trim() : "",
      });
      created++;
      invoices.push(inv);
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

/** Get single invoice with payment history */
export const getInvoiceById = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const invoice = await FeeInvoice.findOne({
      _id: req.params.id,
      schoolId: req.schoolId,
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

/** Update invoice (e.g. amount, dueDate); new amount must be >= paid */
export const updateInvoice = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const invoice = await FeeInvoice.findOne({
      _id: req.params.id,
      schoolId: req.schoolId,
    });
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    const { amount, dueDate, period, remarks, status } = req.body || {};
    if (amount !== undefined) {
      const num = Number(amount);
      if (num < invoice.paid) {
        return res.status(400).json({
          success: false,
          message: `Amount cannot be less than already paid (₹${invoice.paid})`,
        });
      }
      invoice.amount = num;
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
    const populated = await FeeInvoice.findById(invoice._id)
      .populate("studentId", "name className section rollNumber phone")
      .populate("feeTypeId", "name code amount period");
    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

/** Delete invoice — Admin, Principal only. Block if has payments. */
export const deleteInvoice = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const count = await Payment.countDocuments({
      invoiceId: req.params.id,
      schoolId: req.schoolId,
    });
    if (count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: invoice has ${count} payment record(s). Set status to Cancelled instead.`,
      });
    }
    const deleted = await FeeInvoice.findOneAndDelete({
      _id: req.params.id,
      schoolId: req.schoolId,
    });
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    res.json({ success: true, message: "Invoice deleted" });
  } catch (error) {
    next(error);
  }
};
