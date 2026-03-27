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
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

const isClass11Or12 = (className) => /\b(11|12)\b/.test(String(className || ""));

const getExamSubjectMap = (exam) => {
  const map = new Map();
  for (const s of exam.subjects || []) {
    map.set(String(s.subjectId), { maxMarks: s.maxMarks, passMarks: s.passMarks });
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
    subjects: (e.subjects || []).map((s) => ({
      subjectId: s.subjectId?._id || s.subjectId,
      subjectName: s.subjectId?.name || "",
      maxMarks: s.maxMarks,
      passMarks: s.passMarks,
    })),
    schedule: (e.schedule || []).map((x) => ({
      subjectId: x.subjectId?._id || x.subjectId,
      subjectName:
        x.subjectId?.name || subjectNameMap.get(String(x.subjectId?._id || x.subjectId)) || "",
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
    if (!s.subjectId || Number(s.maxMarks) <= 0) return "Invalid subject maxMarks";
    if (Number(s.passMarks) < 0 || Number(s.passMarks) > Number(s.maxMarks)) {
      return "passMarks must be between 0 and maxMarks";
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

  const scheduleSubIds = schedule.map((x) => String(x.subjectId));
  for (const x of schedule) {
    const date = toDateOnly(x.examDate);
    if (!x.subjectId || !date || !x.startTime || !x.endTime) {
      return "Each schedule row must contain subjectId, examDate, startTime, endTime";
    }
    if (x.startTime >= x.endTime) return "startTime must be less than endTime";
  }
  for (const sid of scheduleSubIds) {
    if (!subIds.includes(String(sid))) {
      return "Schedule contains subject not present in subjects list";
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
      subjects: payload.subjects.map((s) => ({
        subjectId: s.subjectId,
        maxMarks: Number(s.maxMarks),
        passMarks: Number(s.passMarks),
      })),
      schedule: payload.schedule.map((x) => ({
        subjectId: x.subjectId,
        examDate: toDateOnly(x.examDate),
        startTime: String(x.startTime),
        endTime: String(x.endTime),
      })),
    });

    const detailed = await Exam.findById(exam._id)
      .populate("sessionId", "name")
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjects.subjectId", "name")
      .populate("schedule.subjectId", "name");

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
      })),
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
      .populate("subjects.subjectId", "name")
      .populate("schedule.subjectId", "name");

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
    existing.subjects = merged.subjects.map((s) => ({
      subjectId: s.subjectId,
      maxMarks: Number(s.maxMarks),
      passMarks: Number(s.passMarks),
    }));
    existing.schedule = merged.schedule.map((x) => ({
      subjectId: x.subjectId,
      examDate: toDateOnly(x.examDate),
      startTime: String(x.startTime),
      endTime: String(x.endTime),
    }));
    await existing.save();

    const detailed = await Exam.findById(existing._id)
      .populate("sessionId", "name")
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjects.subjectId", "name")
      .populate("schedule.subjectId", "name");
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
      .select("name admissionNumber rollNumber className section")
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

    const marks = await ExamMark.find(filter).select("studentId subjectId value").lean();
    const data = {};
    for (const m of marks) {
      const sid = String(m.studentId);
      const sub = String(m.subjectId);
      if (!data[sid]) data[sid] = {};
      data[sid][sub] = m.value;
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
        const raw = String(subjectMap[subjectId]).trim().toUpperCase();
        if (raw !== "AB") {
          const n = Number(raw);
          if (Number.isNaN(n)) {
            return res.status(400).json({ success: false, message: `Invalid marks value for subject ${subjectId}` });
          }
          const maxMarks = subjectRules.get(String(subjectId)).maxMarks;
          if (n < 0 || n > maxMarks) {
            return res.status(400).json({
              success: false,
              message: `Marks for subject ${subjectId} must be in range 0..${maxMarks}`,
            });
          }
        }

        ops.push({
          updateOne: {
            filter: { schoolId, examId: exam._id, studentId, subjectId },
            update: { $set: { value: raw === "AB" ? "AB" : String(Number(raw)) } },
            upsert: true,
          },
        });
      }
    }

    const result = ops.length ? await ExamMark.bulkWrite(ops) : { upsertedCount: 0, modifiedCount: 0 };
    const updated = (result.upsertedCount || 0) + (result.modifiedCount || 0);
    res.json({ success: true, message: "Marks saved", data: { updated } });
  } catch (error) {
    next(error);
  }
};

// Mobile read APIs
export const mobileListExams = listExams;
export const mobileGetExamById = getExamById;

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

