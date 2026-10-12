import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true, // Example: 2025-26
    },

    startDate: Date,
    endDate: Date,

    isActive: {
      type: Boolean,
      default: false,
    },

    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
  },
  { timestamps: true },
);

// 🔥 Prevent duplicate sessions in same school
sessionSchema.index({ name: 1, schoolId: 1 }, { unique: true });

export default mongoose.model("Session", sessionSchema);
