import mongoose from "mongoose";

/** True only for canonical 24-char hex ObjectIds (avoids loose isValid false-positives). */
export const isValidObjectId = (value) => {
  if (value == null) return false;
  const id = String(value).trim();
  if (!/^[a-fA-F0-9]{24}$/.test(id)) return false;
  return mongoose.Types.ObjectId.isValid(id);
};
