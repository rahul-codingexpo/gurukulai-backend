import express from "express";
import {
  createAdmin,
  createPrincipal,
  deleteSchoolAdmin,
  getSchoolAdmins,
  updateSchoolAdmin,
} from "./user.controller.js";
import {
  listSectionAccess,
  updateSectionAccess,
} from "./sectionAccess.controller.js";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";

const router = express.Router();

/* SuperAdmin — school admins */

router.get("/school-admins", protect, authorize("SuperAdmin"), getSchoolAdmins);
router.put("/school-admins/:id", protect, authorize("SuperAdmin"), updateSchoolAdmin);
router.delete("/school-admins/:id", protect, authorize("SuperAdmin"), deleteSchoolAdmin);
router.post("/create-admin", protect, authorize("SuperAdmin"), createAdmin);
router.post(
  "/create-principal",
  protect,
  authorize("SuperAdmin"),
  createPrincipal,
);

/* Admin / Principal — Control Panel section access */
router.get(
  "/section-access",
  protect,
  authorize("Admin", "Principal", "SuperAdmin"),
  listSectionAccess,
);
router.put(
  "/:id/section-access",
  protect,
  authorize("Admin", "Principal", "SuperAdmin"),
  updateSectionAccess,
);

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
    "Accountant",
    "Librarian",
  ),
  (req, res) => {
    res.json({
      success: true,
      user: req.user,
    });
  },
);

export default router;
