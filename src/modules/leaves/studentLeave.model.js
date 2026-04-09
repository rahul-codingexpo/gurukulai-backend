import mongoose from "mongoose";

const studentLeaveSchema = new mongoose.Schema(
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

studentLeaveSchema.index({ schoolId: 1, appliedDate: -1 });

export default mongoose.model("StudentLeave", studentLeaveSchema);
