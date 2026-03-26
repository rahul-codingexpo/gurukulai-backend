import FeeInvoice from "./feeInvoice.model.js";
import Student from "../student/student.model.js";

const ensureSchoolId = (req, res) => {
  if (!req.schoolId) {
    res.status(400).json({
      success: false,
      message:
        req.user?.roleId?.name === "SuperAdmin"
          ? "schoolId is required (query)"
          : "School context missing",
    });
    return null;
  }
  return req.schoolId;
};

/**
 * GET /api/fee-status?type=PAID|UNPAID
 * Returns per-student totals:
 * - totalAmount, totalPaid, balance
 */
export const getStudentFeeStatus = async (req, res, next) => {
  try {
    const schoolId = ensureSchoolId(req, res);
    if (!schoolId) return;

    const { type = "UNPAID", className, section, page = 1, limit = 20 } = req.query;
    const pageNo = Math.max(1, parseInt(page, 10) || 1);
    const limitNo = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNo - 1) * limitNo;

    // Find students (optional class filter)
    const studentFilter = { schoolId };
    if (className) studentFilter.className = className;
    if (section) studentFilter.section = section;

    const studentIds = await Student.find(studentFilter).select("_id").lean();
    const ids = studentIds.map((s) => s._id);

    const match = { schoolId, studentId: { $in: ids } };

    const agg = await FeeInvoice.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$studentId",
          totalAmount: { $sum: "$amount" },
          totalPaid: { $sum: "$paid" },
        },
      },
      {
        $addFields: {
          balance: { $subtract: ["$totalAmount", "$totalPaid"] },
        },
      },
      {
        $match: type === "PAID" ? { balance: 0 } : { balance: { $gt: 0 } },
      },
      { $sort: { balance: -1 } },
      { $skip: skip },
      { $limit: limitNo },
    ]);

    const totalAgg = await FeeInvoice.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$studentId",
          totalAmount: { $sum: "$amount" },
          totalPaid: { $sum: "$paid" },
        },
      },
      { $addFields: { balance: { $subtract: ["$totalAmount", "$totalPaid"] } } },
      {
        $match: type === "PAID" ? { balance: 0 } : { balance: { $gt: 0 } },
      },
      { $count: "count" },
    ]);
    const total = totalAgg[0]?.count ?? 0;

    const studentMap = new Map(
      (
        await Student.find({ _id: { $in: agg.map((x) => x._id) } })
          .select("name admissionNumber className section rollNumber")
          .lean()
      ).map((s) => [s._id.toString(), s])
    );

    const items = agg.map((x) => ({
      student: studentMap.get(String(x._id)) || { _id: x._id },
      totalAmount: x.totalAmount,
      totalPaid: x.totalPaid,
      balance: x.balance,
    }));

    res.json({
      success: true,
      data: {
        type,
        items,
        pagination: {
          page: pageNo,
          limit: limitNo,
          total,
          totalPages: Math.ceil(total / limitNo),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

