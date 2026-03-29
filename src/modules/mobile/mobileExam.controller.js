import Exam from "../exam/exam.model.js";
import Student from "../student/student.model.js";
import ClassModel from "../academic/class.model.js";
import Section from "../academic/section.model.js";

const roleNameOf = (req) => req.user?.roleId?.name;

const resolveSchoolId = (req) => {
  const role = roleNameOf(req);
  if (role === "SuperAdmin") {
    return req.query.schoolId || null;
  }
  return req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
};

const resolveStudentSelf = async (req) => {
  const role = roleNameOf(req);
  if (role === "Student") {
    return Student.findOne({ "studentLogin.userId": req.user._id }).select(
      "_id schoolId className section",
    );
  }
  if (role === "Parent") {
    return Student.findOne({ "parentLogin.userId": req.user._id }).select(
      "_id schoolId className section",
    );
  }
  return null;
};

const resolveStudentClassSectionIds = async (student) => {
  const schoolId = student.schoolId;
  const classes = await ClassModel.find({
    schoolId,
    name: student.className,
  }).select("_id");

  if (!classes.length) {
    return { classIds: [], sectionIds: [] };
  }

  const classIds = classes.map((c) => c._id);
  const sections = await Section.find({
    schoolId,
    classId: { $in: classIds },
    name: student.section,
  }).select("_id");

  return { classIds, sectionIds: sections.map((s) => s._id) };
};

const toDateOnly = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const formatDDMMYYYY = (value) => {
  const x = toDateOnly(value);
  if (!x) return null;
  const dd = String(x.getUTCDate()).padStart(2, "0");
  const mm = String(x.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = x.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const iconIdentifierFromSubject = (name, code) => {
  const raw = String(code || name || "subject")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return raw || "subject";
};

const computePeriodStatus = (schedule, now = new Date()) => {
  if (!schedule?.length) {
    return {
      status: "UPCOMING",
      dateStart: null,
      dateEnd: null,
      displayDate: null,
    };
  }
  const dates = schedule
    .map((s) => toDateOnly(s.examDate))
    .filter(Boolean);
  if (!dates.length) {
    return {
      status: "UPCOMING",
      dateStart: null,
      dateEnd: null,
      displayDate: null,
    };
  }
  const minT = Math.min(...dates.map((d) => d.getTime()));
  const maxT = Math.max(...dates.map((d) => d.getTime()));
  const dateStart = new Date(minT);
  const dateEnd = new Date(maxT);
  const today = toDateOnly(now);
  const t = today.getTime();
  let status;
  if (maxT < t) status = "COMPLETED";
  else if (minT > t) status = "UPCOMING";
  else status = "ONGOING";
  return {
    status,
    dateStart,
    dateEnd,
    displayDate: formatDDMMYYYY(dateStart),
  };
};

const buildMobileListItem = (examLean, now = new Date()) => {
  const period = computePeriodStatus(examLean.schedule, now);
  const syllabus = (examLean.syllabusUrl || "").trim();
  const instr = (examLean.instructions || "").trim();
  return {
    id: examLean._id,
    title: examLean.name,
    name: examLean.name,
    displayDate: period.displayDate,
    dateStart: period.dateStart,
    dateEnd: period.dateEnd,
    status: period.status,
    statusKey: period.status.toLowerCase(),
    sessionId: examLean.sessionId?._id ?? examLean.sessionId ?? null,
    sessionName: examLean.sessionId?.name ?? null,
    classId: examLean.classId?._id ?? examLean.classId ?? null,
    className: examLean.classId?.name ?? null,
    sectionId: examLean.sectionId?._id ?? examLean.sectionId ?? null,
    sectionName: examLean.sectionId?.name ?? null,
    syllabusUrl: syllabus || null,
    hasSyllabus: Boolean(syllabus || instr),
  };
};

const summaryFromItems = (items) => {
  let upcoming = 0;
  let ongoing = 0;
  let completed = 0;
  for (const i of items) {
    if (i.status === "UPCOMING") upcoming += 1;
    else if (i.status === "ONGOING") ongoing += 1;
    else if (i.status === "COMPLETED") completed += 1;
  }
  return { upcoming, ongoing, completed };
};

const studentCanAccessExam = (exam, classIds, sectionIds) => {
  const okClass = classIds.some((id) => String(id) === String(exam.classId?._id ?? exam.classId));
  if (!okClass) return false;
  const sec = exam.sectionId?._id ?? exam.sectionId;
  if (sec == null || sec === "") return true;
  return sectionIds.some((id) => String(id) === String(sec));
};

const marksBySubjectId = (subjects) => {
  const m = new Map();
  for (const s of subjects || []) {
    const sid = String(s.subjectId?._id ?? s.subjectId);
    m.set(sid, { maxMarks: s.maxMarks, passMarks: s.passMarks });
  }
  return m;
};

/** GET /api/mobile/exams */
export const listMobileExams = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    const now = new Date();
    const statusQuery = (req.query.status || "all").toLowerCase();

    if (role === "Student" || role === "Parent") {
      const student = await resolveStudentSelf(req);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found for this user",
        });
      }

      const { classIds, sectionIds } = await resolveStudentClassSectionIds(student);
      if (!classIds.length || !sectionIds.length) {
        return res.json({
          success: true,
          summary: { upcoming: 0, ongoing: 0, completed: 0 },
          data: [],
        });
      }

      const filter = {
        schoolId: student.schoolId,
        classId: { $in: classIds },
        $or: [{ sectionId: null }, { sectionId: { $in: sectionIds } }],
      };
      if (req.query.sessionId) filter.sessionId = req.query.sessionId;

      const exams = await Exam.find(filter)
        .populate("sessionId", "name")
        .populate("classId", "name")
        .populate("sectionId", "name")
        .sort({ createdAt: -1 })
        .lean();

      let items = exams.map((e) => buildMobileListItem(e, now));
      const summary = summaryFromItems(items);

      if (statusQuery === "upcoming") {
        items = items.filter((i) => i.status === "UPCOMING");
      } else if (statusQuery === "ongoing") {
        items = items.filter((i) => i.status === "ONGOING");
      } else if (statusQuery === "completed") {
        items = items.filter((i) => i.status === "COMPLETED");
      }

      return res.json({ success: true, summary, data: items });
    }

    if (role === "Teacher" || role === "Staff") {
      const schoolId = resolveSchoolId(req);
      if (!schoolId) {
        return res.status(400).json({
          success: false,
          message: "School context missing",
        });
      }

      const filter = { schoolId };
      if (req.query.sessionId) filter.sessionId = req.query.sessionId;
      if (req.query.classId) filter.classId = req.query.classId;
      if (req.query.sectionId) filter.sectionId = req.query.sectionId;

      const exams = await Exam.find(filter)
        .populate("sessionId", "name")
        .populate("classId", "name")
        .populate("sectionId", "name")
        .sort({ createdAt: -1 })
        .lean();

      let items = exams.map((e) => buildMobileListItem(e, now));
      const summary = summaryFromItems(items);

      if (statusQuery === "upcoming") {
        items = items.filter((i) => i.status === "UPCOMING");
      } else if (statusQuery === "ongoing") {
        items = items.filter((i) => i.status === "ONGOING");
      } else if (statusQuery === "completed") {
        items = items.filter((i) => i.status === "COMPLETED");
      }

      return res.json({ success: true, summary, data: items });
    }

    return res.status(403).json({
      success: false,
      message: "Exams list is available for Student, Parent, Teacher, or Staff",
    });
  } catch (err) {
    next(err);
  }
};

/** GET /api/mobile/exams/:examId */
export const getMobileExamById = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    const schoolId = resolveSchoolId(req);

    const exam = await Exam.findById(req.params.examId)
      .populate("sessionId", "name")
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjects.subjectId", "name code type")
      .populate("schedule.subjectId", "name code type");

    if (!exam) {
      return res.status(404).json({ success: false, message: "Exam not found" });
    }

    const examSchool = exam.schoolId?._id ?? exam.schoolId;

    if (role === "Student" || role === "Parent") {
      const student = await resolveStudentSelf(req);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found for this user",
        });
      }
      if (String(examSchool) !== String(student.schoolId)) {
        return res.status(403).json({
          success: false,
          message: "Not allowed to view this exam",
        });
      }
      const { classIds, sectionIds } = await resolveStudentClassSectionIds(student);
      if (!studentCanAccessExam(exam, classIds, sectionIds)) {
        return res.status(403).json({
          success: false,
          message: "Not allowed to view this exam",
        });
      }
    } else if (role === "Teacher" || role === "Staff") {
      if (!schoolId || String(examSchool) !== String(schoolId)) {
        return res.status(403).json({
          success: false,
          message: "Not allowed to view this exam",
        });
      }
    } else {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    const now = new Date();
    const period = computePeriodStatus(exam.schedule, now);
    const marksMap = marksBySubjectId(exam.subjects);
    const syllabus = (exam.syllabusUrl || "").trim();
    const instr = (exam.instructions || "").trim();

    const scheduleRows = (exam.schedule || []).map((row) => {
      const sid = String(row.subjectId?._id ?? row.subjectId);
      const sub = row.subjectId;
      const meta = marksMap.get(sid) || { maxMarks: null, passMarks: null };
      const subjectName = sub?.name || "";
      const subjectCode = sub?.code || "";
      const examType =
        (sub?.type || "").trim() || "Theory";
      return {
        subjectId: sid,
        subject_name: subjectName,
        subject_code: subjectCode,
        exam_type: examType,
        total_marks: meta.maxMarks,
        pass_marks: meta.passMarks,
        date: formatDDMMYYYY(row.examDate),
        examDate: row.examDate,
        start_time: row.startTime,
        end_time: row.endTime,
        time_range: `${row.startTime} - ${row.endTime}`,
        icon_identifier: iconIdentifierFromSubject(subjectName, subjectCode),
      };
    });

    const data = {
      id: exam._id,
      title: exam.name,
      name: exam.name,
      displayDate: period.displayDate,
      dateStart: period.dateStart,
      dateEnd: period.dateEnd,
      status: period.status,
      statusKey: period.status.toLowerCase(),
      sessionId: exam.sessionId?._id ?? exam.sessionId,
      sessionName: exam.sessionId?.name ?? null,
      classId: exam.classId?._id ?? exam.classId,
      className: exam.classId?.name ?? null,
      sectionId: exam.sectionId?._id ?? exam.sectionId ?? null,
      sectionName: exam.sectionId?.name ?? null,
      instructions: exam.instructions || "",
      syllabusUrl: syllabus || null,
      hasSyllabus: Boolean(syllabus || instr),
      subjects: (exam.subjects || []).map((s) => ({
        subjectId: String(s.subjectId?._id ?? s.subjectId),
        subject_name: s.subjectId?.name || "",
        subject_code: s.subjectId?.code || "",
        exam_type: (s.subjectId?.type || "").trim() || "Theory",
        total_marks: s.maxMarks,
        pass_marks: s.passMarks,
        icon_identifier: iconIdentifierFromSubject(
          s.subjectId?.name || "",
          s.subjectId?.code || "",
        ),
      })),
      schedule: scheduleRows,
    };

    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
