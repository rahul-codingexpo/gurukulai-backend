import mongoose from "mongoose";

const fieldSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    kind: {
      type: String,
      enum: ["text", "image", "qr"],
      required: true,
    },
    xMm: { type: Number, required: true },
    yMm: { type: Number, required: true },
    wMm: { type: Number, required: true },
    hMm: { type: Number, required: true },
    fontSizeMm: { type: Number, required: true },
    fontWeight: { type: Number, required: true },
    color: { type: String, default: "#000000" },
    borderRadiusMm: { type: Number, required: true },
  },
  { _id: false },
);

const idCardTemplateSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["student", "staff"],
      required: true,
      index: true,
    },
    version: { type: Number, default: 1 },
    cardSizeMm: {
      width: { type: Number, required: true },
      height: { type: Number, required: true },
    },
    frontUrl: { type: String, default: null },
    backUrl: { type: String, default: null },
    fields: { type: [fieldSchema], default: [] },
  },
  { timestamps: true },
);

idCardTemplateSchema.index({ schoolId: 1, type: 1 }, { unique: true });

export default mongoose.model("IdCardTemplate", idCardTemplateSchema);
