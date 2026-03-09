import express from "express";
import {
  createSession,
  getSessions,
  activateSession,
} from "./session.controller.js";

import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { injectSchool } from "../../middleware/injectSchool.middleware.js";

const router = express.Router();

router.post("/", protect, authorize("Admin"), injectSchool, createSession);

router.get(
  "/",
  protect,
  authorize("Admin", "Teacher"),
  injectSchool,
  getSessions,
);

router.put(
  "/activate/:id",
  protect,
  authorize("Admin"),
  injectSchool,
  activateSession,
);

export default router;
