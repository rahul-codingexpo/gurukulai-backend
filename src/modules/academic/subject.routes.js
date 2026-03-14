import express from "express";
import {
  createSubject,
  getSubjects,
  deleteSubject,
  updateSubject,
} from "./subject.controller.js";

import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { injectSchool } from "../../middleware/injectSchool.middleware.js";

const router = express.Router();

// Create subject - Admin & Principal
router.post(
  "/",
  protect,
  authorize("Admin", "Principal"),
  injectSchool,
  createSubject,
);

// List subjects - Admin, Principal & Teacher
router.get(
  "/",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  injectSchool,
  getSubjects,
);

// Update subject - Admin & Principal
router.put(
  "/:id",
  protect,
  authorize("Admin", "Principal"),
  injectSchool,
  updateSubject,
);

// Delete subject - Admin & Principal
router.delete(
  "/:id",
  protect,
  authorize("Admin", "Principal"),
  injectSchool,
  deleteSubject,
);

export default router;
