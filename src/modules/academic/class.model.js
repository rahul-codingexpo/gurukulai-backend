import mongoose from "mongoose";

const classSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true, // e.g., Grade 10
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

// prevent duplicate class in same session
classSchema.index({ name: 1, sessionId: 1, schoolId: 1 }, { unique: true });

export default mongoose.model("Class", classSchema);
