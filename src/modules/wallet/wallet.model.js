import mongoose from "mongoose";

const walletSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },

    // Unallocated positive credit (overpayment) carried forward.
    // Wallet balance shown to UI = credit - dueRemaining.
    credit: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

walletSchema.index({ schoolId: 1, studentId: 1 }, { unique: true });

export default mongoose.model("Wallet", walletSchema);

