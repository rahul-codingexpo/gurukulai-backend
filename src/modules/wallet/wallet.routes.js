import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import {
  getMyWallet,
  uploadWalletPayment,
  getMyWalletPayments,
} from "./wallet.controller.js";

const router = express.Router();

const walletUploadDir = path.join(process.cwd(), "uploads", "wallet");

if (!fs.existsSync(walletUploadDir)) {
  fs.mkdirSync(walletUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, walletUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ext || ".png";
    cb(null, `${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/png", "image/jpg", "image/jpeg", "image/webp"];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only image files allowed"), false);
};

const upload = multer({
  storage,
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

