import express from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { uploadQuizFile } from "../../middleware/upload.middleware.js";
import {
  bulkUpload,
  createQuestion,
  deleteQuestion,
  getMobileQuizQuestions,
  listMobileQuizzes,
  listQuestions,
  submitMobileQuiz,
  updateQuestion,
} from "./quizQuestion.controller.js";

const router = express.Router();

const requireSuperAdmin = (req, res, next) => {
  const roleName = req.user?.roleId?.name;
  if (roleName === "SuperAdmin") {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "You do not have permission",
  });
};

router.post("/", protect, requireSuperAdmin, createQuestion);

router.post(
  "/bulk-upload",
  protect,
  requireSuperAdmin,
  uploadQuizFile.single("file"),
  bulkUpload,
);

router.get("/", protect, listQuestions);

router.patch("/:id", protect, requireSuperAdmin, updateQuestion);

router.delete("/:id", protect, requireSuperAdmin, deleteQuestion);

const mobileRouter = express.Router({ mergeParams: true });

mobileRouter.get("/quizzes", listMobileQuizzes);
mobileRouter.get("/quizzes/questions", getMobileQuizQuestions);
mobileRouter.post("/quizzes/submit", submitMobileQuiz);

export { router as quizQuestionRoutes, mobileRouter as mobileQuizRoutes };

