import mongoose from "mongoose";

const examMarkSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    /** Theory | Practical | Oral */
    paperType: {
      type: String,
      enum: ["Theory", "Practical", "Oral"],
      default: "Theory",
      trim: true,
    },
    value: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

/** Unique per student + subject + paper type (Theory / Practical / Oral). */
examMarkSchema.index(
  { schoolId: 1, examId: 1, studentId: 1, subjectId: 1, paperType: 1 },
  { unique: true },
);

const ExamMark = mongoose.model("ExamMark", examMarkSchema);

/**
 * Drop legacy unique index (no paperType) so Theory + Practical can coexist
 * for the same subject, then sync schema indexes.
 */
export async function ensureExamMarkIndexes() {
  const coll = mongoose.connection.collection("exammarks");
  const obsoleteIndex = "schoolId_1_examId_1_studentId_1_subjectId_1";

  try {
    const indexes = await coll.indexes();
    if (indexes.some((idx) => idx.name === obsoleteIndex)) {
      await coll.dropIndex(obsoleteIndex);
      console.log(`✅ Dropped obsolete ExamMark index: ${obsoleteIndex}`);
    }
  } catch (err) {
    if (err?.codeName !== "IndexNotFound" && err?.code !== 27) {
      console.warn("ExamMark index cleanup warning:", err.message);
    }
  }

  try {
    const backfill = await ExamMark.updateMany(
      {
        $or: [
          { paperType: { $exists: false } },
          { paperType: null },
          { paperType: "" },
        ],
      },
      { $set: { paperType: "Theory" } },
    );
    if (backfill.modifiedCount) {
      console.log(`✅ Backfilled paperType=Theory on ${backfill.modifiedCount} exam mark(s)`);
    }
  } catch (err) {
    console.warn("ExamMark paperType backfill warning:", err.message);
  }

  try {
    await ExamMark.syncIndexes();
  } catch (err) {
    console.warn("ExamMark syncIndexes warning:", err.message);
  }
}

export default ExamMark;
