import express from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { createSpacesUpload } from "../../middleware/spacesUpload.middleware.js";
import {
  injectSchool,
  injectBranchSchoolScope,
} from "../../middleware/injectSchool.middleware.js";
import {
  getMyWallet,
  uploadWalletPayment,
  getMyWalletPayments,
  getStudentAdvanceBalance,
  creditStudentAdvance,
  applyStudentAdvance,
} from "./wallet.controller.js";

const router = express.Router();

const STAFF_WALLET_ROLES = ["Admin", "Principal", "Accountant"];
const staffScope = [protect, injectSchool, injectBranchSchoolScope];

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

// Staff: student advance balance (overpayment credit)
router.get(
  "/students/:studentId/advance",
  ...staffScope,
  authorize(...STAFF_WALLET_ROLES, "Teacher"),
  getStudentAdvanceBalance
);
router.post(
  "/students/:studentId/advance",
  ...staffScope,
  authorize(...STAFF_WALLET_ROLES),
  creditStudentAdvance
);
router.post(
  "/students/:studentId/advance/use",
  ...staffScope,
  authorize(...STAFF_WALLET_ROLES),
  applyStudentAdvance
);

export default router;

