import express from "express";
import { forgotPassword, login, resetPassword, verifyOtp } from "./auth.controller.js";

const router = express.Router();

router.get("/test", (req, res) => {
  res.json({ message: "Auth route working" });
});

router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);

export default router;
