import mongoose from "mongoose";

const { Schema } = mongoose;

const studentTransportAssignmentSchema = new Schema(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    studentName: { type: String, default: "", trim: true },
    admissionNumber: { type: String, default: "", trim: true },
    className: { type: String, default: "", trim: true },
    section: { type: String, default: "", trim: true },
    parentName: { type: String, default: "", trim: true },
    parentMobile: { type: String, default: "", trim: true },
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
    pickupStopId: { type: Schema.Types.ObjectId, required: true },
    dropStopId: { type: Schema.Types.ObjectId, required: true },
    pickupStopName: { type: String, default: "", trim: true },
    dropStopName: { type: String, default: "", trim: true },
    pickupTime: { type: String, default: "", trim: true },
    dropTime: { type: String, default: "", trim: true },
    transportType: {
      type: String,
      enum: ["Both", "PickupOnly", "DropOnly"],
      default: "Both",
    },
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

studentTransportAssignmentSchema.index({ schoolId: 1, studentId: 1, status: 1 });

export default mongoose.model(
  "StudentTransportAssignment",
  studentTransportAssignmentSchema,
);
