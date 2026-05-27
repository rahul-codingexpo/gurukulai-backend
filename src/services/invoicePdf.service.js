import PDFDocument from "pdfkit";
import { uploadBufferToSpaces } from "../utils/spacesUploadBuffer.util.js";

const roundMoney = (n) => Math.round(Number(n) * 100) / 100;

const formatInr = (n) =>
  Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const formatDateLong = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatDateTimeShort = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
};

export async function buildInvoicePdfBuffer({ invoice, student, feeType, school }) {
  const balance = roundMoney((invoice.amount ?? 0) - (invoice.paid ?? 0));
  const base = invoice.baseAmount ?? invoice.amount;
  const discount =
    invoice.discountAmount > 0
      ? `${invoice.discountPercent}% (₹${formatInr(invoice.discountAmount)})`
      : "—";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const schoolName = school?.name || "School";

    doc.fontSize(18).fillColor("#1a365d").text(schoolName, { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(13).fillColor("#4a5568").text("Fee Invoice", { align: "center" });
    doc.moveDown(1);

    doc.fontSize(10).fillColor("#000");
    const rows = [
      ["Invoice ID", invoice.invoiceNumber],
      ["Student", student?.name || "—"],
      ["Admission No", student?.admissionNumber || "—"],
      ["Class", `${student?.className || ""} - ${student?.section || ""}`.trim()],
      ["Fee Type", feeType?.name || "—"],
      ["Period", invoice.period || "—"],
      ["Actual Amount", `₹${formatInr(base)}`],
      ["Discount", discount],
      ["Payable Amount", `₹${formatInr(invoice.amount)}`],
      ["Paid", `₹${formatInr(invoice.paid)}`],
      ["Balance", `₹${formatInr(balance)}`],
      ["Status", invoice.status],
      ["Due Date", formatDateLong(invoice.dueDate)],
      ["Generated", formatDateTimeShort(invoice.createdAt)],
    ];

    rows.forEach(([label, value]) => {
      doc.font("Helvetica-Bold").text(`${label}:`, { continued: true });
      doc.font("Helvetica").text(` ${value}`);
    });

    if (invoice.remarks) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").text("Remarks:", { continued: true });
      doc.font("Helvetica").text(` ${invoice.remarks}`);
    }

    doc.moveDown(1.5);
    doc.fontSize(9).fillColor("#718096").text(
      "This is a computer-generated invoice. Please contact the school office for payment assistance.",
      { align: "center" },
    );

    doc.end();
  });
}

export async function generateAndUploadInvoicePdf({
  invoice,
  student,
  feeType,
  school,
}) {
  const buffer = await buildInvoicePdfBuffer({ invoice, student, feeType, school });
  const safeNumber = String(invoice.invoiceNumber || "invoice").replace(/[^\w.-]+/g, "_");
  const key = `uploads/invoices/${invoice.schoolId}/${safeNumber}.pdf`;
  const url = await uploadBufferToSpaces({
    buffer,
    key,
    contentType: "application/pdf",
  });
  return url;
}
