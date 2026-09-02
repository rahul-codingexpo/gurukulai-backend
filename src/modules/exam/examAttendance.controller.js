import Exam from "./exam.model.js";
import ExamAttendanceSheet from "./examAttendanceSheet.model.js";
import School from "../school/school.model.js";
import Section from "../academic/section.model.js";
import Student from "../student/student.model.js";
import { uploadedFileUrl } from "../../utils/uploadFile.util.js";

const resolveSchoolId = (req) => {
  if (req.schoolId) return req.schoolId;
  const role = req.user?.roleId?.name;
  if (role === "SuperAdmin") {
    return req.query.schoolId || req.body.schoolId || req.params.schoolId || null;
  }
  return req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
};

const toDateOnly = (value) => {
  if (!value) return null;
  const str = String(value).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const d = new Date(y, m - 1, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const toLocalDateKey = (value) => {
  const d = toDateOnly(value);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatExamDateLabel = (value) => {
  const d = toDateOnly(value);
  if (!d) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const normalizeSheet = (doc) => {
  const s = doc?.toObject ? doc.toObject() : doc;
  if (!s) return null;
  return {
    id: s._id,
    schoolId: s.schoolId,
    sessionId: s.sessionId,
    examId: s.examId,
    classId: s.classId,
    sectionId: s.sectionId || null,
    subjectId: s.subjectId,
    examDate: s.examDate,
    entries: (s.entries || []).map((e) => ({
      studentId: e.studentId,
      status: e.status,
    })),
    totalStudents: s.totalStudents ?? 0,
    totalPresent: s.totalPresent ?? 0,
    totalAbsent: s.totalAbsent ?? 0,
    documentUrl: s.documentUrl || null,
    uploadedBy: s.uploadedBy || null,
    uploadedAt: s.uploadedAt || null,
    invigilatorSignedAt: s.invigilatorSignedAt || null,
    principalSignedAt: s.principalSignedAt || null,
    createdBy: s.createdBy || null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
};

const computeTotals = (entries) => {
  const list = Array.isArray(entries) ? entries : [];
  const totalStudents = list.length;
  const totalPresent = list.filter((e) => e.status === "Present").length;
  const totalAbsent = list.filter((e) => e.status === "Absent").length;
  return { totalStudents, totalPresent, totalAbsent };
};

const loadExamStudents = async (exam, schoolId) => {
  const studentFilter = { schoolId, className: exam.classId?.name };
  if (exam.sectionId) {
    const section = await Section.findById(exam.sectionId).select("name");
    if (section?.name) studentFilter.section = section.name;
  }
  return Student.find(studentFilter)
    .select("name admissionNumber rollNumber className section")
    .sort({ section: 1, rollNumber: 1, admissionNumber: 1, name: 1 })
    .lean();
};

const findScheduleRow = (exam, subjectId, examDateKey) => {
  const rows = (exam.schedule || []).filter(
    (x) => String(x.subjectId?._id || x.subjectId) === String(subjectId),
  );
  if (!examDateKey) return rows[0] || null;
  return (
    rows.find((x) => toLocalDateKey(x.examDate) === examDateKey) ||
    rows[0] ||
    null
  );
};

export const getExamAttendancePrintData = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({ success: false, message: "schoolId is required" });
    }

    const { examId, subjectId, examDate } = req.query;
    if (!examId || !subjectId || !examDate) {
      return res.status(400).json({
        success: false,
        message: "examId, subjectId and examDate are required",
      });
    }

    const examDateKey = toLocalDateKey(examDate);
    if (!examDateKey) {
      return res.status(400).json({ success: false, message: "Invalid examDate" });
    }

    const exam = await Exam.findOne({ _id: examId, schoolId })
      .populate("sessionId", "name")
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjects.subjectId", "name code")
      .populate("schedule.subjectId", "name code")
      .lean();

    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });

    const scheduleRow = findScheduleRow(exam, subjectId, examDateKey);
    if (!scheduleRow) {
      return res.status(400).json({
        success: false,
        message: "No schedule found for this subject and exam date",
      });
    }

    const subjectMeta = (exam.subjects || []).find(
      (s) => String(s.subjectId?._id || s.subjectId) === String(subjectId),
    );
    const subjectName =
      scheduleRow.subjectId?.name ||
      subjectMeta?.subjectId?.name ||
      "";

    const school = await School.findById(schoolId)
      .select("name logo address city state pincode")
      .lean();

    const students = await loadExamStudents(exam, schoolId);

    const examDateOnly = toDateOnly(examDate);
    const sectionId = exam.sectionId?._id || exam.sectionId || null;

    const existingSheet = await ExamAttendanceSheet.findOne({
      schoolId,
      examId,
      subjectId,
      examDate: examDateOnly,
      sectionId: sectionId || null,
    }).lean();

    res.json({
      success: true,
      data: {
        school: {
          name: school?.name || "",
          logo: school?.logo || null,
          address: school?.address || "",
          city: school?.city || "",
          state: school?.state || "",
          pincode: school?.pincode || "",
        },
        session: exam.sessionId?.name || "",
        examName: exam.name,
        className: exam.classId?.name || "",
        sectionName: exam.sectionId?.name || "",
        subjectName,
        examDate: examDateOnly,
        examDateLabel: formatExamDateLabel(examDateOnly),
        startTime: scheduleRow.startTime || "",
        endTime: scheduleRow.endTime || "",
        students: students.map((s) => ({
          _id: s._id,
          name: s.name,
          rollNumber: s.rollNumber || "",
          admissionNumber: s.admissionNumber || "",
        })),
        existingSheet: existingSheet
          ? {
              id: existingSheet._id,
              entries: existingSheet.entries || [],
              totalStudents: existingSheet.totalStudents ?? 0,
              totalPresent: existingSheet.totalPresent ?? 0,
              totalAbsent: existingSheet.totalAbsent ?? 0,
              documentUrl: existingSheet.documentUrl || null,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const listExamAttendanceSheets = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({ success: false, message: "schoolId is required" });
    }

    const filter = { schoolId };
    if (req.query.sessionId) filter.sessionId = req.query.sessionId;
    if (req.query.examId) filter.examId = req.query.examId;
    if (req.query.classId) filter.classId = req.query.classId;
    if (req.query.sectionId) filter.sectionId = req.query.sectionId;
    if (req.query.subjectId) filter.subjectId = req.query.subjectId;
    if (req.query.examDate) {
      const d = toDateOnly(req.query.examDate);
      if (d) filter.examDate = d;
    }

    const sheets = await ExamAttendanceSheet.find(filter)
      .sort({ examDate: -1, updatedAt: -1 })
      .lean();

    const examIds = [...new Set(sheets.map((s) => String(s.examId)))];
    const exams = await Exam.find({ _id: { $in: examIds } })
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjects.subjectId", "name")
      .lean();
    const examMap = new Map(exams.map((e) => [String(e._id), e]));

    const data = sheets.map((s) => {
      const exam = examMap.get(String(s.examId));
      const subjectMeta = (exam?.subjects || []).find(
        (sub) => String(sub.subjectId?._id || sub.subjectId) === String(s.subjectId),
      );
      return {
        ...normalizeSheet(s),
        examName: exam?.name || "",
        className: exam?.classId?.name || "",
        sectionName: exam?.sectionId?.name || "",
        subjectName: subjectMeta?.subjectId?.name || "",
        examDateLabel: formatExamDateLabel(s.examDate),
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getExamAttendanceSheetById = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const sheet = await ExamAttendanceSheet.findOne({ _id: req.params.id, schoolId }).lean();
    if (!sheet) {
      return res.status(404).json({ success: false, message: "Attendance sheet not found" });
    }
    res.json({ success: true, data: normalizeSheet(sheet) });
  } catch (error) {
    next(error);
  }
};

export const upsertExamAttendanceEntries = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({ success: false, message: "schoolId is required" });
    }

    const { examId, subjectId, examDate, sectionId, entries } = req.body || {};
    if (!examId || !subjectId || !examDate) {
      return res.status(400).json({
        success: false,
        message: "examId, subjectId and examDate are required",
      });
    }
    if (!Array.isArray(entries)) {
      return res.status(400).json({ success: false, message: "entries array is required" });
    }

    const examDateOnly = toDateOnly(examDate);
    if (!examDateOnly) {
      return res.status(400).json({ success: false, message: "Invalid examDate" });
    }

    const exam = await Exam.findOne({ _id: examId, schoolId })
      .select("sessionId classId sectionId schedule subjects")
      .lean();
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });

    const examDateKey = toLocalDateKey(examDate);
    const scheduleRow = findScheduleRow(exam, subjectId, examDateKey);
    if (!scheduleRow) {
      return res.status(400).json({
        success: false,
        message: "No schedule found for this subject and exam date",
      });
    }

    const normalizedEntries = entries.map((e) => ({
      studentId: e.studentId,
      status: e.status === "Absent" ? "Absent" : "Present",
    }));

    const totals = computeTotals(normalizedEntries);
    const resolvedSectionId =
      sectionId !== undefined
        ? sectionId || null
        : exam.sectionId?._id || exam.sectionId || null;

    const filter = {
      schoolId,
      examId,
      subjectId,
      examDate: examDateOnly,
      sectionId: resolvedSectionId,
    };

    const update = {
      sessionId: exam.sessionId,
      classId: exam.classId?._id || exam.classId,
      sectionId: resolvedSectionId,
      entries: normalizedEntries,
      ...totals,
      createdBy: req.user?._id || null,
    };

    const sheet = await ExamAttendanceSheet.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

    res.json({ success: true, data: normalizeSheet(sheet) });
  } catch (error) {
    next(error);
  }
};

export const uploadExamAttendanceDocument = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const sheet = await ExamAttendanceSheet.findOne({ _id: req.params.id, schoolId });
    if (!sheet) {
      return res.status(404).json({ success: false, message: "Attendance sheet not found" });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: "document file is required" });
    }

    const url = uploadedFileUrl(file);
    sheet.documentUrl = url || null;
    sheet.uploadedBy = req.user?._id || null;
    sheet.uploadedAt = new Date();
    await sheet.save();

    res.json({ success: true, data: normalizeSheet(sheet) });
  } catch (error) {
    next(error);
  }
};

export const deleteExamAttendanceSheet = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const sheet = await ExamAttendanceSheet.findOneAndDelete({ _id: req.params.id, schoolId });
    if (!sheet) {
      return res.status(404).json({ success: false, message: "Attendance sheet not found" });
    }
    res.json({ success: true, message: "Attendance sheet deleted" });
  } catch (error) {
    next(error);
  }
};
