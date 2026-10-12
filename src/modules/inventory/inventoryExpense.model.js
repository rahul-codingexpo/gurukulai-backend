import mongoose from "mongoose";

const { Schema } = mongoose;

const inventoryExpenseSchema = new Schema(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    expenseType: {
      type: String,
      required: true,
      trim: true,
    },

    // Stored as UTC day precision (00:00:00.000Z)
    date: {
      type: Date,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    personName: {
      type: String,
      required: true,
      trim: true,
    },

    notes: {
      type: String,
      default: "",
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

inventoryExpenseSchema.index({ schoolId: 1, date: -1 });
inventoryExpenseSchema.index({ schoolId: 1, expenseType: 1 });

export default mongoose.model(
  "InventoryExpense",
  inventoryExpenseSchema,
);

