import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import {
  uploadGalleryMedia,
  getGalleryList,
  getGalleryById,
  updateGalleryItem,
  deleteGalleryItem,
} from "./gallery.controller.js";

const router = express.Router();

const galleryDir = path.join(process.cwd(), "uploads", "gallery");
if (!fs.existsSync(galleryDir)) {
  fs.mkdirSync(galleryDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, galleryDir),
  filename: (req, file, cb) => {
    const safe = String(file.originalname || "").replace(/\s+/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});

const fileFilter = (req, file, cb) => {
  const m = String(file.mimetype || "");
  if (m.startsWith("image/") || m.startsWith("video/")) return cb(null, true);
  return cb(new Error("Only image/video files are allowed"), false);
};

const galleryUpload = multer({ storage, fileFilter });

// Web + app listing
router.get(
  "/",
  protect,
  authorize(
    "Admin",
    "Principal",
    "Teacher",
    "Staff",
    "Student",
    "Parent",
    "SuperAdmin",
    "Accountant",
    "Librarian",
  ),
  getGalleryList,
);
router.get(
  "/:id",
  protect,
  authorize(
    "Admin",
    "Principal",
    "Teacher",
    "Staff",
    "Student",
    "Parent",
    "SuperAdmin",
    "Accountant",
    "Librarian",
  ),
  getGalleryById,
);

// Only Admin + Principal can manage uploads
router.post(
  "/upload",
  protect,
  authorize("Admin", "Principal"),
  galleryUpload.array("mediaFiles", 20),
  uploadGalleryMedia,
);
router.put(
  "/:id",
  protect,
  authorize("Admin", "Principal"),
  galleryUpload.single("mediaFile"),
  updateGalleryItem,
);
router.delete("/:id", protect, authorize("Admin", "Principal"), deleteGalleryItem);

export default router;

