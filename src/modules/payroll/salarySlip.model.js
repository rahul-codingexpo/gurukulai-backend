import mongoose from "mongoose";

const salarySlipSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    slipNumber: {
      type: String,
      required: true,
      trim: true,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      index: true,
    },
    staffName: { type: String, required: true, trim: true },
    designation: { type: String, default: "", trim: true },
    periodMonth: { type: Number, required: true, min: 1, max: 12 },
    periodYear: { type: Number, required: true, min: 2000 },
    periodLabel: { type: String, required: true, trim: true },
    baseSalary: { type: Number, required: true, min: 0, default: 0 },
    allowances: { type: Number, required: true, min: 0, default: 0 },
    deductions: { type: Number, required: true, min: 0, default: 0 },
    netAmount: { type: Number, required: true, min: 0, default: 0 },
    paid: { type: Number, required: true, min: 0, default: 0 },
    status: {
      type: String,
      enum: ["Unpaid", "Pending", "Partial", "Paid"],
      default: "Unpaid",
      index: true,
    },
    dueDate: { type: Date, default: null },
    paidDate: { type: Date, default: null },
    remarks: { type: String, default: "", trim: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

salarySlipSchema.index({ slipNumber: 1, schoolId: 1 }, { unique: true });
salarySlipSchema.index(
  { schoolId: 1, staffId: 1, periodMonth: 1, periodYear: 1 },
  { unique: true },
);
salarySlipSchema.index({ schoolId: 1, periodYear: 1, periodMonth: 1 });

const roundMoney = (n) => Math.round((Number(n) || 0) * 100) / 100;

salarySlipSchema.pre("validate", function syncTotals() {
  this.baseSalary = roundMoney(this.baseSalary);
  this.allowances = roundMoney(this.allowances);
  this.deductions = roundMoney(this.deductions);
  this.paid = roundMoney(this.paid);
  this.netAmount = roundMoney(Math.max(0, this.baseSalary + this.allowances - this.deductions));
  if (this.netAmount <= 0) {
    this.status = this.paid > 0 ? "Paid" : "Unpaid";
  } else if (this.paid >= this.netAmount) {
    this.status = "Paid";
    if (!this.paidDate) this.paidDate = new Date();
  } else if (this.paid > 0) {
    this.status = "Partial";
    this.paidDate = null;
  } else {
    this.status = "Unpaid";
    this.paidDate = null;
  }
});

export default mongoose.model("SalarySlip", salarySlipSchema);
