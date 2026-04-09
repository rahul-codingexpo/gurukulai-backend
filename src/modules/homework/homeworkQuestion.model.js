import mongoose from "mongoose";

const homeworkQuestionSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    homeworkId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Homework",
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    askedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ["OPEN", "ANSWERED"],
      default: "OPEN",
    },
  },
  { timestamps: true },
);

homeworkQuestionSchema.index({ homeworkId: 1, studentId: 1, createdAt: -1 });

export default mongoose.model("HomeworkQuestion", homeworkQuestionSchema);

