import mongoose from "mongoose";
import FeeAuditLog from "./feeAuditLog.model.js";
import FeeInvoice from "../feeInvoice.model.js";
import PastFeeRecord from "../pastFees/pastFeeRecord.model.js";
import Payment from "../payment.model.js";
import User from "../../user/user.model.js";
import { comparePassword } from "../../../utils/hash.js";

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

/**
 * POST /accounting/fee-audit/permanent-delete
 * Body: { items: [{ sourceType, sourceId }], password }
 * Hard-deletes FeeInvoice / PastFeeRecord and all related audit logs (and invoice payments).
 */
export const permanentlyDeleteFeeSources = async (req, res, next) => {
  try {
    const schoolId = req.schoolId;
    if (!schoolId) {
      return fail(
        res,
        400,
        req.user?.roleId?.name === "SuperAdmin"
          ? "Select a school to permanently delete fee data"
          : "School context missing",
      );
    }

    const { password } = req.body || {};
    if (!password || !String(password).trim()) {
      return fail(res, 400, "Password is required to confirm permanent delete");
    }

    const userWithPass = await User.findById(req.user._id).select("+password");
    if (!userWithPass?.password) {
      return fail(res, 401, "Unable to verify password");
    }
    const match = await comparePassword(String(password), userWithPass.password);
    if (!match) {
      return fail(res, 401, "Incorrect password");
    }

    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!rawItems.length) {
      return fail(res, 400, "items array is required");
    }

    const unique = new Map();
    for (const item of rawItems) {
      const sourceType = String(item?.sourceType || "");
      const sourceId = String(item?.sourceId || "");
      if (!ALLOWED_SOURCE_TYPES.includes(sourceType)) continue;
      if (!mongoose.Types.ObjectId.isValid(sourceId)) continue;
      unique.set(`${sourceType}:${sourceId}`, { sourceType, sourceId });
    }

    if (!unique.size) {
      return fail(res, 400, "No valid fee records selected");
    }

    let deletedInvoices = 0;
    let deletedPastFees = 0;
    let deletedAuditLogs = 0;
    let deletedPayments = 0;

    for (const { sourceType, sourceId } of unique.values()) {
      if (sourceType === "FeeInvoice") {
        // eslint-disable-next-line no-await-in-loop
        const inv = await FeeInvoice.findOne({ _id: sourceId, schoolId }).select("_id");
        if (inv) {
          // eslint-disable-next-line no-await-in-loop
          const payResult = await Payment.deleteMany({
            invoiceId: sourceId,
            schoolId,
          });
          deletedPayments += payResult.deletedCount || 0;
          // eslint-disable-next-line no-await-in-loop
          await FeeInvoice.deleteOne({ _id: sourceId, schoolId });
          deletedInvoices += 1;
        }
      } else if (sourceType === "PastFeeRecord") {
        // eslint-disable-next-line no-await-in-loop
        const past = await PastFeeRecord.findOne({ _id: sourceId, schoolId }).select("_id");
        if (past) {
          // eslint-disable-next-line no-await-in-loop
          await PastFeeRecord.deleteOne({ _id: sourceId, schoolId });
          deletedPastFees += 1;
        }
      }

      // eslint-disable-next-line no-await-in-loop
      const auditResult = await FeeAuditLog.deleteMany({
        schoolId,
        sourceType,
        sourceId,
      });
      deletedAuditLogs += auditResult.deletedCount || 0;
    }

    return ok(res, {
      data: {
        requested: unique.size,
        deletedInvoices,
        deletedPastFees,
        deletedPayments,
        deletedAuditLogs,
      },
      message: `Permanently deleted ${unique.size} fee record(s)`,
    });
  } catch (err) {
    next(err);
  }
};
