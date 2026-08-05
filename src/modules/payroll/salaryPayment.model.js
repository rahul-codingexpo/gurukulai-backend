import mongoose from "mongoose";

const salaryPaymentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    salarySlipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalarySlip",
      required: true,
      index: true,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    method: {
      type: String,
      required: true,
      enum: ["Cash", "Cheque", "Bank Transfer", "UPI"],
    },
    reference: { type: String, trim: true, default: "" },
    paymentDate: { type: Date, required: true },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    remarks: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

salaryPaymentSchema.index({ schoolId: 1, paymentDate: 1 });

export default mongoose.model("SalaryPayment", salaryPaymentSchema);
