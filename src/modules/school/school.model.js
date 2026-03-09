// import mongoose from "mongoose";

// const schoolSchema = new mongoose.Schema(
//   {
//     name: {
//       type: String,
//       required: true,
//     },

//     email: {
//       type: String,
//       unique: true,
//     },

//     phone: String,

//     address: String,

//     logo: String,

//     status: {
//       type: String,
//       enum: ["ACTIVE", "INACTIVE"],
//       default: "ACTIVE",
//     },
//   },
//   { timestamps: true },
// );

// schoolSchema.index({ name: 1 });

// export default mongoose.model("School", schoolSchema);

import mongoose from "mongoose";

const schoolSchema = new mongoose.Schema(
  {
    schoolCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    logo: {
      type: String,
    },

    yearEstablished: {
      type: Number,
    },

    affiliation: {
      type: String, // CBSE / ICSE / State Board
      trim: true,
    },

    address: {
      type: String,
    },

    city: {
      type: String,
    },

    state: {
      type: String,
    },

    pincode: {
      type: String,
    },

    phone: {
      type: String,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
    },

    website: {
      type: String,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  { timestamps: true },
);

// indexing for faster search
schoolSchema.index({ schoolCode: 1 });
schoolSchema.index({ name: 1 });

export default mongoose.model("School", schoolSchema);
