import mongoose from "mongoose";

const homeworkSubmissionSchema = new mongoose.Schema(
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
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: "",
    },
    files: [
      {
        type: String,
        trim: true,
      },
    ],
    submittedAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  { timestamps: true },
);

homeworkSubmissionSchema.index(
  { homeworkId: 1, studentId: 1 },
  { unique: true },
);

export default mongoose.model("HomeworkSubmission", homeworkSubmissionSchema);
