import SalarySlip from "./salarySlip.model.js";
import SalaryPayment from "./salaryPayment.model.js";
import Staff from "../staff/staff.model.js";
import School from "../school/school.model.js";
import StaffAttendance from "../attendance/staffAttendance.model.js";
import { normalizeWhatsAppPhone } from "../../utils/phone.util.js";

/** Daily salary is monthly salary divided by 30 (₹30,000 → ₹1,000 per day). */
const SALARY_MONTH_DAYS = 30;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const roundMoney = (n) => Math.round((Number(n) || 0) * 100) / 100;

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

const periodLabelOf = (month, year) => `${MONTH_NAMES[month - 1] || month} ${year}`;

const monthDateRange = (year, month) => {
  const start = new Date(year, month - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month, 1);
  end.setHours(0, 0, 0, 0);
  return { start, end };
};

/**
 * Payable = monthly salary − (absent days × daily salary).
 * Daily salary = monthly salary / 30. Unmarked days are not treated as absent.
 */
const calculateAttendancePay = (monthlySalary, presentDays, absentDays) => {
  const monthly = roundMoney(monthlySalary);
  const present = Math.max(0, Number(presentDays) || 0);
  const absent = Math.max(0, Number(absentDays) || 0);
  const attendanceDeduction = roundMoney(
    Math.min(monthly, (monthly / SALARY_MONTH_DAYS) * absent),
  );
  return {
    monthlySalary: monthly,
    salaryDays: SALARY_MONTH_DAYS,
    dailySalary: roundMoney(monthly / SALARY_MONTH_DAYS),
    presentDays: present,
    absentDays: absent,
    attendanceDeduction,
    payable: roundMoney(Math.max(0, monthly - attendanceDeduction)),
  };
};

const attendanceCountsForMonth = async (schoolId, staffIds, month, year) => {
  const counts = new Map();
  staffIds.forEach((id) => {
    counts.set(String(id), { presentDays: 0, absentDays: 0 });
  });
  if (!staffIds.length) return counts;
  const { start, end } = monthDateRange(year, month);
  const records = await StaffAttendance.find({
    schoolId,
    staffId: { $in: staffIds },
    date: { $gte: start, $lt: end },
  })
    .select("staffId status")
    .lean();
  records.forEach((row) => {
    const key = String(row.staffId);
    if (!counts.has(key)) counts.set(key, { presentDays: 0, absentDays: 0 });
    const bucket = counts.get(key);
    if (row.status === "Absent") bucket.absentDays += 1;
    else bucket.presentDays += 1;
  });
  return counts;
};

const getNextSlipNumber = async (schoolId, year, month) => {
  const prefix = `SAL-${year}-${String(month).padStart(2, "0")}-`;
  const latest = await SalarySlip.findOne({
    schoolId,
    slipNumber: new RegExp(`^${prefix}`),
  })
    .sort({ slipNumber: -1 })
    .select("slipNumber")
    .lean();
  const last = latest?.slipNumber ? Number(String(latest.slipNumber).replace(prefix, "")) : 0;
  const next = Number.isFinite(last) ? last + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
};

const populateSlip = (q) =>
  q.populate("staffId", "name designation salary phone email status");

const displayStatus = (status) => (status === "Pending" ? "Unpaid" : status);

const withDisplayStatus = (slip) => {
  if (!slip) return slip;
  return { ...slip, status: displayStatus(slip.status) };
};

const formatInrPlain = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const getPayrollDashboard = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const slips = await SalarySlip.find({ schoolId: req.schoolId }).lean();
    const totalNet = slips.reduce((s, row) => s + Number(row.netAmount || 0), 0);
    const totalPaid = slips.reduce((s, row) => s + Number(row.paid || 0), 0);
    const pendingAmount = Math.max(0, totalNet - totalPaid);
    res.json({
      success: true,
      data: {
        totalSlips: slips.length,
        totalNet: roundMoney(totalNet),
        totalPaid: roundMoney(totalPaid),
        pendingAmount: roundMoney(pendingAmount),
        unpaidCount: slips.filter((row) => ["Unpaid", "Pending"].includes(row.status)).length,
        pendingCount: slips.filter((row) => ["Unpaid", "Pending"].includes(row.status)).length,
        partialCount: slips.filter((row) => row.status === "Partial").length,
        paidCount: slips.filter((row) => row.status === "Paid").length,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const listSalarySlips = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const {
      status,
      staffId,
      month,
      year,
      search,
      page = 1,
      limit = 50,
    } = req.query;
    const filter = { schoolId: req.schoolId };
    if (status === "Unpaid" || status === "Pending") {
      filter.status = { $in: ["Unpaid", "Pending"] };
    } else if (status) {
      filter.status = status;
    }
    if (staffId) filter.staffId = staffId;
    if (month) filter.periodMonth = Number(month);
    if (year) filter.periodYear = Number(year);
    if (search && String(search).trim()) {
      const rx = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ staffName: rx }, { slipNumber: rx }, { designation: rx }];
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const total = await SalarySlip.countDocuments(filter);
    const slips = await populateSlip(
      SalarySlip.find(filter)
        .sort({ periodYear: -1, periodMonth: -1, createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
    ).lean();
    res.json({
      success: true,
      data: {
        slips: slips.map(withDisplayStatus),
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getSalarySlipById = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const slip = await populateSlip(
      SalarySlip.findOne({ _id: req.params.id, schoolId: req.schoolId }),
    ).lean();
    if (!slip) {
      return res.status(404).json({ success: false, message: "Salary slip not found" });
    }
    const payments = await SalaryPayment.find({
      schoolId: req.schoolId,
      salarySlipId: slip._id,
    })
      .populate("paidBy", "name")
      .sort({ paymentDate: 1, createdAt: 1 })
      .lean();
    res.json({ success: true, data: { slip: withDisplayStatus(slip), payments } });
  } catch (error) {
    next(error);
  }
};

export const getAttendanceSalarySummary = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const month = Number(req.query?.month);
    const year = Number(req.query?.year);
    if (!month || month < 1 || month > 12 || !year) {
      return res.status(400).json({ success: false, message: "Valid month and year are required" });
    }
    const staffList = await Staff.find({ schoolId: req.schoolId, status: "ACTIVE" })
      .select("name designation salary")
      .lean();
    const counts = await attendanceCountsForMonth(
      req.schoolId,
      staffList.map((staff) => staff._id),
      month,
      year,
    );
    const staff = staffList.map((row) => {
      const attendance = counts.get(String(row._id)) || { presentDays: 0, absentDays: 0 };
      const pay = calculateAttendancePay(row.salary || 0, attendance.presentDays, attendance.absentDays);
      return {
        staffId: row._id,
        name: row.name,
        designation: row.designation || "",
        ...pay,
      };
    });
    res.json({
      success: true,
      data: {
        month,
        year,
        salaryDays: SALARY_MONTH_DAYS,
        staff,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const generateMonthlySalaries = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const month = Number(req.body?.month);
    const year = Number(req.body?.year);
    if (!month || month < 1 || month > 12 || !year) {
      return res.status(400).json({ success: false, message: "Valid month and year are required" });
    }
    const staffIds = Array.isArray(req.body?.staffIds)
      ? [...new Set(req.body.staffIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : [];
    const staffFilter = { schoolId: req.schoolId, status: "ACTIVE" };
    if (staffIds.length) staffFilter._id = { $in: staffIds };
    const staffList = await Staff.find(staffFilter).lean();
    if (!staffList.length) {
      return res.status(400).json({
        success: false,
        message: staffIds.length
          ? "No matching active teachers found"
          : "No active staff found",
      });
    }

    const salaryByStaffId = new Map();
    const rawSalaries = req.body?.staffSalaries;
    if (Array.isArray(rawSalaries)) {
      rawSalaries.forEach((row) => {
        const id = String(row?.staffId || "").trim();
        if (!id) return;
        salaryByStaffId.set(id, roundMoney(row.amount));
      });
    } else if (rawSalaries && typeof rawSalaries === "object") {
      Object.entries(rawSalaries).forEach(([id, amount]) => {
        salaryByStaffId.set(String(id), roundMoney(amount));
      });
    }

    const existing = await SalarySlip.find({
      schoolId: req.schoolId,
      periodMonth: month,
      periodYear: year,
    })
      .select("staffId")
      .lean();
    const existingIds = new Set(existing.map((row) => String(row.staffId)));
    const dueDate = req.body?.dueDate ? new Date(req.body.dueDate) : new Date(year, month, 0);
    const created = [];
    const skipped = [];
    const attendanceByStaff = await attendanceCountsForMonth(
      req.schoolId,
      staffList.map((staff) => staff._id),
      month,
      year,
    );

    for (const staff of staffList) {
      if (existingIds.has(String(staff._id))) {
        skipped.push({ staffId: staff._id, name: staff.name, reason: "Already generated" });
        continue;
      }
      const staffKey = String(staff._id);
      const manualAmount = salaryByStaffId.has(staffKey) ? salaryByStaffId.get(staffKey) : null;
      const monthlySalary = roundMoney(
        manualAmount != null && Number.isFinite(manualAmount) ? manualAmount : staff.salary || 0,
      );
      if (monthlySalary <= 0) {
        skipped.push({ staffId: staff._id, name: staff.name, reason: "Salary amount is required" });
        continue;
      }
      const attendance = attendanceByStaff.get(staffKey) || { presentDays: 0, absentDays: 0 };
      const pay = calculateAttendancePay(monthlySalary, attendance.presentDays, attendance.absentDays);
      const allowances = roundMoney(req.body?.allowances || 0);
      const extraDeductions = roundMoney(req.body?.deductions || 0);
      const slip = await SalarySlip.create({
        schoolId: req.schoolId,
        slipNumber: await getNextSlipNumber(req.schoolId, year, month),
        staffId: staff._id,
        staffName: staff.name,
        designation: staff.designation || "",
        periodMonth: month,
        periodYear: year,
        periodLabel: periodLabelOf(month, year),
        baseSalary: pay.monthlySalary,
        monthlySalary: pay.monthlySalary,
        salaryDays: pay.salaryDays,
        dailySalary: pay.dailySalary,
        presentDays: pay.presentDays,
        absentDays: pay.absentDays,
        attendanceDeduction: pay.attendanceDeduction,
        allowances,
        deductions: roundMoney(pay.attendanceDeduction + extraDeductions),
        dueDate,
        remarks: req.body?.remarks ? String(req.body.remarks).trim() : "",
        generatedBy: req.user?._id || null,
      });
      created.push(slip);
    }

    if (!created.length) {
      return res.status(400).json({
        success: false,
        message: skipped.length
          ? "No new salary slips generated. Enter a salary amount for each selected teacher, or they may already have a slip for this month."
          : "No salary slips generated",
        data: { created: 0, skipped: skipped.length, skippedStaff: skipped },
      });
    }

    res.status(201).json({
      success: true,
      data: {
        created: created.length,
        skipped: skipped.length,
        slips: created.map((row) => withDisplayStatus(row.toObject ? row.toObject() : row)),
        skippedStaff: skipped,
      },
      message: `Generated ${created.length} salary slip(s) for ${periodLabelOf(month, year)}`,
    });
  } catch (error) {
    next(error);
  }
};

export const createSalarySlip = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const { staffId, month, year, baseSalary, allowances = 0, deductions = 0, dueDate, remarks } =
      req.body || {};
    if (!staffId || !month || !year) {
      return res.status(400).json({ success: false, message: "staffId, month and year are required" });
    }
    const staff = await Staff.findOne({ _id: staffId, schoolId: req.schoolId }).lean();
    if (!staff) {
      return res.status(404).json({ success: false, message: "Staff not found" });
    }
    const periodMonth = Number(month);
    const periodYear = Number(year);
    const exists = await SalarySlip.findOne({
      schoolId: req.schoolId,
      staffId,
      periodMonth,
      periodYear,
    }).lean();
    if (exists) {
      return res.status(409).json({
        success: false,
        message: "Salary slip already exists for this staff and month",
      });
    }
    const monthlySalary = roundMoney(baseSalary != null ? baseSalary : staff.salary || 0);
    const counts = await attendanceCountsForMonth(req.schoolId, [staff._id], periodMonth, periodYear);
    const attendance = counts.get(String(staff._id)) || { presentDays: 0, absentDays: 0 };
    const pay = calculateAttendancePay(monthlySalary, attendance.presentDays, attendance.absentDays);
    const slip = await SalarySlip.create({
      schoolId: req.schoolId,
      slipNumber: await getNextSlipNumber(req.schoolId, periodYear, periodMonth),
      staffId,
      staffName: staff.name,
      designation: staff.designation || "",
      periodMonth,
      periodYear,
      periodLabel: periodLabelOf(periodMonth, periodYear),
      baseSalary: pay.monthlySalary,
      monthlySalary: pay.monthlySalary,
      salaryDays: pay.salaryDays,
      dailySalary: pay.dailySalary,
      presentDays: pay.presentDays,
      absentDays: pay.absentDays,
      attendanceDeduction: pay.attendanceDeduction,
      allowances,
      deductions: roundMoney(pay.attendanceDeduction + roundMoney(deductions)),
      dueDate: dueDate ? new Date(dueDate) : new Date(periodYear, periodMonth, 0),
      remarks: remarks ? String(remarks).trim() : "",
      generatedBy: req.user?._id || null,
    });
    const populated = await populateSlip(SalarySlip.findById(slip._id)).lean();
    res.status(201).json({ success: true, data: populated, message: "Salary slip created" });
  } catch (error) {
    next(error);
  }
};

export const updateSalarySlip = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const slip = await SalarySlip.findOne({ _id: req.params.id, schoolId: req.schoolId });
    if (!slip) {
      return res.status(404).json({ success: false, message: "Salary slip not found" });
    }
    if (req.body?.allowances != null) slip.allowances = req.body.allowances;
    if (req.body?.deductions != null) slip.deductions = req.body.deductions;
    if (req.body?.baseSalary != null) slip.baseSalary = req.body.baseSalary;
    if (req.body?.dueDate) slip.dueDate = new Date(req.body.dueDate);
    if (req.body?.remarks != null) slip.remarks = String(req.body.remarks).trim();
    if (slip.paid > roundMoney(Math.max(0, Number(slip.baseSalary) + Number(slip.allowances) - Number(slip.deductions)))) {
      return res.status(400).json({
        success: false,
        message: "Net salary cannot be less than amount already paid",
      });
    }
    await slip.save();
    const populated = await populateSlip(SalarySlip.findById(slip._id)).lean();
    res.json({ success: true, data: populated, message: "Salary slip updated" });
  } catch (error) {
    next(error);
  }
};

export const recordSalaryPayment = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const { salarySlipId, amount, method, reference, remarks, paymentDate } = req.body || {};
    if (!salarySlipId || amount == null || !method) {
      return res.status(400).json({ success: false, message: "salarySlipId, amount and method are required" });
    }
    const validMethods = ["Cash", "Cheque", "Bank Transfer", "UPI"];
    if (!validMethods.includes(method)) {
      return res.status(400).json({ success: false, message: "Invalid payment method" });
    }
    const slip = await SalarySlip.findOne({ _id: salarySlipId, schoolId: req.schoolId });
    if (!slip) {
      return res.status(404).json({ success: false, message: "Salary slip not found" });
    }
    const payAmount = roundMoney(amount);
    if (payAmount <= 0) {
      return res.status(400).json({ success: false, message: "Amount must be greater than 0" });
    }
    const balance = roundMoney(slip.netAmount - slip.paid);
    if (balance <= 0) {
      return res.status(400).json({ success: false, message: "This salary slip is already fully paid" });
    }
    if (payAmount > balance) {
      return res.status(400).json({ success: false, message: `Amount exceeds pending ₹${balance}` });
    }
    const payment = await SalaryPayment.create({
      schoolId: req.schoolId,
      salarySlipId: slip._id,
      staffId: slip.staffId,
      amount: payAmount,
      method,
      reference: reference ? String(reference).trim() : "",
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paidBy: req.user._id,
      remarks: remarks ? String(remarks).trim() : "",
    });
    slip.paid = roundMoney(Number(slip.paid || 0) + payAmount);
    await slip.save();
    res.status(201).json({
      success: true,
      data: { payment, slip: withDisplayStatus(slip.toObject()) },
      message: "Salary payment recorded",
    });
  } catch (error) {
    next(error);
  }
};

export const prepareSalaryWhatsApp = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const slip = await populateSlip(
      SalarySlip.findOne({ _id: req.params.id, schoolId: req.schoolId }),
    ).lean();
    if (!slip) {
      return res.status(404).json({ success: false, message: "Salary slip not found" });
    }

    const staff = slip.staffId && typeof slip.staffId === "object" ? slip.staffId : null;
    const phone = normalizeWhatsAppPhone(staff?.phone);
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "No valid WhatsApp number on this staff member. Add a phone number in Staff List.",
      });
    }

    const school = await School.findById(req.schoolId).select("name").lean();
    const schoolName = school?.name || "School";
    const pending = roundMoney(Math.max(0, Number(slip.netAmount || 0) - Number(slip.paid || 0)));
    const status = displayStatus(slip.status);

    const message = [
      `*Salary Slip — ${schoolName}*`,
      "",
      `Dear ${slip.staffName || "Staff"},`,
      "",
      "Please find your salary slip details below.",
      "",
      `*Slip No:* ${slip.slipNumber}`,
      `*Period:* ${slip.periodLabel}`,
      `*Designation:* ${slip.designation || "—"}`,
      `*Monthly Salary:* ${formatInrPlain(slip.monthlySalary || slip.baseSalary)}`,
      `*Present Days:* ${Number(slip.presentDays || 0)}`,
      `*Absent Days:* ${Number(slip.absentDays || 0)}`,
      `*Daily Salary:* ${formatInrPlain(slip.dailySalary || 0)}`,
      `*Absent Deduction:* ${formatInrPlain(slip.attendanceDeduction || 0)}`,
      `*Allowances:* ${formatInrPlain(slip.allowances)}`,
      `*Deductions:* ${formatInrPlain(slip.deductions)}`,
      `*Net Salary:* ${formatInrPlain(slip.netAmount)}`,
      `*Paid:* ${formatInrPlain(slip.paid)}`,
      `*Pending:* ${formatInrPlain(pending)}`,
      `*Status:* ${status}`,
      "",
      "Thank you.",
    ].join("\n");

    const waUrl = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;

    res.json({
      success: true,
      data: {
        phone,
        message,
        staffName: slip.staffName,
        waUrl,
      },
      message: "WhatsApp share prepared",
    });
  } catch (error) {
    next(error);
  }
};
