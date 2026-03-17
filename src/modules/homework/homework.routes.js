import express from "express";
import {
  createHomework,
  getHomework,
  getHomeworkById,
  updateHomework,
  deleteHomework,
} from "./homework.controller.js";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { uploadStudyMaterials } from "../../middleware/upload.middleware.js";

const router = express.Router();

// Assign homework – Teacher, Admin, Principal (form-data + optional files)
router.post(
  "/",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  uploadStudyMaterials.fields([{ name: "files", maxCount: 10 }]),
  createHomework
);

// List – all authenticated
router.get("/", protect, getHomework);

// Get one – all authenticated
router.get("/:id", protect, getHomeworkById);

// Update – Teacher, Admin, Principal
router.put(
  "/:id",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  uploadStudyMaterials.fields([{ name: "files", maxCount: 10 }]),
  updateHomework
);

// Delete – Teacher, Admin, Principal
router.delete(
  "/:id",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  deleteHomework
);

export default router;
