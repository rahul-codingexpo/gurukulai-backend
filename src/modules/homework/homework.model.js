import mongoose from "mongoose";

const homeworkSchema = new mongoose.Schema(
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

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },

    date: {
      type: Date,
      required: true,
      default: () => new Date(),
    },

    dueDate: {
      type: Date,
      required: true,
    },

    url: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    files: [
      {
        type: String,
        trim: true,
      },
    ],

    downloadable: {
      type: Boolean,
      default: true,
    },

    sendSmsToStudents: {
      type: Boolean,
      default: false,
    },

    sendSmsToParents: {
      type: Boolean,
      default: false,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

homeworkSchema.index({ schoolId: 1, classId: 1, sectionId: 1 });
homeworkSchema.index({ schoolId: 1, dueDate: 1 });

export default mongoose.model("Homework", homeworkSchema);
