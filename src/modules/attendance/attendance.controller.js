import Attendance from "./attendance.model.js";

export const markAttendance = async (req, res, next) => {
  try {
    const {
      date,
      periodNumber,
      subjectId,
      classId,
      sectionId,
      sessionId,
      students,
    } = req.body;

    const attendance = await Attendance.findOneAndUpdate(
      {
        date,
        periodNumber,
        subjectId,
        sectionId,
        schoolId: req.schoolId,
      },
      {
        date,
        periodNumber,
        subjectId,
        classId,
        sectionId,
        sessionId,
        schoolId: req.schoolId,
        students,
      },
      { upsert: true, new: true },
    );

    res.status(200).json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    next(error);
  }
};

export const getAttendanceByDate = async (req, res, next) => {
  try {
    const { date, sectionId } = req.query;

    const records = await Attendance.find({
      date,
      sectionId,
      schoolId: req.schoolId,
    })
      .populate("subjectId")
      .populate("students.studentId");

    res.json({
      success: true,
      data: records,
    });
  } catch (error) {
    next(error);
  }
};
