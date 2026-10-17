import Exam from "./exam.model.js";
import ExamMark from "./examMark.model.js";
import Session from "../academic/session.model.js";
import ClassModel from "../academic/class.model.js";
import Section from "../academic/section.model.js";
import Subject from "../academic/subject.model.js";
import Student from "../student/student.model.js";

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

const formatDateSheetLabels = (dateKey) => {
  const [y, m, day] = String(dateKey).split("-").map(Number);
  if (!y || !m || !day) return { dateLabel: "", dayLabel: "" };
  const d = new Date(y, m - 1, day);
  return {
    dateLabel: `${String(day).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`,
    dayLabel: d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase(),
  };
};

const isClass11Or12 = (className) => /\b(11|12)\b/.test(String(className || ""));

const PAPER_TYPES = ["Theory", "Practical", "Oral"];
const normalizePaperType = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "practical") return "Practical";
  if (raw === "oral") return "Oral";
  if (raw === "grade") return "Grade";
  if (raw === "theory" || raw === "written") return "Theory";
  return "Theory";
};

const enabledPaperTypesForSubject = (s) => {
  const types = [];
  if (s.hasWritten !== false) types.push("Theory");
  if (s.hasPractical) types.push("Practical");
  if (s.hasOral) types.push("Oral");
  return types.length ? types : ["Theory"];
};

const numOrNull = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const resolvePaperMarks = (s, paperType) => {
  const fallbackMax = Number(s.maxMarks) || 0;
  const fallbackPass = Number(s.passMarks) || 0;
  if (paperType === "Practical") {
    return {
      maxMarks: numOrNull(s.practicalMaxMarks) ?? (s.hasPractical ? fallbackMax : 0),
      passMarks: numOrNull(s.practicalPassMarks) ?? (s.hasPractical ? fallbackPass : 0),
    };
  }
  if (paperType === "Oral") {
    return {
      maxMarks: numOrNull(s.oralMaxMarks) ?? (s.hasOral ? fallbackMax : 0),
      passMarks: numOrNull(s.oralPassMarks) ?? (s.hasOral ? fallbackPass : 0),
    };
  }
  return {
    maxMarks: numOrNull(s.theoryMaxMarks) ?? fallbackMax,
    passMarks: numOrNull(s.theoryPassMarks) ?? fallbackPass,
  };
};

const normalizeSubjectPayload = (s) => {
  const hasWritten = s.hasWritten !== false;
  const hasPractical = Boolean(s.hasPractical);
  const hasOral = Boolean(s.hasOral);
  const theoryMax = numOrNull(s.theoryMaxMarks);
  const theoryPass = numOrNull(s.theoryPassMarks);
  const practicalMax = numOrNull(s.practicalMaxMarks);
  const practicalPass = numOrNull(s.practicalPassMarks);
  const oralMax = numOrNull(s.oralMaxMarks);
  const oralPass = numOrNull(s.oralPassMarks);

  let maxMarks = 0;
  let passMarks = 0;
  if (hasWritten) {
    maxMarks += theoryMax != null ? theoryMax : Number(s.maxMarks) || 0;
    passMarks += theoryPass != null ? theoryPass : Number(s.passMarks) || 0;
  }
  if (hasPractical) {
    maxMarks += practicalMax != null ? practicalMax : 0;
    passMarks += practicalPass != null ? practicalPass : 0;
  }
  if (hasOral) {
    maxMarks += oralMax != null ? oralMax : 0;
    passMarks += oralPass != null ? oralPass : 0;
  }
  if (maxMarks <= 0) {
    maxMarks = Number(s.maxMarks) || 0;
    passMarks = Number(s.passMarks) || 0;
  }

  return {
    subjectId: s.subjectId,
    maxMarks,
    passMarks,
    hasWritten,
    hasPractical,
    hasOral,
    theoryMaxMarks: hasWritten
      ? (theoryMax != null ? theoryMax : Number(s.maxMarks) || maxMarks || 0)
      : null,
    theoryPassMarks: hasWritten
      ? (theoryPass != null ? theoryPass : Number(s.passMarks) || passMarks || 0)
      : null,
    practicalMaxMarks: hasPractical ? (practicalMax != null ? practicalMax : 0) : null,
    practicalPassMarks: hasPractical ? (practicalPass != null ? practicalPass : 0) : null,
    oralMaxMarks: hasOral ? (oralMax != null ? oralMax : 0) : null,
    oralPassMarks: hasOral ? (oralPass != null ? oralPass : 0) : null,
  };
};

const getExamSubjectMap = (exam) => {
  const map = new Map();
  for (const s of exam.subjects || []) {
    const sid = String(s.subjectId?._id || s.subjectId);
    map.set(sid, {
      ...s,
      maxMarks: s.maxMarks,
      passMarks: s.passMarks,
      papers: enabledPaperTypesForSubject(s).reduce((acc, type) => {
        acc[type] = resolvePaperMarks(s, type);
        return acc;
      }, {}),
    });
  }
  return map;
};

const normalizeExam = (examDoc) => {
  const e = examDoc.toObject ? examDoc.toObject() : examDoc;
  const subjectNameMap = new Map(
    (e.subjects || []).map((s) => [String(s.subjectId?._id || s.subjectId), s.subjectId?.name || ""]),
  );
  return {
    id: e._id,
    name: e.name,
    sessionId: e.sessionId?._id || e.sessionId || null,
    sessionName: e.sessionId?.name || null,
    classId: e.classId?._id || e.classId || null,
    className: e.classId?.name || null,
    sectionId: e.sectionId?._id || e.sectionId || null,
    sectionName: e.sectionId?.name || null,
    instructions: e.instructions || "",
    syllabusUrl: (e.syllabusUrl || "").trim() || null,
    subjects: (e.subjects || []).map((s) => {
      const normalized = normalizeSubjectPayload(s);
      return {
        subjectId: s.subjectId?._id || s.subjectId,
        subjectName: s.subjectId?.name || "",
        subjectCode: s.subjectId?.code || "",
        examType: (s.subjectId?.type || "").trim() || null,
        maxMarks: normalized.maxMarks,
        passMarks: normalized.passMarks,
        hasWritten: normalized.hasWritten,
        hasPractical: normalized.hasPractical,
        hasOral: normalized.hasOral,
        theoryMaxMarks: normalized.theoryMaxMarks,
        theoryPassMarks: normalized.theoryPassMarks,
        practicalMaxMarks: normalized.practicalMaxMarks,
        practicalPassMarks: normalized.practicalPassMarks,
        oralMaxMarks: normalized.oralMaxMarks,
        oralPassMarks: normalized.oralPassMarks,
      };
    }),
    schedule: (e.schedule || []).map((x) => ({
      subjectId: x.subjectId?._id || x.subjectId,
      subjectName:
        x.subjectId?.name || subjectNameMap.get(String(x.subjectId?._id || x.subjectId)) || "",
      subjectCode: x.subjectId?.code || "",
      examType: (x.subjectId?.type || "").trim() || null,
      paperType: normalizePaperType(x.paperType),
      examDate: x.examDate,
      startTime: x.startTime,
      endTime: x.endTime,
    })),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
};

const validateExamPayload = async (schoolId, payload) => {
  const { name, sessionId, classId, sectionId, subjects, schedule } = payload || {};
  if (!name || !sessionId || !classId) {
    return "name, sessionId and classId are required";
  }
  if (!Array.isArray(subjects) || !subjects.length) return "At least one subject is required";
  if (!Array.isArray(schedule) || !schedule.length) return "Schedule is required";

  const classDoc = await ClassModel.findOne({ _id: classId, schoolId }).select("name");
  if (!classDoc) return "Class not found for this school";

  if (isClass11Or12(classDoc.name) && !sectionId) {
    return "sectionId is required for class 11/12";
  }

  if (sectionId) {
    const sectionDoc = await Section.findOne({ _id: sectionId, classId, schoolId }).select("_id");
    if (!sectionDoc) return "sectionId is invalid for selected class";
  }

  const subIds = subjects.map((s) => String(s.subjectId));
  if (new Set(subIds).size !== subIds.length) return "Duplicate subjectId not allowed";

  for (const s of subjects) {
    const hasWritten = s.hasWritten !== false;
    const hasPractical = Boolean(s.hasPractical);
    const hasOral = Boolean(s.hasOral);
    if (!hasWritten && !hasPractical && !hasOral) {
      return "Each subject must have at least one paper type: Theory, Practical, or Oral";
    }
    const normalized = normalizeSubjectPayload(s);
    if (!s.subjectId || Number(normalized.maxMarks) <= 0) return "Invalid subject maxMarks";
    if (Number(normalized.passMarks) < 0 || Number(normalized.passMarks) > Number(normalized.maxMarks)) {
      return "passMarks must be between 0 and maxMarks";
    }
    for (const paperType of enabledPaperTypesForSubject(normalized)) {
      const marks = resolvePaperMarks(normalized, paperType);
      if (Number(marks.maxMarks) <= 0) {
        return `${paperType} max marks must be greater than 0`;
      }
      if (Number(marks.passMarks) < 0 || Number(marks.passMarks) > Number(marks.maxMarks)) {
        return `${paperType} pass marks must be between 0 and max marks`;
      }
    }
  }

  const existingSubjects = await Subject.find({
    schoolId,
    classId,
    _id: { $in: subIds },
  }).select("_id");
  if (existingSubjects.length !== subIds.length) {
    return "One or more subjects do not belong to selected class";
  }

  const requiredScheduleKeys = new Set();
  for (const s of subjects) {
    const sid = String(s.subjectId);
    for (const paperType of enabledPaperTypesForSubject(s)) {
      requiredScheduleKeys.add(`${sid}::${paperType}`);
    }
  }

  const seenScheduleKeys = new Set();
  for (const x of schedule) {
    const date = toDateOnly(x.examDate);
    const paperType = normalizePaperType(x.paperType);
    if (!x.subjectId || !date || !x.startTime || !x.endTime) {
      return "Each schedule row must contain subjectId, examDate, startTime, endTime";
    }
    if (x.startTime >= x.endTime) return "startTime must be less than endTime";
    const sid = String(x.subjectId);
    if (!subIds.includes(sid)) {
      return "Schedule contains subject not present in subjects list";
    }
    const key = `${sid}::${paperType}`;
    if (seenScheduleKeys.has(key)) {
      return `Duplicate schedule for subject paper ${paperType}`;
    }
    seenScheduleKeys.add(key);
  }

  for (const key of requiredScheduleKeys) {
    if (!seenScheduleKeys.has(key)) {
      const [, paperType] = key.split("::");
      return `Schedule is required for each selected paper type (${paperType})`;
    }
  }
  return null;
};

export const createExam = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ success: false, message: "School context missing" });

    const err = await validateExamPayload(schoolId, req.body);
    if (err) return res.status(400).json({ success: false, message: err });

    const payload = req.body;
    const exam = await Exam.create({
      schoolId,
      name: payload.name,
      sessionId: payload.sessionId,
      classId: payload.classId,
      sectionId: payload.sectionId || null,
      instructions: payload.instructions || "",
      syllabusUrl: payload.syllabusUrl != null ? String(payload.syllabusUrl).trim() : "",
      subjects: payload.subjects.map((s) => normalizeSubjectPayload(s)),
      schedule: payload.schedule.map((x) => ({
        subjectId: x.subjectId,
        paperType: normalizePaperType(x.paperType),
        examDate: toDateOnly(x.examDate),
        startTime: String(x.startTime),
        endTime: String(x.endTime),
      })),
    });

    const detailed = await Exam.findById(exam._id)
      .populate("sessionId", "name")
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjects.subjectId", "name code type")
      .populate("schedule.subjectId", "name code type");

    res.status(201).json({ success: true, data: normalizeExam(detailed) });
  } catch (error) {
    next(error);
  }
};

export const listExams = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ success: false, message: "School context missing" });

    const { sessionId, classId, sectionId } = req.query;
    const filter = { schoolId };
    if (sessionId) filter.sessionId = sessionId;
    if (classId) filter.classId = classId;
    if (sectionId) filter.sectionId = sectionId;

    const exams = await Exam.find(filter)
      .populate("sessionId", "name")
      .populate("classId", "name")
      .populate("sectionId", "name")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: exams.map((e) => ({
        id: e._id,
        name: e.name,
        sessionId: e.sessionId?._id || e.sessionId || null,
        sessionName: e.sessionId?.name || null,
        classId: e.classId?._id || e.classId || null,
        className: e.classId?.name || null,
        sectionId: e.sectionId?._id || e.sectionId || null,
        sectionName: e.sectionId?.name || null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

const PRESCHOOL_CLASS_ORDER = ["NUR", "LKG", "UKG"];
const ROMAN_CLASS_ORDER = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
};

const timeToMinutes = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
};

const formatTime12Hour = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return raw;
  const hours24 = Number(match[1]);
  const minutes = match[2];
  const suffix = hours24 >= 12 ? "p.m" : "a.m";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${suffix}`;
};

const getShiftKey = (startTime, cutoffMinutes = 11 * 60 + 15) =>
  timeToMinutes(startTime) < cutoffMinutes ? "1st" : "2nd";

const sortClassLabel = (a, b) => {
  const left = String(a || "").trim().toUpperCase();
  const right = String(b || "").trim().toUpperCase();
  const leftPre = PRESCHOOL_CLASS_ORDER.indexOf(left);
  const rightPre = PRESCHOOL_CLASS_ORDER.indexOf(right);
  if (leftPre !== -1 || rightPre !== -1) {
    if (leftPre === -1) return 1;
    if (rightPre === -1) return -1;
    return leftPre - rightPre;
  }
  const leftNum = ROMAN_CLASS_ORDER[left] || Number.parseInt(left, 10) || 999;
  const rightNum = ROMAN_CLASS_ORDER[right] || Number.parseInt(right, 10) || 999;
  return leftNum - rightNum;
};

const buildShiftTimingLabel = (entries) => {
  if (!entries.length) return null;
  const starts = entries.map((e) => e.startTime).sort();
  const ends = entries.map((e) => e.endTime).sort();
  return `${formatTime12Hour(starts[0])} to ${formatTime12Hour(ends[ends.length - 1])}`;
};

export const getExamDateSheet = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ success: false, message: "School context missing" });

    const { sessionId, examName } = req.query;
    if (!examName || !String(examName).trim()) {
      return res.status(400).json({ success: false, message: "examName is required" });
    }

    const filter = { schoolId, name: String(examName).trim() };
    if (sessionId) filter.sessionId = sessionId;

    const exams = await Exam.find(filter)
      .populate("sessionId", "name")
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("schedule.subjectId", "name")
      .lean();

    if (!exams.length) {
      return res.status(404).json({ success: false, message: "No exams found for this program" });
    }

    const classColumnMap = new Map();
    for (const exam of exams) {
      const className = exam.classId?.name || "Unknown";
      const sectionName = exam.sectionId?.name;
      const key = sectionName ? `${className}__${sectionName}` : className;
      const label = sectionName ? `${className} (${sectionName})` : className;
      classColumnMap.set(key, label);
    }

    const classKeys = [...classColumnMap.keys()].sort((a, b) =>
      sortClassLabel(classColumnMap.get(a), classColumnMap.get(b)),
    );
    const classes = classKeys.map((key) => ({ key, label: classColumnMap.get(key) }));

    const grid = new Map();
    const shiftBuckets = { "1st": [], "2nd": [] };

    for (const exam of exams) {
      const className = exam.classId?.name || "Unknown";
      const sectionName = exam.sectionId?.name;
      const classKey = sectionName ? `${className}__${sectionName}` : className;

      for (const sch of exam.schedule || []) {
        const dateKey = toLocalDateKey(sch.examDate);
        if (!dateKey) continue;
        const shift = getShiftKey(sch.startTime);
        const subjectName = sch.subjectId?.name || "Subject";
        const paperType = normalizePaperType(sch.paperType);
        const label = `${subjectName} (${paperType})`;

        if (!grid.has(dateKey)) {
          grid.set(dateKey, { "1st": new Map(), "2nd": new Map() });
        }
        const day = grid.get(dateKey);
        if (!day[shift].has(classKey)) day[shift].set(classKey, []);
        const cellSubjects = day[shift].get(classKey);
        if (!cellSubjects.includes(label)) cellSubjects.push(label);
        shiftBuckets[shift].push({ startTime: sch.startTime, endTime: sch.endTime });
      }
    }

    const rowColors = ["#dbeafe", "#fecdd3", "#bbf7d0", "#e9d5ff", "#fde68a", "#cffafe"];
    const sortedDates = [...grid.keys()].sort();

    const rows = sortedDates.map((dateKey, idx) => {
      const { dateLabel, dayLabel } = formatDateSheetLabels(dateKey);

      const buildShiftCells = (shift) => {
        const cells = {};
        const shiftMap = grid.get(dateKey)[shift];
        for (const classKey of classKeys) {
          const subjects = shiftMap.get(classKey) || [];
          cells[classKey] = subjects.join(" + ");
        }
        return cells;
      };

      return {
        date: dateKey,
        dayLabel,
        dateLabel,
        color: rowColors[idx % rowColors.length],
        shifts: {
          "1st": buildShiftCells("1st"),
          "2nd": buildShiftCells("2nd"),
        },
      };
    });

    res.json({
      success: true,
      data: {
        examName: String(examName).trim(),
        sessionName: exams[0]?.sessionId?.name || "",
        classes,
        shiftTimings: {
          first: buildShiftTimingLabel(shiftBuckets["1st"]) || "08:30 a.m to 11:00 a.m",
          second: buildShiftTimingLabel(shiftBuckets["2nd"]) || "11:30 a.m to 01:30 p.m",
        },
        rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getExamById = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const exam = await Exam.findOne({ _id: req.params.examId, schoolId })
      .populate("sessionId", "name")
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjects.subjectId", "name code type")
      .populate("schedule.subjectId", "name code type");

    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    res.json({ success: true, data: normalizeExam(exam) });
  } catch (error) {
    next(error);
  }
};

export const updateExam = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const existing = await Exam.findOne({ _id: req.params.examId, schoolId });
    if (!existing) return res.status(404).json({ success: false, message: "Exam not found" });

    const merged = {
      name: req.body.name ?? existing.name,
      sessionId: req.body.sessionId ?? existing.sessionId,
      classId: req.body.classId ?? existing.classId,
      sectionId: req.body.sectionId === undefined ? existing.sectionId : req.body.sectionId,
      instructions: req.body.instructions ?? existing.instructions,
      syllabusUrl:
        req.body.syllabusUrl === undefined
          ? existing.syllabusUrl
          : String(req.body.syllabusUrl || "").trim(),
      subjects: req.body.subjects ?? existing.subjects,
      schedule: req.body.schedule ?? existing.schedule,
    };

    const err = await validateExamPayload(schoolId, merged);
    if (err) return res.status(400).json({ success: false, message: err });

    existing.name = merged.name;
    existing.sessionId = merged.sessionId;
    existing.classId = merged.classId;
    existing.sectionId = merged.sectionId || null;
    existing.instructions = merged.instructions || "";
    existing.syllabusUrl = merged.syllabusUrl || "";
    existing.subjects = merged.subjects.map((s) => normalizeSubjectPayload(s));
    existing.schedule = merged.schedule.map((x) => ({
      subjectId: x.subjectId,
      paperType: normalizePaperType(x.paperType),
      examDate: toDateOnly(x.examDate),
      startTime: String(x.startTime),
      endTime: String(x.endTime),
    }));
    await existing.save();

    const detailed = await Exam.findById(existing._id)
      .populate("sessionId", "name")
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjects.subjectId", "name code type")
      .populate("schedule.subjectId", "name code type");
    res.json({ success: true, data: normalizeExam(detailed) });
  } catch (error) {
    next(error);
  }
};

export const deleteExam = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const exam = await Exam.findOne({ _id: req.params.examId, schoolId });
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });

    const marksCount = await ExamMark.countDocuments({ schoolId, examId: exam._id });
    if (marksCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete exam because marks are already saved",
      });
    }
    await exam.deleteOne();
    res.json({ success: true, message: "Exam deleted" });
  } catch (error) {
    next(error);
  }
};

export const getExamStudents = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const exam = await Exam.findOne({ _id: req.params.examId, schoolId }).populate("classId", "name");
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });

    const studentFilter = { schoolId, className: exam.classId?.name };
    if (exam.sectionId) {
      const section = await Section.findById(exam.sectionId).select("name");
      if (section?.name) studentFilter.section = section.name;
    }

    const students = await Student.find(studentFilter)
      .select(
        "name admissionNumber rollNumber className section dob parents.father.name parents.mother.name documents.studentPhoto",
      )
      .sort({ section: 1, rollNumber: 1, admissionNumber: 1, name: 1 })
      .lean();

    res.json({ success: true, data: students });
  } catch (error) {
    next(error);
  }
};

export const getExamMarks = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const exam = await Exam.findOne({ _id: req.params.examId, schoolId }).select("_id");
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });

    const filter = { schoolId, examId: exam._id };
    if (req.query.studentId) filter.studentId = req.query.studentId;

    const marks = await ExamMark.find(filter)
      .select("studentId subjectId paperType value")
      .lean();
    const data = {};
    for (const m of marks) {
      const sid = String(m.studentId);
      const sub = String(m.subjectId);
      const paperType = normalizePaperType(m.paperType);
      if (!data[sid]) data[sid] = {};
      const existing = data[sid][sub];
      if (existing && typeof existing === "object") {
        existing[paperType] = m.value;
      } else if (existing != null && existing !== "") {
        data[sid][sub] = { Theory: String(existing), [paperType]: m.value };
      } else {
        data[sid][sub] = { [paperType]: m.value };
      }
    }
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const upsertExamMarks = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const exam = await Exam.findOne({ _id: req.params.examId, schoolId });
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });

    const marks = req.body?.marks;
    if (!marks || typeof marks !== "object") {
      return res.status(400).json({ success: false, message: "marks object is required" });
    }

    const subjectRules = getExamSubjectMap(exam);
    const studentIds = Object.keys(marks);
    if (!studentIds.length) return res.status(400).json({ success: false, message: "No marks provided" });

    const existingStudents = await Student.find({
      _id: { $in: studentIds },
      schoolId,
    }).select("_id");
    if (existingStudents.length !== studentIds.length) {
      return res.status(400).json({ success: false, message: "One or more studentId are invalid" });
    }

    const ops = [];
    for (const studentId of studentIds) {
      const subjectMap = marks[studentId] || {};
      for (const subjectId of Object.keys(subjectMap)) {
        if (!subjectRules.has(String(subjectId))) {
          return res.status(400).json({
            success: false,
            message: `Subject ${subjectId} is not configured for this exam`,
          });
        }
        const rule = subjectRules.get(String(subjectId));
        const cell = subjectMap[subjectId];
        const paperValues =
          cell && typeof cell === "object" && !Array.isArray(cell)
            ? cell
            : { Theory: cell };

        for (const [rawType, rawVal] of Object.entries(paperValues)) {
          const isGradeKey = String(rawType).trim().toLowerCase() === "grade";
          const paperType = isGradeKey ? "Grade" : normalizePaperType(rawType);

          // Optional subject grade (letters like A+, O, B) — not a marks paper.
          if (paperType === "Grade") {
            const grade = String(rawVal ?? "")
              .trim()
              .toUpperCase()
              .slice(0, 8);
            if (grade === "") {
              ops.push({
                deleteOne: {
                  filter: {
                    schoolId,
                    examId: exam._id,
                    studentId,
                    subjectId,
                    paperType: "Grade",
                  },
                },
              });
              continue;
            }
            if (!/^[A-Z0-9+\-]{1,8}$/.test(grade)) {
              return res.status(400).json({
                success: false,
                message: `Invalid grade for subject ${subjectId}`,
              });
            }
            ops.push({
              updateOne: {
                filter: {
                  schoolId,
                  examId: exam._id,
                  studentId,
                  subjectId,
                  paperType: "Grade",
                },
                update: { $set: { value: grade, paperType: "Grade" } },
                upsert: true,
              },
            });
            continue;
          }

          if (!rule.papers[paperType]) {
            return res.status(400).json({
              success: false,
              message: `${paperType} is not enabled for subject ${subjectId}`,
            });
          }
          const raw = String(rawVal ?? "").trim().toUpperCase();
          if (raw === "") {
            ops.push({
              deleteOne: {
                filter: {
                  schoolId,
                  examId: exam._id,
                  studentId,
                  subjectId,
                  paperType,
                },
              },
            });
            continue;
          }
          if (raw !== "AB") {
            const n = Number(raw);
            if (Number.isNaN(n)) {
              return res.status(400).json({
                success: false,
                message: `Invalid marks value for subject ${subjectId} (${paperType}). Enter numbers or AB only.`,
              });
            }
            const maxMarks = rule.papers[paperType].maxMarks;
            if (n < 0 || n > maxMarks) {
              return res.status(400).json({
                success: false,
                message: `Marks for subject ${subjectId} (${paperType}) must be in range 0..${maxMarks}`,
              });
            }
          }

          ops.push({
            updateOne: {
              filter: {
                schoolId,
                examId: exam._id,
                studentId,
                subjectId,
                paperType,
              },
              update: {
                $set: {
                  value: raw === "AB" ? "AB" : String(Number(raw)),
                  paperType,
                },
              },
              upsert: true,
            },
          });
        }
      }
    }

    const result = ops.length ? await ExamMark.bulkWrite(ops) : { upsertedCount: 0, modifiedCount: 0 };
    const updated = (result.upsertedCount || 0) + (result.modifiedCount || 0);
    res.json({ success: true, message: "Marks saved", data: { updated } });
  } catch (error) {
    next(error);
  }
};

export const mobileGetExamMarks = async (req, res, next) => {
  try {
    const role = req.user?.roleId?.name;
    if (!["Student", "Parent", "Teacher", "Staff"].includes(role)) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    if (role === "Student" || role === "Parent") {
      const key = role === "Student" ? "studentLogin.userId" : "parentLogin.userId";
      const student = await Student.findOne({ [key]: req.user._id }).select("_id");
      if (!student) return res.status(404).json({ success: false, message: "Student profile not found" });
      req.query.studentId = String(student._id);
    }

    return getExamMarks(req, res, next);
  } catch (error) {
    next(error);
  }
};

