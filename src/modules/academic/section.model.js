import mongoose from "mongoose";

const sectionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true, // A, B, C
    },

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },

    classTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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

// prevent duplicate section in same class
sectionSchema.index({ name: 1, classId: 1, schoolId: 1 }, { unique: true });

export default mongoose.model("Section", sectionSchema);
