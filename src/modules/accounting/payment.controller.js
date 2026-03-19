import Payment from "./payment.model.js";
import FeeInvoice from "./feeInvoice.model.js";

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

/** Record a payment against an invoice */
export const recordPayment = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const {
      invoiceId,
      amount,
      method,
      receiptNumber,
      chequeNumber,
      bankRef,
      paymentDate,
      remarks,
    } = req.body || {};
    if (!invoiceId || amount == null || !method) {
      return res.status(400).json({
        success: false,
        message: "invoiceId, amount and method are required",
      });
    }
    const validMethods = ["Cash", "Cheque", "Bank Transfer", "UPI"];
    if (!validMethods.includes(method)) {
      return res.status(400).json({
        success: false,
        message: "method must be one of: " + validMethods.join(", "),
      });
    }
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }
    const invoice = await FeeInvoice.findOne({
      _id: invoiceId,
      schoolId: req.schoolId,
    });
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    if (invoice.status === "Paid") {
      return res.status(400).json({
        success: false,
        message: "Invoice is already fully paid",
      });
    }
    if (invoice.status === "Cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cannot record payment on cancelled invoice",
      });
    }
    const balance = invoice.amount - invoice.paid;
    if (amount > balance) {
      return res.status(400).json({
        success: false,
        message: `Amount exceeds balance of ₹${balance}`,
      });
    }
    const date = paymentDate ? new Date(paymentDate) : new Date();
    const payment = await Payment.create({
      schoolId: req.schoolId,
      invoiceId,
      studentId: invoice.studentId,
      amount: Number(amount),
      method,
      receiptNumber: receiptNumber ? String(receiptNumber).trim() : "",
      chequeNumber: chequeNumber ? String(chequeNumber).trim() : "",
      bankRef: bankRef ? String(bankRef).trim() : "",
      paymentDate: date,
      receivedBy: req.user._id,
      remarks: remarks ? String(remarks).trim() : "",
    });
    invoice.paid += Number(amount);
    if (invoice.paid >= invoice.amount) {
      invoice.status = "Paid";
      invoice.paidDate = new Date();
    } else {
      invoice.status = "Partial";
    }
    await invoice.save();
    const invPopulated = await FeeInvoice.findById(invoice._id)
      .populate("studentId", "name className section rollNumber")
      .populate("feeTypeId", "name code");
    res.status(201).json({
      success: true,
      data: {
        payment: await Payment.findById(payment._id).populate("receivedBy", "name"),
        invoice: invPopulated,
      },
    });
  } catch (error) {
    next(error);
  }
};

/** List payments with optional filters */
export const getPayments = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const { invoiceId, studentId, method, fromDate, toDate, page = 1, limit = 20 } =
      req.query;
    const filter = { schoolId: req.schoolId };
    if (invoiceId) filter.invoiceId = invoiceId;
    if (studentId) filter.studentId = studentId;
    if (method) filter.method = method;
    if (fromDate || toDate) {
      filter.paymentDate = {};
      if (fromDate) filter.paymentDate.$gte = new Date(fromDate);
      if (toDate) filter.paymentDate.$lte = new Date(toDate);
    }
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
    const total = await Payment.countDocuments(filter);
    const payments = await Payment.find(filter)
      .populate("invoiceId", "invoiceNumber amount paid status")
      .populate("studentId", "name className section rollNumber")
      .populate("receivedBy", "name")
      .sort({ paymentDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(Math.min(100, Math.max(1, parseInt(limit, 10))))
      .lean();
    res.json({
      success: true,
      data: {
        payments,
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

/** Get all payments for an invoice */
export const getPaymentsByInvoiceId = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const invoice = await FeeInvoice.findOne({
      _id: req.params.invoiceId,
      schoolId: req.schoolId,
    });
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    const payments = await Payment.find({
      invoiceId: req.params.invoiceId,
      schoolId: req.schoolId,
    })
      .populate("receivedBy", "name")
      .sort({ paymentDate: 1, createdAt: 1 })
      .lean();
    res.json({ success: true, data: payments });
  } catch (error) {
    next(error);
  }
};
