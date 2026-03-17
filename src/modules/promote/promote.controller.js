import Promotion from "./promotion.model.js";
import Student from "../student/student.model.js";
import Class from "../academic/class.model.js";
import Section from "../academic/section.model.js";
import Session from "../academic/session.model.js";

const resolveSchoolId = (req) => {
  const roleName = req.user?.roleId?.name;
  if (roleName === "SuperAdmin") {
    return (
      req.query.schoolId ||
      req.body.schoolId ||
      req.params.schoolId ||
      null
    );
  }
  return req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
};

/**
 * List students of a class (optionally filtered by section) for promotion.
 * Query: fromClassId, fromSectionId (optional), schoolId (SuperAdmin).
 * Response: enrollment no (admissionNumber), student name, section, roll no, studentId.
 */
export const getStudentsForPromotion = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query)"
            : "School context missing",
      });
    }

    const { fromClassId, fromSectionId } = req.query;
    if (!fromClassId) {
      return res.status(400).json({
        success: false,
        message: "fromClassId is required",
      });
    }

    const fromClass = await Class.findOne({
      _id: fromClassId,
      schoolId,
    });
    if (!fromClass) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    let sectionName = null;
    if (fromSectionId) {
      const section = await Section.findOne({
        _id: fromSectionId,
        classId: fromClassId,
        schoolId,
      });
      if (!section) {
        return res.status(404).json({
          success: false,
          message: "Section not found",
        });
      }
      sectionName = section.name;
    }

    const filter = { schoolId, className: fromClass.name };
    if (sectionName) filter.section = sectionName;

    const students = await Student.find(filter)
      .select("_id name admissionNumber rollNumber className section")
      .sort({ section: 1, rollNumber: 1 });

    const data = students.map((s) => ({
      _id: s._id,
      enrollmentNo: s.admissionNumber,
      studentName: s.name,
      section: s.section,
      rollNo: s.rollNumber,
      className: s.className,
    }));

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get sections for "Map Class Section" – sections of from-class and to-class.
 * Query: fromClassId, toClassId, schoolId (SuperAdmin).
 */
export const getSectionsForMap = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query)"
            : "School context missing",
      });
    }

    const { fromClassId, toClassId } = req.query;
    if (!fromClassId || !toClassId) {
      return res.status(400).json({
        success: false,
        message: "fromClassId and toClassId are required",
      });
    }

    const [fromClass, toClass] = await Promise.all([
      Class.findOne({ _id: fromClassId, schoolId }),
      Class.findOne({ _id: toClassId, schoolId }),
    ]);

    if (!fromClass || !toClass) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    const [fromSections, toSections] = await Promise.all([
      Section.find({ classId: fromClassId, schoolId }).select("_id name"),
      Section.find({ classId: toClassId, schoolId }).select("_id name"),
    ]);

    res.json({
      success: true,
      data: {
        fromClass: { _id: fromClass._id, name: fromClass.name },
        toClass: { _id: toClass._id, name: toClass.name },
        fromSections,
        toSections,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Promote students to the next session/class/section.
 * Body: toSessionId, fromClassId, toClassId, sectionMappings: [{ fromSectionId, toSectionId }], studentIds (optional; if omitted, all students in fromClass are promoted).
 * Each student's className and section are updated to the target class/section; a Promotion record is created.
 */
export const promoteStudents = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query or body)"
            : "School context missing",
      });
    }

    const {
      toSessionId,
      fromClassId,
      toClassId,
      sectionMappings,
      studentIds,
    } = req.body;

    if (!toSessionId || !fromClassId || !toClassId) {
      return res.status(400).json({
        success: false,
        message: "toSessionId, fromClassId and toClassId are required",
      });
    }

    if (!sectionMappings || !Array.isArray(sectionMappings) || sectionMappings.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "sectionMappings array is required (e.g. [{ fromSectionId, toSectionId }])",
      });
    }

    const [fromClass, toClass, toSession] = await Promise.all([
      Class.findOne({ _id: fromClassId, schoolId }),
      Class.findOne({ _id: toClassId, schoolId }),
      Session.findOne({ _id: toSessionId, schoolId }),
    ]);

    if (!fromClass || !toClass || !toSession) {
      return res.status(404).json({
        success: false,
        message: "Class or Session not found",
      });
    }

    const toSectionIds = sectionMappings.map((m) => m.toSectionId);
    const toSections = await Section.find({
      _id: { $in: toSectionIds },
      schoolId,
      classId: toClassId,
    });
    const toSectionMap = new Map(toSections.map((s) => [s._id.toString(), s]));

    const fromSectionIdToToSection = new Map(
      sectionMappings.map((m) => [m.fromSectionId.toString(), m.toSectionId.toString()])
    );

    const studentFilter = { schoolId, className: fromClass.name };
    if (studentIds && studentIds.length > 0) {
      studentFilter._id = { $in: studentIds };
    }

    const students = await Student.find(studentFilter);
    const promoted = [];
    const errors = [];

    for (const student of students) {
      const fromSection = await Section.findOne({
        schoolId,
        classId: fromClassId,
        name: student.section,
      });
      if (!fromSection) {
        errors.push({
          studentId: student._id,
          admissionNumber: student.admissionNumber,
          reason: "Section not found for current section name",
        });
        continue;
      }

      const toSectionIdStr = fromSectionIdToToSection.get(
        fromSection._id.toString()
      );
      if (!toSectionIdStr) {
        errors.push({
          studentId: student._id,
          admissionNumber: student.admissionNumber,
          reason: "No section mapping for current section",
        });
        continue;
      }

      const toSection = toSectionMap.get(toSectionIdStr);
      if (!toSection) {
        errors.push({
          studentId: student._id,
          admissionNumber: student.admissionNumber,
          reason: "Target section not found",
        });
        continue;
      }

      const existing = await Promotion.findOne({
        studentId: student._id,
        toSessionId,
      });
      if (existing) {
        errors.push({
          studentId: student._id,
          admissionNumber: student.admissionNumber,
          reason: "Already promoted to this session",
        });
        continue;
      }

      student.className = toClass.name;
      student.section = toSection.name;
      await student.save();

      await Promotion.create({
        schoolId,
        studentId: student._id,
        fromSessionId: fromClass.sessionId,
        toSessionId,
        fromClassId,
        toClassId,
        fromSectionId: fromSection._id,
        toSectionId: toSection._id,
        promotedBy: req.user._id,
      });

      promoted.push({
        _id: student._id,
        admissionNumber: student.admissionNumber,
        name: student.name,
        newClassName: toClass.name,
        newSection: toSection.name,
      });
    }

    res.status(200).json({
      success: true,
      message: `Promoted ${promoted.length} student(s)`,
      data: {
        promoted,
        errors: errors.length ? errors : undefined,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get promotion history for a session or student.
 * Query: schoolId (SuperAdmin), toSessionId (optional), studentId (optional).
 */
export const getPromotionHistory = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query)"
            : "School context missing",
      });
    }

    const { toSessionId, studentId } = req.query;
    const filter = { schoolId };
    if (toSessionId) filter.toSessionId = toSessionId;
    if (studentId) filter.studentId = studentId;

    const history = await Promotion.find(filter)
      .populate("studentId", "name admissionNumber")
      .populate("fromSessionId", "name")
      .populate("toSessionId", "name")
      .populate("fromClassId", "name")
      .populate("toClassId", "name")
      .populate("fromSectionId", "name")
      .populate("toSectionId", "name")
      .populate("promotedBy", "name")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
};
