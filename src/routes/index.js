import express from "express";
import authRoutes from "../modules/auth/auth.routes.js";
import userRoutes from "../modules/user/user.routes.js";
const router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes); // ✅ ADD THIS
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "API Running 🚀",
  });
});

export default router;
