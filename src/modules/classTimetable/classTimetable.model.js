import mongoose from "mongoose";

const classTimetableSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
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
      required: true,
    },

    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },

    startTime: {
      type: String,
      required: true,
      trim: true,
      // e.g. "09:00", "09:30"
    },

    endTime: {
      type: String,
      required: true,
      trim: true,
    },

    day: {
      type: String,
      enum: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
      required: true,
    },

    roomNumber: {
      type: String,
      trim: true,
      default: "",
    },

    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

classTimetableSchema.index({ schoolId: 1, classId: 1, sectionId: 1, day: 1 });
classTimetableSchema.index({ teacherId: 1, day: 1 });

export default mongoose.model("ClassTimetable", classTimetableSchema);
