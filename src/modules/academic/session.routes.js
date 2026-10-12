import express from "express";
import {
  createSession,
  getSessions,
  activateSession,
  updateSession,
  deleteSession,
} from "./session.controller.js";

import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { injectSchool } from "../../middleware/injectSchool.middleware.js";

const router = express.Router();

router.post("/", protect, authorize("Admin","Principal"), injectSchool, createSession);

//get route
router.get(
  "/",
  protect,
  authorize("Admin", "Principal", "Teacher","SuperAdmin","Accountant","Librarian","Staff","Student","Parent"),
  injectSchool,
  getSessions,
);


//put route
router.put(
  "/activate/:id",
  protect,
  authorize("Admin","Principal"),
  injectSchool,
  activateSession,
);

router.put(
  "/:id",
  protect,
  authorize("Admin","Principal"),
  injectSchool,
  updateSession,
);

router.delete(
  "/:id",
  protect,
  authorize("Admin","Principal"),
  injectSchool,
  deleteSession,
);

export default router;

