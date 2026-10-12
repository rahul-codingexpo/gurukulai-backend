import mongoose from "mongoose";

const staffLeaveSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },

    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      index: true,
    },

    appliedDate: {
      type: Date,
      required: true,
      default: () => new Date(),
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    leaveCategory: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },

    leaveFrom: {
      type: Date,
      required: true,
    },

    leaveTo: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["Approved", "Unapproved", "Rejected"],
      default: "Unapproved",
      index: true,
    },

    emergencyContactName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    emergencyContactPhone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "",
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
  },
  { timestamps: true }
);

staffLeaveSchema.index({ schoolId: 1, appliedDate: -1 });

export default mongoose.model("StaffLeave", staffLeaveSchema);
