import mongoose from "mongoose";

const { Schema } = mongoose;

const busSchema = new Schema(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    busCode: { type: String, required: true, trim: true },
    busIdentity: { type: String, required: true, trim: true },
    busName: { type: String, default: "", trim: true },
    registrationNumber: { type: String, required: true, trim: true },
    busType: { type: String, default: "", trim: true },
    seatingCapacity: { type: Number, required: true, min: 1 },
    model: { type: String, default: "", trim: true },
    photoUrl: { type: String, default: "" },
    fitnessValidTill: { type: Date, default: null },
    insuranceExpiryDate: { type: Date, default: null },
    permitExpiryDate: { type: Date, default: null },
    gpsAvailable: { type: Boolean, default: false },
    gpsDeviceId: { type: String, default: "", trim: true },
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

busSchema.index({ schoolId: 1, busIdentity: 1 }, { unique: true });
busSchema.index({ schoolId: 1, registrationNumber: 1 }, { unique: true });

export default mongoose.model("TransportBus", busSchema);
