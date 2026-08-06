import StudentFeeDiscount from "./studentFeeDiscount.model.js";
import Student from "../student/student.model.js";

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

/** GET /accounting/student-fee-discounts — students who have saved fee discounts */
export const listStudentFeeDiscounts = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const { className, section, search } = req.query;
    const rows = await StudentFeeDiscount.find({
      schoolId: req.schoolId,
      discountAmount: { $gt: 0 },
    })
      .populate("studentId", "name admissionNumber className section rollNumber status")
      .populate("feeTypeId", "name code amount period")
      .sort({ updatedAt: -1 })
      .lean();

    const byStudent = new Map();
    for (const row of rows) {
      const student = row.studentId;
      if (!student || typeof student !== "object") continue;
      if (className && String(student.className || "").trim() !== String(className).trim()) continue;
      if (section && String(student.section || "").trim() !== String(section).trim()) continue;
      if (search && String(search).trim()) {
        const q = String(search).trim().toLowerCase();
        const hay = `${student.name || ""} ${student.admissionNumber || ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const sid = String(student._id);
      if (!byStudent.has(sid)) {
        byStudent.set(sid, {
          studentId: student._id,
          student,
          discounts: [],
          totalDiscount: 0,
        });
      }
      const entry = byStudent.get(sid);
      entry.discounts.push({
        _id: row._id,
        feeTypeId: row.feeTypeId,
        discountAmount: roundMoney(row.discountAmount),
        updatedAt: row.updatedAt,
      });
      entry.totalDiscount = roundMoney(entry.totalDiscount + Number(row.discountAmount || 0));
    }

    const data = [...byStudent.values()].sort((a, b) =>
      String(a.student?.name || "").localeCompare(String(b.student?.name || "")),
    );

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/** GET /accounting/student-fee-discounts/student/:studentId */
export const getStudentFeeDiscountsByStudent = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const { studentId } = req.params;
    const student = await Student.findOne({ _id: studentId, schoolId: req.schoolId })
      .select("name admissionNumber className section")
      .lean();
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    const rows = await StudentFeeDiscount.find({
      schoolId: req.schoolId,
      studentId,
      discountAmount: { $gt: 0 },
    })
      .populate("feeTypeId", "name code amount period")
      .lean();

    res.json({
      success: true,
      data: {
        student,
        discounts: rows.map((row) => ({
          _id: row._id,
          feeTypeId: row.feeTypeId,
          discountAmount: roundMoney(row.discountAmount),
          updatedAt: row.updatedAt,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /accounting/student-fee-discounts
 * Body: { studentId, items: [{ feeTypeId, discountAmount }] }
 * Upserts positive discounts; removes items with discountAmount <= 0.
 */
export const upsertStudentFeeDiscounts = async (req, res, next) => {
  try {
    if (!requireSchool(req, res)) return;
    const { studentId, items } = req.body || {};
    if (!studentId || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "studentId and items array are required",
      });
    }
    const student = await Student.findOne({ _id: studentId, schoolId: req.schoolId }).select("_id");
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const saved = [];
    for (const item of items) {
      const feeTypeId = item?.feeTypeId;
      if (!feeTypeId) continue;
      const amount = roundMoney(item.discountAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        await StudentFeeDiscount.deleteOne({
          schoolId: req.schoolId,
          studentId,
          feeTypeId,
        });
        continue;
      }
      const row = await StudentFeeDiscount.findOneAndUpdate(
        { schoolId: req.schoolId, studentId, feeTypeId },
        {
          $set: {
            schoolId: req.schoolId,
            studentId,
            feeTypeId,
            discountAmount: amount,
          },
        },
        { upsert: true, new: true },
      )
        .populate("feeTypeId", "name code amount period")
        .lean();
      saved.push(row);
    }

    res.json({
      success: true,
      data: saved,
      message: "Student fee discounts saved",
    });
  } catch (error) {
    next(error);
  }
};
