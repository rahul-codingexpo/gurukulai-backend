import mongoose from "mongoose";

const attendanceEntrySchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    status: {
      type: String,
      enum: ["Present", "Absent"],
      required: true,
    },
  },
  { _id: false },
);

const examAttendanceSheetSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
      index: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
      default: null,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    examDate: {
      type: Date,
      required: true,
    },
    entries: {
      type: [attendanceEntrySchema],
      default: [],
    },
    totalStudents: { type: Number, default: 0 },
    totalPresent: { type: Number, default: 0 },
    totalAbsent: { type: Number, default: 0 },
    documentUrl: { type: String, trim: true, default: null },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    uploadedAt: { type: Date, default: null },
    invigilatorSignedAt: { type: Date, default: null },
    principalSignedAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

examAttendanceSheetSchema.index(
  { schoolId: 1, examId: 1, subjectId: 1, examDate: 1, sectionId: 1 },
  { unique: true },
);

export default mongoose.model("ExamAttendanceSheet", examAttendanceSheetSchema);
