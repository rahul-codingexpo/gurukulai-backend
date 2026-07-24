/**
 * One-time fix: correct student dob + admissionDate from Angels Public School Excel.
 *
 * Sheet dates are DD-MM-YYYY (India). Older uploads may have day/month swapped.
 *
 * Usage (from gurukulai-backend folder):
 *   node scripts/fix-student-dates-from-sheet.mjs --dry-run
 *   node scripts/fix-student-dates-from-sheet.mjs
 *   node scripts/fix-student-dates-from-sheet.mjs --file "./data 6july2026.xlsx"
 *   node scripts/fix-student-dates-from-sheet.mjs --school "Angels Public School Begusarai"
 *
 * Requires MONGO_URI in .env. Keep the xlsx on the server; do not commit student data.
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";
import XLSX from "xlsx";
import { parseSheetDate, parseSheetDateToIso } from "../src/utils/parseSheetDate.util.js";

dotenv.config();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const fileIdx = args.indexOf("--file");
const schoolIdx = args.indexOf("--school");

const defaultFile = path.resolve(process.cwd(), "data 6july2026.xlsx");
const excelPath =
  fileIdx >= 0 && args[fileIdx + 1]
    ? path.resolve(process.cwd(), args[fileIdx + 1])
    : defaultFile;

const schoolName =
  schoolIdx >= 0 && args[schoolIdx + 1]
    ? String(args[schoolIdx + 1]).trim()
    : "Angels Public School Begusarai";

const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gurukulAI";

const normalizeHeader = (k) =>
  String(k || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const pick = (row, aliases) => {
  const map = {};
  for (const [k, v] of Object.entries(row || {})) {
    map[normalizeHeader(k)] = v;
  }
  for (const alias of aliases) {
    const v = map[normalizeHeader(alias)];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
};

const sameCalendarDay = (a, b) => {
  if (!a || !b) return false;
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
};

const toIsoLocal = (d) => {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

async function main() {
  if (!fs.existsSync(excelPath)) {
    console.error(`Excel file not found: ${excelPath}`);
    console.error('Place "data 6july2026.xlsx" in the backend folder or pass --file <path>');
    process.exit(1);
  }

  console.log(`Excel: ${excelPath}`);
  console.log(`School: ${schoolName}`);
  console.log(`Mongo: ${mongoUri}`);
  console.log(dryRun ? "Mode: DRY RUN (no writes)" : "Mode: WRITE");

  const wb = XLSX.readFile(excelPath, { cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  console.log(`Sheet rows: ${rows.length}`);

  const sheetByAdmission = new Map();
  let sheetSkipped = 0;

  for (const row of rows) {
    const admissionNumber = String(
      pick(row, ["Admission No.", "Admission No", "admissionNumber", "Admission Number"]),
    ).trim();
    if (!admissionNumber) {
      sheetSkipped += 1;
      continue;
    }

    const dobRaw = pick(row, ["Date Of Birth", "Date of Birth", "dob", "DOB"]);
    const admissionDateRaw = pick(row, [
      "Date of Addmission",
      "Date of Admission",
      "admissionDate",
      "Admission Date",
    ]);

    const dob = parseSheetDate(dobRaw);
    const admissionDate = parseSheetDate(admissionDateRaw);

    if (!dob && !admissionDate) {
      sheetSkipped += 1;
      continue;
    }

    sheetByAdmission.set(admissionNumber, {
      admissionNumber,
      dob,
      admissionDate,
      dobIso: parseSheetDateToIso(dobRaw),
      admissionDateIso: parseSheetDateToIso(admissionDateRaw),
    });
  }

  console.log(`Sheet students with dates: ${sheetByAdmission.size} (skipped ${sheetSkipped})`);

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  const school = await db.collection("schools").findOne({
    name: { $regex: new RegExp(`^${schoolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  });

  if (!school?._id) {
    console.error(`School not found: "${schoolName}"`);
    const samples = await db.collection("schools").find({}, { projection: { name: 1 } }).limit(20).toArray();
    console.error(
      "Available schools (sample):",
      samples.map((s) => s.name).join(" | ") || "(none)",
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Matched school: ${school.name} (${school._id})`);

  const students = await db
    .collection("students")
    .find({ schoolId: school._id })
    .project({ admissionNumber: 1, name: 1, dob: 1, admissionDate: 1 })
    .toArray();

  console.log(`DB students for school: ${students.length}`);

  let matched = 0;
  let updated = 0;
  let alreadyOk = 0;
  let notInSheet = 0;
  let noDateInSheet = 0;
  const samples = [];

  for (const student of students) {
    const adm = String(student.admissionNumber || "").trim();
    if (!adm) continue;

    const sheetRow = sheetByAdmission.get(adm);
    if (!sheetRow) {
      notInSheet += 1;
      continue;
    }
    matched += 1;

    const set = {};
    if (sheetRow.dob && !sameCalendarDay(student.dob, sheetRow.dob)) {
      set.dob = sheetRow.dob;
    }
    if (sheetRow.admissionDate && !sameCalendarDay(student.admissionDate, sheetRow.admissionDate)) {
      set.admissionDate = sheetRow.admissionDate;
    }

    if (!Object.keys(set).length) {
      if (!sheetRow.dob && !sheetRow.admissionDate) noDateInSheet += 1;
      else alreadyOk += 1;
      continue;
    }

    if (samples.length < 15) {
      samples.push({
        admissionNumber: adm,
        name: student.name,
        dob: { from: toIsoLocal(student.dob), to: sheetRow.dobIso },
        admissionDate: {
          from: toIsoLocal(student.admissionDate),
          to: sheetRow.admissionDateIso,
        },
        fields: Object.keys(set),
      });
    }

    if (!dryRun) {
      await db.collection("students").updateOne({ _id: student._id }, { $set: set });
    }
    updated += 1;
  }

  console.log("\nSample corrections:");
  for (const s of samples) {
    console.log(
      `  ${s.admissionNumber} ${s.name} | dob ${s.dob.from} → ${s.dob.to} | adm ${s.admissionDate.from} → ${s.admissionDate.to} | ${s.fields.join(",")}`,
    );
  }

  console.log("\nSummary:");
  console.log({ matched, updated, alreadyOk, notInSheet, noDateInSheet, dryRun });

  await mongoose.disconnect();
  console.log(dryRun ? "Dry run done. Re-run without --dry-run to apply." : "Done.");
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
