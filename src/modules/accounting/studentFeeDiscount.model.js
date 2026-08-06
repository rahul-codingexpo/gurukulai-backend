import mongoose from "mongoose";

const studentFeeDiscountSchema = new mongoose.Schema(
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
    feeTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeeType",
      required: true,
      index: true,
    },
    /** Fixed rupee discount applied whenever this fee type is billed for the student. */
    discountAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  { timestamps: true },
);

studentFeeDiscountSchema.index(
  { schoolId: 1, studentId: 1, feeTypeId: 1 },
  { unique: true },
);
studentFeeDiscountSchema.index({ schoolId: 1, studentId: 1 });

export default mongoose.model("StudentFeeDiscount", studentFeeDiscountSchema);
