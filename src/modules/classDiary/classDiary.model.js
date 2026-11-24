import mongoose from "mongoose";

const classDiarySchema = new mongoose.Schema(
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
      index: true,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
      default: null,
      index: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      default: null,
      index: true,
    },
    subjectName: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    topic: {
      type: String,
      trim: true,
      maxlength: 4000,
      required: true,
    },
    topicPhoto: {
      type: String,
      trim: true,
      default: "",
    },
    classworkPhoto: {
      type: String,
      trim: true,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

classDiarySchema.index({ schoolId: 1, classId: 1, date: -1, createdAt: -1 });

export default mongoose.model("ClassDiary", classDiarySchema);
