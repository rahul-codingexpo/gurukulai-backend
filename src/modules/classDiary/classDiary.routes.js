import express from "express";
import {
  listClassDiary,
  createClassDiary,
  deleteClassDiary,
} from "./classDiary.controller.js";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { uploadStudyMaterials } from "../../middleware/upload.middleware.js";

const router = express.Router();

router.get("/", protect, listClassDiary);

router.post(
  "/",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  uploadStudyMaterials.fields([
    { name: "topicPhoto", maxCount: 1 },
    { name: "classworkPhoto", maxCount: 1 },
  ]),
  createClassDiary,
);

router.delete(
  "/:id",
  protect,
  authorize("Admin", "Principal", "Teacher"),
  deleteClassDiary,
);

export default router;
