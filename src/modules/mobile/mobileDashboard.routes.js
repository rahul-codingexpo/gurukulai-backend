import express from "express";
import { protect } from "../../middleware/auth.middleware.js";
import {
  getMobileDashboard,
  getMobileEventById,
  listMobileEvents,
  markMobileEventRead,
} from "./mobileDashboard.controller.js";
import { getMobileProfile } from "./mobileProfile.controller.js";
import {
  getMobileStudentAttendanceMonth,
  getMobileStaffAttendanceMonth,
  getTeacherStudentsForMarking,
  teacherMarkStudentAttendance,
} from "./mobileAttendance.controller.js";
import { getMobileTimetable } from "./mobileTimetable.controller.js";
import { mobileGetExamMarks, getExamStudents } from "../exam/exam.controller.js";
import { listMobileExams, getMobileExamById } from "./mobileExam.controller.js";
import { mobileQuizRoutes } from "../quiz/quizQuestion.routes.js";
import { getGalleryList, getGalleryById } from "../gallery/gallery.controller.js";
import {
  applyMyLeaveMobile,
  getMyLeavesMobile,
  updateMyLeaveMobile,
  deleteMyLeaveMobile,
  listPendingLeavesMobile,
  approveRejectLeaveMobile,
  applyStudentLeaveMobile,
  getStudentLeavesMobile,
  updateStudentLeaveMobile,
  deleteStudentLeaveMobile,
  listPendingStudentLeavesMobile,
  updateStudentLeaveStatusMobile,
  applyStaffLeaveMobile,
  getStaffLeavesMobile,
  updateStaffLeaveMobile,
  deleteStaffLeaveMobile,
  listPendingStaffLeavesMobile,
  updateStaffLeaveStatusMobile,
} from "./mobileLeaves.controller.js";
import { uploadStudyMaterials } from "../../middleware/upload.middleware.js";
import {
  listMobileHomework,
  getMobileHomeworkById,
  createMobileHomework,
  updateMobileHomework,
  deleteMobileHomework,
  submitMobileHomework,
} from "./mobileHomework.controller.js";

const router = express.Router();
const mobileOnly = (req, res, next) => {
  const roleName = req.user?.roleId?.name;
  if (["Student", "Parent", "Teacher", "Staff"].includes(roleName)) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "Mobile APIs are allowed only for Student, Parent, Teacher and Staff",
  });
};

// Mobile dashboard: any authenticated user
router.get("/dashboard", protect, mobileOnly, getMobileDashboard);

// Mobile profile (header avatar -> profile screen)
router.get("/profile", protect, mobileOnly, getMobileProfile);

// Mobile events list (filter=all|read|unread)
router.get("/events", protect, mobileOnly, listMobileEvents);

// Mobile event details page (click event -> details)
router.get("/events/:id", protect, mobileOnly, getMobileEventById);

// Mark event as read
router.put("/events/:id/read", protect, mobileOnly, markMobileEventRead);

// -------- Attendance (Mobile) --------
// Student/Parent month view (ignore entry/exit for students)
router.get(
  "/attendance/student",
  protect,
  mobileOnly,
  getMobileStudentAttendanceMonth
);

// Staff/Teacher month view
router.get(
  "/attendance/staff",
  protect,
  mobileOnly,
  getMobileStaffAttendanceMonth
);

// Teacher flow: select class -> list students
router.get(
  "/attendance/teacher/students",
  protect,
  mobileOnly,
  getTeacherStudentsForMarking
);

// Teacher flow: mark attendance (single or bulk)
router.post(
  "/attendance/teacher/mark-students",
  protect,
  mobileOnly,
  teacherMarkStudentAttendance
);

// -------- Timetable (Mobile) --------
// Student/Parent: own class timetable by day
// Teacher: own timetable by day
// Admin/Principal: optional classId/sectionId/teacherId filters
router.get("/timetable", protect, mobileOnly, getMobileTimetable);

// -------- Exams / Admit / Marksheet (Mobile GET) --------
router.get("/exams", protect, mobileOnly, listMobileExams);
router.get("/exams/:examId", protect, mobileOnly, getMobileExamById);
router.get("/exams/:examId/students", protect, mobileOnly, getExamStudents);
router.get("/exams/:examId/marks", protect, mobileOnly, mobileGetExamMarks);

// -------- MCQ Quizzes (Mobile) --------
router.use("/quiz", protect, mobileOnly, mobileQuizRoutes);

// -------- Gallery (Mobile GET) --------
router.get("/gallery", protect, mobileOnly, getGalleryList);
router.get("/gallery/:id", protect, mobileOnly, getGalleryById);

// -------- Homework (Mobile) --------
router.get("/homework", protect, mobileOnly, listMobileHomework);
router.post(
  "/homework",
  protect,
  mobileOnly,
  uploadStudyMaterials.fields([{ name: "files", maxCount: 10 }]),
  createMobileHomework,
);
router.post(
  "/homework/:id/submit",
  protect,
  mobileOnly,
  uploadStudyMaterials.fields([{ name: "files", maxCount: 10 }]),
  submitMobileHomework,
);
router.get("/homework/:id", protect, mobileOnly, getMobileHomeworkById);
router.put(
  "/homework/:id",
  protect,
  mobileOnly,
  uploadStudyMaterials.fields([{ name: "files", maxCount: 10 }]),
  updateMobileHomework,
);
router.delete("/homework/:id", protect, mobileOnly, deleteMobileHomework);

// -------- Leaves (Mobile clean APIs) --------
router.post("/leaves/me/apply", protect, mobileOnly, applyMyLeaveMobile);
router.get("/leaves/me", protect, mobileOnly, getMyLeavesMobile);
router.put("/leaves/me/:id", protect, mobileOnly, updateMyLeaveMobile);
router.delete("/leaves/me/:id", protect, mobileOnly, deleteMyLeaveMobile);
router.get("/leaves/pending", protect, mobileOnly, listPendingLeavesMobile);
router.put("/leaves/:id/status", protect, mobileOnly, approveRejectLeaveMobile);

// Clean separated mobile leave APIs (aligned with separate DB collections)
// Student leaves
router.post("/leaves/students/me/apply", protect, mobileOnly, applyStudentLeaveMobile);
router.get("/leaves/students/me", protect, mobileOnly, getStudentLeavesMobile);
router.put("/leaves/students/me/:id", protect, mobileOnly, updateStudentLeaveMobile);
router.delete("/leaves/students/me/:id", protect, mobileOnly, deleteStudentLeaveMobile);
router.get("/leaves/students/pending", protect, mobileOnly, listPendingStudentLeavesMobile);
router.put("/leaves/students/:id/status", protect, mobileOnly, updateStudentLeaveStatusMobile);

// Staff leaves
router.post("/leaves/staff/me/apply", protect, mobileOnly, applyStaffLeaveMobile);
router.get("/leaves/staff/me", protect, mobileOnly, getStaffLeavesMobile);
router.put("/leaves/staff/me/:id", protect, mobileOnly, updateStaffLeaveMobile);
router.delete("/leaves/staff/me/:id", protect, mobileOnly, deleteStaffLeaveMobile);
router.get("/leaves/staff/pending", protect, mobileOnly, listPendingStaffLeavesMobile);
router.put("/leaves/staff/:id/status", protect, mobileOnly, updateStaffLeaveStatusMobile);

export default router;

