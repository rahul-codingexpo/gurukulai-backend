import mongoose from "mongoose";

const tcContentSchema = new mongoose.Schema(
  {
    studentName: { type: String, trim: true, default: "" },
    rollNumber: { type: String, trim: true, default: "" },
    dob: { type: Date, default: null },
    fatherName: { type: String, trim: true, default: "" },
    motherName: { type: String, trim: true, default: "" },
    classLastAttended: { type: String, trim: true, default: "" },
    section: { type: String, trim: true, default: "" },
    academicSession: { type: String, trim: true, default: "" },
    admissionDate: { type: Date, default: null },
    leavingDate: { type: Date, default: null },
    reasonForLeaving: { type: String, trim: true, default: "" },
    conduct: {
      type: String,
      enum: ["Excellent", "Very Good", "Good", "Satisfactory", ""],
      default: "Good",
    },
    feesCleared: {
      type: String,
      enum: ["Yes", "No", ""],
      default: "Yes",
    },
    resultStatus: { type: String, trim: true, default: "" },
    remarks: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const tcFileSchema = new mongoose.Schema(
  {
    path: { type: String, trim: true, default: "" },
    originalName: { type: String, trim: true, default: "" },
    mimeType: { type: String, trim: true, default: "" },
    size: { type: Number, default: 0 },
  },
  { _id: false }
);

const tcSchema = new mongoose.Schema(
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
      default: null,
      index: true,
    },
    admissionNumber: { type: String, trim: true, default: "", index: true },
    mode: {
      type: String,
      enum: ["UPLOAD", "GENERATED"],
      required: true,
      index: true,
    },
    tcNumber: {
      type: String,
      required: true,
      trim: true,
    },
    issueDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "CANCELLED"],
      default: "ACTIVE",
      index: true,
    },
    file: { type: tcFileSchema, default: undefined },
    content: { type: tcContentSchema, default: {} },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

tcSchema.index({ schoolId: 1, tcNumber: 1 }, { unique: true });

export default mongoose.model("TransferCertificate", tcSchema);
