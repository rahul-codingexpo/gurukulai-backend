import mongoose from "mongoose";

const { Schema } = mongoose;

const routeStopSchema = new Schema(
  {
    stopName: { type: String, required: true, trim: true },
    stopSequence: { type: Number, required: true, min: 1 },
    pickupTime: { type: String, default: "", trim: true },
    dropTime: { type: String, default: "", trim: true },
    distance: { type: Number, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { _id: true },
);

const transportRouteSchema = new Schema(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    routeCode: { type: String, required: true, trim: true },
    routeName: { type: String, required: true, trim: true },
    routeDescription: { type: String, default: "", trim: true },
    startPoint: { type: String, default: "", trim: true },
    endPoint: { type: String, default: "", trim: true },
    stops: { type: [routeStopSchema], default: [] },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    remarks: { type: String, default: "", trim: true },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

transportRouteSchema.index({ schoolId: 1, routeCode: 1 }, { unique: true });
transportRouteSchema.index({ schoolId: 1, routeName: 1 });

export default mongoose.model("TransportRoute", transportRouteSchema);
