import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";

dotenv.config();

const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gurukulAI";
const uploadsRoot = path.resolve(process.cwd(), "uploads");

const collectUploadPaths = (value, out) => {
  if (typeof value === "string") {
    if (value.includes("uploads/") || value.startsWith("/uploads")) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectUploadPaths(v, out));
    return;
  }
  if (value && typeof value === "object" && !(value instanceof Date) && typeof value.toHexString !== "function") {
    Object.values(value).forEach((v) => collectUploadPaths(v, out));
  }
};

const toFsPath = (url) => {
  let p = String(url).trim();
  if (/^https?:\/\//i.test(p)) {
    try {
      p = new URL(p).pathname;
    } catch {
      return null;
    }
  }
  p = p.replace(/^\/+/, "");
  if (!p.startsWith("uploads/")) return null;
  return path.resolve(process.cwd(), p);
};

const main = async () => {
  console.log("cwd:", process.cwd());
  console.log("uploadsRoot:", uploadsRoot);
  console.log("uploads exists:", fs.existsSync(uploadsRoot));

  const top = fs.existsSync(uploadsRoot)
    ? fs.readdirSync(uploadsRoot).slice(0, 20)
    : [];
  console.log("uploads top entries:", top);

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const school = await db.collection("schools").findOne({}, { projection: { name: 1, logo: 1, qrCode: 1 } });
  const gallery = await db.collection("galleries").findOne({}, { projection: { mediaUrl: 1, title: 1 } });
  const student = await db.collection("students").findOne(
    { "documents.studentPhoto": { $type: "string" } },
    { projection: { name: 1, documents: 1 } },
  );

  console.log("\nDB samples:");
  console.log("school.logo =", school?.logo);
  console.log("school.qrCode =", school?.qrCode);
  console.log("gallery.mediaUrl =", gallery?.mediaUrl);
  console.log("student.photo =", student?.documents?.studentPhoto);

  const samples = [school?.logo, school?.qrCode, gallery?.mediaUrl, student?.documents?.studentPhoto].filter(Boolean);
  console.log("\nPath checks:");
  for (const s of samples) {
    const abs = toFsPath(s);
    const ok = abs ? fs.existsSync(abs) : false;
    console.log(`${ok ? "OK " : "MISS"} | db=${s} | file=${abs || "(not local uploads path)"}`);
  }

  // scan a few collections for missing files
  let checked = 0;
  let missing = 0;
  const missingExamples = [];
  for (const name of ["schools", "galleries", "students", "staffs", "studymaterials"]) {
    const docs = await db.collection(name).find({}).limit(200).toArray();
    for (const doc of docs) {
      const paths = [];
      collectUploadPaths(doc, paths);
      for (const p of paths) {
        checked += 1;
        const abs = toFsPath(p);
        if (!abs || !fs.existsSync(abs)) {
          missing += 1;
          if (missingExamples.length < 12) missingExamples.push({ collection: name, id: String(doc._id), path: p });
        }
      }
    }
  }

  console.log(`\nChecked upload-like fields: ${checked}`);
  console.log(`Missing on disk: ${missing}`);
  if (missingExamples.length) {
    console.log("Missing examples:");
    missingExamples.forEach((m) => console.log(`- [${m.collection}] ${m.path}`));
  }

  // expected public URL
  console.log("\nBrowser should request:");
  console.log("http://localhost:5000" + (String(school?.logo || "").startsWith("/") ? school.logo : `/${school?.logo || ""}`));

  await mongoose.disconnect();
};

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
