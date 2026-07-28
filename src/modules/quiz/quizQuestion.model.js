import mongoose from "mongoose";

const { Schema } = mongoose;

const quizQuestionSchema = new Schema(
  {
    /** Legacy — optional; ignored for new global bank uploads */
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: false,
    },
    /** Display label as uploaded (e.g. "Grade 1", "1st") */
    class: {
      type: String,
      required: true,
    },
    /** Canonical key for matching across schools (e.g. "1", "pre-nursery") */
    classKey: {
      type: String,
      required: true,
      index: true,
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
  classKey: 1,
  subject: 1,
  quizTitle: 1,
});

quizQuestionSchema.index({ classKey: 1, isActive: 1 });

export default mongoose.model("QuizQuestion", quizQuestionSchema);
