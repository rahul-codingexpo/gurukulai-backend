import Exam from "../exam/exam.model.js";
import Student from "../student/student.model.js";
import School from "../school/school.model.js";
import { resolveStudentClassSectionIds } from "../../utils/resolveClassByName.util.js";

const roleNameOf = (req) => req.user?.roleId?.name;

const mapChildSummary = (student) => ({
  id: String(student._id),
  _id: String(student._id),
  name: student.name || "",
  className: student.className || "",
  section: student.section || "",
  admissionNumber: student.admissionNumber || "",
  rollNumber: student.rollNumber || "",
});

const toDateOnly = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const formatDDMMYYYY = (value) => {
  const x = toDateOnly(value);
  if (!x) return "";
  const dd = String(x.getUTCDate()).padStart(2, "0");
  const mm = String(x.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = x.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const parseTimeToMinutes = (value) => {
  const s = String(value || "").trim();
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    return parseInt(m24[1], 10) * 60 + parseInt(m24[2], 10);
  }
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = parseInt(m12[2], 10);
    const ap = m12[3].toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return h * 60 + min;
  }
  return Number.MAX_SAFE_INTEGER;
};

/** Map exam.schedule → mobile admit-card rows (subject / date / time). */
const mapAdmitSchedule = (schedule = []) =>
  (schedule || [])
    .map((row) => {
      const sub = row.subjectId;
      const subjectName = (sub?.name || "").trim();
      const paper = String(row.paperType || "Theory").trim() || "Theory";
      const label =
        subjectName && paper && paper !== "Theory"
          ? `${subjectName} (${paper})`
          : subjectName || "Subject";
      const start = String(row.startTime || "").trim();
      const end = String(row.endTime || "").trim();
      const timeRange =
        start && end ? `${start} - ${end}` : start || end || "";
      return {
        subjectId: String(sub?._id ?? sub ?? ""),
        subject_name: label,
        subjectName: label,
        subject: label,
        paper_type: paper,
        date: formatDDMMYYYY(row.examDate),
        examDate: row.examDate,
        start_time: start,
        end_time: end,
        startTime: start,
        endTime: end,
        time_range: timeRange,
        time: timeRange,
      };
    })
    .filter((row) => row.date || row.time_range)
    .sort((a, b) => {
      const ta = toDateOnly(a.examDate)?.getTime?.() ?? Number.MAX_SAFE_INTEGER;
      const tb = toDateOnly(b.examDate)?.getTime?.() ?? Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      const timeCmp =
        parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time);
      if (timeCmp !== 0) return timeCmp;
      return String(a.paper_type || "").localeCompare(String(b.paper_type || ""));
    });

/**
 * Resolve the student record for admit-card.
 * Student → own linked profile only (ignores client studentId).
 * Parent → optional ?studentId= must belong to parentLogin.userId set;
 *          otherwise first linked child (single-child convenience).
 * Returns { student } | { error: { status, message } }.
 */
const resolveAdmitStudent = async (req) => {
  const role = roleNameOf(req);
  const userId = req.user?._id;

  if (role === "Student") {
    const student = await Student.findOne({
      "studentLogin.userId": userId,
    }).lean();
    if (!student) {
      return {
        error: { status: 404, message: "Student profile not found" },
      };
    }
    return { student };
  }

  if (role === "Parent") {
    const linked = await Student.find({
      "parentLogin.userId": userId,
    }).lean();
    if (!linked.length) {
      return {
        error: { status: 404, message: "Student profile not found" },
      };
    }

    const requested = String(req.query?.studentId || "").trim();
    if (requested) {
      const match = linked.find((s) => String(s._id) === requested);
      if (!match) {
        return {
          error: {
            status: 403,
            message: "Not allowed to access this student's admit card",
          },
        };
      }
      return { student: match, children: linked };
    }

    return { student: linked[0], children: linked };
  }

  return {
    error: {
      status: 403,
      message: "Only Student and Parent can load admit cards",
    },
  };
};

const studentCanAccessExam = (exam, classIds, sectionIds) => {
  const okClass = classIds.some(
    (id) => String(id) === String(exam.classId?._id ?? exam.classId),
  );
  if (!okClass) return false;
  const sec = exam.sectionId?._id ?? exam.sectionId;
  if (sec == null || sec === "") return true;
  return sectionIds.some((id) => String(id) === String(sec));
};

const splitInstructions = (raw) => {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  const text = String(raw || "").trim();
  if (!text) return [];
  return text
    .split(/\r?\n|•|;/)
    .map((s) => s.trim())
    .filter(Boolean);
};

const populateAdmitExam = (query) =>
  query
    .populate("classId", "name")
    .populate("sectionId", "name")
    .populate("schedule.subjectId", "name code type");

/** GET /api/mobile/admit-card/children — Parent linked children (Student → self) */
export const listMobileAdmitCardChildren = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (role !== "Student" && role !== "Parent") {
      return res.status(403).json({
        success: false,
        message: "Only Student and Parent can access this endpoint",
      });
    }

    if (role === "Student") {
      const student = await Student.findOne({
        "studentLogin.userId": req.user._id,
      }).lean();
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found",
        });
      }
      return res.json({
        success: true,
        data: [mapChildSummary(student)],
      });
    }

    const linked = await Student.find({
      "parentLogin.userId": req.user._id,
    })
      .sort({ name: 1 })
      .lean();

    return res.json({
      success: true,
      data: linked.map(mapChildSummary),
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/mobile/admit-card?examId=&studentId= */
export const getMobileAdmitCard = async (req, res, next) => {
  try {
    const resolved = await resolveAdmitStudent(req);
    if (resolved.error) {
      return res.status(resolved.error.status).json({
        success: false,
        message: resolved.error.message,
      });
    }

    const student = resolved.student;
    const { classIds, sectionIds } = await resolveStudentClassSectionIds(student);
    let exam = null;

    if (req.query.examId) {
      exam = await populateAdmitExam(Exam.findById(req.query.examId)).lean();

      if (!exam) {
        return res.status(404).json({
          success: false,
          message: "Exam not found",
        });
      }

      if (String(exam.schoolId) !== String(student.schoolId)) {
        return res.status(403).json({
          success: false,
          message: "Exam does not belong to your school",
        });
      }

      if (!studentCanAccessExam(exam, classIds, sectionIds)) {
        return res.status(403).json({
          success: false,
          message: "You are not eligible for this exam admit card",
        });
      }
    } else {
      // Pick most recent exam for student's class/section
      const filter = { schoolId: student.schoolId };
      if (classIds.length) filter.classId = { $in: classIds };
      if (sectionIds.length) {
        filter.$or = [
          { sectionId: { $in: sectionIds } },
          { sectionId: null },
          { sectionId: { $exists: false } },
        ];
      }

      exam = await populateAdmitExam(Exam.findOne(filter))
        .sort({ createdAt: -1 })
        .lean();

      if (!exam) {
        return res.status(404).json({
          success: false,
          message: "No exam found for admit card",
        });
      }
    }

    const school = await School.findById(student.schoolId)
      .select("name")
      .lean();

    const className =
      exam.classId?.name ||
      student.className ||
      "";
    const sectionName =
      exam.sectionId?.name ||
      student.section ||
      "";
    const classLabel = sectionName
      ? `${className}-${sectionName}`
      : className;

    const instructions = splitInstructions(exam.instructions);
    const schedule = mapAdmitSchedule(exam.schedule);

    res.json({
      success: true,
      data: {
        schoolName: school?.name || "School",
        school: school?.name || "School",
        studentId: String(student._id),
        studentName: student.name || "",
        name: student.name || "",
        className: classLabel,
        class: classLabel,
        examName: exam.name || "",
        exam: exam.name || "",
        title: exam.name || "",
        rollNumber: student.rollNumber || "",
        rollNo: student.rollNumber || "",
        photo: student.documents?.studentPhoto || "",
        photoUrl: student.documents?.studentPhoto || "",
        profilePhoto: student.documents?.studentPhoto || "",
        instructions,
        instruction: instructions.join("\n"),
        examId: String(exam._id),
        schedule,
        timetable: schedule,
        examSchedule: schedule,
      },
    });
  } catch (error) {
    next(error);
  }
};
