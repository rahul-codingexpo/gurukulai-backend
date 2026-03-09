import express from "express";
import {
  markAttendance,
  getAttendanceByDate,
} from "./attendance.controller.js";

import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { injectSchool } from "../../middleware/injectSchool.middleware.js";

const router = express.Router();

router.post(
  "/",
  protect,
  authorize("Admin", "Teacher"),
  injectSchool,
  markAttendance,
);

router.get(
  "/",
  protect,
  authorize("Admin", "Teacher"),
  injectSchool,
  getAttendanceByDate,
);

export default router;
