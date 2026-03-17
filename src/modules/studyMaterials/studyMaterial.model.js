import mongoose from "mongoose";

const studyMaterialSchema = new mongoose.Schema(
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

    url: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    downloadable: {
      type: Boolean,
      default: true,
    },

    files: [
      {
        type: String,
        trim: true,
      },
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

studyMaterialSchema.index({ schoolId: 1, classId: 1, sectionId: 1 });
studyMaterialSchema.index({ schoolId: 1, subjectId: 1 });

export default mongoose.model("StudyMaterial", studyMaterialSchema);
