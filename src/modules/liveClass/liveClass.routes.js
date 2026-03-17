import express from "express";
import {
  createLiveClass,
  getLiveClasses,
  getLiveClassById,
  updateLiveClass,
  deleteLiveClass,
} from "./liveClass.controller.js";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";

const router = express.Router();

// Create – Admin, Principal, Teacher
router.post(
  "/",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  createLiveClass
);

// List – all authenticated
router.get("/", protect, getLiveClasses);

// Get one – all authenticated
router.get("/:id", protect, getLiveClassById);

// Update – Admin, Principal, Teacher
router.put(
  "/:id",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  updateLiveClass
);

// Delete – Admin, Principal, Teacher
router.delete(
  "/:id",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  deleteLiveClass
);

export default router;
