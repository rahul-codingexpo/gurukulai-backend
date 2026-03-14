import express from "express";
import authRoutes from "../modules/auth/auth.routes.js";
import userRoutes from "../modules/user/user.routes.js";
import schoolRoutes from "../modules/school/school.routes.js";
import sessionRoutes from "../modules/academic/session.routes.js";
import subjectRoutes from "../modules/academic/subject.routes.js";
import classRoutes from "../modules/academic/class.routes.js";
import sectionRoutes from "../modules/academic/section.routes.js";
import attendanceRoutes from "../modules/attendance/attendance.routes.js";
import timetableRoutes from "../modules/timetable/timetable.routes.js";
import classTimetableRoutes from "../modules/classTimetable/classTimetable.routes.js";
import staffRoutes from "../modules/staff/staff.routes.js";
import studentRoutes from "../modules/student/student.routes.js";
import eventRoutes from "../modules/events/event.routes.js";
const router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/schools", schoolRoutes);
router.use("/staff", staffRoutes);
router.use("/students", studentRoutes);
router.use("/events", eventRoutes);
router.use("/sessions", sessionRoutes);
router.use("/subjects", subjectRoutes);
router.use("/classes", classRoutes);
router.use("/sections", sectionRoutes);
router.use("/timetable", timetableRoutes);
router.use("/class-timetable", classTimetableRoutes);
router.use("/attendance", attendanceRoutes);
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "API Running 🚀",
  });
});

export default router;
