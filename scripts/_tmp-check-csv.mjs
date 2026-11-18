import fs from "fs";
import XLSX from "xlsx";
import { parseSheetDateToIso } from "../src/utils/parseSheetDate.util.js";

const path = "./Angles Public School 6 July 2026 (2).csv";
const buf = fs.readFileSync(path);

const readOpts = { cellDates: false, raw: true, dateNF: "dd/mm/yyyy" };
const wb = XLSX.read(buf, { type: "buffer", ...readOpts });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });

const targets = ["2035", "1696", "Zainab", "Ahmad"];
for (const r of rows) {
  const adm = String(r.admissionNumber || "");
  const name = String(r.name || "");
  if (targets.some((t) => adm === t || name.includes(t))) {
    console.log({
      name: r.name,
      admissionNumber: r.admissionNumber,
      dobRaw: r.dob,
      dobType: typeof r.dob,
      dobCell: r.dob instanceof Date ? r.dob.toISOString() : r.dob,
      admRaw: r.admissionDate,
      admType: typeof r.admissionDate,
      parsedDob: parseSheetDateToIso(r.dob, XLSX.SSF),
      parsedAdm: parseSheetDateToIso(r.admissionDate, XLSX.SSF),
    });
  }
}

// Also check first few ambiguous dates
console.log("\nSample ambiguous:");
for (const r of rows.slice(0, 8)) {
  console.log(
    r.name,
    "| dob",
    JSON.stringify(r.dob),
    "->",
    parseSheetDateToIso(r.dob, XLSX.SSF),
    "| adm",
    JSON.stringify(r.admissionDate),
    "->",
    parseSheetDateToIso(r.admissionDate, XLSX.SSF),
  );
}

// Simulate frontend formatAsIsoDate / parseDobToIso path
import { createRequire } from "module";
// inline compact parse like frontend
const compact = (v) =>
  String(v ?? "")
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ")
    .replace(/\s+/g, "")
    .trim();

console.log("\nWithout XLSX — raw line grep:");
const text = fs.readFileSync(path, "utf8");
for (const line of text.split(/\r?\n/)) {
  if (line.includes(",2035,") || line.includes(",1696,")) {
    const cols = line.split(",");
    // fragile but headers: name,gender,dob,admissionNumber,... admissionDate at 7
    console.log("cols3 dob?", cols[2], "cols3 admNo?", cols[3], "cols7 admDate?", cols[7]);
    console.log(line.slice(0, 120));
  }
}
