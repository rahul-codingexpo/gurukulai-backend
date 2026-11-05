import FeeInvoice from "../accounting/feeInvoice.model.js";
import Student from "../student/student.model.js";

const roleNameOf = (req) => req.user?.roleId?.name;

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
