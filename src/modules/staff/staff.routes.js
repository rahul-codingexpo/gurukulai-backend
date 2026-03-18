import express from "express";

import {
  createStaff,
  getStaff,
  updateStaff,
  deleteStaff,
} from "./staff.controller.js";

import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";

const router = express.Router();

/* Admin create staff */

router.post("/", protect, authorize("Admin", "Principal"), createStaff);

/* Get staff */

router.get("/", protect, authorize("Admin", "Principal","SuperAdmin"), getStaff);

/* Update staff */

router.put("/:id", protect, authorize("Admin", "Principal"), updateStaff);

/* Delete staff */

router.delete("/:id", protect, authorize("Admin", "Principal"), deleteStaff);

export default router;
