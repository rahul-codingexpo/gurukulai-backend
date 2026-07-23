/**
 * Normalize DB media paths:
 * - uploads/foo -> /uploads/foo
 * - ensure leading slash for local uploads paths
 */
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const dryRun = process.argv.includes("--dry-run");
const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gurukulAI";

const normalizePath = (value) => {
  if (typeof value !== "string") return { value, changed: false };
  const raw = value.trim();
  if (!raw) return { value, changed: false };

  if (raw.startsWith("uploads/")) {
    return { value: `/${raw}`, changed: true };
  }
  return { value, changed: false };
};

const walk = (value) => {
  if (typeof value === "string") return normalizePath(value);

  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const r = walk(item);
      if (r.changed) changed = true;
      return r.value;
    });
    return { value: next, changed };
  }

  if (
    value &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    typeof value.toHexString !== "function" &&
    !value._bsontype
  ) {
    let changed = false;
    const next = {};
    for (const [k, v] of Object.entries(value)) {
      const r = walk(v);
      next[k] = r.value;
      if (r.changed) changed = true;
    }
    return { value: next, changed };
  }

  return { value, changed: false };
};

const main = async () => {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const cols = await db.listCollections().toArray();
  let updated = 0;

  for (const { name } of cols) {
    if (name.startsWith("system.")) continue;
    const col = db.collection(name);
    const cursor = col.find({});
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      const { _id, ...rest } = doc;
      const rewritten = walk(rest);
      if (!rewritten.changed) continue;
      updated += 1;
      console.log(`[${name}] ${_id} normalized uploads paths`);
      if (!dryRun) await col.replaceOne({ _id }, { _id, ...rewritten.value });
    }
  }

  console.log(dryRun ? `DRY RUN docs needing fix: ${updated}` : `Updated docs: ${updated}`);
  await mongoose.disconnect();
};

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
