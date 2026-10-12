import mongoose from "mongoose";

const { Schema } = mongoose;

const driverSchema = new Schema(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    driverCode: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    photoUrl: { type: String, default: "" },
    mobile: { type: String, required: true, trim: true },
    alternateMobile: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    licenceNumber: { type: String, default: "", trim: true },
    licenceType: { type: String, default: "", trim: true },
    licenceIssueDate: { type: Date, default: null },
    licenceExpiryDate: { type: Date, default: null },
    joiningDate: { type: Date, default: null },
    experience: { type: String, default: "", trim: true },
    emergencyContactName: { type: String, default: "", trim: true },
    emergencyContactNumber: { type: String, default: "", trim: true },
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

driverSchema.index({ schoolId: 1, driverCode: 1 }, { unique: true });

export default mongoose.model("TransportDriver", driverSchema);
