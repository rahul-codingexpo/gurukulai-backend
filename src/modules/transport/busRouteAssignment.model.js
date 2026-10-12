import mongoose from "mongoose";

const { Schema } = mongoose;

const busRouteAssignmentSchema = new Schema(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    busId: {
      type: Schema.Types.ObjectId,
      ref: "TransportBus",
      required: true,
      index: true,
    },
    routeId: {
      type: Schema.Types.ObjectId,
      ref: "TransportRoute",
      required: true,
      index: true,
    },
    shift: {
      type: String,
      enum: ["Morning", "Evening", "Both", "Afternoon"],
      default: "Morning",
    },
    startTime: { type: String, default: "", trim: true },
    endTime: { type: String, default: "", trim: true },
    effectiveFrom: { type: Date, default: null },
    effectiveTo: { type: Date, default: null },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

busRouteAssignmentSchema.index({ schoolId: 1, busId: 1, routeId: 1, shift: 1, status: 1 });

export default mongoose.model("BusRouteAssignment", busRouteAssignmentSchema);
