/**
 * Rewrite DigitalOcean Spaces URLs in MongoDB to local /uploads/... paths.
 *
 * Usage:
 *   node scripts/migrate-spaces-urls-to-local.mjs
 *   node scripts/migrate-spaces-urls-to-local.mjs --dry-run
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { toLocalUploadPath } from "../src/utils/spacesPublicUrl.util.js";

dotenv.config();

const dryRun = process.argv.includes("--dry-run");
const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gurukulAI";

const looksLikeSpacesUrl = (value) =>
  typeof value === "string" &&
  (/digitaloceanspaces\.com/i.test(value) ||
    (/gurukul-uploads/i.test(value) && /^https?:\/\//i.test(value)));

const rewriteValue = (value) => {
  if (typeof value === "string") {
    if (!looksLikeSpacesUrl(value)) return { value, changed: false };
    const local = toLocalUploadPath(value);
    if (!local || local === value) return { value, changed: false };
    return { value: local, changed: true };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const r = rewriteValue(item);
      if (r.changed) changed = true;
      return r.value;
    });
    return { value: next, changed };
  }

  if (value && typeof value === "object" && !(value instanceof Date) && !value._bsontype) {
    // Skip ObjectId / Buffer-like
    if (typeof value.toHexString === "function") return { value, changed: false };

    let changed = false;
    const next = {};
    for (const [k, v] of Object.entries(value)) {
      const r = rewriteValue(v);
      next[k] = r.value;
      if (r.changed) changed = true;
    }
    return { value: next, changed };
  }

  return { value, changed: false };
};

async function main() {
  console.log(`Connecting: ${mongoUri}`);
  console.log(dryRun ? "Mode: DRY RUN (no writes)" : "Mode: WRITE");

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  let docsScanned = 0;
  let docsUpdated = 0;
  let fieldsChanged = 0;

  for (const { name } of collections) {
    if (name.startsWith("system.")) continue;
    const col = db.collection(name);
    const cursor = col.find({});

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      docsScanned += 1;
      const { _id, ...rest } = doc;
      const rewritten = rewriteValue(rest);
      if (!rewritten.changed) continue;

      fieldsChanged += 1;
      docsUpdated += 1;
      console.log(`[${name}] ${_id} → local /uploads paths`);

      if (!dryRun) {
        await col.replaceOne({ _id }, { _id, ...rewritten.value });
      }
    }
  }

  console.log("---");
  console.log(`Docs scanned: ${docsScanned}`);
  console.log(`Docs updated: ${docsUpdated}`);
  console.log(`Collections touched (approx by updated docs): ${fieldsChanged}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
