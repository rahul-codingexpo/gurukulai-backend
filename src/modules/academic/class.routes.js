import express from "express";
import { createClass, getClasses } from "./class.controller.js";

import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { injectSchool } from "../../middleware/injectSchool.middleware.js";

const router = express.Router();

router.post("/", protect, authorize("Admin"), injectSchool, createClass);

router.get(
  "/",
  protect,
  authorize("Admin", "Teacher"),
  injectSchool,
  getClasses,
);

export default router;
