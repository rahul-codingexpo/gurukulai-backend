import express from "express";
import { createSpacesUpload } from "../../middleware/spacesUpload.middleware.js";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { injectSchool } from "../../middleware/injectSchool.middleware.js";
import {
  getExamAttendancePrintData,
  listExamAttendanceSheets,
  getExamAttendanceSheetById,
  upsertExamAttendanceEntries,
  uploadExamAttendanceDocument,
  deleteExamAttendanceSheet,
} from "./examAttendance.controller.js";

const router = express.Router();

const documentFileFilter = (req, file, cb) => {
  const allowed = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
  ];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  const err = new Error("Only PDF/JPG/JPEG/PNG allowed");
  err.statusCode = 415;
  return cb(err, false);
};

const uploadExamAttendanceDoc = createSpacesUpload({
  folder: "uploads/exam-attendance",
  fileFilter: documentFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get(
  "/print-data",
  protect,
  authorize("Admin", "Principal", "Teacher", "Staff", "SuperAdmin"),
  injectSchool,
  getExamAttendancePrintData,
);

router.get(
  "/",
  protect,
  authorize("Admin", "Principal", "Teacher", "Staff", "SuperAdmin"),
  injectSchool,
  listExamAttendanceSheets,
);

router.get(
  "/:id",
  protect,
  authorize("Admin", "Principal", "Teacher", "Staff", "SuperAdmin"),
  injectSchool,
  getExamAttendanceSheetById,
);

router.put(
  "/",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  injectSchool,
  upsertExamAttendanceEntries,
);

router.post(
  "/:id/upload",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  injectSchool,
  uploadExamAttendanceDoc.single("document"),
  uploadExamAttendanceDocument,
);

router.delete(
  "/:id",
  protect,
  authorize("Admin", "Principal"),
  injectSchool,
  deleteExamAttendanceSheet,
);

export default router;
