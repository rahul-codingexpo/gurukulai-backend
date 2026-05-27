import FeeInvoice from "../../../modules/accounting/feeInvoice.model.js";
import Student from "../../../modules/student/student.model.js";
import FeeType from "../../../modules/accounting/feeType.model.js";
import School from "../../../modules/school/school.model.js";

void Student;
void FeeType;

import { WhatsAppTemplateKey } from "../../../config/whatsappTemplates.config.js";
import { isWhatsAppTemplateConfigured } from "../../../config/whatsappTemplates.config.js";
import {
  applyDebugContactRouting,
  collectStudentFamilyRecipients,
  formatAmountPlain,
  formatDueDate,
  getCalendarDayInTimeZone,
  invoiceBalance,
} from "./feeWhatsApp.shared.js";
import { sendTemplateBatch } from "../whatsAppMessenger.service.js";

const TEMPLATE_KEY = WhatsAppTemplateKey.FEE_OVERDUE_DUE;

/**
 * Build {{1}}..{{10}} for fee_overdue_due template.
 * {{1}} = student name only (all recipients). No invoice number in template.
 */
export const buildFeeOverdueDueTemplateVariables = ({ invoice, student, feeType, school }) => {
  const balance = invoiceBalance(invoice);
  const classSection = [student?.className, student?.section].filter(Boolean).join(" - ");
  const displayStatus = balance > 0 ? "Overdue" : invoice.status;

  return [
    student?.name?.trim() || "Student",
    school?.name || "School",
    formatDueDate(invoice.dueDate),
    student?.admissionNumber || "-",
    classSection || "-",
    feeType?.name || "-",
    formatAmountPlain(invoice.amount),
    formatAmountPlain(invoice.paid),
    formatAmountPlain(balance),
    displayStatus,
  ];
};

export const notifyFeeOverdueDueWhatsApp = async (invoiceId) => {
  if (!isWhatsAppTemplateConfigured(TEMPLATE_KEY)) {
    return { skipped: true, reason: "fee_overdue_due template not configured" };
  }

  const invoice = await FeeInvoice.findById(invoiceId)
    .populate("studentId", "name admissionNumber className section phone parents")
    .populate("feeTypeId", "name code")
    .lean();

  if (!invoice) return { skipped: true, reason: "Invoice not found" };

  const balance = invoiceBalance(invoice);
  if (balance <= 0) {
    return { skipped: true, reason: "No remaining balance", invoiceId };
  }

  if (invoice.status === "Paid" || invoice.status === "Cancelled") {
    return { skipped: true, reason: `Invoice status is ${invoice.status}`, invoiceId };
  }

  if (invoice.whatsappDueReminderSentAt) {
    return { skipped: true, reason: "Due-date reminder already sent", invoiceId };
  }

  const student = invoice.studentId;
  if (!student) return { skipped: true, reason: "Student not found" };

  const school = await School.findById(invoice.schoolId).select("name").lean();
  const feeType = invoice.feeTypeId;

  let family = collectStudentFamilyRecipients(student);
  family = applyDebugContactRouting(family, student, "fee_overdue_due");

  if (!family.length) {
    return {
      skipped: true,
      reason: "No valid phone on student or parents",
      invoiceId: invoice._id,
    };
  }

  const studentName = student.name?.trim() || "Student";
  const sharedVariables = buildFeeOverdueDueTemplateVariables({
    invoice,
    student,
    feeType,
    school,
  });

  const recipients = family.map((member) => ({
    phone: member.phone,
    recipientType: member.recipientType,
    recipientName: studentName,
    variables: sharedVariables,
  }));

  const batch = await sendTemplateBatch({
    templateKey: TEMPLATE_KEY,
    recipients,
    header: { type: "none" },
  });

  const anySent = batch.logs?.some((l) => l.status === "sent");

  if (anySent) {
    await FeeInvoice.updateOne(
      { _id: invoice._id },
      {
        $set: {
          whatsappDueReminderSentAt: new Date(),
          whatsappDueReminderLog: batch.logs,
        },
      },
    );
  }

  return { invoiceId: invoice._id, balance, ...batch };
};

/**
 * Find invoices whose due date is today (timezone) with balance > 0 and send reminders.
 */
export const runFeeDueDateReminderBatch = async (options = {}) => {
  const timeZone = options.timeZone || process.env.FEE_DUE_REMINDER_TZ || "Asia/Kolkata";
  const todayStr = getCalendarDayInTimeZone(new Date(), timeZone);

  if (!isWhatsAppTemplateConfigured(TEMPLATE_KEY)) {
    return { skipped: true, reason: "fee_overdue_due template not configured", today: todayStr };
  }

  const candidates = await FeeInvoice.find({
    status: { $nin: ["Paid", "Cancelled"] },
    whatsappDueReminderSentAt: { $exists: false },
    $expr: { $gt: [{ $subtract: ["$amount", "$paid"] }, 0] },
  })
    .select("_id dueDate amount paid status")
    .lean();

  const dueTodayIds = candidates
    .filter((inv) => getCalendarDayInTimeZone(new Date(inv.dueDate), timeZone) === todayStr)
    .map((inv) => inv._id);

  const summary = {
    today: todayStr,
    timeZone,
    matched: dueTodayIds.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    results: [],
  };

  for (const id of dueTodayIds) {
    try {
      const result = await notifyFeeOverdueDueWhatsApp(id);
      if (result.skipped) {
        summary.skipped += 1;
      } else if (result.logs?.some((l) => l.status === "failed")) {
        summary.failed += 1;
      } else if (result.logs?.some((l) => l.status === "sent")) {
        summary.sent += 1;
      }
      summary.results.push({ invoiceId: String(id), ...result });
    } catch (err) {
      summary.failed += 1;
      summary.results.push({ invoiceId: String(id), error: err.message });
    }
  }

  return summary;
};
