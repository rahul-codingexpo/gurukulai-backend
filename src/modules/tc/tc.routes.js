import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

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

const tcUploadDir = path.join(process.cwd(), "uploads", "tc");
if (!fs.existsSync(tcUploadDir)) {
  fs.mkdirSync(tcUploadDir, { recursive: true });
}

const sanitizeName = (name = "tc-file") =>
  String(name)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tcUploadDir);
  },
  filename: function (req, file, cb) {
    const safe = sanitizeName(file.originalname || "tc");
    cb(null, `${Date.now()}_${safe}`);
  },
});

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

const uploadTcFile = multer({
  storage,
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
