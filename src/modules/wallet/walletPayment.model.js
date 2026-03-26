import mongoose from "mongoose";

const walletPaymentSchema = new mongoose.Schema(
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

    // Unique reference from parent/student payment (UPI transaction)
    utrId: {
      type: String,
      required: true,
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    qrCode: {
      type: String,
      trim: true,
      default: "",
    },

    paymentScreenshot: {
      // Path stored for /uploads static serving, e.g. /uploads/wallet/xxx.png
      type: String,
      trim: true,
      default: "",
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },

    // Allocation results (audit-friendly)
    appliedToInvoices: {
      type: Number,
      required: true,
      default: 0,
    },
    leftoverCreditAfter: {
      type: Number,
      required: true,
      default: 0,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

walletPaymentSchema.index({ schoolId: 1, utrId: 1 }, { unique: true });
walletPaymentSchema.index({ schoolId: 1, studentId: 1, createdAt: -1 });

export default mongoose.model("WalletPayment", walletPaymentSchema);

