import express from "express";
import {
  createSubject,
  getSubjects,
  deleteSubject,
} from "./subject.controller.js";

import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { injectSchool } from "../../middleware/injectSchool.middleware.js";

const router = express.Router();

router.post("/", protect, authorize("Admin"), injectSchool, createSubject);

router.get(
  "/",
  protect,
  authorize("Admin", "Teacher"),
  injectSchool,
  getSubjects,
);

router.delete("/:id", protect, authorize("Admin"), injectSchool, deleteSubject);

export default router;
