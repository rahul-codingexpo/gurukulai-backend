import mongoose from "mongoose";

const classSubjectSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },

    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },

    periodsPerWeek: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model("ClassSubject", classSubjectSchema);
