import mongoose from "mongoose";

const feeInvoiceSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
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
    /** Original fee amount before discount (same as legacy `amount` when no discount) */
    baseAmount: {
      type: Number,
      min: 0,
    },
    discountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** Final payable after discount (balance uses amount - paid) */
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paid: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["Paid", "Pending", "Overdue", "Partial", "Cancelled"],
      default: "Pending",
    },
    dueDate: {
      type: Date,
      required: true,
    },
    paidDate: { type: Date, default: null },
    period: { type: String, trim: true, default: "" },
    remarks: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

feeInvoiceSchema.index({ invoiceNumber: 1, schoolId: 1 }, { unique: true });
feeInvoiceSchema.index({ studentId: 1, schoolId: 1 });
feeInvoiceSchema.index({ status: 1, schoolId: 1 });
feeInvoiceSchema.index({ schoolId: 1, feeTypeId: 1, period: 1 });

feeInvoiceSchema.pre("save", async function () {
  // Legacy docs without discount fields: treat stored amount as base (no discount)
  if (this.baseAmount == null || this.baseAmount === undefined) {
    this.baseAmount = this.amount;
    if (this.discountPercent == null || this.discountPercent === undefined) {
      this.discountPercent = 0;
    }
    if (this.discountAmount == null || this.discountAmount === undefined) {
      this.discountAmount = 0;
    }
  }
  if (this.paid >= this.amount) {
    this.status = "Paid";
    if (!this.paidDate) this.paidDate = new Date();
  } else if (this.paid > 0) {
    this.status = "Partial";
  } else if (this.dueDate && this.dueDate < new Date() && this.status === "Pending") {
    this.status = "Overdue";
  }
});

export default mongoose.model("FeeInvoice", feeInvoiceSchema);
