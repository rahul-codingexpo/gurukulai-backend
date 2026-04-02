import InventoryExpense from "./inventoryExpense.model.js";

const roleNameOf = (req) => req.user?.roleId?.name;

const resolveSchoolId = (req) => {
  const role = roleNameOf(req);
  if (role === "SuperAdmin") {
    return req.query.schoolId || req.body.schoolId || req.params.schoolId || null;
  }
  return req.user?.schoolId ?? null;
};

const toISODateOnly = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const parseDateOnly = (value) => {
  if (!value) return null;
  const s = String(value).trim();
  // Expect YYYY-MM-DD from <input type="date" />
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const dt = new Date(`${s}T00:00:00.000Z`);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const ok = (res, payload = {}) => res.json({ success: true, ...payload });

const fail = (res, status, message, extra = undefined) =>
  res.status(status).json({
    success: false,
    message,
    ...(extra ? extra : {}),
  });

const validateExpenseInput = (payload) => {
  const errors = {};

  const expenseType = String(payload.expenseType || "").trim();
  if (!expenseType) errors.expenseType = "expenseType is required";

  const parsedDate = parseDateOnly(payload.date);
  if (!parsedDate) errors.date = "date must be a valid date (YYYY-MM-DD)";

  const amountNum = Number(payload.amount);
  if (payload.amount === undefined || payload.amount === null || payload.amount === "") {
    errors.amount = "amount is required";
  } else if (Number.isNaN(amountNum)) {
    errors.amount = "amount must be a number";
  } else if (!(amountNum > 0)) {
    errors.amount = "amount must be > 0";
  }

  const personName = String(payload.personName || "").trim();
  if (!personName) errors.personName = "personName is required";

  const notes = payload.notes === undefined ? "" : String(payload.notes);

  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    parsed: {
      expenseType,
      date: parsedDate,
      amount: amountNum,
      personName,
      notes,
    },
    errors,
  };
};

/** POST /api/inventory/expenses */
export const createInventoryExpense = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return fail(res, 400, "School context missing");
    }

    const { expenseType, date, amount, personName, notes } = req.body || {};

    const { valid, parsed, errors } = validateExpenseInput({
      expenseType,
      date,
      amount,
      personName,
      notes,
    });

    if (!valid) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    const created = await InventoryExpense.create({
      ...parsed,
      schoolId,
      createdBy: req.user?._id,
    });

    const populated = await created.populate({
      path: "createdBy",
      select: "_id name",
    });

    return res.status(201).json({
      success: true,
      message: "Expense created successfully",
      data: {
        _id: populated._id,
        schoolId: populated.schoolId,
        expenseType: populated.expenseType,
        date: toISODateOnly(populated.date),
        amount: populated.amount,
        personName: populated.personName,
        notes: populated.notes,
        createdBy: populated.createdBy
          ? { _id: populated.createdBy._id, name: populated.createdBy.name }
          : null,
        createdAt: populated.createdAt,
        updatedAt: populated.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

/** GET /api/inventory/expenses */
export const listInventoryExpenses = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return fail(res, 400, "School context missing");
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limitRaw = Number(req.query.limit) || 25;
    const limit = Math.max(1, Math.min(100, limitRaw));

    const expenseType = req.query.expenseType
      ? String(req.query.expenseType).trim()
      : null;

    const fromDt = req.query.fromDate
      ? parseDateOnly(req.query.fromDate)
      : null;
    const toDt = req.query.toDate ? parseDateOnly(req.query.toDate) : null;

    if (req.query.fromDate && !fromDt) {
      return fail(res, 400, "fromDate must be a valid date (YYYY-MM-DD)");
    }
    if (req.query.toDate && !toDt) {
      return fail(res, 400, "toDate must be a valid date (YYYY-MM-DD)");
    }

    const query = { schoolId };
    if (expenseType) query.expenseType = expenseType;
    if (fromDt || toDt) {
      query.date = {};
      if (fromDt) query.date.$gte = fromDt;
      if (toDt) query.date.$lte = toDt;
    }

    const [total, items] = await Promise.all([
      InventoryExpense.countDocuments(query),
      InventoryExpense.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return ok(res, {
      data: {
        items: items.map((i) => ({
          _id: i._id,
          date: toISODateOnly(i.date),
          expenseType: i.expenseType,
          amount: i.amount,
          personName: i.personName,
          notes: i.notes,
          createdAt: i.createdAt,
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

/** PUT /api/inventory/expenses/:expenseId */
export const updateInventoryExpense = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return fail(res, 400, "School context missing");
    }

    const { expenseType, date, amount, personName, notes } = req.body || {};

    const { valid, parsed, errors } = validateExpenseInput({
      expenseType,
      date,
      amount,
      personName,
      notes,
    });

    if (!valid) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    const updated = await InventoryExpense.findOneAndUpdate(
      { _id: req.params.expenseId, schoolId },
      { ...parsed },
      { new: true },
    );

    if (!updated) {
      return fail(res, 404, "Expense not found");
    }

    return ok(res, {
      message: "Expense updated successfully",
      data: {
        _id: updated._id,
        expenseType: updated.expenseType,
        date: toISODateOnly(updated.date),
        amount: updated.amount,
        personName: updated.personName,
        notes: updated.notes,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/inventory/expenses/:expenseId */
export const deleteInventoryExpense = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return fail(res, 400, "School context missing");
    }

    const deleted = await InventoryExpense.findOneAndDelete({
      _id: req.params.expenseId,
      schoolId,
    });

    if (!deleted) {
      return fail(res, 404, "Expense not found");
    }

    return ok(res, { message: "Expense deleted successfully" });
  } catch (err) {
    next(err);
  }
};

