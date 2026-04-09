import mongoose from "mongoose";

const studentAttendanceSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

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

    // Optional display status for mobile teacher marking flow
    markType: {
      type: String,
      enum: ["Present", "Absent", "Late"],
      default: undefined,
    },

    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

studentAttendanceSchema.index(
  { schoolId: 1, date: 1, studentId: 1 },
  { unique: true }
);

export default mongoose.model("StudentAttendance", studentAttendanceSchema);
