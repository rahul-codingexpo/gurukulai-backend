import mongoose from "mongoose";

const { Schema } = mongoose;

const pastFeeImportBatchSchema = new Schema(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },

    batchName: {
      type: String,
      required: true,
      trim: true,
    },

    session: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    fileMeta: {
      filename: String,
      originalSize: Number,
    },

    recordsRead: { type: Number, default: 0 },
    recordsImported: { type: Number, default: 0 },
    recordsSkipped: { type: Number, default: 0 },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    importedOn: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

pastFeeImportBatchSchema.index({ schoolId: 1, importedOn: -1 });

export default mongoose.model(
  "PastFeeImportBatch",
  pastFeeImportBatchSchema,
);

