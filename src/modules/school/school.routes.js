import express from "express";
import { createSchool, getSchools, getBranchCampuses, updateSchool, deleteSchool } from "./school.controller.js";
import { onboardSchool } from "./school.onboard.controller.js";
import { branchOnboard } from "./school.branchOnboard.controller.js";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import upload from "../../middleware/upload.middleware.js";

const router = express.Router();

/**
 * SuperAdmin creates school
 */
router.post(
  "/",
  protect,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "schoolLogo", maxCount: 1 },
  ]),
  authorize("SuperAdmin"),
  createSchool,
);

/**
 * SuperAdmin onboards a branch group with one or more campuses
 * Multipart: branchName, schools (JSON string), optional logo_0, logo_1, ...
 */
router.post(
  "/branch-onboard",
  protect,
  authorize("SuperAdmin"),
  upload.any(),
  branchOnboard,
);

/**
 * List schools
 */
router.get("/", protect, getSchools);

/**
 * Campuses in the logged-in user's branch (accounting campus picker)
 */
router.get("/branch-campuses", protect, getBranchCampuses);

/**
 * Update school
 */
router.put(
  "/:id",
  protect,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "schoolLogo", maxCount: 1 },
    { name: "qrCode", maxCount: 1 },
    { name: "paymentQr", maxCount: 1 },
    { name: "timetableTemplateImage", maxCount: 1 },
  ]),
  authorize("Admin", "Principal", "Accountant", "SuperAdmin"),
  updateSchool,
);

router.post("/onboard", protect, authorize("SuperAdmin"), onboardSchool);

//delete route
router.delete(
  "/:id",
  protect,
  authorize("SuperAdmin"),
  deleteSchool,
);

export default router;
