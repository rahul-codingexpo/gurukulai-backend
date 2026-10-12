import mongoose from "mongoose";

const { Schema } = mongoose;

const busStaffAssignmentSchema = new Schema(
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
    staffType: {
      type: String,
      enum: ["driver", "conductor"],
      required: true,
    },
    staffId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    shift: {
      type: String,
      enum: ["Morning", "Evening", "Both", "Afternoon"],
      default: "Both",
    },
    isPrimary: { type: Boolean, default: true },
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

busStaffAssignmentSchema.index({ schoolId: 1, busId: 1, staffType: 1, status: 1 });

export default mongoose.model("BusStaffAssignment", busStaffAssignmentSchema);
