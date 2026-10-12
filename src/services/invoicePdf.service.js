import PDFDocument from "pdfkit";
import { uploadBufferToSpaces } from "../utils/spacesUploadBuffer.util.js";

const RED = "#b91c1c";
const CREAM = "#fffdf5";

const fmtReceiptDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(dt.getDate()).padStart(2, "0");
  return `${day}-${months[dt.getMonth()]}-${dt.getFullYear()}`;
};

const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const teens = [
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const twoBelowHundred = (n) => {
  if (n < 10) return ones[n];
  if (n < 20) return teens[n - 10];
  return tens[Math.floor(n / 10)] + (n % 10 ? ` ${ones[n % 10]}` : "");
};

const hundredChunk = (n) => {
  let s = "";
  let x = n;
  if (x > 99) {
    s += `${ones[Math.floor(x / 100)]} Hundred`;
    x %= 100;
    if (x) s += " ";
  }
  if (x) s += twoBelowHundred(x);
  return s.trim();
};

const rupeesToWords = (num) => {
  const n = Math.round(Number(num) || 0);
  if (n === 0) return "Zero Rupees Only";
  let x = n;
  const parts = [];
  if (x >= 10000000) {
    parts.push(`${hundredChunk(Math.floor(x / 10000000))} Crore`);
    x %= 10000000;
  }
  if (x >= 100000) {
    parts.push(`${hundredChunk(Math.floor(x / 100000))} Lakh`);
    x %= 100000;
  }
  if (x >= 1000) {
    parts.push(`${hundredChunk(Math.floor(x / 1000))} Thousand`);
    x %= 1000;
  }
  if (x > 0) parts.push(hundredChunk(x));
  return `${parts.join(" ").replace(/\s+/g, " ").trim()} Rupees Only`;
};

const splitRsPaise = (n) => {
  const totalPaise = Math.round((Number(n) || 0) * 100);
  const rs = Math.floor(totalPaise / 100);
  const paise = Math.abs(totalPaise % 100);
  return {
    rs: rs.toLocaleString("en-IN"),
    p: String(paise).padStart(2, "0"),
    hasAmount: totalPaise !== 0,
  };
};

const feeTypeIdOf = (row) => {
  const ft = row?.feeTypeId;
  if (ft && typeof ft === "object") return String(ft._id || ft.id || "");
  return String(ft || "");
};

const feeTypeNameOf = (row) => {
  const ft = row?.feeTypeId;
  if (ft && typeof ft === "object" && ft.name) return String(ft.name).trim();
  return String(row?.remarks || "Fee").trim() || "Fee";
};

/** Particulars = only fee lines on this invoice (not every class fee type). */
const buildParticularsRows = (invoices = []) => {
  const amountById = new Map();
  const labelById = new Map();
  const order = [];

  invoices.forEach((row) => {
    const id = feeTypeIdOf(row);
    const label = feeTypeNameOf(row);
    const amount = Number(row.amount || 0);
    if (id) {
      if (!amountById.has(id)) {
        order.push(id);
        labelById.set(id, label);
        amountById.set(id, 0);
      }
      amountById.set(id, amountById.get(id) + amount);
      return;
    }
    const key = `__row_${order.length}`;
    order.push(key);
    labelById.set(key, label);
    amountById.set(key, amount);
  });

  const rows = order.map((key) => ({
    label: labelById.get(key) || "Fee",
    amount: amountById.get(key) || 0,
  }));

  if (!rows.length) {
    return [{ sno: 1, label: "Fee", amount: 0 }];
  }

  return rows.map((row, idx) => ({ sno: idx + 1, ...row }));
};

/**
 * Classic paper-style fee receipt PDF (red + cream, U-DISE header, particulars table).
 */
export async function buildInvoicePdfBuffer({
  invoice,
  invoices,
  student,
  feeType,
  school,
  paymentLine = "—",
}) {
  const lines = (Array.isArray(invoices) && invoices.length ? invoices : [invoice]).filter(Boolean);
  const primary = lines[0] || invoice || {};
  const stu = student || {};
  const sch = school || {};

  const schoolAddress = [sch.address, sch.city, sch.state, sch.pincode]
    .filter(Boolean)
    .join(", ")
    .toUpperCase();
  const classLabel = [stu.className, stu.section].filter(Boolean).join(" - ") || "";
  const monthLabel = primary.period || "";
  const receiptDate = fmtReceiptDate(primary.createdAt || primary.updatedAt || primary.dueDate);
  const fatherName = stu.parents?.father?.name || "";
  const udise = sch.udiseNumber || sch.registrationNumber || sch.schoolCode || "—";
  const mobiles = String(sch.phone || "")
    .split(/[,/|]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join(", ");
  const recognition = sch.runUnder || "";
  const serialNo = String(primary.invoiceNumber || "").replace(/^INV-/i, "") || "—";

  const normalizedLines = lines.map((row) => ({
    ...row,
    feeTypeId:
      typeof row.feeTypeId === "object" && row.feeTypeId
        ? row.feeTypeId
        : feeType || row.feeTypeId,
  }));
  const feeRows = buildParticularsRows(normalizedLines);

  const totals = lines.reduce(
    (acc, row) => ({
      total: acc.total + Number(row.amount || 0),
      paid: acc.paid + Number(row.paid || 0),
      dues: acc.dues + Math.max(0, Number(row.amount || 0) - Number(row.paid || 0)),
    }),
    { total: 0, paid: 0, dues: 0 },
  );

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      info: {
        Title: `Fee Receipt ${primary.invoiceNumber || ""}`,
        Author: sch.name || "School",
      },
    });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageLeft = doc.page.margins.left;
    const pageRight = doc.page.width - doc.page.margins.right;
    const contentWidth = pageRight - pageLeft;
    let y = doc.page.margins.top;

    const boxTop = y - 10;
    const boxLeft = pageLeft - 12;
    const boxWidth = contentWidth + 24;

    doc.save();
    doc.rect(boxLeft, boxTop, boxWidth, doc.page.height - boxTop - 24).fill(CREAM);
    doc.restore();

    doc.fillColor(RED).font("Times-Bold").fontSize(10);
    doc.text(`U-DISE CODE-${udise}`, pageLeft, y, { width: contentWidth * 0.34, align: "left" });
    doc.fontSize(13).text("FEE RECEIPT", pageLeft + contentWidth * 0.28, y, {
      width: contentWidth * 0.44,
      align: "center",
    });
    doc.fontSize(10).text(`Mob-${mobiles || "—"}`, pageLeft + contentWidth * 0.62, y, {
      width: contentWidth * 0.38,
      align: "right",
    });

    y += 22;
    doc.font("Times-Bold").fontSize(22).text(String(sch.name || "SCHOOL").toUpperCase(), pageLeft, y, {
      width: contentWidth,
      align: "center",
    });
    y = doc.y + 2;
    if (recognition) {
      doc.font("Times-Bold").fontSize(11).text(recognition, pageLeft, y, {
        width: contentWidth,
        align: "center",
      });
      y = doc.y + 4;
    } else {
      y += 4;
    }

    const addr = schoolAddress || "—";
    const addrHeight = Math.max(22, doc.heightOfString(addr, { width: contentWidth * 0.78 }) + 10);
    const addrWidth = Math.min(contentWidth * 0.86, Math.max(280, addr.length * 7));
    const addrX = pageLeft + (contentWidth - addrWidth) / 2;
    doc.save();
    doc.strokeColor(RED).lineWidth(1.2).roundedRect(addrX, y, addrWidth, addrHeight, 12).stroke();
    doc.restore();
    doc.font("Times-Bold").fontSize(10).fillColor(RED).text(addr, addrX + 8, y + 6, {
      width: addrWidth - 16,
      align: "center",
    });
    y += addrHeight + 14;

    doc.font("Times-Bold").fontSize(12);
    doc.text(`Sl.No. ${serialNo}`, pageLeft, y, { width: contentWidth * 0.5, align: "left" });
    doc.text(`Date: ${receiptDate}`, pageLeft + contentWidth * 0.5, y, {
      width: contentWidth * 0.5,
      align: "right",
    });
    y += 20;

    doc.font("Times-Bold").fontSize(12).fillColor(RED);
    doc.text(`Name: ${stu.name || "—"}`, pageLeft, y, { width: contentWidth });
    y += 18;
    doc.text(`Father's Name: ${fatherName || "—"}`, pageLeft, y, { width: contentWidth });
    y += 18;

    const third = contentWidth / 3;
    doc.text(`Class: ${classLabel}`, pageLeft, y, { width: third - 6 });
    doc.text(`Roll: ${stu.rollNumber ?? "—"}`, pageLeft + third, y, { width: third - 6 });
    doc.text(`Month: ${monthLabel}`, pageLeft + third * 2, y, { width: third });
    y += 22;

    const colSl = 50;
    const colAmtRs = 90;
    const colAmtP = 50;
    const colPart = contentWidth - colSl - colAmtRs - colAmtP;
    const headerH = 36;

    const drawCell = (x, yy, w, h, text, opts = {}) => {
      doc.save();
      doc.strokeColor(RED).lineWidth(1).rect(x, yy, w, h).stroke();
      doc.restore();
      if (text == null || text === "") return;
      doc
        .fillColor(RED)
        .font("Times-Bold")
        .fontSize(opts.size || 11)
        .text(String(text), x + 4, yy + (opts.padY ?? 8), {
          width: w - 8,
          align: opts.align || "left",
        });
    };

    drawCell(pageLeft, y, colSl, headerH, "Sl No.", { align: "center", padY: 12 });
    drawCell(pageLeft + colSl, y, colPart, headerH, "PARTICULARS", { align: "center", padY: 12 });
    drawCell(pageLeft + colSl + colPart, y, colAmtRs + colAmtP, 18, "Amount", { align: "center", padY: 4 });
    drawCell(pageLeft + colSl + colPart, y + 18, colAmtRs, 18, "RS.", { align: "center", padY: 4, size: 10 });
    drawCell(pageLeft + colSl + colPart + colAmtRs, y + 18, colAmtP, 18, "P.", { align: "center", padY: 4, size: 10 });
    y += headerH;

    const available = Math.max(160, doc.page.height - y - 170);
    const dynamicRowH = Math.min(28, Math.max(20, Math.floor(available / Math.max(feeRows.length, 1))));
    const padY = dynamicRowH >= 26 ? 8 : 4;

    feeRows.forEach((row) => {
      const money = splitRsPaise(row.amount);
      drawCell(pageLeft, y, colSl, dynamicRowH, String(row.sno), { align: "center", padY });
      drawCell(pageLeft + colSl, y, colPart, dynamicRowH, row.label, { padY });
      drawCell(pageLeft + colSl + colPart, y, colAmtRs, dynamicRowH, money.rs, {
        align: "right",
        padY,
      });
      drawCell(pageLeft + colSl + colPart + colAmtRs, y, colAmtP, dynamicRowH, money.p, {
        align: "center",
        padY,
      });
      y += dynamicRowH;
    });

    y += 10;
    const wordsBoxW = contentWidth - 230;
    const wordsBoxH = 78;
    doc.save();
    doc.strokeColor(RED).lineWidth(1).rect(pageLeft, y, wordsBoxW, wordsBoxH).stroke();
    doc.restore();
    doc.font("Times-Bold").fontSize(12).fillColor(RED).text("Amount In Words", pageLeft + 8, y + 8, {
      width: wordsBoxW - 16,
    });
    doc.font("Times-Bold").fontSize(11).text(rupeesToWords(Math.round(totals.total)), pageLeft + 8, y + 28, {
      width: wordsBoxW - 16,
    });

    const sumX = pageLeft + wordsBoxW + 8;
    const sumW = contentWidth - wordsBoxW - 8;
    const sumLabelW = sumW - 90 - 42;
    const summaryRows = [
      ["Total-", totals.total],
      ["Paid-", totals.paid],
      ["Dues-", totals.dues],
    ];
    summaryRows.forEach((row, i) => {
      const yy = y + i * 26;
      const money = splitRsPaise(row[1]);
      drawCell(sumX, yy, sumLabelW, 26, row[0], { padY: 7 });
      drawCell(sumX + sumLabelW, yy, 90, 26, money.rs, { align: "right", padY: 7 });
      drawCell(sumX + sumLabelW + 90, yy, 42, 26, money.p, { align: "center", padY: 7 });
    });

    y += Math.max(wordsBoxH, 78) + 16;

    doc.font("Times-Bold").fontSize(10).fillColor(RED).text(
      "Note:- Parents/Guardians are requested to Pay the monthly fee up to 5 of each month.",
      pageLeft,
      y,
      { width: contentWidth * 0.68 },
    );
    if (paymentLine && paymentLine !== "—") {
      doc.font("Times-Roman").fontSize(9).text(paymentLine, pageLeft, doc.y + 4, {
        width: contentWidth * 0.68,
      });
    }

    doc.font("Times-Bold").fontSize(12).text("Signature", pageLeft + contentWidth * 0.72, y + 18, {
      width: contentWidth * 0.28,
      align: "right",
    });
    doc.save();
    doc
      .strokeColor(RED)
      .lineWidth(1)
      .moveTo(pageLeft + contentWidth * 0.72, y + 16)
      .lineTo(pageRight, y + 16)
      .stroke();
    doc.restore();

    const boxBottom = Math.min(doc.page.height - 24, y + 70);
    doc.save();
    doc.strokeColor(RED).lineWidth(1.6).rect(boxLeft, boxTop, boxWidth, boxBottom - boxTop).stroke();
    doc.restore();

    doc.end();
  });
}

export async function generateAndUploadInvoicePdf({
  invoice,
  invoices,
  student,
  feeType,
  school,
  paymentLine,
}) {
  const buffer = await buildInvoicePdfBuffer({
    invoice,
    invoices,
    student,
    feeType,
    school,
    paymentLine,
  });
  const primary = (Array.isArray(invoices) && invoices[0]) || invoice || {};
  const safeNumber = String(primary.invoiceNumber || "invoice").replace(/[^\w.-]+/g, "_");
  const schoolId = primary.schoolId || invoice?.schoolId || school?._id || "school";
  const suffix = Array.isArray(invoices) && invoices.length > 1 ? "-receipt" : "";
  const key = `uploads/invoices/${schoolId}/${safeNumber}${suffix}.pdf`;
  const url = await uploadBufferToSpaces({
    buffer,
    key,
    contentType: "application/pdf",
  });
  return url;
}
