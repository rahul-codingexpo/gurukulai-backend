import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeeInvoice",
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
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
    receiptNumber: { type: String, trim: true, default: "" },
    chequeNumber: { type: String, trim: true, default: "" },
    bankRef: { type: String, trim: true, default: "" },
    paymentDate: {
      type: Date,
      required: true,
    },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    remarks: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

paymentSchema.index({ invoiceId: 1 });
paymentSchema.index({ schoolId: 1, paymentDate: 1 });

export default mongoose.model("Payment", paymentSchema);
