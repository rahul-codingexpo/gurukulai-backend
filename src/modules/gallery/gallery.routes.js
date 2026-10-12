import express from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { createSpacesUpload } from "../../middleware/spacesUpload.middleware.js";
import {
  uploadGalleryMedia,
  getGalleryList,
  getGalleryById,
  updateGalleryItem,
  deleteGalleryItem,
} from "./gallery.controller.js";

const router = express.Router();

const fileFilter = (req, file, cb) => {
  const m = String(file.mimetype || "");
  if (m.startsWith("image/") || m.startsWith("video/")) return cb(null, true);
  return cb(new Error("Only image/video files are allowed"), false);
};

const galleryUpload = createSpacesUpload({
  folder: "uploads/gallery",
  fileFilter,
});

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

