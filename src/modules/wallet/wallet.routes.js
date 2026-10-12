import express from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { createSpacesUpload } from "../../middleware/spacesUpload.middleware.js";
import {
  getMyWallet,
  uploadWalletPayment,
  getMyWalletPayments,
} from "./wallet.controller.js";

const router = express.Router();

const fileFilter = (req, file, cb) => {
  const allowed = ["image/png", "image/jpg", "image/jpeg", "image/webp"];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only image files allowed"), false);
};

const upload = createSpacesUpload({
  folder: "uploads/wallet",
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Student/Parent can view their wallet
router.get("/me", protect, authorize("Student", "Parent"), getMyWallet);

// Student/Parent upload UPI payment screenshot
router.post(
  "/payments/upload",
  protect,
  authorize("Student", "Parent"),
  upload.single("paymentScreenshot"),
  uploadWalletPayment
);

// Student/Parent view payment history
router.get(
  "/payments",
  protect,
  authorize("Student", "Parent"),
  getMyWalletPayments
);

export default router;

