/**
 * Backfill classKey on existing quizquestions; schoolId kept but unused going forward.
 *
 * Usage:
 *   node scripts/migrate-quiz-questions-global.mjs
 *   node scripts/migrate-quiz-questions-global.mjs --dry-run
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { normalizeClassKey } from "../src/utils/normalizeClassKey.util.js";

dotenv.config();

const dryRun = process.argv.includes("--dry-run");
const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gurukulAI";

async function main() {
  console.log(`Connecting: ${mongoUri}`);
  console.log(dryRun ? "Mode: DRY RUN" : "Mode: WRITE");

  await mongoose.connect(mongoUri);
  const col = mongoose.connection.db.collection("quizquestions");

  const cursor = col.find({});
  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    scanned += 1;
    const classKey = normalizeClassKey(doc.class);
    if (!classKey) {
      skipped += 1;
      console.warn(`Skip ${doc._id}: cannot normalize class="${doc.class}"`);
      continue;
    }
    if (doc.classKey === classKey) {
      skipped += 1;
      continue;
    }
    if (!dryRun) {
      await col.updateOne({ _id: doc._id }, { $set: { classKey } });
    }
    updated += 1;
  }

  console.log({ scanned, updated, skipped, dryRun });
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
