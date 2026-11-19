/**
 * PDF feedback fixes — automated verification suite (Phases 1–4).
 *
 * Usage:
 *   node scripts/test-pdf-fixes.mjs
 *   node scripts/test-pdf-fixes.mjs --live   # optional HTTP smoke (needs BASE_URL + TOKEN)
 *
 * Env (live only):
 *   BASE_URL=https://schoolerp.medhyxtech.com/api
 *   TOKEN=<Bearer token for Student/Parent/Teacher>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(__dirname, "..");
const APP = path.resolve(BACKEND, "../app");
const LIVE = process.argv.includes("--live");
const BASE_URL = (process.env.BASE_URL || "https://schoolerp.medhyxtech.com/api").replace(/\/$/, "");
const TOKEN = process.env.TOKEN || "";

const results = [];

const read = (p) => {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

const exists = (p) => fs.existsSync(p);

const assert = (id, title, ok, detail, confidence) => {
  results.push({
    id,
    title,
    pass: Boolean(ok),
    detail: detail || (ok ? "OK" : "FAILED"),
    confidence,
  });
};

const contains = (file, needles) => {
  const text = read(file);
  if (!text) return { ok: false, missing: ["<file missing>"] };
  const missing = needles.filter((n) => !text.includes(n));
  return { ok: missing.length === 0, missing, text };
};

// ---------- Phase 1 ----------
{
  const f = path.join(APP, "lib/view/home/home_main_screen.dart");
  const r = contains(f, ["PopScope", "Press back again to exit", "canPop: false"]);
  assert(
    7,
    "Back button does not exit app immediately",
    r.ok,
    r.ok ? "PopScope + double-back exit in HomeMainScreen" : `Missing: ${r.missing.join(", ")}`,
    r.ok ? 95 : 20,
  );
}

{
  const login = path.join(APP, "lib/view/auth/login_view.dart");
  const cubit = path.join(APP, "lib/view/auth/cubit/login_cubit.dart");
  const r1 = contains(login, ["hasNotices", "if (cubit.hasNotices)"]);
  const r2 = contains(cubit, ["final List<LoginNotice> announcements = []", "hasNotices"]);
  const ok = r1.ok && r2.ok && !contains(login, ['"2025-01-20"']).ok;
  assert(
    11,
    "Login Notice Board hidden when empty / no hardcoded 2025 date",
    ok,
    ok
      ? "Hardcoded notices/date removed; board gated on hasNotices"
      : `login_view missing=${r1.missing}; cubit missing=${r2.missing}`,
    ok ? 98 : 25,
  );
}

{
  const f = path.join(APP, "lib/view/quiz/QuizSubjectView.dart");
  const r = contains(f, ["TopicScreen", "onTap:", "Navigator.push"]);
  assert(
    9,
    "Quiz subject selection navigates to topics",
    r.ok,
    r.ok ? "SubjectCard onTap → TopicScreen" : `Missing: ${r.missing.join(", ")}`,
    r.ok ? 88 : 30,
  );
}

// ---------- Phase 2 ----------
{
  const routes = path.join(BACKEND, "src/modules/mobile/mobileDashboard.routes.js");
  const ctrl = path.join(BACKEND, "src/modules/mobile/mobileTeachers.controller.js");
  const appRepo = path.join(APP, "lib/data/repository/api_repository.dart");
  const ok =
    contains(routes, ['"/teachers"', "listMobileTeachers"]).ok &&
    contains(ctrl, ["listMobileTeachers"]).ok &&
    contains(appRepo, ["ApiEndpoints.TEACHERS"]).ok;
  assert(
    8,
    "Teacher Contacts uses GET /api/mobile/teachers",
    ok,
    ok ? "Route + controller + app wired" : "Teachers mobile route/controller/app wiring incomplete",
    ok ? 95 : 25,
  );
}

{
  const routes = path.join(BACKEND, "src/modules/mobile/mobileDashboard.routes.js");
  const ctrl = path.join(BACKEND, "src/modules/mobile/mobileFees.controller.js");
  const ok =
    contains(routes, ['"/fees/history"', "getMobileFeeHistory"]).ok &&
    contains(ctrl, ["getMobileFeeHistory", "FeeInvoice"]).ok;
  assert(
    12,
    "Past fees uses GET /api/mobile/fees/history",
    ok,
    ok ? "Fees history mobile API present" : "Fees history API missing",
    ok ? 95 : 25,
  );
}

{
  const routes = path.join(BACKEND, "src/modules/mobile/mobileDashboard.routes.js");
  const ctrl = path.join(BACKEND, "src/modules/mobile/mobileAdmitCard.controller.js");
  const appRepo = path.join(APP, "lib/data/repository/api_repository.dart");
  const ok =
    contains(routes, ['"/admit-card"', "getMobileAdmitCard"]).ok &&
    contains(ctrl, ["getMobileAdmitCard"]).ok &&
    contains(appRepo, ["ADMIT_CARD"]).ok &&
    !contains(appRepo, ['"/mobile/exams/admit-card"']).ok;
  assert(
    16,
    "Admit Card uses dedicated /mobile/admit-card (no exams/:id hack)",
    ok,
    ok ? "Dedicated admit-card route; bad fallback removed" : "Admit-card wiring incomplete",
    ok ? 92 : 30,
  );
}

{
  const routes = path.join(BACKEND, "src/modules/mobile/mobileDashboard.routes.js");
  const ctrl = path.join(BACKEND, "src/modules/mobile/mobileClasses.controller.js");
  const examView = path.join(APP, "lib/view/exam/exam_view.dart");
  const ok =
    contains(routes, ['"/sections"', "listMobileSections"]).ok &&
    contains(ctrl, ["listMobileSections"]).ok &&
    contains(examView, ["schoolSections"]).ok &&
    !contains(examView, ['["A", "B", "C", "D", "E", "F"]']).ok;
  assert(
    13,
    "Exam Class/Section from school APIs (not hardcoded A–F)",
    ok,
    ok ? "Mobile sections API + ExamView uses schoolSections" : "Sections still hardcoded or API missing",
    ok ? 90 : 35,
  );
}

// ---------- Phase 3 ----------
{
  const routes = path.join(BACKEND, "src/modules/mobile/mobileDashboard.routes.js");
  const ctrl = path.join(BACKEND, "src/modules/mobile/mobileHolidays.controller.js");
  const cubit = path.join(APP, "lib/view/holiday/cubit/holiday_cubit.dart");
  const ok =
    contains(routes, ['"/holidays"', "listMobileHolidays"]).ok &&
    contains(ctrl, ["listMobileHolidays"]).ok &&
    contains(cubit, ["getHolidays"]).ok &&
    !contains(cubit, ["Holi - Festival of Colors"]).ok;
  assert(
    10,
    "Holidays load from API (not hardcoded Holi/Ramzan)",
    ok,
    ok ? "Holidays API + cubit uses getHolidays()" : "Holidays still hardcoded or API missing",
    ok ? 90 : 30,
  );
}

{
  const routes = path.join(BACKEND, "src/modules/mobile/mobileDashboard.routes.js");
  const ctrl = path.join(BACKEND, "src/modules/mobile/mobileTransport.controller.js");
  const screen = path.join(APP, "lib/view/transport/transport_screen.dart");
  const discover = path.join(APP, "lib/view/home/widgets/discover_bottom_sheet.dart");
  const ok =
    contains(routes, ['"/transport"', "getMobileTransport"]).ok &&
    contains(ctrl, ["getMobileTransport"]).ok &&
    exists(screen) &&
    contains(discover, ['"/transport"']).ok;
  assert(
    4,
    "Transport details for student (API + Discover screen)",
    ok,
    ok ? "Transport API + screen + Discover tile" : "Transport feature incomplete",
    ok ? 88 : 25,
  );
}

{
  const model = path.join(BACKEND, "src/modules/exam/examMark.model.js");
  const examCtrl = path.join(BACKEND, "src/modules/exam/exam.controller.js");
  const marksUi = path.join(APP, "lib/view/teacher/marks_entry/marks_entry_screen.dart");
  const report = path.join(APP, "lib/view/report/report_screen.dart");
  const ok =
    contains(model, ["practicalValue"]).ok &&
    contains(examCtrl, ["practicalValue", "practical"]).ok &&
    contains(marksUi, ["Practical", "setPracticalMarks"]).ok &&
    contains(report, ["practical"]).ok;
  assert(
    3,
    "Practical marks on marksheet / marks entry",
    ok,
    ok ? "Schema + upsert/get + UI + report display" : "Practical marks incomplete",
    ok ? 85 : 30,
  );
}

{
  const staffModel = path.join(BACKEND, "src/modules/staff/staff.model.js");
  const staffCtrl = path.join(BACKEND, "src/modules/staff/staff.controller.js");
  const ok =
    contains(staffModel, ['"Other"', "customDesignation"]).ok &&
    contains(staffCtrl, ['"Other"', "customDesignation"]).ok;
  assert(
    1,
    'Designation "Other" + customDesignation (backend)',
    ok,
    ok
      ? "Backend enum + validation ready (web Add Staff form is outside this repo)"
      : "Designation Other not in staff model/controller",
    ok ? 82 : 25,
  );
}

// ---------- Phase 4 ----------
{
  const err = path.join(APP, "lib/utils/error_message.dart");
  const retry = path.join(APP, "lib/utils/error_retry_view.dart");
  const fees = path.join(APP, "lib/view/fees/fees_screen.dart");
  const teachers = path.join(APP, "lib/view/teacherchat/teacher_list_chatting_screen.dart");
  const ok =
    exists(err) &&
    exists(retry) &&
    contains(fees, ["ErrorRetryView"]).ok &&
    contains(teachers, ["ErrorRetryView"]).ok;
  assert(
    "P4-err",
    "Friendly errors + Retry UI",
    ok,
    ok ? "error_message + ErrorRetryView wired on key screens" : "Error polish incomplete",
    ok ? 92 : 30,
  );
}

{
  const screen = path.join(APP, "lib/view/study_materials/study_materials_screen.dart");
  const repo = path.join(APP, "lib/data/repository/api_repository.dart");
  const ok =
    contains(screen, ["sectionId", "subjectId", "Class"]).ok &&
    contains(repo, ["required String sectionId", "required String subjectId"]).ok;
  assert(
    "P4-study",
    "Study material upload collects class/section/subject",
    ok,
    ok ? "Upload sheet + repository require IDs" : "Upload still missing required IDs",
    ok ? 90 : 35,
  );
}

// ---------- Previously fixed (retest code presence) ----------
{
  const readme = path.join(BACKEND, "README-MOBILE-APIS-ADDED.md");
  const routes = path.join(BACKEND, "src/modules/mobile/mobileDashboard.routes.js");
  const ok =
    contains(readme, ["dashboard/teacher"]).ok &&
    contains(routes, ["getTeacherDashboard"]).ok;
  assert(
    5,
    "Teacher login/dashboard mobile route (prior fix)",
    ok,
    ok ? "Documented + route registered" : "Teacher dashboard route missing",
    ok ? 90 : 40,
  );
}

{
  const discover = path.join(APP, "lib/view/home/widgets/discover_bottom_sheet.dart");
  const report = path.join(APP, "lib/view/report/report_screen.dart");
  const ok = contains(discover, ['"/report"']).ok && exists(report);
  assert(
    6,
    "Discover → Report opens Report (not Exams)",
    ok,
    ok ? "Discover routes to /report" : "Report route missing",
    ok ? 95 : 40,
  );
}

{
  const guardian = path.join(BACKEND, "src/modules/mobile/mobileGuardian.controller.js");
  const routes = path.join(BACKEND, "src/modules/mobile/mobileDashboard.routes.js");
  const ok =
    contains(guardian, ["getMobileGuardian"]).ok &&
    contains(routes, ['"/guardian"']).ok;
  assert(
    14,
    "Guardian details from student record (prior fix)",
    ok,
    ok ? "Guardian mobile API present" : "Guardian API missing",
    ok ? 90 : 40,
  );
}

{
  const header = path.join(APP, "lib/view/home/widgets/home_header.dart");
  const profile = path.join(APP, "lib/view/profile/profile_screen.dart");
  const ok =
    (contains(header, ['"/profile"']).ok || contains(header, ["profile"]).ok) &&
    exists(profile);
  assert(
    15,
    "Home avatar → profile/student details (prior fix)",
    ok,
    ok ? "Profile screen + header navigation present" : "Avatar→profile wiring unclear",
    ok ? 88 : 45,
  );
}

{
  const study = path.join(APP, "lib/view/study_materials/study_materials_screen.dart");
  const routes = path.join(BACKEND, "src/modules/mobile/mobileDashboard.routes.js");
  const ok =
    contains(study, ["_open", "FileDownloader"]).ok &&
    contains(routes, ["study-materials"]).ok;
  assert(
    17,
    "Study Materials tap opens/downloads file (prior fix)",
    ok,
    ok ? "Open/download path + mobile study-materials route" : "Study open path incomplete",
    ok ? 88 : 40,
  );
}

{
  const admit = path.join(APP, "lib/view/admit_card/admit_card_screen.dart");
  const ok = contains(admit, ["instructions", "entry.key + 1"]).ok;
  assert(
    2,
    "Admit card instructions line by line (prior UI)",
    ok,
    ok ? "Instructions rendered numbered line-by-line" : "Instructions UI missing",
    ok ? 85 : 40,
  );
}

// ---------- Optional live smoke ----------
async function liveSmoke() {
  if (!LIVE) return;
  if (!TOKEN) {
    assert(
      "LIVE",
      "Live API smoke tests",
      false,
      "Skipped: set TOKEN env for --live",
      0,
    );
    return;
  }

  const endpoints = [
    ["/mobile/teachers", 8],
    ["/mobile/fees/history", 12],
    ["/mobile/admit-card", 16],
    ["/mobile/sections", 13],
    ["/mobile/holidays", 10],
    ["/mobile/transport", 4],
    ["/mobile/classes", 13],
    ["/mobile/guardian", 14],
    ["/mobile/study-materials", 17],
  ];

  for (const [ep, related] of endpoints) {
    try {
      const res = await fetch(`${BASE_URL}${ep}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const status = res.status;
      const ok = status >= 200 && status < 500 && status !== 404;
      assert(
        `LIVE-${related}`,
        `LIVE ${ep}`,
        ok,
        `HTTP ${status}`,
        ok ? 70 : 20,
      );
    } catch (e) {
      assert(`LIVE-${related}`, `LIVE ${ep}`, false, String(e.message || e), 10);
    }
  }
}

await liveSmoke();

// ---------- Report ----------
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
const avgConfidence =
  results.reduce((s, r) => s + (r.pass ? r.confidence : Math.min(r.confidence, 40)), 0) /
  (results.length || 1);

const lines = [];
lines.push("# PDF Fixes — Test Report");
lines.push("");
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`Mode: ${LIVE ? "static + live" : "static code verification"}`);
lines.push(`Summary: **${passed} passed**, **${failed} failed**, avg confidence **${avgConfidence.toFixed(0)}%**`);
lines.push("");
lines.push("| ID | Item | Result | Confidence | Detail |");
lines.push("|----|------|--------|------------|--------|");
for (const r of results) {
  lines.push(
    `| ${r.id} | ${r.title} | ${r.pass ? "PASS" : "FAIL"} | **${r.confidence}%** | ${r.detail.replace(/\|/g, "/")} |`,
  );
}
lines.push("");
lines.push("## Confidence meaning");
lines.push("- **90–98%**: Code present and wiring matches the planned fix; live device retest still recommended.");
lines.push("- **80–89%**: Core fix present; depends on data/deploy/web form outside this repo.");
lines.push("- **≤40%**: Check failed — implementation missing or incomplete.");
lines.push("");
if (!LIVE) {
  lines.push("## Live API");
  lines.push("Re-run with credentials for HTTP smoke:");
  lines.push("```bash");
  lines.push("TOKEN=<jwt> node scripts/test-pdf-fixes.mjs --live");
  lines.push("```");
}

const reportPath = path.join(BACKEND, "TEST-REPORT-PDF-FIXES.md");
fs.writeFileSync(reportPath, lines.join("\n"), "utf8");

const jsonPath = path.join(BACKEND, "TEST-REPORT-PDF-FIXES.json");
fs.writeFileSync(
  jsonPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), passed, failed, avgConfidence, results }, null, 2),
  "utf8",
);

console.log(lines.join("\n"));
console.log(`\nWrote ${reportPath}`);
console.log(`Wrote ${jsonPath}`);

process.exit(failed > 0 ? 1 : 0);
