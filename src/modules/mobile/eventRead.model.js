import mongoose from "mongoose";

const eventReadSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    readAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

eventReadSchema.index({ eventId: 1, userId: 1 }, { unique: true });
eventReadSchema.index({ schoolId: 1, userId: 1, readAt: -1 });

export default mongoose.model("EventRead", eventReadSchema);

