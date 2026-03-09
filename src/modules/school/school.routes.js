import express from "express";
import { createSchool, getSchools, updateSchool } from "./school.controller.js";
import { onboardSchool } from "./school.onboard.controller.js";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";

const router = express.Router();

/**
 * SuperAdmin creates school
 */
router.post("/", protect, authorize("SuperAdmin"), createSchool);

/**
 * List schools
 */
router.get("/", protect, authorize("SuperAdmin"), getSchools);

/**
 * Update school
 */
router.put("/:id", protect, authorize("SuperAdmin"), updateSchool);

router.post("/onboard", protect, authorize("SuperAdmin"), onboardSchool);

export default router;
