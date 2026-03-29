import mongoose from "mongoose";

const examSubjectSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    maxMarks: { type: Number, required: true },
    passMarks: { type: Number, required: true },
  },
  { _id: false },
);

const examScheduleSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    examDate: { type: Date, required: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const examSchema = new mongoose.Schema(
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
    name: { type: String, required: true, trim: true },
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
    instructions: { type: String, default: "" },

    /** Optional URL for "View syllabus" on mobile (PDF link or school-hosted path) */
    syllabusUrl: { type: String, trim: true, maxlength: 2000, default: "" },
    subjects: {
      type: [examSubjectSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "At least one subject is required",
      },
    },
    schedule: {
      type: [examScheduleSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "Schedule is required",
      },
    },
  },
  { timestamps: true },
);

examSchema.index(
  { schoolId: 1, sessionId: 1, classId: 1, sectionId: 1, name: 1 },
  { unique: true },
);

export default mongoose.model("Exam", examSchema);

