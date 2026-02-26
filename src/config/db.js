import mongoose from "mongoose";
import { ENV } from "./env.js";

export const connectDB = async () => {
  try {
    await mongoose.connect(ENV.MONGO_URI);
    console.log("✅ MongoDB Connected", mongoose.connection.name);
  } catch (error) {
    console.error("DB Error:", error.message);
    process.exit(1);
  }
};
