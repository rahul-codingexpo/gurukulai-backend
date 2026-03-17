import mongoose from "mongoose";

const liveClassSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },

    sectionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Section",
      },
    ],

    date: {
      type: Date,
      required: true,
    },

    time: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },

    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },

    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    classLink: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

liveClassSchema.index({ schoolId: 1, date: 1 });
liveClassSchema.index({ schoolId: 1, teacherId: 1 });

export default mongoose.model("LiveClass", liveClassSchema);
