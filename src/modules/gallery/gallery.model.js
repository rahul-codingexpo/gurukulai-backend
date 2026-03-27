import mongoose from "mongoose";

const gallerySchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    mediaType: {
      type: String,
      enum: ["IMAGE", "VIDEO"],
      required: true,
      index: true,
    },
    mediaUrl: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      default: "",
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

gallerySchema.index({ schoolId: 1, createdAt: -1 });

export default mongoose.model("Gallery", gallerySchema);

