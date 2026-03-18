import express from "express";
import {
  createClassTimetable,
  getClassTimetables,
  getClassTimetableByClassAndSection,
  getClassTimetableByTeacher,
  getClassTimetableById,
  updateClassTimetable,
  deleteClassTimetable,
} from "./classTimetable.controller.js";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";

const router = express.Router();

// Create – Admin & Principal
router.post(
  "/",
  protect,
  authorize("Admin", "Principal"),
  createClassTimetable,
);

// List all (optional filters: ?classId= & ?sectionId= & ?day= & ?schoolId= for SuperAdmin)
router.get(
  "/",
  protect,
  authorize("Admin", "Principal", "Teacher","SuperAdmin","Accountant","Librarian","Staff","Student","Parent"),
  getClassTimetables,
);

// Get by class + section
router.get(
  "/class/:classId/section/:sectionId",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  getClassTimetableByClassAndSection,
);

// Get by teacher
router.get(
  "/teacher/:teacherId",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  getClassTimetableByTeacher,
);

// Get single entry
router.get(
  "/:id",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  getClassTimetableById,
);

// Update – Admin & Principal
router.put(
  "/:id",
  protect,
  authorize("Admin", "Principal"),
  updateClassTimetable,
);

// Delete – Admin & Principal
router.delete(
  "/:id",
  protect,
  authorize("Admin", "Principal"),
  deleteClassTimetable,
);

export default router;
