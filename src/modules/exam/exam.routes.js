import express from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { injectSchool } from "../../middleware/injectSchool.middleware.js";
import {
  createExam,
  listExams,
  getExamById,
  updateExam,
  deleteExam,
  getExamStudents,
  getExamMarks,
  upsertExamMarks,
} from "./exam.controller.js";

const router = express.Router();

router.post("/", protect, authorize("Admin", "Principal", "Teacher"), injectSchool, createExam);
router.get("/", protect, authorize("Admin", "Principal", "Teacher", "Staff", "Student", "Parent", "SuperAdmin"), injectSchool, listExams);
router.get("/:examId", protect, authorize("Admin", "Principal", "Teacher", "Staff", "Student", "Parent", "SuperAdmin"), injectSchool, getExamById);
router.put("/:examId", protect, authorize("Admin", "Principal", "Teacher"), injectSchool, updateExam);
router.delete("/:examId", protect, authorize("Admin", "Principal"), injectSchool, deleteExam);
router.get("/:examId/students", protect, authorize("Admin", "Principal", "Teacher", "Staff"), injectSchool, getExamStudents);
router.get("/:examId/marks", protect, authorize("Admin", "Principal", "Teacher", "Staff", "Student", "Parent"), injectSchool, getExamMarks);
router.put("/:examId/marks", protect, authorize("Admin", "Principal", "Teacher"), injectSchool, upsertExamMarks);

export default router;

