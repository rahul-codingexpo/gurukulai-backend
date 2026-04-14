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

    /** Student address/residence (optional) */
    address: { type: String, default: "" },

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
        qualification: String,
        occupation: String,
        dob: Date,
        photo: String,
      },
      mother: {
        name: String,
        phone: String,
        qualification: String,
        occupation: String,
        dob: Date,
        photo: String,
      },
      anniversaryDate: Date,
    },

    previousSchool: {
      schoolName: String,
      address: String,
      class: String,
      passoutYear: Number,
      percentage: Number,
      lastExam: String,
      lastExamYear: Number,
      marks: String,
      board: String,
    },

    documents: {
      //   parentIdProof: String,
      //   parentSignature: String,
      fatherIdProof: String,
      motherIdProof: String,

      parentSignature: String,

      studentPhoto: String,
      marksheetPhoto: String,
      reportC: String,
      cc: String,
      tc: String,
      dobCertificate: String,
    },

    route: String,
    group: String,
    referredBy: String,
    formNo: String,
    remarks: String,
    hostelRoomNo: String,
    bedNo: String,
    schoolStatus: String,
    discountDate: Date,
    scholarshipNo: String,
    feeBalance: Number,
    bloodGroup: String,
    height: String,
    weight: String,
    visionLeft: String,
    visionRight: String,
    dentalHygiene: String,
    additionalField1: String,
    additionalField2: String,
    aadharCardNo: String,
    busNo: String,

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
