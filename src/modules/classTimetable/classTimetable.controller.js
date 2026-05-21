import ClassTimetable from "./classTimetable.model.js";
import {
  resolveTeacherUserId,
  findPopulatedEntryById,
  enrichTimetableTeacherFields,
  POPULATE_PATHS,
} from "./classTimetable.utils.js";

const resolveSchoolId = (req) => {
  const roleName = req.user?.roleId?.name;
  if (roleName === "SuperAdmin") {
    return req.query.schoolId || req.body.schoolId || req.params.schoolId || null;
  }
  return req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
};

export const createClassTimetable = async (req, res, next) => {
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
      classId,
      sectionId,
      subjectId,
      startTime,
      endTime,
      day,
      roomNumber,
      joinLink,
      teacherId,
    } = req.body;

    if (!classId || !sectionId || !subjectId || !startTime || !endTime || !day || !teacherId) {
      return res.status(400).json({
        success: false,
        message:
          "classId, sectionId, subjectId, startTime, endTime, day and teacherId are required",
      });
    }

    // Optional: check slot clash (same class, section, day, overlapping time)
    const clash = await ClassTimetable.findOne({
      schoolId,
      classId,
      sectionId,
      day,
      $or: [
        {
          $and: [
            { startTime: { $lte: startTime } },
            { endTime: { $gt: startTime } },
          ],
        },
        {
          $and: [
            { startTime: { $lt: endTime } },
            { endTime: { $gte: endTime } },
          ],
        },
      ],
    });

    if (clash) {
      return res.status(400).json({
        success: false,
        message: "Time slot overlaps with an existing entry for this class/section/day",
      });
    }

    const resolvedTeacherId = await resolveTeacherUserId(teacherId);
    if (!resolvedTeacherId) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid teacherId. Use the teacher's login (User) id, or a Staff id that has a linked user account.",
      });
    }

    const entry = await ClassTimetable.create({
      schoolId,
      classId,
      sectionId,
      subjectId,
      startTime,
      endTime,
      day,
      roomNumber: roomNumber || "",
      joinLink: joinLink || "",
      teacherId: resolvedTeacherId,
    });

    const populated = await findPopulatedEntryById(entry._id);
    await enrichTimetableTeacherFields(populated);

    res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

export const getClassTimetables = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query). Example: ?schoolId=..."
            : "School context missing",
      });
    }

    const { classId, sectionId, day } = req.query;
    const filter = { schoolId };
    if (classId) filter.classId = classId;
    if (sectionId) filter.sectionId = sectionId;
    if (day) filter.day = day;

    const entries = await ClassTimetable.find(filter)
      .populate(POPULATE_PATHS)
      .sort({ day: 1, startTime: 1 });

    await enrichTimetableTeacherFields(entries);

    res.json({
      success: true,
      data: entries,
    });
  } catch (error) {
    next(error);
  }
};

export const getClassTimetableByClassAndSection = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query). Example: ?schoolId=..."
            : "School context missing",
      });
    }

    const { classId, sectionId } = req.params;

    const entries = await ClassTimetable.find({
      schoolId,
      classId,
      sectionId,
    })
      .populate([
        { path: "classId", select: "name" },
        { path: "sectionId", select: "name" },
        { path: "subjectId", select: "name code type" },
        { path: "teacherId", select: "name" },
      ])
      .sort({ day: 1, startTime: 1 });

    await enrichTimetableTeacherFields(entries);

    res.json({
      success: true,
      data: entries,
    });
  } catch (error) {
    next(error);
  }
};

export const getClassTimetableByTeacher = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query). Example: ?schoolId=..."
            : "School context missing",
      });
    }

    const { teacherId } = req.params;

    const entries = await ClassTimetable.find({
      schoolId,
      teacherId,
    })
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name code")
      .sort({ day: 1, startTime: 1 });

    res.json({
      success: true,
      data: entries,
    });
  } catch (error) {
    next(error);
  }
};

export const getClassTimetableById = async (req, res, next) => {
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

    const entry = await ClassTimetable.findOne({
      _id: req.params.id,
      schoolId,
    }).populate([
      { path: "classId", select: "name" },
      { path: "sectionId", select: "name" },
      { path: "subjectId", select: "name code type" },
      { path: "teacherId", select: "name" },
    ]);

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Timetable entry not found",
      });
    }

    await enrichTimetableTeacherFields(entry);

    res.json({
      success: true,
      data: entry,
    });
  } catch (error) {
    next(error);
  }
};

export const updateClassTimetable = async (req, res, next) => {
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

    const entry = await ClassTimetable.findOne({
      _id: req.params.id,
      schoolId,
    });

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Timetable entry not found",
      });
    }

    const {
      classId,
      sectionId,
      subjectId,
      startTime,
      endTime,
      day,
      roomNumber,
      joinLink,
      teacherId,
    } = req.body;

    if (classId !== undefined) entry.classId = classId;
    if (sectionId !== undefined) entry.sectionId = sectionId;
    if (subjectId !== undefined) entry.subjectId = subjectId;
    if (startTime !== undefined) entry.startTime = startTime;
    if (endTime !== undefined) entry.endTime = endTime;
    if (day !== undefined) entry.day = day;
    if (roomNumber !== undefined) entry.roomNumber = roomNumber;
    if (joinLink !== undefined) entry.joinLink = joinLink;
    if (teacherId !== undefined) {
      const resolvedTeacherId = await resolveTeacherUserId(teacherId);
      if (!resolvedTeacherId) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid teacherId. Use the teacher's login (User) id, or a Staff id that has a linked user account.",
        });
      }
      entry.teacherId = resolvedTeacherId;
    }

    await entry.save();

    const populated = await findPopulatedEntryById(entry._id);
    await enrichTimetableTeacherFields(populated);

    res.json({
      success: true,
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteClassTimetable = async (req, res, next) => {
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

    const deleted = await ClassTimetable.findOneAndDelete({
      _id: req.params.id,
      schoolId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Timetable entry not found",
      });
    }

    res.json({
      success: true,
      message: "Timetable entry deleted",
    });
  } catch (error) {
    next(error);
  }
};
