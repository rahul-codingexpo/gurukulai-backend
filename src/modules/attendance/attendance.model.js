import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
    },

    periodNumber: {
      type: Number,
      required: true,
    },

    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },

    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
      required: true,
    },

    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
    },

    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    students: [
      {
        studentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Student",
        },
        status: {
          type: String,
          enum: ["Present", "Absent", "Late"],
          required: true,
        },
      },
    ],
  },
  { timestamps: true },
);

/* Prevent duplicate attendance for same period */
attendanceSchema.index(
  {
    date: 1,
    periodNumber: 1,
    sectionId: 1,
    subjectId: 1,
    schoolId: 1,
  },
  { unique: true },
);

export default mongoose.model("Attendance", attendanceSchema);
