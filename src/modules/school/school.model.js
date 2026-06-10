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

    // School offline UPI collection setup (shown to parents/students on app)
    upiId: {
      type: String,
      trim: true,
      default: "",
    },

    // Stored path to QR image for payments (e.g. /uploads/<filename>)
    qrCode: {
      type: String,
      trim: true,
      default: "",
    },

    website: {
      type: String,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },

    // Per-school timetable view template (Option D — Hybrid).
    // - "default": theme-customizable HTML grid
    // - "imageOverlay": school-uploaded blank template image with cell overlay
    timetableSettings: {
      viewTemplate: {
        type: String,
        enum: ["default", "imageOverlay"],
        default: "default",
      },
      theme: {
        title: { type: String, default: "CLASS SCHEDULE" },
        headerColor: { type: String, default: "#E8E8E8" },
        timeColColor: { type: String, default: "#F3F4F6" },
        borderColor: { type: String, default: "#1a1a1a" },
        accentColor: { type: String, default: "#111111" },
        showNoteColumn: { type: Boolean, default: true },
        showRoomNumber: { type: Boolean, default: false },
        showTeacherInCell: { type: Boolean, default: true },
      },
      imageOverlay: {
        imageUrl: { type: String, default: "" },
        // Image grid bounds, expressed as percentages (0-100) of the image
        // Auto-distributes cells uniformly between these bounds.
        bounds: {
          left: { type: Number, default: 10 },
          top: { type: Number, default: 18 },
          right: { type: Number, default: 98 },
          bottom: { type: Number, default: 95 },
        },
        // How many days/columns and periods/rows the image grid contains.
        columns: { type: Number, default: 6 },
        rows: { type: Number, default: 8 },
        // Day order matching the image columns (left-to-right).
        dayOrder: {
          type: [String],
          default: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        },
        textColor: { type: String, default: "#111111" },
        fontSizePx: { type: Number, default: 12 },
      },
    },
  },
  { timestamps: true },
);

// indexing for faster search
schoolSchema.index({ schoolCode: 1 });
schoolSchema.index({ name: 1 });

export default mongoose.model("School", schoolSchema);
