import FeeInvoice from "../accounting/feeInvoice.model.js";
import "../accounting/feeType.model.js"; // ensure FeeType is registered for populate
import StudentFeeDiscount from "../accounting/studentFeeDiscount.model.js";
import Student from "../student/student.model.js";

const roleNameOf = (req) => req.user?.roleId?.name;

const roundMoney = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Resolve students owned by the authenticated user.
 * Student → own profile only.
 * Parent → every student with parentLogin.userId = req.user._id.
 */
const resolveLinkedStudents = async (req) => {
  const role = roleNameOf(req);
  const userId = req.user?._id;
  if (!userId) return [];

  if (role === "Student") {
    const student = await Student.findOne({
      "studentLogin.userId": userId,
    }).lean();
    return student ? [student] : [];
  }

  if (role === "Parent") {
    return Student.find({ "parentLogin.userId": userId }).lean();
  }

  return [];
};

/**
 * Optional ?studentId= is accepted only when it belongs to the linked set.
 * Returns null when the client asked for a student they do not own.
 */
const resolveScopedStudentIds = (students, requestedStudentId) => {
  const allowedIds = students.map((s) => String(s._id));
  if (!requestedStudentId || String(requestedStudentId).trim() === "") {
    return allowedIds;
  }
  const requested = String(requestedStudentId).trim();
  if (!allowedIds.includes(requested)) {
    return null;
  }
  return [requested];
};

const mapInvoice = (inv, student) => {
  const amount = Number(inv.amount) || 0;
  const paid = Number(inv.paid) || 0;
  const fatherName = (student?.parents?.father?.name || "").toString().trim();

  return {
    _id: inv._id,
    id: String(inv._id),
    studentId: student?._id ? String(student._id) : String(inv.studentId || ""),
    invoiceId: inv.invoiceNumber || String(inv._id),
    invoiceNo: inv.invoiceNumber || "",
    invoiceNumber: inv.invoiceNumber || "",
    studentName: student?.name || "",
    // Always present for Flutter (#16). Father only — not mother fallback.
    fatherName,
    className: student?.className
      ? `${student.className}${student.section ? `-${student.section}` : ""}`
      : "",
    period: inv.period || "",
    amount,
    paid,
    status: inv.status || "Pending",
    date: inv.paidDate || inv.dueDate || inv.createdAt || null,
    dueDate: inv.dueDate || null,
    lineItems: [],
  };
};

const loadOwnedFeeInvoices = async (req, res) => {
  const role = roleNameOf(req);
  if (role !== "Student" && role !== "Parent") {
    return res.status(403).json({
      success: false,
      message: "Only Student and Parent can access fee history",
    });
  }

  const students = await resolveLinkedStudents(req);
  if (!students.length) {
    return res.status(404).json({
      success: false,
      message: "Student profile not found",
    });
  }

  const scopedIds = resolveScopedStudentIds(students, req.query?.studentId);
  if (scopedIds === null) {
    return res.status(403).json({
      success: false,
      message: "Not allowed to access this student's fees",
    });
  }

  const studentById = new Map(students.map((s) => [String(s._id), s]));
  const schoolIds = [
    ...new Set(
      students
        .filter((s) => scopedIds.includes(String(s._id)))
        .map((s) => String(s.schoolId))
        .filter(Boolean),
    ),
  ];

  const filter = {
    studentId: { $in: scopedIds },
    isDeleted: { $ne: true },
  };
  if (schoolIds.length === 1) {
    filter.schoolId = schoolIds[0];
  } else if (schoolIds.length > 1) {
    filter.schoolId = { $in: schoolIds };
  }

  const invoices = await FeeInvoice.find(filter)
    .sort({ dueDate: -1, createdAt: -1 })
    .lean();

  const data = invoices.map((inv) => {
    const sid = String(inv.studentId);
    return mapInvoice(inv, studentById.get(sid));
  });

  return res.json({
    success: true,
    data,
  });
};

/** GET /api/mobile/fees/history */
export const getMobileFeeHistory = async (req, res, next) => {
  try {
    await loadOwnedFeeInvoices(req, res);
  } catch (error) {
    next(error);
  }
};

/** GET /api/mobile/invoices */
export const getMobileInvoices = async (req, res, next) => {
  try {
    await loadOwnedFeeInvoices(req, res);
  } catch (error) {
    next(error);
  }
};

/**
 * Build fee structure rows for one student, merging fixed rupee discounts by fee type name.
 */
const buildStudentFeeStructureBlock = (student, discountsByFeeTypeName) => {
  const lines = Array.isArray(student?.feeStructure) ? student.feeStructure : [];
  const feeStructure = lines.map((row) => {
    const feeType = String(row.feeType || "").trim();
    const amount = roundMoney(row.amount);
    const key = feeType.toLowerCase();
    const discountAmount = roundMoney(discountsByFeeTypeName.get(key) || 0);
    const netAmount = roundMoney(Math.max(0, amount - discountAmount));
    const billingMode =
      row.billingMode === "oneTime" || row.billingMode === "perMonth"
        ? row.billingMode
        : "perMonth";
    return {
      feeType: feeType || "—",
      period: String(row.period || "").trim() || "—",
      amount,
      billingMode,
      discountAmount,
      netAmount,
    };
  });

  const totalAmount = roundMoney(
    feeStructure.reduce((sum, row) => sum + Number(row.amount || 0), 0),
  );
  const totalDiscount = roundMoney(
    feeStructure.reduce((sum, row) => sum + Number(row.discountAmount || 0), 0),
  );
  const totalNet = roundMoney(
    feeStructure.reduce((sum, row) => sum + Number(row.netAmount || 0), 0),
  );

  return {
    studentId: String(student._id),
    studentName: student.name || "",
    admissionNumber: student.admissionNumber || "",
    className: student.className || "",
    section: student.section || "",
    feeStructure,
    totalAmount,
    totalDiscount,
    totalNet,
  };
};

/**
 * GET /api/mobile/fees/structure
 * Assigned fee structure + fixed discounts (Student / Parent).
 * Optional ?studentId= for parents with multiple children.
 */
export const getMobileFeeStructure = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (role !== "Student" && role !== "Parent") {
      return res.status(403).json({
        success: false,
        message: "Only Student and Parent can access fee structure",
      });
    }

    const students = await resolveLinkedStudents(req);
    if (!students.length) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const scopedIds = resolveScopedStudentIds(students, req.query?.studentId);
    if (scopedIds === null) {
      return res.status(403).json({
        success: false,
        message: "Not allowed to access this student's fees",
      });
    }

    const scopedStudents = students.filter((s) =>
      scopedIds.includes(String(s._id)),
    );

    const discountRows = await StudentFeeDiscount.find({
      studentId: { $in: scopedIds },
      discountAmount: { $gt: 0 },
    })
      .populate("feeTypeId", "name")
      .lean();

    /** studentId → Map(feeTypeNameLower → discountAmount) */
    const discountMaps = new Map();
    for (const row of discountRows) {
      const sid = String(row.studentId);
      const feeName = String(row.feeTypeId?.name || "").trim().toLowerCase();
      if (!feeName) continue;
      if (!discountMaps.has(sid)) discountMaps.set(sid, new Map());
      discountMaps
        .get(sid)
        .set(feeName, roundMoney(row.discountAmount));
    }

    const data = scopedStudents.map((student) =>
      buildStudentFeeStructureBlock(
        student,
        discountMaps.get(String(student._id)) || new Map(),
      ),
    );

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};
