import mongoose from "mongoose";

const staffSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    salary: {
      type: Number,
    },

    designation: {
      type: String,
      enum: ["Principal", "Teacher", "Staff"],
      required: true,
    },

    joiningDate: {
      type: Date,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    // Optional staff documents (stored as `/uploads/<filename>` paths)
    photoUrl: { type: String, default: undefined },
    aadharDocumentUrl: { type: String, default: undefined },
    panDocumentUrl: { type: String, default: undefined },
    experienceDocumentUrl: { type: String, default: undefined },
  },
  { timestamps: true },
);

export default mongoose.model("Staff", staffSchema);
