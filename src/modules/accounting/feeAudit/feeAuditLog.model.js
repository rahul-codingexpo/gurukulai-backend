import mongoose from "mongoose";

const { Schema } = mongoose;

const changeEntrySchema = new Schema(
  {
    field: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const feeAuditLogSchema = new Schema(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },

    sourceType: {
      type: String,
      enum: ["FeeInvoice", "PastFeeRecord"],
      required: true,
      index: true,
    },

    sourceId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    action: {
      type: String,
      enum: ["created", "updated", "deleted", "restored"],
      required: true,
      index: true,
    },

    changes: { type: [changeEntrySchema], default: [] },

    snapshot: { type: Schema.Types.Mixed, default: null },

    summary: { type: String, default: "" },

    studentRef: {
      studentId: { type: Schema.Types.ObjectId, ref: "Student" },
      studentName: { type: String, default: "" },
      admissionNumber: { type: String, default: "" },
    },

    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    performedByName: { type: String, default: "" },
    performedByRole: { type: String, default: "" },
    performedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

feeAuditLogSchema.index({ schoolId: 1, sourceType: 1, sourceId: 1, performedAt: 1 });
feeAuditLogSchema.index({ schoolId: 1, action: 1, performedAt: -1 });

export default mongoose.model("FeeAuditLog", feeAuditLogSchema);
