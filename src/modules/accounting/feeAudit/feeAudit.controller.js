import mongoose from "mongoose";
import FeeAuditLog from "./feeAuditLog.model.js";
import FeeInvoice from "../feeInvoice.model.js";
import PastFeeRecord from "../pastFees/pastFeeRecord.model.js";

const ok = (res, payload) => res.json({ success: true, ...payload });
const fail = (res, status, message) =>
  res.status(status).json({ success: false, message });

const ALLOWED_SOURCE_TYPES = ["FeeInvoice", "PastFeeRecord"];
const ALLOWED_ACTIONS = ["created", "updated", "deleted", "restored"];

/**
 * GET /accounting/fee-audit
 * Filters: sourceType, action, fromDate, toDate, search (student name / admission), page, limit
 * Scoped by school. SuperAdmin must pass `schoolId` (handled by injectSchool).
 */
export const listFeeAuditLogs = async (req, res, next) => {
  try {
    const schoolId = req.schoolId;
    if (!schoolId) {
      return fail(
        res,
        400,
        req.user?.roleId?.name === "SuperAdmin"
          ? "Select a school to view fee history"
          : "School context missing",
      );
    }

    const {
      sourceType,
      action,
      fromDate,
      toDate,
      search,
      page = 1,
      limit = 25,
    } = req.query || {};

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(100, Number(limit) || 25));

    const filter = { schoolId };
    if (sourceType && ALLOWED_SOURCE_TYPES.includes(sourceType)) {
      filter.sourceType = sourceType;
    }
    if (action && ALLOWED_ACTIONS.includes(action)) {
      filter.action = action;
    }
    if (fromDate || toDate) {
      filter.performedAt = {};
      if (fromDate) filter.performedAt.$gte = new Date(fromDate);
      if (toDate) filter.performedAt.$lte = new Date(toDate);
    }

    if (search && String(search).trim()) {
      const rx = new RegExp(
        String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      filter.$or = [
        { "studentRef.studentName": rx },
        { "studentRef.admissionNumber": rx },
        { summary: rx },
      ];
    }

    const [total, items] = await Promise.all([
      FeeAuditLog.countDocuments(filter),
      FeeAuditLog.find(filter)
        .sort({ performedAt: -1, _id: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    // Determine which sourceIds are currently soft-deleted, so the UI can show "Restore".
    const invoiceIds = items
      .filter((x) => x.sourceType === "FeeInvoice")
      .map((x) => x.sourceId);
    const pastFeeIds = items
      .filter((x) => x.sourceType === "PastFeeRecord")
      .map((x) => x.sourceId);

    const [deletedInvoices, deletedPastFees] = await Promise.all([
      invoiceIds.length
        ? FeeInvoice.find({ _id: { $in: invoiceIds }, schoolId })
            .select("_id isDeleted")
            .lean()
        : [],
      pastFeeIds.length
        ? PastFeeRecord.find({ _id: { $in: pastFeeIds }, schoolId })
            .select("_id isDeleted")
            .lean()
        : [],
    ]);

    const deletedMap = new Map();
    for (const d of deletedInvoices) {
      deletedMap.set(`FeeInvoice:${d._id}`, !!d.isDeleted);
    }
    for (const d of deletedPastFees) {
      deletedMap.set(`PastFeeRecord:${d._id}`, !!d.isDeleted);
    }

    const enriched = items.map((it) => ({
      ...it,
      currentlyDeleted: deletedMap.get(`${it.sourceType}:${it.sourceId}`) === true,
    }));

    return ok(res, {
      data: {
        items: enriched,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /accounting/fee-audit/:sourceType/:sourceId
 * Returns the full timeline for a specific record + the original snapshot, latest snapshot,
 * and current live state (so the UI can show "Original / Edits / Latest / Deleted/Restored").
 */
export const getFeeAuditTimeline = async (req, res, next) => {
  try {
    const schoolId = req.schoolId;
    if (!schoolId) {
      return fail(
        res,
        400,
        req.user?.roleId?.name === "SuperAdmin"
          ? "Select a school to view fee history"
          : "School context missing",
      );
    }

    const { sourceType, sourceId } = req.params;
    if (!ALLOWED_SOURCE_TYPES.includes(sourceType)) {
      return fail(res, 400, "Invalid sourceType");
    }
    if (!mongoose.Types.ObjectId.isValid(sourceId)) {
      return fail(res, 400, "Invalid sourceId");
    }

    const events = await FeeAuditLog.find({
      schoolId,
      sourceType,
      sourceId,
    })
      .sort({ performedAt: 1, _id: 1 })
      .lean();

    // Look up live record (may be soft-deleted)
    let live = null;
    if (sourceType === "FeeInvoice") {
      live = await FeeInvoice.findOne({ _id: sourceId, schoolId })
        .populate(
          "studentId",
          "name admissionNumber className section rollNumber phone",
        )
        .populate("feeTypeId", "name code amount period")
        .lean();
    } else if (sourceType === "PastFeeRecord") {
      live = await PastFeeRecord.findOne({ _id: sourceId, schoolId }).lean();
    }

    const original =
      events.find((e) => e.action === "created")?.snapshot || null;
    const latest =
      [...events].reverse().find((e) => e.snapshot)?.snapshot || null;

    return ok(res, {
      data: {
        sourceType,
        sourceId,
        events,
        original,
        latest,
        live,
        currentlyDeleted: !!live?.isDeleted,
      },
    });
  } catch (err) {
    next(err);
  }
};
