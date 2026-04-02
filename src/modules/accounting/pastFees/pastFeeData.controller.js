import XLSX from "xlsx";
import Student from "../../student/student.model.js";
import ClassModel from "../../academic/class.model.js";
import PastFeeImportBatch from "./pastFeeImportBatch.model.js";
import PastFeeRecord from "./pastFeeRecord.model.js";

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

    if (importedDocs.length) {
      await PastFeeRecord.insertMany(importedDocs);
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

export const listPastFeeImports = async (req, res, next) => {
  try {
    const schoolId = req.schoolId;
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
    const schoolId = req.schoolId;
    if (!schoolId) return fail(res, 400, "School context missing");

    const session = req.query.session ? String(req.query.session).trim() : null;
    const section = req.query.section ? String(req.query.section).trim() : null;

    const className = req.query.className
      ? String(req.query.className).trim()
      : null;
    const classId = req.query.classId ? String(req.query.classId).trim() : null;
    const search = req.query.search ? String(req.query.search).trim() : null;

    const status = req.query.status ? String(req.query.status).trim() : null;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));

    let classNameFromClassId = null;
    if (!className && classId) {
      const cls = await ClassModel.findOne({ _id: classId, schoolId }).select("name").lean();
      classNameFromClassId = cls?.name || null;
    }

    const effectiveClassName = className || classNameFromClassId;

    const match = { schoolId };
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
      if (s === "unpaid") return "Unpaid";
      if (s === "partially paid" || s === "partial" || s === "partially") return "Partially Paid";
      if (s === "paid") return "Paid";
      return null;
    })();

    const pipeline = [
      { $match: match },
      {
        $addFields: {
          computedBalance: "$balance",
          computedStatus: {
            $cond: [
              { $eq: ["$balance", 0] },
              "Paid",
              {
                $cond: [
                  { $eq: ["$paidAmount", 0] },
                  "Unpaid",
                  "Partially Paid",
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
    const schoolId = req.schoolId;
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

