import express from "express";
import {
  markStudentAttendance,
  getStudentAttendanceByDate,
  updateStudentAttendance,
  deleteStudentAttendance,
} from "./studentAttendance.controller.js";
import {
  markStaffAttendance,
  getStaffAttendanceByDate,
  updateStaffAttendance,
  deleteStaffAttendance,
} from "./staffAttendance.controller.js";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";

const router = express.Router();

// ---------- Student attendance ----------
// Mark (single or bulk) – Teacher, Admin, Principal
router.post(
  "/students",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  markStudentAttendance,
);

// Get by date (optional: className, section) – Admin, Principal, Teacher
router.get(
  "/students",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  getStudentAttendanceByDate,
);

// Update – Admin, Principal, Teacher
router.put(
  "/students/:id",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  updateStudentAttendance,
);

// Delete – Admin, Principal
router.delete(
  "/students/:id",
  protect,
  authorize("Admin", "Principal"),
  deleteStudentAttendance,
);

// ---------- Staff attendance ----------
// Mark (single or bulk) – Admin, Principal
router.post(
  "/staff",
  protect,
  authorize("Admin", "Principal"),
  markStaffAttendance,
);

// Get by date – Admin, Principal
router.get(
  "/staff",
  protect,
  authorize("Admin", "Principal"),
  getStaffAttendanceByDate,
);

// Update (e.g. exit time) – Admin, Principal
router.put(
  "/staff/:id",
  protect,
  authorize("Admin", "Principal"),
  updateStaffAttendance,
);

// Delete – Admin, Principal
router.delete(
  "/staff/:id",
  protect,
  authorize("Admin", "Principal"),
  deleteStaffAttendance,
);

export default router;
