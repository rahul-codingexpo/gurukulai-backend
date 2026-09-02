import FeeInvoice from "./feeInvoice.model.js";
import FeeType from "./feeType.model.js";
import Payment from "./payment.model.js";
import Student from "../student/student.model.js";
import School from "../school/school.model.js";
import { notifyFeeInvoiceWhatsApp } from "../../services/whatsapp/index.js";
import { generateAndUploadInvoicePdf, buildInvoicePdfBuffer } from "../../services/invoicePdf.service.js";
import { normalizeWhatsAppPhone } from "../../utils/phone.util.js";
import { writeFeeAudit, diffTrackedFields } from "./feeAudit/feeAudit.service.js";
import { schoolIdFilter } from "../../utils/branchScope.util.js";

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
 * When `options.discountAmount` is set, that fixed ₹ value is deducted from base
 * (avoids decimal drift from percent round-trip). Otherwise uses discountPercent.
 * Returns final payable in `amount`, plus discount breakdown.
 */
export const computeInvoiceAmounts = (baseAmount, discountPercent = 0, options = {}) => {
  const base = roundMoney(baseAmount);

  if (options.discountAmount != null && options.discountAmount !== "") {
    const discountAmount = roundMoney(
      Math.min(base, Math.max(0, Number(options.discountAmount) || 0)),
    );
    const finalAmount = roundMoney(base - discountAmount);
    const pct = base > 0 ? roundMoney((discountAmount / base) * 100) : 0;
    return {
      baseAmount: base,
      discountPercent: pct,
      discountAmount,
      amount: finalAmount,
    };
  }

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

  // Repair inconsistent "Paid" from old pre-save (paid >= amount treated 0>=0 as Paid)
  await FeeInvoice.updateMany(
    {
      schoolId,
      status: "Paid",
      amount: { $lte: 0 },
      paid: { $lte: 0 },
    },
    { $set: { status: "Pending" }, $unset: { paidDate: "" } }
  );
  await FeeInvoice.updateMany(
    {
      schoolId,
      status: "Paid",
      $expr: {
        $and: [{ $gt: ["$amount", 0] }, { $lte: ["$paid", 0] }],
      },
    },
    { $set: { status: "Pending" }, $unset: { paidDate: "" } }
  );
  await FeeInvoice.updateMany(
    {
      schoolId,
      status: "Paid",
      $expr: {
        $and: [
          { $gt: ["$amount", 0] },
          { $gt: ["$paid", 0] },
          { $lt: ["$paid", "$amount"] },
        ],
      },
    },
    { $set: { status: "Partial" } }
  );

  await FeeInvoice.updateMany(
    {
      schoolId,
      status: "Pending",
      dueDate: { $lt: today },
    },
    { $set: { status: "Overdue" } }
  );
}

async function markOverdueForScope(req) {
  const ids =
    Array.isArray(req.schoolIds) && req.schoolIds.length
      ? req.schoolIds
      : req.schoolId
        ? [req.schoolId]
        : [];
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    await markOverdue(id);
  }
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
      discountAmount: discountAmountBody,
      status: requestedStatus,
      paidAmount,
      paid: paidFromBody,
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
    if (discountAmountBody != null && discountAmountBody !== "") {
      const disc = Number(discountAmountBody);
      if (Number.isNaN(disc) || disc < 0) {
        return res.status(400).json({
          success: false,
          message: "discountAmount must be 0 or greater",
        });
      }
    }
    if (Number(amount) < 0) {
      return res.status(400).json({
        success: false,
        message: "amount (base before discount) must be 0 or greater",
      });
    }
    const computed =
      discountAmountBody != null && discountAmountBody !== ""
        ? computeInvoiceAmounts(amount, pct, { discountAmount: discountAmountBody })
        : computeInvoiceAmounts(amount, pct);
    if (computed.amount < 0) {
      return res.status(400).json({
        success: false,
        message: "Final payable after discount cannot be negative",
      });
    }
    const student = await Student.findOne({
      _id: studentId,
      ...schoolIdFilter(req),
    }).select("_id schoolId");
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    const campusSchoolId = student.schoolId;

    const feeType = await FeeType.findOne({
      _id: feeTypeId,
      schoolId: campusSchoolId,
    }).select("_id");
    if (!feeType) {
      return res.status(404).json({
        success: false,
        message: "Fee type not found for the student's campus",
      });
    }

    const periodStr = period ? String(period).trim() : "";
    const existing = await FeeInvoice.findOne({
      schoolId: campusSchoolId,
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
    let initialStatus = allowedStatuses.includes(requestedStatus)
      ? requestedStatus
      : "Pending";

    let paid = 0;
    let paidDate = null;
    const requestedPaidRaw = paidAmount != null ? paidAmount : paidFromBody;
    const requestedPaid =
      requestedPaidRaw != null && requestedPaidRaw !== ""
        ? Number(requestedPaidRaw)
        : null;

    if (initialStatus === "Paid") {
      if (computed.amount <= 0) {
        // No payable amount — keep as Due instead of fake Paid (0 >= 0)
        paid = 0;
        paidDate = null;
        initialStatus = "Pending";
      } else {
        paid = computed.amount;
        paidDate = new Date();
      }
    } else if (initialStatus === "Partial") {
      if (requestedPaid == null || Number.isNaN(requestedPaid) || requestedPaid <= 0) {
        return res.status(400).json({
          success: false,
          message: "paidAmount is required and must be greater than 0 for Partial status",
        });
      }
      if (requestedPaid >= computed.amount) {
        if (computed.amount <= 0) {
          return res.status(400).json({
            success: false,
            message: "Cannot mark Partial when payable amount is 0",
          });
        }
        paid = computed.amount;
        paidDate = new Date();
        initialStatus = "Paid";
      } else {
        paid = Math.round(requestedPaid * 100) / 100;
        paidDate = new Date();
        initialStatus = "Partial";
      }
    } else if (requestedPaid != null && !Number.isNaN(requestedPaid) && requestedPaid > 0) {
      // Allow optional paid amount even if status wasn't Partial
      if (computed.amount <= 0) {
        paid = 0;
        paidDate = null;
        // keep requested status (usually Pending)
      } else if (requestedPaid >= computed.amount) {
        paid = computed.amount;
        paidDate = new Date();
        initialStatus = "Paid";
      } else {
        paid = Math.round(requestedPaid * 100) / 100;
        paidDate = new Date();
        initialStatus = "Partial";
      }
    }

    const invoiceNumber = await getNextInvoiceNumber(campusSchoolId);
    const invoice = await FeeInvoice.create({
      schoolId: campusSchoolId,
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
      schoolId: campusSchoolId,
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
    await markOverdueForScope(req);
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
    const filter = { ...schoolIdFilter(req) };
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
        ...schoolIdFilter(req),
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
      .populate("studentId", "name admissionNumber className section rollNumber phone parents")
      .populate("feeTypeId", "name code amount period")
      .populate("schoolId", "name schoolCode address city state pincode")
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

/** Send fee invoice WhatsApp via WhySMS template API (automatic). */
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
      ...schoolIdFilter(req),
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

const formatInrPlain = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const formatDueDateLong = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const pickPhoneFromRaw = (raw) => normalizeWhatsAppPhone(raw);

/** Parents: father first, then mother. */
const pickParentPhone = (student) => {
  const father = pickPhoneFromRaw(student?.parents?.father?.phone);
  if (father) return { phone: father, used: "father" };
  const mother = pickPhoneFromRaw(student?.parents?.mother?.phone);
  if (mother) return { phone: mother, used: "mother" };
  return { phone: null, used: null };
};

/** recipient: "student" | "parents" */
const resolveWhatsAppRecipient = (student, recipient) => {
  const target = String(recipient || "").toLowerCase() === "student" ? "student" : "parents";
  if (target === "student") {
    const phone = pickPhoneFromRaw(student?.phone);
    return {
      recipient: "student",
      phone,
      used: phone ? "student" : null,
      error: phone ? null : "No valid WhatsApp phone on student",
    };
  }
  const parent = pickParentPhone(student);
  return {
    recipient: "parents",
    phone: parent.phone,
    used: parent.used,
    error: parent.phone
      ? null
      : "No valid WhatsApp phone on parents (father or mother)",
  };
};

const ensureInvoicePdf = async (invoice, student, feeType, school, invoices) => {
  const pdfUrl = await generateAndUploadInvoicePdf({
    invoice,
    invoices,
    student,
    feeType,
    school,
  });
  const ids = (Array.isArray(invoices) && invoices.length ? invoices : [invoice])
    .map((inv) => inv?._id)
    .filter(Boolean);
  if (ids.length) {
    await FeeInvoice.updateMany({ _id: { $in: ids } }, { $set: { pdfUrl } });
  }
  return pdfUrl;
};

const getPublicBaseUrl = (req) => {
  const fromEnv = String(process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const proto = String(req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim();
  const host = String(req.get("x-forwarded-host") || req.get("host") || "")
    .split(",")[0]
    .trim();
  if (!host) return "";
  return `${proto}://${host}`;
};

const toAbsolutePdfUrl = (req, pdfUrl) => {
  if (!pdfUrl) return "";
  const raw = String(pdfUrl).trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const pathPart = raw.startsWith("/") ? raw : `/${raw}`;
  const base = getPublicBaseUrl(req);
  return base ? `${base}${pathPart}` : pathPart;
};

/**
 * Prepare a manual WhatsApp share: pre-filled invoice text + PDF download ids.
 * Opens in WhatsApp app/web for the user to send.
 */
export const prepareManualWhatsApp = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const { invoiceIds, recipient } = req.body || {};
    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "invoiceIds array is required",
      });
    }

    const uniqueIds = [...new Set(invoiceIds.map((id) => String(id)))];
    const invoices = await FeeInvoice.find({
      _id: { $in: uniqueIds },
      ...schoolIdFilter(req),
      isDeleted: { $ne: true },
      status: { $ne: "Cancelled" },
    })
      .populate("studentId", "name admissionNumber className section rollNumber phone parents")
      .populate("feeTypeId", "name code")
      .lean();

    if (invoices.length !== uniqueIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more invoices were not found or cannot be shared",
      });
    }

    const student = invoices[0].studentId;
    if (!student) {
      return res.status(400).json({ success: false, message: "Student not found on invoice" });
    }

    const resolved = resolveWhatsAppRecipient(student, recipient);
    if (!resolved.phone) {
      return res.status(400).json({
        success: false,
        message: resolved.error || "No valid WhatsApp phone found",
      });
    }
    const phone = resolved.phone;

    const campusSchoolId = invoices[0].schoolId;
    const school = await School.findById(campusSchoolId)
      .select("name logo address city state pincode phone email affiliation schoolCode")
      .lean();
    const schoolName = school?.name || "School";

    const hasNormal = invoices.some((inv) => !inv.isLegacyDue);
    const pdfInvoices = hasNormal ? invoices.filter((inv) => !inv.isLegacyDue) : invoices;

    const pdfUrl = await ensureInvoicePdf(
      pdfInvoices[0],
      student,
      pdfInvoices[0].feeTypeId,
      school,
      pdfInvoices,
    );
    const pdfs = [
      {
        invoiceId: String(pdfInvoices[0]._id),
        invoiceNumber: pdfInvoices[0].invoiceNumber,
        pdfUrl,
        pdfAbsoluteUrl: toAbsolutePdfUrl(req, pdfUrl),
      },
    ];

    const totalBase = pdfInvoices.reduce(
      (s, inv) => s + Number(inv.baseAmount != null ? inv.baseAmount : inv.amount || 0),
      0,
    );
    const totalAmount = pdfInvoices.reduce((s, inv) => s + Number(inv.amount || 0), 0);
    const totalPaid = pdfInvoices.reduce((s, inv) => s + Number(inv.paid || 0), 0);
    const totalBalance = Math.round((totalAmount - totalPaid) * 100) / 100;
    const feeTypes = pdfInvoices
      .map((inv) => (typeof inv.feeTypeId === "object" ? inv.feeTypeId?.name : ""))
      .filter(Boolean)
      .join(", ");
    const invoiceNumbers = pdfInvoices.map((inv) => inv.invoiceNumber).join(", ");
    const period = String(pdfInvoices[0].period || "").trim() || "—";
    const classSection = [student.className, student.section].filter(Boolean).join(" - ") || "—";
    const discountLabels = [
      ...new Set(
        pdfInvoices
          .map((inv) => {
            const pct = Number(inv.discountPercent) || 0;
            return pct > 0 ? `${pct}%` : null;
          })
          .filter(Boolean),
      ),
    ];
    const status =
      pdfInvoices.every((i) => i.status === "Paid")
        ? "Paid"
        : pdfInvoices.some((i) => i.status === "Partial")
          ? "Partial"
          : pdfInvoices.some((i) => i.status === "Overdue")
            ? "Overdue"
            : pdfInvoices.some((i) => i.status === "Pending")
              ? "Due"
              : pdfInvoices[0].status || "Due";

    const pdfLines = pdfs
      .map((p) => {
        const link = p.pdfAbsoluteUrl || p.pdfUrl;
        return pdfs.length === 1
          ? link
          : `${p.invoiceNumber}: ${link}`;
      })
      .filter(Boolean);

    const greeting =
      resolved.recipient === "student"
        ? `Dear ${student.name || "Student"},`
        : "Dear Parent/Guardian,";

    const message = [
      `*Fee Invoice — ${schoolName}*`,
      "",
      greeting,
      "",
      resolved.recipient === "student"
        ? "Please find your fee invoice details below."
        : `Please find the fee invoice for *${student.name || "Student"}*.`,
      "",
      `*Invoice ID:* ${invoiceNumbers}`,
      `*Admission No:* ${student.admissionNumber || "—"}`,
      `*Class:* ${classSection}`,
      `*Fee Type:* ${feeTypes || "—"}`,
      `*Period:* ${period}`,
      `*Actual Amount:* ${formatInrPlain(totalBase)}`,
      `*Discount:* ${discountLabels.length ? discountLabels.join(", ") : "—"}`,
      `*Payable Amount:* ${formatInrPlain(totalAmount)}`,
      `*Paid:* ${formatInrPlain(totalPaid)}`,
      `*Balance:* ${formatInrPlain(totalBalance)}`,
      `*Status:* ${status}`,
      `*Due Date:* ${formatDueDateLong(pdfInvoices[0].dueDate)}`,
      "",
      "*Invoice PDF:*",
      ...(pdfLines.length ? pdfLines : ["PDF link unavailable"]),
      "",
      "Thank you.",
    ].join("\n");

    const waUrl = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;

    res.json({
      success: true,
      data: {
        phone,
        message,
        studentName: student.name,
        recipient: resolved.recipient,
        recipientUsed: resolved.used,
        pdfs,
        waUrl,
      },
      message: "WhatsApp share prepared",
    });
  } catch (error) {
    next(error);
  }
};

/** Download invoice PDF (generates and caches if missing). */
export const downloadInvoicePdf = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const invoice = await FeeInvoice.findOne({
      _id: req.params.id,
      ...schoolIdFilter(req),
      isDeleted: { $ne: true },
    })
      .populate("studentId", "name admissionNumber className section rollNumber phone parents")
      .populate("feeTypeId", "name code")
      .lean();

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    const school = await School.findById(invoice.schoolId)
      .select("name logo address city state pincode phone email affiliation schoolCode")
      .lean();

    // Rebuild PDF for the selected invoice line(s) only — same as print.
    // Do not pull every sibling fee for the same period (that added Past Dues / other fees).
    const lines = [{ ...invoice, feeTypeId: invoice.feeTypeId }];

    const buffer = await buildInvoicePdfBuffer({
      invoice,
      invoices: lines,
      student: invoice.studentId,
      feeType: invoice.feeTypeId,
      school,
    });

    try {
      const pdfUrl = await generateAndUploadInvoicePdf({
        invoice,
        invoices: lines,
        student: invoice.studentId,
        feeType: invoice.feeTypeId,
        school,
      });
      await FeeInvoice.updateMany(
        { _id: invoice._id },
        { $set: { pdfUrl } },
      );
    } catch {
      // Still return the buffer even if cache upload fails
    }

    const safeName = String(invoice.invoiceNumber || "invoice").replace(/[^\w.-]+/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
    res.send(buffer);
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
      ...schoolIdFilter(req),
      isDeleted: { $ne: true },
    })
      .populate("studentId", "name admissionNumber className section rollNumber phone parents")
      .populate("feeTypeId", "name code amount period")
      .populate("schoolId", "name schoolCode address city state pincode")
      .lean();
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    const payments = await Payment.find({
      invoiceId: invoice._id,
      schoolId: invoice.schoolId?._id || invoice.schoolId,
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
      ...schoolIdFilter(req),
      isDeleted: { $ne: true },
    });
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    const beforeSnap = await populateInvoice(
      FeeInvoice.findById(invoice._id),
    ).lean();
    const { amount, baseAmount, dueDate, period, remarks, status, discountPercent, discountAmount } =
      req.body || {};

    const hasPricingUpdate =
      baseAmount !== undefined ||
      amount !== undefined ||
      discountPercent !== undefined ||
      discountAmount !== undefined;

    if (hasPricingUpdate) {
      const prevBase =
        invoice.baseAmount != null ? invoice.baseAmount : invoice.amount;
      let base = prevBase;
      if (baseAmount !== undefined) base = Number(baseAmount);
      else if (amount !== undefined) base = Number(amount);

      let pct = invoice.discountPercent ?? 0;
      if (discountPercent !== undefined) pct = Number(discountPercent);

      if (Number.isNaN(base) || base < 0) {
        return res.status(400).json({
          success: false,
          message: "Base amount must be 0 or greater",
        });
      }
      if (Number.isNaN(pct) || pct < 0 || pct > 100) {
        return res.status(400).json({
          success: false,
          message: "discountPercent must be between 0 and 100",
        });
      }
      if (discountAmount !== undefined && discountAmount !== null && discountAmount !== "") {
        const disc = Number(discountAmount);
        if (Number.isNaN(disc) || disc < 0) {
          return res.status(400).json({
            success: false,
            message: "discountAmount must be 0 or greater",
          });
        }
      }

      const computed =
        discountAmount !== undefined && discountAmount !== null && discountAmount !== ""
          ? computeInvoiceAmounts(base, pct, { discountAmount })
          : computeInvoiceAmounts(base, pct);
      if (computed.amount < 0) {
        return res.status(400).json({
          success: false,
          message: "Final payable after discount cannot be negative",
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
    const amt = Number(invoice.amount) || 0;
    const paidAmt = Number(invoice.paid) || 0;
    // Only auto-reconcile when there is a real payable amount (not ₹0 lines)
    if (amt > 0 && paidAmt >= amt) {
      invoice.status = "Paid";
      if (!invoice.paidDate) invoice.paidDate = new Date();
    } else if (amt > 0 && paidAmt > 0 && paidAmt < amt) {
      invoice.status = "Partial";
    }
    await invoice.save();
    const populated = await populateInvoice(FeeInvoice.findById(invoice._id)).lean();
    const changes = diffTrackedFields(beforeSnap, populated, TRACKED_INVOICE_FIELDS);
    if (changes.length) {
      await writeFeeAudit({
        schoolId: invoice.schoolId,
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
      ...schoolIdFilter(req),
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
      schoolId: invoice.schoolId,
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
      ...schoolIdFilter(req),
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
      schoolId: invoice.schoolId,
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
