import Timetable from "./timetable.model.js";
import ClassSubject from "../classSubject/classSubject.model.js";

/**
 * Create Timetable Entry
 */

export const createTimetable = async (req, res, next) => {
  try {
    const {
      classId,
      sectionId,
      day,
      periodId,
      subjectId,
      teacherId,
      schoolId,
    } = req.body;

    /* 1️⃣ Class Period Clash */
    const classClash = await Timetable.findOne({
      classId,
      sectionId,
      day,
      periodId,
    });

    if (classClash) {
      return res.status(400).json({
        success: false,
        message: "Class already has a subject for this period",
      });
    }

    /* 2️⃣ Teacher Clash */
    const teacherClash = await Timetable.findOne({
      teacherId,
      day,
      periodId,
    });

    if (teacherClash) {
      return res.status(400).json({
        success: false,
        message: "Teacher already assigned in another class for this period",
      });
    }

    /* 3️⃣ Weekly Subject Limit Validation */

    const classSubject = await ClassSubject.findOne({
      classId,
      subjectId,
    });

    if (!classSubject) {
      return res.status(400).json({
        success: false,
        message: "Subject not assigned to this class",
      });
    }

    const usedPeriods = await Timetable.countDocuments({
      classId,
      subjectId,
    });

    if (usedPeriods >= classSubject.periodsPerWeek) {
      return res.status(400).json({
        success: false,
        message: "Weekly subject period limit reached",
      });
    }

    /* 4️⃣ Create Entry */

    const timetable = await Timetable.create({
      schoolId,
      classId,
      sectionId,
      day,
      periodId,
      subjectId,
      teacherId,
    });

    res.status(201).json({
      success: true,
      data: timetable,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Timetable by Class + Section
 */

export const getClassTimetable = async (req, res, next) => {
  try {
    const { classId, sectionId } = req.params;

    const timetable = await Timetable.find({
      classId,
      sectionId,
    })
      .populate("subjectId", "name")
      .populate("teacherId", "name")
      .populate("periodId");

    res.json({
      success: true,
      data: timetable,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Teacher Timetable
 */

export const getTeacherTimetable = async (req, res, next) => {
  try {
    const { teacherId } = req.params;

    const timetable = await Timetable.find({
      teacherId,
    })
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name")
      .populate("periodId");

    res.json({
      success: true,
      data: timetable,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Timetable Entry
 */

export const deleteTimetable = async (req, res, next) => {
  try {
    await Timetable.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Timetable entry deleted",
    });
  } catch (error) {
    next(error);
  }
};
