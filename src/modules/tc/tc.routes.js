import express from "express";
import { createSpacesUpload } from "../../middleware/spacesUpload.middleware.js";

import {
  uploadTC,
  createGeneratedTC,
  getTCList,
  getTCById,
  updateTC,
  updateTCStatus,
  deleteTC,
  downloadTCFile,
} from "./tc.controller.js";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";

const router = express.Router();

const tcFileFilter = (req, file, cb) => {
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

const uploadTcFile = createSpacesUpload({
  folder: "uploads/tc",
  fileFilter: tcFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// Create/update/delete: Admin, Principal (+ SuperAdmin via authorize bypass)
// View/list: Admin, Principal, Teacher (+ SuperAdmin)
router.post(
  "/upload",
  protect,
  authorize("Admin", "Principal"),
  uploadTcFile.single("tcFile"),
  uploadTC
);

router.post(
  "/",
  protect,
  authorize("Admin", "Principal"),
  createGeneratedTC
);

router.get(
  "/",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  getTCList
);

router.get(
  "/:id",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  getTCById
);

router.get(
  "/:id/download",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  downloadTCFile
);

router.put(
  "/:id",
  protect,
  authorize("Admin", "Principal"),
  updateTC
);

router.put(
  "/:id/status",
  protect,
  authorize("Admin", "Principal"),
  updateTCStatus
);

router.delete(
  "/:id",
  protect,
  authorize("Admin", "Principal"),
  deleteTC
);

export default router;
