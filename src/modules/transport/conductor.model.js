import mongoose from "mongoose";

const { Schema } = mongoose;

const conductorSchema = new Schema(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    conductorCode: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    photoUrl: { type: String, default: "" },
    mobile: { type: String, required: true, trim: true },
    alternateMobile: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    idProofNumber: { type: String, default: "", trim: true },
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

conductorSchema.index({ schoolId: 1, conductorCode: 1 }, { unique: true });

export default mongoose.model("TransportConductor", conductorSchema);
