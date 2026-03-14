import mongoose from "mongoose";

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true, // e.g. Mathematics
    },

    code: {
      type: String, // e.g. MATH101
    },

    type: {
      type: String, // e.g. Theory / Practical / Elective
      trim: true,
    },

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },

    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
    },

    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
  },
  { timestamps: true },
);

// prevent duplicate subject in same class
subjectSchema.index({ name: 1, classId: 1, schoolId: 1 }, { unique: true });

export default mongoose.model("Subject", subjectSchema);
