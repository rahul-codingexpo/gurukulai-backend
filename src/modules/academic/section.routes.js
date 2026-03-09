import express from "express";
import { createSection, getSections } from "./section.controller.js";

import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { injectSchool } from "../../middleware/injectSchool.middleware.js";

const router = express.Router();

router.post("/", protect, authorize("Admin"), injectSchool, createSection);

router.get(
  "/",
  protect,
  authorize("Admin", "Teacher"),
  injectSchool,
  getSections,
);

export default router;
