import FeeType from "./feeType.model.js";
import FeeInvoice from "./feeInvoice.model.js";
import ClassModel from "../academic/class.model.js";
import { schoolIdFilter, schoolIdMatchValue } from "../../utils/branchScope.util.js";

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

const normalizeClassIds = async (schoolId, classIds) => {
  if (classIds == null) return [];
  const raw = Array.isArray(classIds) ? classIds : [classIds];
  const ids = [...new Set(raw.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return [];

  const found = await ClassModel.find({
    schoolId,
    _id: { $in: ids },
  })
    .select("_id")
    .lean();

  if (found.length !== ids.length) {
    const err = new Error("One or more classIds are invalid for this school");
    err.statusCode = 400;
    throw err;
  }
  return found.map((c) => c._id);
};

const populateFeeType = (q) =>
  q.populate("classIds", "name sessionId");

/** Create fee type — Admin, Principal, Accountant */
export const createFeeType = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const { name, code, amount, period, description, icon, classIds } = req.body || {};
    if (!name || !code || amount == null || !period) {
      return res.status(400).json({
        success: false,
        message: "name, code, amount and period are required",
      });
    }
    if (Number(amount) < 0 || Number(amount) > 1000000) {
      return res.status(400).json({
        success: false,
        message: "amount must be between 0 and 10,00,000",
      });
    }
    const validPeriods = ["Monthly", "Quarterly", "Half-Yearly", "Yearly", "One-Time"];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        message: "period must be one of: " + validPeriods.join(", "),
      });
    }
    const existing = await FeeType.findOne({
      schoolId: req.schoolId,
      code: String(code).trim().toUpperCase(),
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Fee type with code '${existing.code}' already exists in this school`,
      });
    }

    let normalizedClassIds = [];
    try {
      normalizedClassIds = await normalizeClassIds(req.schoolId, classIds);
    } catch (e) {
      return res.status(e.statusCode || 400).json({
        success: false,
        message: e.message || "Invalid classIds",
      });
    }

    const feeType = await FeeType.create({
      schoolId: req.schoolId,
      name: String(name).trim(),
      code: String(code).trim().toUpperCase(),
      amount: Number(amount),
      period,
      description: description ? String(description).trim() : "",
      icon: icon ? String(icon).trim() : "",
      classIds: normalizedClassIds,
      status: "Active",
    });
    const populated = await populateFeeType(FeeType.findById(feeType._id));
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

/** List fee types — Admin, Principal, Accountant, Teacher, SuperAdmin */
export const getFeeTypes = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const { status, search, classId, className } = req.query;
    const filter = { ...schoolIdFilter(req) };
    if (status) filter.status = status;
    if (search && String(search).trim()) {
      const s = String(search).trim();
      filter.$or = [
        { name: new RegExp(s, "i") },
        { code: new RegExp(s, "i") },
      ];
    }

    // When filtering by class: include fee types for that class OR all-classes (empty classIds)
    if (classId) {
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { classIds: { $size: 0 } },
            { classIds: classId },
            { classIds: { $exists: false } },
          ],
        },
      ];
    } else if (className && String(className).trim()) {
      const classes = await ClassModel.find({
        schoolId: schoolIdMatchValue(req),
        name: String(className).trim(),
      })
        .select("_id")
        .lean();
      const ids = classes.map((c) => c._id);
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { classIds: { $size: 0 } },
            { classIds: { $exists: false } },
            ...(ids.length ? [{ classIds: { $in: ids } }] : []),
          ],
        },
      ];
    }

    const data = await populateFeeType(FeeType.find(filter).sort({ name: 1 }));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/** Get single fee type */
export const getFeeTypeById = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const feeType = await populateFeeType(
      FeeType.findOne({
        _id: req.params.id,
        ...schoolIdFilter(req),
      }),
    );
    if (!feeType) {
      return res.status(404).json({ success: false, message: "Fee type not found" });
    }
    res.json({ success: true, data: feeType });
  } catch (error) {
    next(error);
  }
};

/** Update fee type */
export const updateFeeType = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const { name, code, amount, period, description, icon, status, classIds } = req.body || {};
    const feeType = await FeeType.findOne({
      _id: req.params.id,
      ...schoolIdFilter(req),
    });
    if (!feeType) {
      return res.status(404).json({ success: false, message: "Fee type not found" });
    }
    if (name !== undefined) feeType.name = String(name).trim();
    if (code !== undefined) feeType.code = String(code).trim().toUpperCase();
    if (amount !== undefined) {
      const amountNum = Number(amount);
      if (Number.isNaN(amountNum) || amountNum < 0 || amountNum > 1000000) {
        return res.status(400).json({
          success: false,
          message: "amount must be between 0 and 10,00,000",
        });
      }
      feeType.amount = amountNum;
    }
    if (period !== undefined) feeType.period = period;
    if (description !== undefined) feeType.description = String(description).trim();
    if (icon !== undefined) feeType.icon = String(icon).trim();
    if (status !== undefined) feeType.status = status;
    if (classIds !== undefined) {
      try {
        feeType.classIds = await normalizeClassIds(feeType.schoolId, classIds);
      } catch (e) {
        return res.status(e.statusCode || 400).json({
          success: false,
          message: e.message || "Invalid classIds",
        });
      }
    }
    await feeType.save();
    const populated = await populateFeeType(FeeType.findById(feeType._id));
    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

/** Delete fee type — Admin, Principal only. Block if invoices use it. */
export const deleteFeeType = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const count = await FeeInvoice.countDocuments({
      feeTypeId: req.params.id,
      ...schoolIdFilter(req),
    });
    if (count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: ${count} invoice(s) use this fee type. Set status to Inactive instead.`,
      });
    }
    const deleted = await FeeType.findOneAndDelete({
      _id: req.params.id,
      ...schoolIdFilter(req),
    });
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Fee type not found" });
    }
    res.json({ success: true, message: "Fee type deleted" });
  } catch (error) {
    next(error);
  }
};
