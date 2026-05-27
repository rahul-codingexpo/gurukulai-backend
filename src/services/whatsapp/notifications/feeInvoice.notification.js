import FeeInvoice from "../../../modules/accounting/feeInvoice.model.js";
import Student from "../../../modules/student/student.model.js";
import FeeType from "../../../modules/accounting/feeType.model.js";
import School from "../../../modules/school/school.model.js";

void Student;
void FeeType;

import { WhatsAppTemplateKey } from "../../../config/whatsappTemplates.config.js";
import { isWhatsAppTemplateConfigured } from "../../../config/whatsappTemplates.config.js";
import { generateAndUploadInvoicePdf } from "../../invoicePdf.service.js";
import { queueWhatsAppJob, sendTemplateBatch } from "../whatsAppMessenger.service.js";
import {
  applyDebugContactRouting,
  collectStudentFamilyRecipients,
  formatAmountPlain,
  formatDueDate,
  invoiceBalance,
} from "./feeWhatsApp.shared.js";

const TEMPLATE_KEY = WhatsAppTemplateKey.FEE_INVOICE;

/** {{8}} — percent only (template shows "Discount: *{{8}}* %"). */
const formatDiscountPercent = (invoice, baseAmount) => {
  const pct = Number(invoice.discountPercent) || 0;
  if (pct > 0) return String(pct);
  const amt = Number(invoice.discountAmount) || 0;
  const base = Number(baseAmount) || 0;
  if (amt > 0 && base > 0) return String(Math.round((amt / base) * 100));
  return "0";
};

/** e.g. 5/22/26 at 8:11 PM — no commas inside value. */
const formatGeneratedAt = (d) => {
  const x = new Date(d);
  const m = x.getMonth() + 1;
  const day = x.getDate();
  const y = String(x.getFullYear()).slice(-2);
  const time = x.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${m}/${day}/${y} at ${time}`;
};

/**
 * Build {{1}}..{{13}} for fee_invoice template.
 * {{1}} is always the student name (student, parent, or debug recipient).
 */
export const buildFeeInvoiceTemplateVariables = ({ invoice, student, feeType }) => {
  const base = invoice.baseAmount ?? invoice.amount;
  const balance = invoiceBalance(invoice);
  const classSection = [student?.className, student?.section].filter(Boolean).join(" - ");
  const studentName = student?.name?.trim() || "Student";

  return [
    studentName,
    formatGeneratedAt(invoice.createdAt),
    invoice.invoiceNumber,
    student?.admissionNumber || "-",
    classSection || "-",
    feeType?.name || "-",
    formatAmountPlain(base),
    formatDiscountPercent(invoice, base),
    formatAmountPlain(invoice.amount),
    formatAmountPlain(invoice.paid),
    formatAmountPlain(balance),
    invoice.status,
    formatDueDate(invoice.dueDate),
  ];
};

export const notifyFeeInvoiceWhatsApp = async (invoiceId) => {
  if (!isWhatsAppTemplateConfigured(TEMPLATE_KEY)) {
    return { skipped: true, reason: "fee_invoice template not configured" };
  }

  const invoice = await FeeInvoice.findById(invoiceId)
    .populate("studentId")
    .populate("feeTypeId", "name code")
    .lean();

  if (!invoice) return { skipped: true, reason: "Invoice not found" };

  const student = invoice.studentId;
  if (!student) return { skipped: true, reason: "Student not found" };

  const school = await School.findById(invoice.schoolId).select("name").lean();
  const feeType = invoice.feeTypeId;

  let pdfUrl = invoice.pdfUrl;
  if (!pdfUrl) {
    try {
      pdfUrl = await generateAndUploadInvoicePdf({
        invoice,
        student,
        feeType,
        school,
      });
      await FeeInvoice.updateOne({ _id: invoice._id }, { $set: { pdfUrl } });
    } catch (err) {
      return { skipped: true, reason: "PDF generation failed", error: err.message };
    }
  }

  let family = collectStudentFamilyRecipients(student);
  family = applyDebugContactRouting(family, student, "fee_invoice");

  if (!family.length) {
    return {
      skipped: true,
      reason: "No valid phone on student or parents",
      invoiceId: invoice._id,
    };
  }

  const studentName = student.name?.trim() || "Student";
  const sharedVariables = buildFeeInvoiceTemplateVariables({ invoice, student, feeType });

  const recipients = family.map((member) => ({
    phone: member.phone,
    recipientType: member.recipientType,
    recipientName: studentName,
    variables: sharedVariables,
  }));

  const batch = await sendTemplateBatch({
    templateKey: TEMPLATE_KEY,
    recipients,
    header: {
      type: "document",
      document: {
        link: pdfUrl,
        filename: `${invoice.invoiceNumber}.pdf`,
      },
    },
  });

  await FeeInvoice.updateOne(
    { _id: invoice._id },
    {
      $set: {
        pdfUrl,
        whatsappLastNotifiedAt: new Date(),
        whatsappNotificationLog: batch.logs,
        whatsappTemplateKey: TEMPLATE_KEY,
      },
    },
  );

  return { invoiceId: invoice._id, pdfUrl, ...batch };
};

export const queueFeeInvoiceWhatsApp = (invoiceId) => {
  queueWhatsAppJob(`fee_invoice:${invoiceId}`, () => notifyFeeInvoiceWhatsApp(invoiceId));
};
