import express from "express";
import { createAdmin, createPrincipal } from "./user.controller.js";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";

const router = express.Router();

/* SuperAdmin creates Admin */

router.post("/create-admin", protect, authorize("SuperAdmin"), createAdmin);
router.post(
  "/create-principal",
  protect,
  authorize("SuperAdmin"),
  createPrincipal,
);
// Only SuperAdmin & Admin allowed
router.get(
  "/profile",
  protect,
  authorize(
    "Admin",
    "SuperAdmin",
    "Principal",
    "Teacher",
    "Staff",
    "Student",
    "Parent",
  ),
  (req, res) => {
    res.json({
      success: true,
      user: req.user,
    });
  },
);

export default router;
