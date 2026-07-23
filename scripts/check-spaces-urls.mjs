import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gurukulAI";

const walk = (v, path, hits) => {
  if (typeof v === "string") {
    if (/digitaloceanspaces|gurukul-uploads\.sfo3/i.test(v)) {
      hits.push({ path, value: v.slice(0, 180) });
    }
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => walk(x, `${path}[${i}]`, hits));
    return;
  }
  if (v && typeof v === "object" && !(v instanceof Date) && !v._bsontype && typeof v.toHexString !== "function") {
    for (const [k, val] of Object.entries(v)) {
      walk(val, path ? `${path}.${k}` : k, hits);
    }
  }
};

const main = async () => {
  await mongoose.connect(mongoUri);
  console.log("DB:", mongoUri);
  const db = mongoose.connection.db;
  const cols = await db.listCollections().toArray();
  let total = 0;
  for (const { name } of cols) {
    if (name.startsWith("system.")) continue;
    const docs = await db.collection(name).find({}).toArray();
    for (const doc of docs) {
      const hits = [];
      walk(doc, "", hits);
      if (hits.length) {
        total += hits.length;
        console.log(`\n[${name}] ${doc._id}`);
        hits.slice(0, 8).forEach((h) => console.log(" ", h.path, "=>", h.value));
      }
    }
  }
  console.log("\n---");
  console.log("Remaining Spaces-like values:", total);
  const school = await db.collection("schools").findOne({}, { projection: { logo: 1, qrCode: 1, name: 1 } });
  console.log("Sample school:", school);
  const gallery = await db.collection("galleries").findOne({}, { projection: { mediaUrl: 1 } });
  console.log("Sample gallery:", gallery);
  await mongoose.disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
