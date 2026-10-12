import express from "express";
import {
  createTimetable,
  getClassTimetable,
  getTeacherTimetable,
  deleteTimetable,
} from "./timetable.controller.js";

const router = express.Router();

/* Create timetable */
router.post("/", createTimetable);

/* Class timetable */
router.get("/class/:classId/:sectionId", getClassTimetable);

/* Teacher timetable */
router.get("/teacher/:teacherId", getTeacherTimetable);

/* Delete */
router.delete("/:id", deleteTimetable);

export default router;
