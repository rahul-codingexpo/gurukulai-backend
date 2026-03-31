import mongoose from "mongoose";

const { Schema } = mongoose;

const quizQuestionSchema = new Schema(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    class: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      required: true,
    },
    quizTitle: {
      type: String,
      required: true,
    },
    questionText: {
      type: String,
      required: true,
    },
    options: {
      A: { type: String, required: true },
      B: { type: String, required: true },
      C: { type: String, required: true },
      D: { type: String, required: true },
    },
    correctOption: {
      type: String,
      required: true,
      enum: ["A", "B", "C", "D"],
    },
    explanation: {
      type: String,
      default: "",
    },
    marks: {
      type: Number,
      default: 1,
      min: 1,
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

quizQuestionSchema.index({
  schoolId: 1,
  class: 1,
  subject: 1,
  quizTitle: 1,
});

quizQuestionSchema.index({ schoolId: 1, isActive: 1 });

export default mongoose.model("QuizQuestion", quizQuestionSchema);

