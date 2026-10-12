import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
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
      maxlength: 200,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: "",
    },

    location: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },

    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },

    organizationFor: {
      type: [String],
      enum: [
        "STUDENTS",
        "TEACHERS",
        "PARENTS",
        "STAFF",
        "ACCOUNTANTS",
        "LIBRARIANS",
        "ALL",
      ],
      default: ["ALL"],
      index: true,
    },

    status: {
      type: String,
      enum: ["ONGOING", "UPCOMING", "COMPLETED"],
      default: "UPCOMING",
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

eventSchema.index({ schoolId: 1, startAt: 1 });

export default mongoose.model("Event", eventSchema);

