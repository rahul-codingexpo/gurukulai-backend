import mongoose from "mongoose";
import User from "../user/user.model.js";
import Staff from "../staff/staff.model.js";
import ClassTimetable from "./classTimetable.model.js";

const POPULATE_PATHS = [
  { path: "classId", select: "name" },
  { path: "sectionId", select: "name" },
  { path: "subjectId", select: "name code" },
  { path: "teacherId", select: "name" },
];

/**
 * Timetable teacherId must be a User _id (see classTimetable.model.js).
 * Accepts User id directly, or Staff id when staff.userId is linked.
 */
export const resolveTeacherUserId = async (teacherId) => {
  if (!teacherId || !mongoose.Types.ObjectId.isValid(teacherId)) {
    return null;
  }

  const oid = new mongoose.Types.ObjectId(teacherId);

  const user = await User.findById(oid).select("_id name");
  if (user) return user._id;

  const staff = await Staff.findById(oid).select("userId name");
  if (staff?.userId) return staff.userId;

  return null;
};

export const findPopulatedEntryById = async (id) =>
  ClassTimetable.findById(id).populate(POPULATE_PATHS);

/**
 * When teacherId was saved as Staff _id, User populate fails and name is missing.
 * Resolve display + optionally migrate row to correct User id.
 */
export const enrichTimetableTeacherFields = async (entries, { migrate = true } = {}) => {
  const list = Array.isArray(entries) ? entries : [entries];
  const updates = [];

  for (const entry of list) {
    const ref = entry.teacherId;
    if (ref && typeof ref === "object" && ref.name) continue;

    const rawId = ref?._id ?? ref;
    if (!rawId || !mongoose.Types.ObjectId.isValid(rawId)) continue;

    const user = await User.findById(rawId).select("name");
    if (user) {
      entry.teacherId = user;
      continue;
    }

    const staff = await Staff.findById(rawId).select("name userId");
    if (!staff) continue;

    if (staff.userId) {
      const linkedUser = await User.findById(staff.userId).select("name");
      entry.teacherId = linkedUser || { _id: staff.userId, name: staff.name };
      if (migrate) {
        updates.push({
          updateOne: {
            filter: { _id: entry._id },
            update: { $set: { teacherId: staff.userId } },
          },
        });
      }
    } else {
      entry.teacherId = { _id: rawId, name: staff.name };
    }
  }

  if (migrate && updates.length) {
    await ClassTimetable.bulkWrite(updates);
  }

  return list;
};

export { POPULATE_PATHS };
