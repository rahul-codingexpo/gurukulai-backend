import express from "express";
import {
  createClass,
  deleteClass,
  getClasses,
  updateClass,
} from "./class.controller.js";

import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { injectSchool } from "../../middleware/injectSchool.middleware.js";

const router = express.Router();

// Create class - Admin & Principal
router.post(
  "/",
  protect,
  authorize("Admin", "Principal"),
  injectSchool,
  createClass,
);

// List classes - Admin, Principal & Teacher
router.get(
  "/",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  injectSchool,
  getClasses,
);

// Update class - Admin & Principal
router.put(
  "/:id",
  protect,
  authorize("Admin", "Principal"),
  injectSchool,
  updateClass,
);

// Delete class - Admin & Principal
router.delete(
  "/:id",
  protect,
  authorize("Admin", "Principal"),
  injectSchool,
  deleteClass,
);

export default router;
