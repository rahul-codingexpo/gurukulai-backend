# Backend handoff — School Management mobile APIs

**Audience:** Backend developer  
**Live API base:** `https://schoolerp.medhyxtech.com/api`  
**App package:** `com.Medhyxtech.School` (Medhyx School on Play Store)  
**Scope:** Make student Discover + related mobile APIs match what the Flutter app calls.  
**Do not:** deploy casually to production, copy production data, or send real WhatsApp/email unless explicitly asked.

---

## How to read status codes (live probe)

| Code | Meaning for mobile |
|------|--------------------|
| **401** `Not authorized, token missing` | Route **exists**. Needs Bearer token. Not “broken route”. |
| **404** `Route not found` | Route **missing on live**. Feature cannot load until backend ships it. |
| **400** on `POST /auth/login` with empty body | Login route **exists** (validation ran). |

**Probed:** 2026-11-10 against production (unauthenticated GETs unless noted).

---

## Student Discover — live accuracy (must fix)

Flutter Discover opens these screens. Opening navigation alone is not enough; each must hit a live route and return data when logged in as Student.

| Feature | App calls | Live result | Backend needed? |
|---------|-----------|-------------|-----------------|
| Timetable | `GET /mobile/timetable` | **401** route OK | Verify with student token + day filter |
| Notice Board | `GET /mobile/events` | **401** route OK | Verify filters (all / upcoming / past) |
| Exam | `GET /mobile/exams` | **401** route OK | Verify list + detail + syllabus |
| Guardian Details | `GET /mobile/guardian` | **401** route OK | Verify name/phone/email/address |
| Report | `GET /mobile/exams` then `.../exams/:id/marks` | Exams **401**; marks need auth check | Verify marks payload for student |
| Holiday | `GET /mobile/holidays?year=&month=` | **404 missing** | **Ship route** (see §A) |
| Gallery | `GET /mobile/gallery` | **401** route OK | Verify albums/photos |
| Settings / Profile | Local UI + `GET/POST /mobile/profile` (+ photo) | Profile **401** route OK | Verify photo upload Student-only |
| Study Material | `GET /mobile/study-materials` | **401** route OK | Verify list + download URLs |
| Fees | `GET /mobile/fees/history`, `GET /mobile/invoices` | **404 missing** | **Ship routes** (see §A) |
| Admit Card | `GET /mobile/admit-card` (+ `/children`) | **404 missing** | **Ship routes** (see §A) |
| Transport | `GET /mobile/transport` | **404 missing** | **Ship route** (see §A) |
| Attendance | `GET /mobile/attendance/student` | **401** route OK | Verify month/status (no fake times) |
| Homework | `GET /mobile/homework` (+ submit) | **401** route OK | Verify list/filter/submit |
| Teacher | `GET /mobile/teachers` | **404 missing** | **Ship route** (see §A) |
| Classes | `GET /mobile/classes` | **401** route OK | Sections: `GET /mobile/sections` is **404** — ship or stop requiring it |
| Play Quiz | `/mobile/quiz/subjects`, `topics`, `quizzes/questions`, `quizzes/submit` | **401** routes OK | Verify full quiz flow |

### Also confirmed

| Endpoint | Live |
|----------|------|
| `GET /health` | **200** |
| `POST /auth/login` | Exists (**400** without credentials) |
| `GET /mobile/dashboard` | **401** |
| `GET /mobile/timetable/courses` | **401** |
| `GET /mobile/homework/subjects` | **401** |
| `GET /mobile/sections` | **404** |
| Alternate fee/holiday/admit/transport paths tried | Still **404** |

---

## A. REQUIRED — Missing live routes (404)

These are called by the published Flutter app and **fail on production today**.

Implement (or restore) under `/api/mobile/...` with Bearer auth. Prefer **403** for wrong role, **401** when token missing, **404 only** when resource id not found — not for the whole route.

### A1. Holidays

- **Flutter:** `GET /api/mobile/holidays?year=&month=`
- **Live:** 404  
- **Need:** list of holidays/events for calendar (title, date, endDate, description, location, optional imageUrl).  
- Optional later: replace CDN default image (old §2) — **not** a substitute for the missing route.

### A2. Fees & invoices

- **Flutter:**  
  - `GET /api/mobile/fees/history`  
  - `GET /api/mobile/invoices`  
- **Live:** both 404  
- **Need:** student/parent fee rows; include `fatherName` if available. Teacher/Staff → **403**.

### A3. Admit card

- **Flutter:**  
  - `GET /api/mobile/admit-card`  
  - `GET /api/mobile/admit-card/children`  
- **Live:** both 404  
- **Need:** student/parent scoped admit data. Do **not** reuse `GET /mobile/exams/admit-card` (treats `admit-card` as examId → 500 risk).

### A4. Transport

- **Flutter:** `GET /api/mobile/transport`  
- **Live:** 404  
- **Need:** student’s route/bus/driver/conductor info (or empty success payload if unassigned).

### A5. Teachers directory

- **Flutter:** `GET /api/mobile/teachers` (Teacher Discover / dial list)  
- **Live:** 404  
- **Need:** school teacher list (`name`, `subject`, `phone`, `photo`/`photoUrl`).

### A6. Sections (Classes filters)

- **Flutter:** `GET /api/mobile/sections?classId=` (and similar)  
- **Live:** 404  
- **Classes list** `GET /api/mobile/classes` is **401** (OK).  
- **Need:** sections for a class, or document that mobile must not call sections until shipped.

---

## B. REQUIRED — Staff leave apply returns wrong `status` string

*(Still valid; separate from Discover 404s.)*

### Problem

Staff/teacher leave apply HTTP response invents a display string that is **not** the DB enum.

| Source | `status` value |
|--------|----------------|
| Mongo `StaffLeave.status` enum | `"Approved"` \| `"Unapproved"` \| `"Rejected"` |
| Apply API response (bug) | `"Pending Approval"` |
| List/detail APIs | canonical status + `statusLabel: "Pending"` when Unapproved |

### Location

**File:** `backend/src/modules/mobile/mobileLeaves.controller.js`  
**Function:** `applyStaffLeaveMobile` (~520–530)

Return `status: leave.status` (expect `"Unapproved"`) and `statusLabel: "Pending"` — never `"Pending Approval"`, never store that string in Mongo.

### Related routes

| Method | Path |
|--------|------|
| POST | `/api/mobile/leaves/staff/me/apply` |
| GET | `/api/mobile/leaves/staff/me/dashboard` |
| GET | `/api/mobile/leaves/staff/me/:id` |
| PUT | `/api/mobile/leaves/staff/:id/status` |
| PUT | `/api/mobile/leaves/students/:id/status` |

### Acceptance

- [ ] Apply never returns `"Pending Approval"`.  
- [ ] `status` is only `Approved` \| `Unapproved` \| `Rejected`.  
- [ ] List/detail/apply agree for the same leave id.  
- [ ] Bad ObjectId → **400**, not 500.

---

## C. OPTIONAL — Holiday image CDN (only after A1 exists)

When holidays route exists and an event has no `imageUrl`, avoid hard dependency on jsDelivr Twemoji if product prefers local/empty placeholder.

**File (if present):** `backend/src/modules/mobile/mobileHolidays.controller.js`  
**Priority:** Low. Irrelevant until **A1** is live.

---

## D. DECISION — Staff / teacher attendance timezone

Staff self-mark times use Node process local TZ unless configured otherwise.

**File:** `backend/src/modules/mobile/mobileAttendance.controller.js`  

Product must choose: server-local = school TZ, UTC, or explicit `SCHOOL_TIMEZONE` (e.g. `Asia/Kolkata`).  
Student month API is status-only by design — do not invent entry/exit times for students without a product decision.

---

## E. Verification checklist (staging / after deploy)

Run with real Student (and Teacher where noted) Bearer tokens. Prefer non-production DB for leave writes.

### E1. Routes that were 404 on production — must become 401/200

| # | Endpoint | Pass |
|---|----------|------|
| 1 | `GET /api/mobile/holidays` | Not 404; calendar data for year/month |
| 2 | `GET /api/mobile/fees/history` | Not 404; `fatherName` when available; Teacher 403 |
| 3 | `GET /api/mobile/invoices` | Not 404 |
| 4 | `GET /api/mobile/admit-card` (+ children) | Not 404; scoped student |
| 5 | `GET /api/mobile/transport` | Not 404 |
| 6 | `GET /api/mobile/teachers` | Not 404; usable directory |
| 7 | `GET /api/mobile/sections` | Not 404 **or** Flutter updated to stop calling it |

### E2. Routes that already existed (401) — still verify with login

| # | Area | Endpoint(s) | Pass |
|---|------|-------------|------|
| 1 | Login | `POST /api/auth/login` | Token for Student/Teacher |
| 2 | Dashboard | `GET /api/mobile/dashboard` | 200 Student |
| 3 | Timetable | `GET /api/mobile/timetable` | Day periods load |
| 4 | Notice | `GET /api/mobile/events` | Filters work |
| 5 | Exam + report marks | `GET /api/mobile/exams`, `.../:id/marks` | List + marks |
| 6 | Guardian | `GET /api/mobile/guardian` | Fields populated |
| 7 | Gallery | `GET /api/mobile/gallery` | Albums/photos |
| 8 | Study materials | `GET /api/mobile/study-materials` | List + file URLs |
| 9 | Attendance | `GET /api/mobile/attendance/student` | Month statuses |
| 10 | Homework | `GET/POST .../mobile/homework...` | List + submit |
| 11 | Classes | `GET /api/mobile/classes` | Includes Nursery/LKG/UKG when in DB |
| 12 | Quiz | subjects → topics → questions → submit | Full flow |
| 13 | Profile photo | `POST /api/mobile/profile/photo` | Student only; others 403 |
| 14 | Leave (§B) | staff apply + approve/reject | Canonical status; no 500 on bad id |
| 15 | Teacher dashboard | `GET /api/mobile/dashboard/teacher` | 200 Teacher |

**Auth:** All `/api/mobile/*` need `Authorization: Bearer <token>` except public health.

---

## F. Out of scope / do not change unless asked

- Flutter store listing / signing / Play Console.  
- Production Mongo dumps / production secrets in chat.  
- Enabling WhySMS / Resend for these fixes.  
- Inventing App Store IDs or seed passwords in this doc.

---

## G. Suggested PR plan

| PR | Contents | Priority |
|----|----------|----------|
| **PR-1** | §A missing routes: holidays, fees/invoices, admit-card, transport, teachers, sections | **Ship first** (Discover broken in prod) |
| **PR-2** | §B leave apply `status` + `statusLabel` | Required |
| **PR-3** | §C holiday image fallback | Optional, after PR-1 |
| **PR-4** | §D timezone | After product decision |
| — | §E verification on staging then production | After PR-1 / PR-2 |

---

## Changelog of this document

| Date | Note |
|------|------|
| 2026-03-26 | Initial handoff after Flutter-only fix pass |
| 2026-03-26 | Expanded: leave status, holiday CDN, TZ, 17-feature matrix |
| 2026-11-10 | **Corrected against live production probe.** Fees/Admit/Holidays/Transport/Teachers/Sections are **404** on live (doc previously said “no code change”). Added Discover matrix + required missing-route section. |
