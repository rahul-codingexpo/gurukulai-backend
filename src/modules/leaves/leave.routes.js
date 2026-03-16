import express from "express";
import {
  createStudentLeave,
  getStudentLeaves,
  getStudentLeaveById,
  updateStudentLeave,
  updateStudentLeaveStatus,
  deleteStudentLeave,
} from "./studentLeave.controller.js";
import {
  createStaffLeave,
  getStaffLeaves,
  getStaffLeaveById,
  updateStaffLeave,
  updateStaffLeaveStatus,
  deleteStaffLeave,
} from "./staffLeave.controller.js";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";

const router = express.Router();

// ---------- Student leaves ----------
router.post(
  "/students",
  protect,
  authorize("Admin", "Principal", "Teacher", "Student"),
  createStudentLeave
);

router.get(
  "/students",
  protect,
  authorize("Admin", "Principal", "Teacher", "Student", "SuperAdmin"),
  getStudentLeaves
);

router.get(
  "/students/:id",
  protect,
  authorize("Admin", "Principal", "Teacher", "Student", "SuperAdmin"),
  getStudentLeaveById
);

router.put(
  "/students/:id",
  protect,
  authorize("Admin", "Principal", "Teacher", "Student"),
  updateStudentLeave
);

router.put(
  "/students/:id/status",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  updateStudentLeaveStatus
);

router.delete(
  "/students/:id",
  protect,
  authorize("Admin", "Principal", "Teacher", "Student"),
  deleteStudentLeave
);

// ---------- Staff leaves ----------
router.post(
  "/staff",
  protect,
  authorize("Admin", "Principal", "Teacher", "Staff"),
  createStaffLeave
);

router.get(
  "/staff",
  protect,
  authorize("Admin", "Principal", "Teacher", "Staff", "SuperAdmin"),
  getStaffLeaves
);

router.get(
  "/staff/:id",
  protect,
  authorize("Admin", "Principal", "Teacher", "Staff", "SuperAdmin"),
  getStaffLeaveById
);

router.put(
  "/staff/:id",
  protect,
  authorize("Admin", "Principal", "Teacher", "Staff"),
  updateStaffLeave
);

router.put(
  "/staff/:id/status",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  updateStaffLeaveStatus
);

router.delete(
  "/staff/:id",
  protect,
  authorize("Admin", "Principal", "Teacher", "Staff"),
  deleteStaffLeave
);

export default router;
