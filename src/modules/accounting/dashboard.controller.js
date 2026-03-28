import FeeInvoice from "./feeInvoice.model.js";
import FeeType from "./feeType.model.js";
import Payment from "./payment.model.js";

const requireSchool = (req, res) => {
  if (!req.schoolId) {
    res.status(400).json({
      success: false,
      message:
        req.user?.roleId?.name === "SuperAdmin"
          ? "schoolId is required (query)"
          : "School context missing",
    });
    return false;
  }
  return true;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** GET /api/accounting/dashboard — aggregated stats */
export const getDashboard = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const schoolId = req.schoolId;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [
      totalRevenueResult,
      collectedThisMonthResult,
      pendingResult,
      overdueResult,
      pendingStudentCount,
      overdueInvoiceCount,
      totalDiscountResult,
    ] = await Promise.all([
      FeeInvoice.aggregate([
        { $match: { schoolId: schoolId, status: "Paid" } },
        { $group: { _id: null, total: { $sum: "$paid" } } },
      ]),
      Payment.aggregate([
        {
          $match: {
            schoolId: schoolId,
            paymentDate: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      FeeInvoice.aggregate([
        {
          $match: {
            schoolId: schoolId,
            status: { $in: ["Pending", "Partial"] },
          },
        },
        { $group: { _id: null, total: { $sum: { $subtract: ["$amount", "$paid"] } } } },
      ]),
      FeeInvoice.aggregate([
        { $match: { schoolId: schoolId, status: "Overdue" } },
        { $group: { _id: null, total: { $sum: { $subtract: ["$amount", "$paid"] } } } },
      ]),
      FeeInvoice.distinct("studentId", {
        schoolId,
        status: { $in: ["Pending", "Partial", "Overdue"] },
      }).then((ids) => ids.length),
      FeeInvoice.countDocuments({ schoolId, status: "Overdue" }),
      FeeInvoice.aggregate([
        {
          $match: {
            schoolId: schoolId,
            status: { $ne: "Cancelled" },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ["$discountAmount", 0] } },
          },
        },
      ]),
    ]);

    const totalRevenue = totalRevenueResult[0]?.total ?? 0;
    const collectedThisMonth = collectedThisMonthResult[0]?.total ?? 0;
    const pendingFees = pendingResult[0]?.total ?? 0;
    const overdueAmount = overdueResult[0]?.total ?? 0;
    const totalDiscountGiven = totalDiscountResult[0]?.total ?? 0;

    const yearStart = new Date(now.getFullYear(), 0, 1);
    const paymentsByMonth = await Payment.aggregate([
      {
        $match: {
          schoolId: schoolId,
          paymentDate: { $gte: yearStart, $lte: now },
        },
      },
      {
        $group: {
          _id: { $month: "$paymentDate" },
          collected: { $sum: "$amount" },
        },
      },
    ]);
    const byMonthMap = Object.fromEntries(
      paymentsByMonth.map((x) => [x._id, x.collected])
    );
    const monthlyCollection = MONTHS.map((month, i) => ({
      month,
      collected: byMonthMap[i + 1] ?? 0,
      target: 350000,
    }));

    const feeDistributionAgg = await FeeInvoice.aggregate([
      { $match: { schoolId: schoolId, status: "Paid" } },
      { $group: { _id: "$feeTypeId", total: { $sum: "$paid" } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]);
    const typeIds = feeDistributionAgg.map((x) => x._id).filter(Boolean);
    const types = await FeeType.find({ _id: { $in: typeIds } })
      .select("name")
      .lean();
    const typeMap = Object.fromEntries(types.map((t) => [t._id.toString(), t.name]));
    const totalPaidForPct = feeDistributionAgg.reduce((s, x) => s + x.total, 0);
    const feeDistribution = feeDistributionAgg.map((x) => ({
      name: typeMap[x._id?.toString()] || "Other",
      amount: x.total,
      percent: totalPaidForPct > 0 ? Math.round((x.total / totalPaidForPct) * 100) : 0,
    }));

    const recentInvoices = await FeeInvoice.find({ schoolId })
      .populate("studentId", "name className section")
      .populate("feeTypeId", "name")
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    const recentInvoicesFormatted = recentInvoices.map((inv) => ({
      _id: inv._id,
      invoiceNumber: inv.invoiceNumber,
      student: inv.studentId?.name
        ? `${inv.studentId.name}`
        : "—",
      class: inv.studentId
        ? `${inv.studentId.className || ""}-${inv.studentId.section || ""}`.replace(/^-|-$/g, "") || "—"
        : "—",
      feeType: inv.feeTypeId?.name ?? "—",
      amount: inv.amount,
      baseAmount: inv.baseAmount ?? inv.amount,
      discountPercent: inv.discountPercent ?? 0,
      discountAmount: inv.discountAmount ?? 0,
      status: inv.status,
      date: inv.createdAt,
    }));

    res.json({
      success: true,
      data: {
        totalRevenue,
        collectedThisMonth,
        pendingFees,
        overdueAmount,
        totalDiscountGiven,
        pendingStudentCount,
        overdueInvoiceCount,
        monthlyCollection,
        feeDistribution,
        recentInvoices: recentInvoicesFormatted,
      },
    });
  } catch (error) {
    next(error);
  }
};
