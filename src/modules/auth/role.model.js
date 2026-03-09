import mongoose from "mongoose";

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      enum: ["SuperAdmin", "Admin", "Principal", "Teacher", "Accountant"],
      unique: true,
    },

    permissions: [String],

    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      default: null,
    },
  },
  { timestamps: true },
);

roleSchema.index({ name: 1, schoolId: 1 }, { unique: true });

export default mongoose.model("Role", roleSchema);
