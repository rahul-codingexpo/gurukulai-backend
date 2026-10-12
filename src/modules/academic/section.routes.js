import express from "express";
import {
  createSection,
  deleteSection,
  getSections,
  updateSection,
} from "./section.controller.js";

import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { injectSchool } from "../../middleware/injectSchool.middleware.js";

const router = express.Router();

// Create section - Admin & Principal
router.post(
  "/",
  protect,
  authorize("Admin", "Principal"),
  injectSchool,
  createSection,
);

// List sections - Admin, Principal & Teacher
router.get(
  "/",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  injectSchool,
  getSections,
);

// Update section - Admin & Principal
router.put(
  "/:id",
  protect,
  authorize("Admin", "Principal"),
  injectSchool,
  updateSection,
);

// Delete section - Admin & Principal
router.delete(
  "/:id",
  protect,
  authorize("Admin", "Principal"),
  injectSchool,
  deleteSection,
);

export default router;
