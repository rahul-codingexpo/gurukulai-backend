import express from "express";
import { createSchool, getSchools, updateSchool, deleteSchool } from "./school.controller.js";
import { onboardSchool } from "./school.onboard.controller.js";
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
  upload.single("logo"),
  authorize("SuperAdmin"),
  createSchool,
);

/**
 * List schools
 */
router.get("/", protect, getSchools);

/**
 * Update school
 */
router.put(
  "/:id",
  protect,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "qrCode", maxCount: 1 },
    { name: "paymentQr", maxCount: 1 },
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
