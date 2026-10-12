import express from "express";
import {
  createStudyMaterial,
  getStudyMaterials,
  getStudyMaterialById,
  updateStudyMaterial,
  deleteStudyMaterial,
} from "./studyMaterial.controller.js";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { uploadStudyMaterials } from "../../middleware/upload.middleware.js";

const router = express.Router();

// Create – Admin, Principal, Teacher (form-data: classId, sectionId, subjectId, title, description, url, downloadable, files)
router.post(
  "/",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  uploadStudyMaterials.fields([{ name: "files", maxCount: 10 }]),
  createStudyMaterial
);

// List – all authenticated users
router.get("/", protect, getStudyMaterials);

// Get one – all authenticated users
router.get("/:id", protect, getStudyMaterialById);

// Update – Admin, Principal, Teacher
router.put(
  "/:id",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  uploadStudyMaterials.fields([{ name: "files", maxCount: 10 }]),
  updateStudyMaterial
);

// Delete – Admin, Principal, Teacher
router.delete(
  "/:id",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  deleteStudyMaterial
);

export default router;
