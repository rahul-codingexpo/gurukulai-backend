import express from "express";

import {
  createStaff,
  getStaff,
  updateStaff,
  deleteStaff,
} from "./staff.controller.js";

import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { uploadStaffDocuments } from "../../middleware/upload.middleware.js";

const router = express.Router();

/* Admin create staff */

router.post(
  "/",
  protect,
  authorize("Admin", "Principal"),
  uploadStaffDocuments.fields([
    { name: "photo", maxCount: 1 },
    { name: "aadharDocument", maxCount: 1 },
    { name: "panDocument", maxCount: 1 },
    { name: "experienceDocument", maxCount: 1 },
  ]),
  createStaff,
);

/* Get staff */

router.get("/", protect, authorize("Admin", "Principal","SuperAdmin"), getStaff);

/* Update staff */

router.put(
  "/:id",
  protect,
  authorize("Admin", "Principal"),
  uploadStaffDocuments.fields([
    { name: "photo", maxCount: 1 },
    { name: "aadharDocument", maxCount: 1 },
    { name: "panDocument", maxCount: 1 },
    { name: "experienceDocument", maxCount: 1 },
  ]),
  updateStaff,
);

/* Delete staff */

router.delete("/:id", protect, authorize("Admin", "Principal"), deleteStaff);

export default router;
