// import mongoose from "mongoose";

// const userSchema = new mongoose.Schema(
//   {
//     name: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     email: {
//       type: String,
//       required: true,
//       unique: true,
//       lowercase: true,
//       trim: true,
//     },

//     phone: {
//       type: String,
//       trim: true,
//     },

//     username: {
//       type: String,
//       unique: true,
//       sparse: true,
//       trim: true,
//     },

//     password: {
//       type: String,
//     },

//     roleId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Role",
//       required: true,
//     },

//     schoolId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "School",
//       default: null,
//     },

//     status: {
//       type: String,
//       enum: ["ACTIVE", "INACTIVE"],
//       default: "ACTIVE",
//     },
//   },
//   { timestamps: true },
// );

// /* Indexing for performance */

// userSchema.index({ email: 1 });
// userSchema.index({ schoolId: 1 });

// export default mongoose.model("User", userSchema);

//updated user model ============

import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      unique: true,
      sparse: true, // optional email
      default: undefined,
      set: (v) => (v ? v : undefined), // never store null/"" -> avoids unique index collisions
    },

    phone: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      default: undefined,
      set: (v) => (v ? v : undefined),
    },

    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      default: undefined,
      set: (v) => (v ? v : undefined),
    },

    password: {
      type: String,
      required: true,
    },

    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },

    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      default: null,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },

    passwordReset: {
      otpHash: { type: String, select: false, default: undefined },
      expiresAt: { type: Date, select: false, default: undefined },
      lastSentAt: { type: Date, select: false, default: undefined },
    },
  },
  { timestamps: true },
);

/* Indexing */

// Note: `unique: true` already creates indexes for email/phone/username.
// Keep schoolId index for queries; email/phone/username indexes are handled by Mongoose unique.
userSchema.index({ schoolId: 1 });

export default mongoose.model("User", userSchema);
