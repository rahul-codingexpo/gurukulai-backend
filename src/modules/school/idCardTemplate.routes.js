import express from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { createSpacesUpload } from "../../middleware/spacesUpload.middleware.js";
import {
  getIdCardTemplate,
  saveIdCardTemplate,
  uploadIdCardBackground,
  removeIdCardBackground,
} from "./idCardTemplate.controller.js";

const router = express.Router();

/**
 * Admin / Principal only for this module (no SuperAdmin bypass).
 */
const requireSchoolAdminPrincipal = (req, res, next) => {
  const role = req.user?.roleId?.name;
  if (role !== "Admin" && role !== "Principal") {
    return res.status(403).json({
      success: false,
      message: "You do not have permission",
    });
  }
  if (!req.user?.schoolId) {
    return res.status(403).json({
      success: false,
      message: "School context required",
    });
  }
  next();
};

const allowedExt = /\.(png|jpg|jpeg|webp)$/i;
const backgroundFileFilter = (req, file, cb) => {
  const m = String(file.mimetype || "").toLowerCase();
  const name = String(file.originalname || "");
  const okMime =
    m === "image/png" || m === "image/jpeg" || m === "image/webp";
  if (okMime && allowedExt.test(name)) return cb(null, true);
  return cb(new Error("Only png, jpg, jpeg, or webp images are allowed"), false);
};

const backgroundUpload = createSpacesUpload({
  folder: "uploads/id-cards",
  fileFilter: backgroundFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.get("/", protect, requireSchoolAdminPrincipal, getIdCardTemplate);
router.put("/", protect, requireSchoolAdminPrincipal, saveIdCardTemplate);
router.post(
  "/background",
  protect,
  requireSchoolAdminPrincipal,
  backgroundUpload.single("backgroundFile"),
  uploadIdCardBackground,
);
router.delete(
  "/background",
  protect,
  requireSchoolAdminPrincipal,
  removeIdCardBackground,
);

export default router;
