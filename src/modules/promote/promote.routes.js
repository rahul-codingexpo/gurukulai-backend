import express from "express";
import {
  getStudentsForPromotion,
  getSectionsForMap,
  promoteStudents,
  getPromotionHistory,
} from "./promote.controller.js";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { injectSchool } from "../../middleware/injectSchool.middleware.js";

const router = express.Router();

// All promotion routes: Admin, Principal (and SuperAdmin with schoolId)
router.use(protect, authorize("Admin", "Principal", "SuperAdmin"), injectSchool);

// List students of a class/section for promotion (e.g. "Students Of Class: Grade 4")
router.get("/students", getStudentsForPromotion);

// Get sections for "Map Class Section" (from-class and to-class sections)
router.get("/sections-map", getSectionsForMap);

// Promote students to next session/class with section mapping
router.post("/", promoteStudents);

// Promotion history (by session or student)
router.get("/history", getPromotionHistory);

export default router;
