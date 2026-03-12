import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    name: String,
    gender: String,
    dob: Date,
    phone: String,

    admissionNumber: {
      type: String,
      required: true,
    },

    rollNumber: String,

    className: String,
    section: String,

    admissionDate: Date,

    // photo: String,

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "SUSPENDED"],
      default: "ACTIVE",
    },

    suspension: {
      startDate: Date,
      endDate: Date,
      reason: String,
    },

    parents: {
      father: {
        name: String,
        phone: String,
        occupation: String,
      },
      mother: {
        name: String,
        phone: String,
        occupation: String,
      },
    },

    previousSchool: {
      schoolName: String,
      address: String,
      class: String,
      passoutYear: Number,
      percentage: Number,
    },

    documents: {
      //   parentIdProof: String,
      //   parentSignature: String,
      fatherIdProof: String,
      motherIdProof: String,

      parentSignature: String,

      studentPhoto: String,
    },

    feeStructure: [
      {
        feeType: String,
        period: String,
        amount: Number,
      },
    ],

    studentLogin: {
      enabled: Boolean,
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },

    parentLogin: {
      enabled: Boolean,
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
  },
  { timestamps: true },
);

export default mongoose.model("Student", studentSchema);
