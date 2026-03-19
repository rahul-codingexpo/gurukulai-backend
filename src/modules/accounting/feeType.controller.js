import FeeType from "./feeType.model.js";
import FeeInvoice from "./feeInvoice.model.js";

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

/** Create fee type — Admin, Principal, Accountant */
export const createFeeType = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const { name, code, amount, period, description, icon } = req.body || {};
    if (!name || !code || amount == null || !period) {
      return res.status(400).json({
        success: false,
        message: "name, code, amount and period are required",
      });
    }
    if (amount <= 0 || amount > 1000000) {
      return res.status(400).json({
        success: false,
        message: "amount must be greater than 0 and at most 10,00,000",
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
    const feeType = await FeeType.create({
      schoolId: req.schoolId,
      name: String(name).trim(),
      code: String(code).trim().toUpperCase(),
      amount: Number(amount),
      period,
      description: description ? String(description).trim() : "",
      icon: icon ? String(icon).trim() : "",
      status: "Active",
    });
    res.status(201).json({ success: true, data: feeType });
  } catch (error) {
    next(error);
  }
};

/** List fee types — Admin, Principal, Accountant, Teacher, SuperAdmin */
export const getFeeTypes = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const { status, search } = req.query;
    const filter = { schoolId: req.schoolId };
    if (status) filter.status = status;
    if (search && String(search).trim()) {
      const s = String(search).trim();
      filter.$or = [
        { name: new RegExp(s, "i") },
        { code: new RegExp(s, "i") },
      ];
    }
    const data = await FeeType.find(filter).sort({ name: 1 });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/** Get single fee type */
export const getFeeTypeById = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const feeType = await FeeType.findOne({
      _id: req.params.id,
      schoolId: req.schoolId,
    });
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
    const { name, code, amount, period, description, icon, status } = req.body || {};
    const feeType = await FeeType.findOne({
      _id: req.params.id,
      schoolId: req.schoolId,
    });
    if (!feeType) {
      return res.status(404).json({ success: false, message: "Fee type not found" });
    }
    if (name !== undefined) feeType.name = String(name).trim();
    if (code !== undefined) feeType.code = String(code).trim().toUpperCase();
    if (amount !== undefined) feeType.amount = Number(amount);
    if (period !== undefined) feeType.period = period;
    if (description !== undefined) feeType.description = String(description).trim();
    if (icon !== undefined) feeType.icon = String(icon).trim();
    if (status !== undefined) feeType.status = status;
    await feeType.save();
    res.json({ success: true, data: feeType });
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
      schoolId: req.schoolId,
    });
    if (count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: ${count} invoice(s) use this fee type. Set status to Inactive instead.`,
      });
    }
    const deleted = await FeeType.findOneAndDelete({
      _id: req.params.id,
      schoolId: req.schoolId,
    });
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Fee type not found" });
    }
    res.json({ success: true, message: "Fee type deleted" });
  } catch (error) {
    next(error);
  }
};
