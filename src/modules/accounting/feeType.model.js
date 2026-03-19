import mongoose from "mongoose";

const feeTypeSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 10,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    period: {
      type: String,
      required: true,
      enum: ["Monthly", "Quarterly", "Half-Yearly", "Yearly", "One-Time"],
    },
    description: { type: String, trim: true, default: "" },
    icon: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
  },
  { timestamps: true }
);

feeTypeSchema.index({ code: 1, schoolId: 1 }, { unique: true });
feeTypeSchema.index({ schoolId: 1, status: 1 });

export default mongoose.model("FeeType", feeTypeSchema);
