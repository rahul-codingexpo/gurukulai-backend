import express from "express";
import multer from "multer";
import { protect } from "../../../middleware/auth.middleware.js";
import { authorize } from "../../../middleware/role.middleware.js";
import { injectSchool } from "../../../middleware/injectSchool.middleware.js";
import {
  importPastFees,
  listPastFeeImports,
  listPastFeeRecords,
  getStudentPastFeeSummary,
} from "./pastFeeData.controller.js";

const router = express.Router();

const denySuperAdmin = (req, res, next) => {
  if (req.user?.roleId?.name === "SuperAdmin") {
    return res.status(403).json({
      success: false,
      message: "You do not have permission",
    });
  }
  next();
};

const fileFilter = (req, file, cb) => {
  const ext = String(file.originalname || "").toLowerCase().split(".").pop();
  const mime = file.mimetype || "";
  const allowedExt = ["csv", "xlsx", "xls"];

  const allowedMime = [
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];

  if (allowedExt.includes(ext) || allowedMime.includes(mime)) cb(null, true);
  else cb(new Error("Only CSV/XLS/XLSX files are allowed"), false);
};

const uploadPastFeeFile = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Endpoint 1: Bulk Import
router.post(
  "/accounting/past-fees/import",
  protect,
  denySuperAdmin,
  authorize("Admin", "Principal"),
  injectSchool,
  uploadPastFeeFile.single("file"),
  importPastFees,
);

// Endpoint 2: List Import History (Batches)
router.get(
  "/accounting/past-fees/imports",
  protect,
  denySuperAdmin,
  authorize("Admin", "Principal"),
  injectSchool,
  listPastFeeImports,
);

// Endpoint 3: List Past Fee Records (with Filters)
router.get(
  "/accounting/past-fees",
  protect,
  denySuperAdmin,
  authorize("Admin", "Principal"),
  injectSchool,
  listPastFeeRecords,
);

// Optional Endpoint 4: Past Fee Summary by Student
router.get(
  "/accounting/past-fees/students/:studentId/summary",
  protect,
  denySuperAdmin,
  authorize("Admin", "Principal"),
  injectSchool,
  getStudentPastFeeSummary,
);

export default router;

