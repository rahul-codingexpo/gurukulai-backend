import mongoose from "mongoose";
import XLSX from "xlsx";
import Student from "../../student/student.model.js";
import ClassModel from "../../academic/class.model.js";
import School from "../../school/school.model.js";
import PastFeeImportBatch from "./pastFeeImportBatch.model.js";
import PastFeeRecord from "./pastFeeRecord.model.js";
import FeeInvoice from "../feeInvoice.model.js";
import FeeType from "../feeType.model.js";
import Payment from "../payment.model.js";
import { writeFeeAudit, diffTrackedFields } from "../feeAudit/feeAudit.service.js";
import { normalizeWhatsAppPhone } from "../../../utils/phone.util.js";
import { schoolIdMatchValue } from "../../../utils/branchScope.util.js";

const TRACKED_PAST_FEE_FIELDS = [
  "dueAmount",
  "paidAmount",
  "balance",
  "dueDate",
  "remarks",
  "session",
  "className",
  "section",
];

const ok = (res, payload = {}) => res.json({ success: true, ...payload });
const fail = (res, status, message, errors) =>
  res.status(status).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
  });

const normalizeHeader = (s) =>
  String(s || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .toLowerCase();

const getRowValue = (row, normalizedKey, keyMap) => {
  const actualKey = keyMap[normalizedKey];
  if (!actualKey) return "";
  return row[actualKey];
};

const parseDateOnly = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const s = String(value).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const dt = new Date(`${s}T00:00:00.000Z`);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const toISODateOnly = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const parseNumber = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return n;
};

const parseRowsFromUpload = (file) => {
  const ext = (file.originalname || "").toLowerCase().split(".").pop();
  const buffer = file.buffer;
  if (!buffer) throw new Error("File buffer missing");

  if (ext === "csv") {
    const text = buffer.toString("utf8");
    const wb = XLSX.read(text, { type: "string" });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  }

  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
};

const validateAndNormalizeBatchRows = async ({
  req,
  rows,
  schoolId,
  sessionOverride,
  batch,
}) => {
  const admissionKey = "admissionno";
  const dueAmountKey = "dueamount";
  const paidAmountKey = "paidamount";
  const classKey = "class";
  const sectionKey = "section";
  const sessionKey = "session";
  const dueDateKey = "duedate";
  const remarksKey = "remarks";
  const studentNameKey = "studentname";

  const requiredHeaders = [admissionKey, dueAmountKey];
  if (!sessionOverride) requiredHeaders.push(sessionKey);

  const firstRow = rows[0] || {};
  const firstKeyMap = Object.fromEntries(
    Object.keys(firstRow).map((k) => [normalizeHeader(k), k]),
  );

  for (const rh of requiredHeaders) {
    if (!firstKeyMap[rh]) {
      throw new Error(
        `Header mismatch: missing required column ${rh}`,
      );
    }
  }

  // Collect admissions for bulk student fetch
  const admissions = [];
  for (const r of rows) {
    const keyMap = Object.fromEntries(
      Object.keys(r).map((k) => [normalizeHeader(k), k]),
    );
    const admissionNo = getRowValue(r, admissionKey, keyMap);
    if (admissionNo && String(admissionNo).trim()) {
      admissions.push(String(admissionNo).trim());
    }
  }

  const uniqueAdmissions = [...new Set(admissions)];

  const students = await Student.find({
    schoolId,
    admissionNumber: { $in: uniqueAdmissions },
  }).lean();

  const studentMap = new Map(
    students.map((s) => [String(s.admissionNumber), s]),
  );

  const importedDocs = [];
  let skipped = 0;

  for (const row of rows) {
    const keyMap = Object.fromEntries(
      Object.keys(row).map((k) => [normalizeHeader(k), k]),
    );

    const admissionNumber = String(
      getRowValue(row, admissionKey, keyMap),
    ).trim();
    const dueAmountNum = parseNumber(
      getRowValue(row, dueAmountKey, keyMap),
    );

    if (!admissionNumber || dueAmountNum === null) {
      skipped += 1;
      continue;
    }

    if (!(dueAmountNum >= 0)) {
      skipped += 1;
      continue;
    }

    const paidAmountNumRaw = parseNumber(
      getRowValue(row, paidAmountKey, keyMap),
    );
    const paidAmountNum =
      paidAmountNumRaw === null ? 0 : paidAmountNumRaw;
    if (paidAmountNum < 0) {
      skipped += 1;
      continue;
    }

    const sessionFromRow = String(
      getRowValue(row, sessionKey, keyMap),
    ).trim();
    const session = String(sessionOverride || sessionFromRow || "").trim();
    if (!session) {
      skipped += 1;
      continue;
    }

    const student = studentMap.get(admissionNumber);
    if (!student) {
      skipped += 1;
      continue;
    }

    // Cap paidAmount at dueAmount (avoid negative balance)
    const paidAmount = paidAmountNum > dueAmountNum ? dueAmountNum : paidAmountNum;
    const balance = dueAmountNum - paidAmount;

    const classNameFromRow = String(
      getRowValue(row, classKey, keyMap),
    ).trim();
    const sectionFromRow = String(
      getRowValue(row, sectionKey, keyMap),
    ).trim();

    const className = String(student.className || classNameFromRow || "").trim();
    const section = String(student.section || sectionFromRow || "").trim();
    if (!className) {
      skipped += 1;
      continue;
    }

    const dueDate = parseDateOnly(getRowValue(row, dueDateKey, keyMap));

    const remarksVal = getRowValue(row, remarksKey, keyMap);
    const remarks =
      remarksVal === undefined || remarksVal === null
        ? ""
        : String(remarksVal).trim();

    const studentNameFromRow = String(
      getRowValue(row, studentNameKey, keyMap),
    ).trim();
    const studentName = String(student.name || studentNameFromRow || "").trim();
    if (!studentName) {
      skipped += 1;
      continue;
    }

    importedDocs.push({
      schoolId,
      studentId: student._id,
      studentName,
      admissionNumber,
      className,
      section,
      session,
      dueAmount: dueAmountNum,
      paidAmount,
      balance,
      dueDate,
      remarks,
      importBatchId: batch._id,
      createdBy: req.user?._id,
    });
  }

  return {
    importedDocs,
    skipped,
  };
};

export const importPastFees = async (req, res, next) => {
  try {
    const schoolId = req.schoolId;
    if (!schoolId) return fail(res, 400, "School context missing");
    if (!req.file) return fail(res, 400, "file is required");

    const sessionOverride = req.body?.sessionYear
      ? String(req.body.sessionYear).trim()
      : "";

    const importName = req.body?.importName
      ? String(req.body.importName).trim()
      : `Past fees import #${Date.now()}`;

    const rows = parseRowsFromUpload(req.file);
    if (!Array.isArray(rows) || rows.length === 0) {
      return fail(res, 400, "No rows found in file");
    }

    const firstRow = rows[0] || {};
    const firstKeyMap = Object.fromEntries(
      Object.keys(firstRow).map((k) => [normalizeHeader(k), k]),
    );
    const sessionFromFileFirstRow = String(
      firstKeyMap.session ? firstRow[firstKeyMap.session] : "",
    ).trim();
    const session = sessionOverride || sessionFromFileFirstRow || "";
    if (!session) {
      return fail(
        res,
        400,
        "Session is required either in file column `Session` or via `sessionYear`",
      );
    }

    const batch = await PastFeeImportBatch.create({
      schoolId,
      batchName: importName,
      session,
      fileMeta: {
        filename: req.file.originalname,
        originalSize: req.file.size,
      },
      recordsRead: rows.length,
      recordsImported: 0,
      recordsSkipped: 0,
      createdBy: req.user?._id,
      importedOn: new Date(),
    });

    const { importedDocs, skipped } =
      await validateAndNormalizeBatchRows({
        req,
        rows,
        schoolId,
        sessionOverride: sessionOverride || null,
        batch,
      });

    const importedCount = importedDocs.length;

    let insertedDocs = [];
    if (importedDocs.length) {
      insertedDocs = await PastFeeRecord.insertMany(importedDocs);
      for (const doc of insertedDocs) {
        await writeFeeAudit({
          schoolId,
          sourceType: "PastFeeRecord",
          sourceId: doc._id,
          action: "created",
          after: doc.toObject(),
          user: req.user,
        });
      }
    }

    batch.recordsImported = importedCount;
    batch.recordsSkipped = skipped;
    await batch.save();

    return res.status(201).json({
      success: true,
      message: "Past fee data imported",
      data: {
        batchId: batch._id,
        batchName: batch.batchName,
        session: batch.session,
        totals: {
          recordsRead: batch.recordsRead,
          recordsImported: batch.recordsImported,
          recordsSkipped: batch.recordsSkipped,
        },
      },
    });
  } catch (err) {
    return fail(res, 400, err.message || "Past fee import failed");
  }
};

export const createPastFeeRecord = async (req, res, next) => {
  try {
    const schoolId = req.schoolId;
    if (!schoolId) return fail(res, 400, "School context missing");

    const admissionNo = String(req.body?.admissionNumber || "").trim();
    const sessionVal = String(req.body?.session || "").trim();
    const dueAmountNum = parseNumber(req.body?.dueAmount);

    if (!admissionNo) return fail(res, 400, "admissionNumber is required");
    if (!sessionVal) return fail(res, 400, "session is required");
    if (dueAmountNum === null || dueAmountNum < 0) {
      return fail(res, 400, "dueAmount is required and must be 0 or greater");
    }

    const batch = await PastFeeImportBatch.create({
      schoolId,
      batchName: `Single entry · ${admissionNo} · ${new Date().toLocaleDateString("en-IN")}`,
      session: sessionVal,
      fileMeta: { filename: "single-entry", originalSize: 0 },
      recordsRead: 1,
      recordsImported: 0,
      recordsSkipped: 0,
      createdBy: req.user?._id,
      importedOn: new Date(),
    });

    const row = {
      AdmissionNo: admissionNo,
      StudentName: req.body?.studentName || "",
      Class: req.body?.className || "",
      Section: req.body?.section || "",
      Session: sessionVal,
      DueAmount: req.body?.dueAmount,
      PaidAmount: req.body?.paidAmount ?? 0,
      DueDate: req.body?.dueDate || "",
      Remarks: req.body?.remarks || "",
    };

    const { importedDocs, skipped } = await validateAndNormalizeBatchRows({
      req,
      rows: [row],
      schoolId,
      sessionOverride: sessionVal,
      batch,
    });

    if (!importedDocs.length) {
      await PastFeeImportBatch.deleteOne({ _id: batch._id });
      return fail(
        res,
        400,
        "Could not create record. Check admission number exists and student has class assigned.",
      );
    }

    const [record] = await PastFeeRecord.insertMany(importedDocs);
    batch.recordsImported = 1;
    batch.recordsSkipped = skipped;
    await batch.save();

    await writeFeeAudit({
      schoolId,
      sourceType: "PastFeeRecord",
      sourceId: record._id,
      action: "created",
      after: record.toObject(),
      user: req.user,
    });

    return res.status(201).json({
      success: true,
      message: "Past fee record created",
      data: { record, batchId: batch._id },
    });
  } catch (err) {
    return fail(res, 400, err.message || "Failed to create past fee record");
  }
};

export const listPastFeeImports = async (req, res, next) => {
  try {
    const schoolId = schoolIdMatchValue(req);
    if (!schoolId) return fail(res, 400, "School context missing");

    const session = req.query.session ? String(req.query.session).trim() : "";
    const fromDate = req.query.fromDate ? parseDateOnly(req.query.fromDate) : null;
    const toDate = req.query.toDate ? parseDateOnly(req.query.toDate) : null;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));

    const query = { schoolId };
    if (session) query.session = session;
    if (fromDate || toDate) {
      query.importedOn = {};
      if (fromDate) query.importedOn.$gte = fromDate;
      if (toDate) query.importedOn.$lte = toDate;
    }

    const [total, items] = await Promise.all([
      PastFeeImportBatch.countDocuments(query),
      PastFeeImportBatch.find(query)
        .populate("createdBy", "name")
        .sort({ importedOn: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return ok(res, {
      data: {
        items: items.map((b) => ({
          batchId: b._id,
          batchName: b.batchName,
          session: b.session,
          importedOn: b.importedOn,
          records: b.recordsImported,
          createdBy: { name: b.createdBy?.name || "" },
        })),
        total,
        page,
        limit,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const listPastFeeRecords = async (req, res, next) => {
  try {
    const schoolId = schoolIdMatchValue(req);
    if (!schoolId) return fail(res, 400, "School context missing");

    const session = req.query.session ? String(req.query.session).trim() : null;
    const section = req.query.section ? String(req.query.section).trim() : null;

    const className = req.query.className
      ? String(req.query.className).trim()
      : null;
    const classId = req.query.classId ? String(req.query.classId).trim() : null;
    const search = req.query.search ? String(req.query.search).trim() : null;

    const status = req.query.status ? String(req.query.status).trim() : null;
    const studentId = req.query.studentId ? String(req.query.studentId).trim() : null;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));

    let classNameFromClassId = null;
    if (!className && classId) {
      const cls = await ClassModel.findOne({ _id: classId, schoolId }).select("name").lean();
      classNameFromClassId = cls?.name || null;
    }

    const effectiveClassName = className || classNameFromClassId;

    const includeDeleted = String(req.query.includeDeleted || "").toLowerCase() === "true";
    const match = { schoolId };
    if (!includeDeleted) match.isDeleted = { $ne: true };
    if (studentId) {
      if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return fail(res, 400, "Invalid studentId");
      }
      match.studentId = new mongoose.Types.ObjectId(studentId);
    }
    if (session) match.session = session;
    if (effectiveClassName) match.className = effectiveClassName;
    if (section) match.section = section;

    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      match.$or = [{ admissionNumber: rx }, { studentName: rx }];
    }

    const statusMatch = (() => {
      if (!status) return null;
      const s = status.toLowerCase();
      if (s === "due" || s === "unpaid" || s === "pending") return "Due";
      if (s === "partial" || s === "partially paid" || s === "partially") return "Partial";
      if (s === "overdue") return "Overdue";
      if (s === "paid") return "Paid";
      return null;
    })();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pipeline = [
      { $match: match },
      {
        $addFields: {
          computedBalance: "$balance",
          computedStatus: {
            $cond: [
              { $lte: ["$balance", 0] },
              "Paid",
              {
                $cond: [
                  { $gt: ["$paidAmount", 0] },
                  "Partial",
                  {
                    $cond: [
                      {
                        $and: [
                          { $ne: ["$dueDate", null] },
                          { $lt: ["$dueDate", today] },
                        ],
                      },
                      "Overdue",
                      "Due",
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    ];

    if (statusMatch) pipeline.push({ $match: { computedStatus: statusMatch } });

    pipeline.push(
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          items: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                studentId: 1,
                studentName: 1,
                admissionNumber: 1,
                className: 1,
                section: 1,
                session: 1,
                dueAmount: 1,
                paidAmount: 1,
                balance: 1,
                dueDate: 1,
                remarks: 1,
                invoiceId: 1,
                createdAt: 1,
                updatedAt: 1,
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    );

    const agg = await PastFeeRecord.aggregate(pipeline);
    const facet = agg[0] || { items: [], total: [] };
    const total = facet.total[0]?.count || 0;

    const items = (facet.items || []).map((i) => ({
      _id: i._id,
      studentId: i.studentId,
      studentName: i.studentName,
      admissionNumber: i.admissionNumber,
      className: i.className,
      section: i.section,
      session: i.session,
      dueAmount: i.dueAmount,
      paidAmount: i.paidAmount,
      balance: i.balance,
      dueDate: toISODateOnly(i.dueDate),
      remarks: i.remarks,
      invoiceId: i.invoiceId || null,
      createdAt: i.createdAt,
    }));

    return ok(res, {
      data: {
        items,
        total,
        page,
        limit,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getStudentPastFeeSummary = async (req, res, next) => {
  try {
    const schoolId = schoolIdMatchValue(req);
    if (!schoolId) return fail(res, 400, "School context missing");
    const { studentId } = req.params;

    const student = await Student.findOne({ _id: studentId, schoolId }).lean();
    if (!student) return fail(res, 404, "Student not found");

    const [agg] = await PastFeeRecord.aggregate([
      { $match: { schoolId, studentId } },
      {
        $group: {
          _id: null,
          totalBilled: { $sum: "$dueAmount" },
          totalPaid: { $sum: "$paidAmount" },
          balance: { $sum: "$balance" },
        },
      },
    ]);

    const summaryBase = agg || { totalBilled: 0, totalPaid: 0, balance: 0 };

    const bySessionAgg = await PastFeeRecord.aggregate([
      { $match: { schoolId, studentId } },
      {
        $group: {
          _id: "$session",
          balance: { $sum: "$balance" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return ok(res, {
      data: {
        studentId,
        totalBilled: summaryBase.totalBilled,
        totalPaid: summaryBase.totalPaid,
        balance: summaryBase.balance,
        bySession: bySessionAgg.map((x) => ({
          session: x._id,
          balance: x.balance,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

/** Edit a single past-fee record. Updates due/paid/balance, dates, remarks etc. */
export const updatePastFeeRecord = async (req, res, next) => {
  try {
    const schoolId = schoolIdMatchValue(req);
    if (!schoolId) return fail(res, 400, "School context missing");

    const record = await PastFeeRecord.findOne({
      _id: req.params.id,
      schoolId,
      isDeleted: { $ne: true },
    });
    if (!record) return fail(res, 404, "Past fee record not found");

    const before = record.toObject();

    const setNumberIfPresent = (key, transform = (v) => v) => {
      if (req.body?.[key] !== undefined && req.body?.[key] !== "") {
        const num = parseNumber(req.body[key]);
        if (num === null || num < 0) {
          throw new Error(`${key} must be 0 or greater`);
        }
        record[key] = transform(num);
      }
    };

    try {
      setNumberIfPresent("dueAmount");
      setNumberIfPresent("paidAmount");
    } catch (e) {
      return fail(res, 400, e.message);
    }

    if (req.body?.dueDate !== undefined) {
      const d = req.body.dueDate ? parseDateOnly(req.body.dueDate) : null;
      record.dueDate = d || null;
    }
    if (req.body?.remarks !== undefined) {
      record.remarks = String(req.body.remarks || "").trim();
    }
    if (req.body?.session !== undefined && String(req.body.session).trim()) {
      record.session = String(req.body.session).trim();
    }
    if (req.body?.className !== undefined && String(req.body.className).trim()) {
      record.className = String(req.body.className).trim();
    }
    if (req.body?.section !== undefined) {
      record.section = String(req.body.section || "").trim();
    }

    if (record.paidAmount > record.dueAmount) {
      return fail(res, 400, "Paid amount cannot exceed due amount");
    }

    const requestedStatus = req.body?.status
      ? String(req.body.status).trim()
      : null;
    if (requestedStatus) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (requestedStatus === "Paid") {
        record.paidAmount = record.dueAmount;
        record.balance = 0;
      } else if (requestedStatus === "Due" || requestedStatus === "Unpaid") {
        record.paidAmount = 0;
        record.balance = record.dueAmount;
        if (!record.dueDate || record.dueDate < today) {
          record.dueDate = today;
        }
      } else if (requestedStatus === "Overdue") {
        record.paidAmount = 0;
        record.balance = record.dueAmount;
        if (!record.dueDate || record.dueDate >= today) {
          record.dueDate = yesterday;
        }
      } else if (requestedStatus === "Partial" || requestedStatus === "Partially Paid") {
        if (record.paidAmount <= 0 || record.paidAmount >= record.dueAmount) {
          return fail(
            res,
            400,
            "Partial requires paid amount greater than 0 and less than due amount",
          );
        }
        record.balance = Math.max(0, record.dueAmount - record.paidAmount);
      } else {
        return fail(res, 400, "Invalid status. Use Paid, Due, Partial, or Overdue");
      }
    } else {
      record.balance = Math.max(0, record.dueAmount - record.paidAmount);
    }

    await record.save();
    const after = record.toObject();
    const changes = diffTrackedFields(before, after, TRACKED_PAST_FEE_FIELDS);
    if (changes.length) {
      await writeFeeAudit({
        schoolId,
        sourceType: "PastFeeRecord",
        sourceId: record._id,
        action: "updated",
        before,
        after,
        changes,
        user: req.user,
      });
    }

    return ok(res, {
      message: "Past fee record updated",
      data: after,
    });
  } catch (err) {
    next(err);
  }
};

/** Soft delete a past fee record. */
export const softDeletePastFeeRecord = async (req, res, next) => {
  try {
    const schoolId = schoolIdMatchValue(req);
    if (!schoolId) return fail(res, 400, "School context missing");

    const record = await PastFeeRecord.findOne({
      _id: req.params.id,
      schoolId,
      isDeleted: { $ne: true },
    });
    if (!record) return fail(res, 404, "Past fee record not found");

    const before = record.toObject();
    record.isDeleted = true;
    record.deletedAt = new Date();
    record.deletedBy = req.user?._id;
    await record.save();

    await writeFeeAudit({
      schoolId,
      sourceType: "PastFeeRecord",
      sourceId: record._id,
      action: "deleted",
      before,
      after: before,
      user: req.user,
    });

    return ok(res, { message: "Past fee record deleted" });
  } catch (err) {
    next(err);
  }
};

/** Restore a soft-deleted past fee record. */
export const restorePastFeeRecord = async (req, res, next) => {
  try {
    const schoolId = schoolIdMatchValue(req);
    if (!schoolId) return fail(res, 400, "School context missing");

    const record = await PastFeeRecord.findOne({
      _id: req.params.id,
      schoolId,
      isDeleted: true,
    });
    if (!record) return fail(res, 404, "Deleted past fee record not found");

    record.isDeleted = false;
    record.deletedAt = null;
    record.deletedBy = null;
    await record.save();

    await writeFeeAudit({
      schoolId,
      sourceType: "PastFeeRecord",
      sourceId: record._id,
      action: "restored",
      after: record.toObject(),
      user: req.user,
    });

    return ok(res, { message: "Past fee record restored", data: record.toObject() });
  } catch (err) {
    next(err);
  }
};

const roundMoney = (n) => Math.round(Number(n || 0) * 100) / 100;

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

const serializePastFee = (record) => {
  const obj = typeof record.toObject === "function" ? record.toObject() : { ...record };
  return {
    ...obj,
    dueDate: toISODateOnly(obj.dueDate),
    invoiceId: obj.invoiceId || null,
  };
};

const resolveWhatsAppRecipient = (student, recipient) => {
  const target = String(recipient || "").toLowerCase() === "student" ? "student" : "parents";
  if (target === "student") {
    const phone = normalizeWhatsAppPhone(student?.phone);
    return {
      recipient: "student",
      phone,
      used: phone ? "student" : null,
      error: phone ? null : "No valid WhatsApp phone on student",
    };
  }
  const father = normalizeWhatsAppPhone(student?.parents?.father?.phone);
  if (father) {
    return { recipient: "parents", phone: father, used: "father", error: null };
  }
  const mother = normalizeWhatsAppPhone(student?.parents?.mother?.phone);
  if (mother) {
    return { recipient: "parents", phone: mother, used: "mother", error: null };
  }
  return {
    recipient: "parents",
    phone: null,
    used: null,
    error: "No valid WhatsApp phone on parents (father or mother)",
  };
};

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
  if (last?.invoiceNumber) {
    const m = last.invoiceNumber.match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

async function ensureBackDuesFeeType(schoolId) {
  const code = "PASTDUES";
  let feeType = await FeeType.findOne({ schoolId, code });
  if (feeType) return feeType;
  feeType = await FeeType.create({
    schoolId,
    name: "Past Dues",
    code,
    amount: 0,
    period: "One-Time",
    description: "Auto-created for past fee payments recorded from Past Fee Data",
    classIds: [],
    status: "Active",
  });
  return feeType;
}

async function ensurePastFeeInvoice(record, schoolId, user) {
  if (record.invoiceId) {
    const existing = await FeeInvoice.findOne({
      _id: record.invoiceId,
      schoolId,
      isDeleted: { $ne: true },
    });
    if (existing) return existing;
  }

  const linked = await FeeInvoice.findOne({
    schoolId,
    pastFeeRecordId: record._id,
    isDeleted: { $ne: true },
  });
  if (linked) {
    record.invoiceId = linked._id;
    await record.save();
    return linked;
  }

  const feeType = await ensureBackDuesFeeType(schoolId);
  const due = roundMoney(record.dueAmount);
  const paid = roundMoney(record.paidAmount);
  const dueDate = record.dueDate || new Date();
  let status = "Pending";
  if (due > 0 && paid >= due) status = "Paid";
  else if (paid > 0) status = "Partial";

  const invoice = await FeeInvoice.create({
    schoolId,
    invoiceNumber: await getNextInvoiceNumber(schoolId),
    studentId: record.studentId,
    feeTypeId: feeType._id,
    baseAmount: due,
    discountPercent: 0,
    discountAmount: 0,
    amount: due,
    paid,
    status,
    dueDate,
    paidDate: due > 0 && paid >= due ? new Date() : null,
    period: record.session || "",
    remarks: record.remarks || `Past dues — ${record.session || ""}`.trim(),
    isLegacyDue: true,
    pastFeeRecordId: record._id,
  });

  record.invoiceId = invoice._id;
  await record.save();

  await writeFeeAudit({
    schoolId,
    sourceType: "FeeInvoice",
    sourceId: invoice._id,
    action: "created",
    after: invoice.toObject(),
    user,
  });

  return invoice;
}

/** Prepare WhatsApp message for past-fee due balance (student or parents). */
export const preparePastFeeWhatsApp = async (req, res, next) => {
  try {
    const schoolId = schoolIdMatchValue(req);
    if (!schoolId) return fail(res, 400, "School context missing");
    if (!schoolId) return fail(res, 400, "School context missing");

    const record = await PastFeeRecord.findOne({
      _id: req.params.id,
      schoolId,
      isDeleted: { $ne: true },
    });
    if (!record) return fail(res, 404, "Past fee record not found");

    const campusSchoolId = record.schoolId;

    const student = await Student.findOne({ _id: record.studentId, schoolId: campusSchoolId })
      .select("name admissionNumber className section phone parents")
      .lean();
    if (!student) return fail(res, 404, "Student not found");

    const resolved = resolveWhatsAppRecipient(student, req.body?.recipient);
    if (!resolved.phone) {
      return fail(res, 400, resolved.error || "No valid WhatsApp phone found");
    }

    const school = await School.findById(campusSchoolId).select("name").lean();
    const schoolName = school?.name || "School";
    const classSection =
      [record.className || student.className, record.section || student.section]
        .filter(Boolean)
        .join("-") || "—";
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const status =
      Number(record.balance) <= 0
        ? "Paid"
        : Number(record.paidAmount) > 0
          ? "Partial"
          : record.dueDate && new Date(record.dueDate) < todayStart
            ? "Overdue"
            : "Due";

    const greeting =
      resolved.recipient === "student"
        ? `Dear ${student.name || record.studentName || "Student"},`
        : "Dear Parent/Guardian,";

    const message = [
      `*Past Fee Dues — ${schoolName}*`,
      "",
      greeting,
      "",
      resolved.recipient === "student"
        ? "Please find your pending past fee details below."
        : `Please find the pending past fee details for *${student.name || record.studentName || "Student"}*.`,
      "",
      `*Admission No:* ${record.admissionNumber || student.admissionNumber || "—"}`,
      `*Class:* ${classSection}`,
      `*Session:* ${record.session || "—"}`,
      `*Due Amount:* ${formatInrPlain(record.dueAmount)}`,
      `*Paid:* ${formatInrPlain(record.paidAmount)}`,
      `*Balance Due:* ${formatInrPlain(record.balance)}`,
      `*Status:* ${status}`,
      `*Due Date:* ${formatDueDateLong(record.dueDate)}`,
      record.remarks ? `*Remarks:* ${record.remarks}` : null,
      "",
      "Kindly clear the outstanding balance at the earliest.",
      "",
      "Thank you.",
    ]
      .filter((line) => line !== null)
      .join("\n");

    const waUrl = `https://web.whatsapp.com/send?phone=${resolved.phone}&text=${encodeURIComponent(message)}`;

    return ok(res, {
      message: "WhatsApp share prepared",
      data: {
        phone: resolved.phone,
        message,
        studentName: student.name || record.studentName,
        recipient: resolved.recipient,
        recipientUsed: resolved.used,
        waUrl,
      },
    });
  } catch (err) {
    next(err);
  }
};

/** Record a payment on a past-fee row and create/update the linked fee invoice. */
export const recordPastFeePayment = async (req, res, next) => {
  try {
    const schoolId = schoolIdMatchValue(req);
    if (!schoolId) return fail(res, 400, "School context missing");

    const record = await PastFeeRecord.findOne({
      _id: req.params.id,
      schoolId,
      isDeleted: { $ne: true },
    });
    if (!record) return fail(res, 404, "Past fee record not found");

    const campusSchoolId = record.schoolId;
    const { amount, method, receiptNumber, chequeNumber, bankRef, paymentDate, remarks } =
      req.body || {};
    if (amount == null || !method) {
      return fail(res, 400, "amount and method are required");
    }
    const validMethods = ["Cash", "Cheque", "Bank Transfer", "UPI"];
    if (!validMethods.includes(method)) {
      return fail(res, 400, "method must be one of: " + validMethods.join(", "));
    }
    const payAmount = roundMoney(amount);
    if (payAmount <= 0) return fail(res, 400, "Amount must be greater than 0");

    const balance = roundMoney(record.balance);
    if (balance <= 0) return fail(res, 400, "This past fee record is already fully paid");
    if (payAmount > balance) {
      return fail(res, 400, `Amount exceeds balance of ₹${balance}`);
    }

    const before = record.toObject();
    const invoice = await ensurePastFeeInvoice(record, campusSchoolId, req.user);

    const invoiceBalance = roundMoney((invoice.amount || 0) - (invoice.paid || 0));
    if (payAmount > invoiceBalance && invoiceBalance >= 0) {
      // Keep invoice in sync if past-fee balance is the source of truth
      invoice.amount = roundMoney(record.dueAmount);
      invoice.baseAmount = roundMoney(record.dueAmount);
      invoice.paid = roundMoney(record.paidAmount);
    }

    const date = paymentDate ? new Date(paymentDate) : new Date();
    const payment = await Payment.create({
      schoolId: campusSchoolId,
      invoiceId: invoice._id,
      studentId: record.studentId,
      amount: payAmount,
      method,
      receiptNumber: receiptNumber ? String(receiptNumber).trim() : "",
      chequeNumber: chequeNumber ? String(chequeNumber).trim() : "",
      bankRef: bankRef ? String(bankRef).trim() : "",
      paymentDate: date,
      receivedBy: req.user._id,
      remarks: remarks ? String(remarks).trim() : "",
    });

    invoice.paid = roundMoney((Number(invoice.paid) || 0) + payAmount);
    const payable = roundMoney(invoice.amount);
    const paidTotal = roundMoney(invoice.paid);
    if (payable > 0 && paidTotal >= payable) {
      invoice.status = "Paid";
      invoice.paidDate = new Date();
    } else if (payable > 0 && paidTotal > 0) {
      invoice.status = "Partial";
    }
    await invoice.save();

    record.paidAmount = roundMoney((Number(record.paidAmount) || 0) + payAmount);
    record.balance = Math.max(0, roundMoney(record.dueAmount) - record.paidAmount);
    record.invoiceId = invoice._id;
    await record.save();

    await writeFeeAudit({
      schoolId: campusSchoolId,
      sourceType: "PastFeeRecord",
      sourceId: record._id,
      action: "updated",
      before,
      after: record.toObject(),
      changes: diffTrackedFields(before, record.toObject(), TRACKED_PAST_FEE_FIELDS),
      user: req.user,
    });

    const invPopulated = await FeeInvoice.findById(invoice._id)
      .populate("studentId", "name admissionNumber className section rollNumber")
      .populate("feeTypeId", "name code");

    return res.status(201).json({
      success: true,
      message: "Payment recorded and fee invoice updated",
      data: {
        record: serializePastFee(record),
        invoice: invPopulated,
        payment: await Payment.findById(payment._id).populate("receivedBy", "name"),
      },
    });
  } catch (err) {
    next(err);
  }
};

