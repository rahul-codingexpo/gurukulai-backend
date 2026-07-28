import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { uploadBufferToSpaces } from "../utils/spacesUploadBuffer.util.js";

const BLUE = "#2563EB";
const SLATE = "#0f172a";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";

const formatInr = (n) =>
  `Rs. ${Number(n ?? 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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

const getActualAmount = (inv) => {
  if (inv?.baseAmount != null && Number.isFinite(Number(inv.baseAmount))) return Number(inv.baseAmount);
  return Number(inv?.amount || 0);
};

const getDiscountRupees = (inv) => {
  const actual = getActualAmount(inv);
  const net = Number(inv?.amount || 0);
  if (inv?.discountAmount != null && Number(inv.discountAmount) > 0) return Number(inv.discountAmount);
  return Math.max(0, actual - net);
};

const resolveLocalUploadPath = (value) => {
  if (!value) return null;
  let rel = String(value).trim();
  if (/^https?:\/\//i.test(rel)) {
    try {
      rel = new URL(rel).pathname;
    } catch {
      return null;
    }
  }
  rel = rel.replace(/^\/+/, "");
  if (!rel.startsWith("uploads/")) return null;
  const abs = path.resolve(process.cwd(), rel);
  const root = path.resolve(process.cwd(), "uploads");
  if (!abs.startsWith(root)) return null;
  return abs;
};

const drawHLine = (doc, x1, x2, y, color = BORDER, width = 0.8) => {
  doc.save();
  doc.strokeColor(color).lineWidth(width).moveTo(x1, y).lineTo(x2, y).stroke();
  doc.restore();
};

const drawDottedHLine = (doc, x1, x2, y) => {
  doc.save();
  doc.strokeColor("#CBD5E1").lineWidth(0.7).dash(2, { space: 2 }).moveTo(x1, y).lineTo(x2, y).stroke();
  doc.undash();
  doc.restore();
};

/**
 * Fee receipt PDF matching the Print Invoice UI (FEE RECEIPT layout).
 * Pass `invoices` for a multi-line / complete receipt; defaults to `[invoice]`.
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

  const schoolAddress = [sch.address, sch.city, sch.state, sch.pincode].filter(Boolean).join(", ");
  const classSection = [stu.className, stu.section].filter(Boolean).join(" - ") || "—";
  const sessionLabel =
    stu.academicSession || stu.currentSessionName || stu.session || primary.period || "—";
  const receiptDate = fmtReceiptDate(primary.createdAt || primary.updatedAt);
  const fatherMobile = stu.parents?.father?.phone || "—";
  const fatherName = stu.parents?.father?.name || "—";

  const feeRows = lines.map((row, idx) => {
    const ft = typeof row.feeTypeId === "object" && row.feeTypeId ? row.feeTypeId : feeType || {};
    const description = [ft?.name || "Fee", row.period].filter(Boolean).join(" — ") || "—";
    return {
      sno: idx + 1,
      description,
      actual: getActualAmount(row),
      discount: getDiscountRupees(row),
      net: Number(row.amount || 0),
    };
  });

  const totals = feeRows.reduce(
    (acc, row) => ({
      subTotal: acc.subTotal + row.actual,
      totalDiscount: acc.totalDiscount + row.discount,
      grandTotal: acc.grandTotal + row.net,
    }),
    { subTotal: 0, totalDiscount: 0, grandTotal: 0 },
  );

  const logoPath = resolveLocalUploadPath(sch.logo);

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

    // Outer blue border
    const boxTop = y - 8;
    const boxLeft = pageLeft - 10;
    const boxRight = pageRight + 10;
    const boxWidth = boxRight - boxLeft;

    // Header
    const headerTop = y;
    if (logoPath && fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, pageLeft, headerTop, { fit: [48, 48] });
      } catch {
        // ignore bad logo
      }
    }

    const textLeft = logoPath && fs.existsSync(logoPath) ? pageLeft + 60 : pageLeft;
    doc
      .fillColor(BLUE)
      .font("Helvetica-Bold")
      .fontSize(16)
      .text(String(sch.name || "School").toUpperCase(), textLeft, headerTop, {
        width: contentWidth * 0.58,
        align: "left",
      });

    let infoY = headerTop + 22;
    doc.fillColor(MUTED).font("Helvetica").fontSize(9);
    doc.text(schoolAddress || "—", textLeft, infoY, { width: contentWidth * 0.58 });
    infoY = doc.y + 2;
    doc.text(`Contact: ${sch.phone || "—"} | Email: ${sch.email || "—"}`, textLeft, infoY, {
      width: contentWidth * 0.58,
    });
    infoY = doc.y + 2;
    doc.text(
      `Affiliation No: ${sch.affiliation || "—"} | Code: ${sch.schoolCode || "—"}`,
      textLeft,
      infoY,
      { width: contentWidth * 0.58 },
    );

    const metaLeft = pageLeft + contentWidth * 0.62;
    doc
      .fillColor("#334155")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("FEE RECEIPT", metaLeft, headerTop, { width: contentWidth * 0.38, align: "right" });
    doc
      .fillColor("#475569")
      .font("Helvetica")
      .fontSize(9)
      .text(`Inv No: ${primary.invoiceNumber || "—"}`, metaLeft, headerTop + 18, {
        width: contentWidth * 0.38,
        align: "right",
      });
    doc.text(`Date: ${receiptDate}`, metaLeft, headerTop + 32, {
      width: contentWidth * 0.38,
      align: "right",
    });

    y = Math.max(doc.y, headerTop + 56) + 10;
    doc.save();
    doc.rect(pageLeft, y, contentWidth, 3).fill(BLUE);
    doc.restore();
    y += 14;

    // Student details (2-column)
    const col1Label = pageLeft;
    const col1Value = pageLeft + contentWidth * 0.22;
    const col2Label = pageLeft + contentWidth * 0.52;
    const col2Value = pageLeft + contentWidth * 0.74;
    const rowH = 18;

    const detailRows = [
      ["Student Name:", stu.name || "—", "Roll No:", stu.rollNumber ?? "—"],
      ["Father's Name:", fatherName, "Admission No:", stu.admissionNumber || "—"],
      ["Class/Section:", classSection, "Session:", sessionLabel],
      ["Father Mobile:", fatherMobile, "", ""],
    ];

    detailRows.forEach((row) => {
      doc.fillColor(SLATE).font("Helvetica-Bold").fontSize(9).text(row[0], col1Label, y, {
        width: contentWidth * 0.21,
      });
      doc.font("Helvetica").text(String(row[1]), col1Value, y, { width: contentWidth * 0.28 });
      if (row[2]) {
        doc.font("Helvetica-Bold").text(row[2], col2Label, y, { width: contentWidth * 0.21 });
        doc.font("Helvetica").text(String(row[3]), col2Value, y, { width: contentWidth * 0.26 });
      }
      y += rowH;
      drawDottedHLine(doc, pageLeft, pageRight, y - 4);
    });

    y += 8;

    // Fee table header
    const cols = [
      { key: "sno", label: "S.No", width: 40, align: "center" },
      { key: "description", label: "Description / Head", width: contentWidth - 40 - 95 - 85 - 95, align: "left" },
      { key: "actual", label: "Actual Amount", width: 95, align: "center" },
      { key: "discount", label: "Discount", width: 85, align: "center" },
      { key: "net", label: "Net Amount", width: 95, align: "center" },
    ];

    const cellPadX = 6;
    const cellInner = (colWidth) => Math.max(8, colWidth - cellPadX * 2);

    const drawTableHeader = (yy) => {
      doc.save();
      doc.rect(pageLeft, yy, contentWidth, 24).fill(BLUE);
      doc.restore();
      let x = pageLeft;
      cols.forEach((c) => {
        doc
          .fillColor("#FFFFFF")
          .font("Helvetica-Bold")
          .fontSize(8)
          .text(c.label, x + cellPadX, yy + 8, {
            width: cellInner(c.width),
            align: "center",
          });
        x += c.width;
      });
      return yy + 24;
    };

    y = drawTableHeader(y);

    feeRows.forEach((row) => {
      const values = [
        String(row.sno),
        row.description,
        formatInr(row.actual),
        formatInr(row.discount),
        formatInr(row.net),
      ];
      const heights = values.map((val, i) =>
        doc.heightOfString(String(val), {
          width: cellInner(cols[i].width),
          align: cols[i].align,
        }),
      );
      const cellH = Math.max(24, Math.max(...heights) + 12);

      if (y + cellH > doc.page.height - 120) {
        doc.addPage();
        y = doc.page.margins.top;
        y = drawTableHeader(y);
      }

      let x = pageLeft;
      cols.forEach((c, i) => {
        doc.save();
        doc.strokeColor(BORDER).lineWidth(0.8).rect(x, y, c.width, cellH).stroke();
        doc.restore();
        const textHeight = doc.heightOfString(String(values[i]), {
          width: cellInner(c.width),
          align: c.align,
        });
        const textY = y + Math.max(6, (cellH - textHeight) / 2);
        doc
          .fillColor(i === 4 ? SLATE : i === 0 ? MUTED : SLATE)
          .font(i === 4 ? "Helvetica-Bold" : "Helvetica")
          .fontSize(9)
          .text(values[i], x + cellPadX, textY, {
            width: cellInner(c.width),
            align: c.align,
          });
        x += c.width;
      });
      y += cellH;
    });

    y += 10;

    // Totals
    const totalsWidth = 250;
    const totalsLeft = pageRight - totalsWidth;
    const labelW = 120;
    const valueW = 120;
    doc
      .fillColor(MUTED)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text("Sub-Total:", totalsLeft, y, { width: labelW, align: "right" });
    doc
      .fillColor(SLATE)
      .font("Helvetica-Bold")
      .text(formatInr(totals.subTotal), totalsLeft + labelW + 8, y, {
        width: valueW,
        align: "center",
      });
    y += 16;
    doc
      .fillColor(MUTED)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text("Total Discount:", totalsLeft, y, { width: labelW, align: "right" });
    doc
      .fillColor(MUTED)
      .font("Helvetica-Bold")
      .text(formatInr(totals.totalDiscount), totalsLeft + labelW + 8, y, {
        width: valueW,
        align: "center",
      });
    y += 18;
    doc
      .fillColor(SLATE)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("Grand Total:", totalsLeft, y, { width: labelW, align: "right" });
    doc
      .fillColor(BLUE)
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(formatInr(totals.grandTotal), totalsLeft + labelW + 8, y - 1, {
        width: valueW,
        align: "center",
      });
    y += 20;
    doc
      .fillColor("#94A3B8")
      .font("Helvetica-Oblique")
      .fontSize(8)
      .text(`(In Words: ${rupeesToWords(Math.round(totals.grandTotal))})`, pageLeft, y, {
        width: contentWidth,
        align: "right",
      });

    y += 28;

    // Footer
    const footerY = Math.max(y, doc.page.height - 90);
    doc
      .fillColor("#94A3B8")
      .font("Helvetica-Oblique")
      .fontSize(8)
      .text("Digital Partner: Medhyx Technology | www.medhyxtech.com", pageLeft, footerY, {
        width: contentWidth * 0.55,
      });

    doc
      .fillColor("#475569")
      .font("Helvetica")
      .fontSize(9)
      .text(paymentLine || "—", pageLeft + contentWidth * 0.5, footerY, {
        width: contentWidth * 0.5,
        align: "right",
      });
    drawHLine(doc, pageLeft + contentWidth * 0.55, pageRight, footerY + 28, "#94A3B8", 0.8);
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(9)
      .text("Authorized Signatory", pageLeft + contentWidth * 0.5, footerY + 32, {
        width: contentWidth * 0.5,
        align: "right",
      });

    // Draw outer border last (approximate height)
    const boxBottom = Math.min(doc.page.height - 24, footerY + 55);
    doc.save();
    doc.strokeColor(BLUE).lineWidth(2).rect(boxLeft, boxTop, boxWidth, boxBottom - boxTop).stroke();
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
