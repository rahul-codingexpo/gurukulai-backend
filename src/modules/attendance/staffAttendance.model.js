import mongoose from "mongoose";

const staffAttendanceSchema = new mongoose.Schema(
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

    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },

    status: {
      type: String,
      enum: ["Present", "Absent"],
      required: true,
    },

    entryTime: {
      type: String,
      trim: true,
      default: "",
      // e.g. "09:00"
    },

    exitTime: {
      type: String,
      trim: true,
      default: "",
      // e.g. "17:30"
    },
  },
  { timestamps: true },
);

staffAttendanceSchema.index(
  { schoolId: 1, date: 1, staffId: 1 },
  { unique: true }
);

export default mongoose.model("StaffAttendance", staffAttendanceSchema);
