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
      exam = await Exam.findById(req.query.examId)
        .populate("classId", "name")
        .populate("sectionId", "name")
        .lean();

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

      exam = await Exam.findOne(filter)
        .populate("classId", "name")
        .populate("sectionId", "name")
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
      },
    });
  } catch (error) {
    next(error);
  }
};
