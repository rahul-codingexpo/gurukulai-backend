import express from "express";
import {
  createEvent,
  deleteEvent,
  getEventById,
  getEvents,
  updateEvent,
} from "./event.controller.js";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";

const router = express.Router();

// Any authenticated user of a school can view events
router.get("/", protect, getEvents);
router.get("/:id", protect, getEventById);

// Only Admin/Principal can manage events
router.post("/", protect, authorize("Admin", "Principal"), createEvent);
router.put("/:id", protect, authorize("Admin", "Principal"), updateEvent);
router.delete("/:id", protect, authorize("Admin", "Principal"), deleteEvent);

export default router;

