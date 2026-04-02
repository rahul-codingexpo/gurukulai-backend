import mongoose from "mongoose";

const { Schema } = mongoose;

const pastFeeRecordSchema = new Schema(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },

    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },

    studentName: { type: String, required: true, trim: true },
    admissionNumber: { type: String, required: true, trim: true, index: true },

    className: { type: String, required: true, trim: true, index: true },
    section: { type: String, default: "", trim: true, index: true },

    session: { type: String, required: true, trim: true, index: true },

    dueAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, required: true, min: 0, default: 0 },
    balance: { type: Number, required: true, min: 0, index: true },

    dueDate: { type: Date, default: null },
    remarks: { type: String, default: "", trim: true },

    importBatchId: {
      type: Schema.Types.ObjectId,
      ref: "PastFeeImportBatch",
      required: true,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

pastFeeRecordSchema.index({ schoolId: 1, session: 1, studentId: 1 });

export default mongoose.model("PastFeeRecord", pastFeeRecordSchema);

