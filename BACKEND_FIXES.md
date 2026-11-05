# Backend handoff — remaining fixes for School Management (Phases / 17 features)

**Audience:** Backend developer  
**Scope:** Fix remaining backend gaps after Flutter app fixes landed.  
**Do not:** deploy to production, copy production data, or send real WhatsApp/email as part of these fixes unless explicitly asked.

---

## Quick status for the original 17 features (backend)

Most mobile APIs for the 17 features already exist and are correct. Flutter now calls the right endpoints for Classes, leave approve/reject, Fees/Admit visibility, etc.

| # | Feature | Backend needed? | Notes |
|---|---------|-----------------|--------|
| 1 | Profile photo | No code change | `POST /api/mobile/profile/photo` exists |
| 2 | Fees & invoices | No code change | Includes `fatherName` |
| 3 | Admit card | No code change | |
| 4 | Holidays | Optional only | CDN image fallback (§2) |
| 5 | Staff calendar events | No code change | `POST /api/mobile/events` |
| 6 | “School Information” label | N/A | Flutter only |
| 7 | Staff attendance time | Decision + possible fix | Server clock / TZ (§3) |
| 8 | Nursery/LKG/UKG | No code change | `GET /api/mobile/classes` already returns all classes; Flutter was wrong before |
| 9 | Student performance | No code change | exams + marks |
| 10 | Attendance success message | N/A | Flutter / correct API already |
| 11 | Marks subjects / practical | No code change | |
| 12–13 | Leave approve 500s | Mostly done | ObjectId + CastError→400; verify live. Status consistency = §1 |
| 14 | Student leave status | No code change | Enum `Unapproved` / `Approved` / `Rejected` |
| 15 | Apply leave label | N/A | Flutter only |
| 16 | Father name on fees | No code change | Already on fee payloads |
| 17 | Hide fees/admit for staff | No code change | APIs already 403 for Teacher/Staff |

**What you must ship:** §1 (required).  
**What you may ship:** §2 (optional).  
**What needs product decision first:** §3 (timezone).  
**What to verify after:** §4 checklist.

---

## 1. REQUIRED — Staff leave apply returns wrong `status` string

### Problem

After a successful staff/teacher leave apply, the **HTTP response** invents a display string that is **not** the database enum. List/detail APIs use the real enum and a separate `statusLabel`.

| Source | `status` value |
|--------|----------------|
| Mongo `StaffLeave.status` enum | `"Approved"` \| `"Unapproved"` \| `"Rejected"` (default `"Unapproved"`) |
| Apply API response today | `"Pending Approval"` ← **wrong / non-canonical** |
| Dashboard/detail APIs | canonical status + `statusLabel: "Pending"` when Unapproved |

### Exact location

**File:** `backend/src/modules/mobile/mobileLeaves.controller.js`  
**Function:** `applyStaffLeaveMobile`  
**Lines:** ~520–530

**Current code (bug):**

```javascript
return res.status(201).json({
  success: true,
  message: "Leave application submitted successfully",
  data: {
    _id: leave._id,
    leaveType: leave.leaveCategory || leaveType,
    durationDays,
    status: "Pending Approval", // ← BUG: not in StaffLeave enum
    leaveFrom: leave.leaveFrom,
    leaveTo: leave.leaveTo,
  },
});
```

**Canonical pattern already used in the same file** (`getTeacherLeavesDashboardMobile` / `getTeacherLeaveByIdMobile`, ~377–419):

```javascript
status: statusKey(l.status), // or leave.status
statusLabel: l.status === "Unapproved" ? "Pending" : l.status,
```

**Model reference:** `backend/src/modules/leaves/staffLeave.model.js` — `status` enum `["Approved", "Unapproved", "Rejected"]`.

**Related routes (do not break):**

| Method | Path | Handler |
|--------|------|---------|
| POST | `/api/mobile/leaves/staff/me/apply` | `applyStaffLeaveMobile` |
| GET | `/api/mobile/leaves/staff/me/dashboard` | `getTeacherLeavesDashboardMobile` |
| GET | `/api/mobile/leaves/staff/me/:id` | `getTeacherLeaveByIdMobile` |
| PUT | `/api/mobile/leaves/staff/:id/status` | `updateStaffLeaveStatusMobile` → `approveRejectLeaveMobile` |

### Required fix

1. Set `status` from the **saved leave document**, not a hardcoded phrase. Prefer:
   - `status: leave.status` (should be `"Unapproved"` after create), **or**
   - the same `statusKey(leave.status)` helper used elsewhere in this file (keep one convention).
2. Add `statusLabel` for display, matching list/detail:
   - `"Unapproved"` → `"Pending"`
   - otherwise use the status string (`Approved` / `Rejected`).
3. Do **not** store `"Pending Approval"` in Mongo. Do **not** add it to the enum.
4. Keep HTTP **201**, success message, and other fields (`_id`, `leaveType`, `durationDays`, dates).

**Suggested response shape:**

```json
{
  "success": true,
  "message": "Leave application submitted successfully",
  "data": {
    "_id": "<ObjectId>",
    "leaveType": "<category from body>",
    "durationDays": 2,
    "status": "Unapproved",
    "statusLabel": "Pending",
    "leaveFrom": "...",
    "leaveTo": "..."
  }
}
```

### Flutter contract (already shipped)

- Apply success screens tolerate list refresh; Flutter maps `Unapproved` → “Pending” in several places.
- Approve/reject now uses mobile:
  - `PUT /api/mobile/leaves/staff/:id/status` body `{ "status": "Approved" | "Rejected" | "Unapproved" }`
  - `PUT /api/mobile/leaves/students/:id/status` same statuses (app no longer rewrites Rejected → Unapproved on the website path).

### How to test (§1)

Use a **non-production** DB (e.g. local `gurukulAI_e2e`). Do not use production.

1. Login as Teacher or Staff → Bearer token.  
2. `POST /api/mobile/leaves/staff/me/apply` with valid `leaveType`, `leaveFrom`, `leaveTo`, `reason`.  
3. Assert `201` and `data.status === "Unapproved"` and `data.statusLabel === "Pending"` (if you add the label).  
4. In Mongo, that leave’s `status` is `"Unapproved"`.  
5. `GET /api/mobile/leaves/staff/me/dashboard` → same `_id` with consistent status.  
6. Approver: `PUT /api/mobile/leaves/staff/:id/status` with `{ "status": "Approved" }` then `{ "status": "Rejected" }` on another leave → 200, no 500.  
7. Invalid id string → **400** (not 500), via existing `isValidObjectId` / CastError middleware.

### Acceptance criteria

- [ ] Apply response never returns `"Pending Approval"`.  
- [ ] Apply `status` is always one of `Approved` | `Unapproved` | `Rejected`.  
- [ ] List/detail/apply agree for the same leave id.  
- [ ] Approve/reject still works; no new 500s on bad ObjectIds.

---

## 2. OPTIONAL — Holiday calendar default image uses external CDN

### Problem

When an event has no `imageUrl`, holidays API fills a jsDelivr Twemoji URL. Titles/dates are still from DB — **not fake holiday data** — but the API depends on a third-party CDN.

### Exact location

**File:** `backend/src/modules/mobile/mobileHolidays.controller.js`  
**Lines:** ~9–10, used ~23

```javascript
const DEFAULT_HOLIDAY_IMAGE =
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3d6.png";
// ...
const image = event.imageUrl || DEFAULT_HOLIDAY_IMAGE;
```

**Consumer:** `GET /api/mobile/holidays` (Flutter Holiday calendar).

### Options (pick one with product)

| Option | Change | Pros | Cons |
|--------|--------|------|------|
| A. Local default | Point to a file under `/uploads/...` or static host path | No CDN | Need asset on server |
| B. Empty image | Use `""` / omit when missing | Flutter shows placeholder | Slightly emptier UI |
| C. Keep CDN | Document dependency | Zero work | Offline/CDN failures |

### Suggested test

1. Event **with** `imageUrl` → response uses that URL.  
2. Event **without** `imageUrl` → behavior matches chosen option (local / empty / CDN).  
3. Flutter calendar still lists title + date.

**Priority:** Low. Not a blocker for the 17 features’ data correctness.

---

## 3. DECISION REQUIRED — Staff / teacher attendance timezone

### Context

Staff/teacher self-mark and some display times use the **Node process local timezone** (`Date`, `getHours()`, helpers like `hhmmNow()`), not an explicit school TZ or client offset.

**File:** `backend/src/modules/mobile/mobileAttendance.controller.js`  
**Relevant areas:**

- `hhmmNow()` / `toDateOnly` / month bounds (~37–58)  
- Teacher self-mark `teacherMarkSelfAttendance` (~476–546): default `entryTime` from `hhmmNow()` when Present/Late  
- Staff month returns `entryTime` / `exitTime`  
- Student month (`getMobileStudentAttendanceMonth`) selects **`date` + `status` only** — no entry/exit by design  

**Flutter note (do not “fix” blindly):**  
Student attendance UI intentionally shows `"--"` for arrival/leave because the student month API has no times. Changing that requires a **product + API** decision, not only Flutter.

### Product must choose one policy

1. **Keep server-local time** (document that the API host TZ must be the school TZ, e.g. IST on the VPS).  
2. **Store/return UTC** and let clients convert.  
3. **Explicit school timezone** (e.g. `Asia/Kolkata` in config/env) for all attendance date/time computations.

Do **not** invent a timezone without confirming with the school/ops.

### If implementing option 3 (example approach — confirm before coding)

1. Add env e.g. `SCHOOL_TIMEZONE=Asia/Kolkata` (name TBD).  
2. Centralize “now” and “date-only” helpers to that zone.  
3. Apply consistently to self-mark, staff month, and any `updatedAt`-derived display times.  
4. Document in API notes for mobile.

### Tests after a decision

1. Mark self Present at a known wall-clock time in the school → `checkIn` / `entryTime` matches policy.  
2. Fetch staff month → same times.  
3. Student month → still status-only; no fabricated times.  
4. Host TZ ≠ school TZ (if applicable) → still correct under chosen policy.

**Priority:** Medium for correctness complaints (“time wrong”); blocked on product decision.

---

## 4. Runtime verification checklist (backend + mobile)

Run against **local/staging** with seeded data. Not a substitute for §1 code fix.

| # | Area | Endpoint(s) | Pass criteria |
|---|------|-------------|---------------|
| 1 | Profile photo | `POST /api/mobile/profile/photo`, `GET /api/mobile/profile` | Relative `/uploads/...` URL; Student only; others 403 |
| 2 | Fees + father name | `GET /api/mobile/fees/history`, `/invoices` | Rows include `fatherName`; Teacher/Staff 403 |
| 3 | Admit card | `GET /api/mobile/admit-card`, `/admit-card/children` | Student/Parent OK; scoped `studentId` |
| 4 | Holidays / events | `GET /api/mobile/holidays`, `POST /api/mobile/events` | Create as Teacher/Staff; appears in holidays |
| 5 | Attendance times | `POST/GET .../attendance/teacher/self`, `GET .../attendance/staff` | Times match TZ policy (§3) |
| 6 | Leave apply/approve | Staff/student apply + `PUT .../leaves/{staff\|students}/:id/status` | No 500 on valid/invalid ids; Rejected stays Rejected |
| 7 | Marks | `GET/PUT /api/mobile/exams/:id/marks` (+ academic if used) | Subjects + practical when `hasPractical` |
| 8 | Teacher dashboard | `GET /api/mobile/dashboard/teacher` | 200 for Teacher |
| 9 | Classes list | `GET /api/mobile/classes` | Includes Nursery/LKG/UKG when present in `classes` collection |

**Auth:** All `/api/mobile/*` above need `Authorization: Bearer <token>` except where noted.  
**Errors:** Prefer 400 for bad ids (CastError middleware in `backend/src/middleware/error.middleware.js`).

---

## 5. Out of scope / do not change unless asked

- Flutter app (already updated for Classes, leave reject path, Teacher Fees/Admit hide, Teacher role Future bug).  
- Production Mongo / production secrets.  
- Enabling WhySMS / Resend for these fixes.  
- Deleting unused website leave routes — Flutter mobile approve no longer depends on rewriting Rejected→Unapproved; website admin may still use `/api/leaves/...`.  
- Inventing App Store IDs or seed passwords in this doc.

---

## 6. Suggested PR plan for backend

| PR | Contents | Priority |
|----|----------|----------|
| **PR-A** | §1 leave apply `status` + `statusLabel` alignment + tests | **Ship first** |
| **PR-B** | §2 holiday image fallback (if product picks A or B) | Optional |
| **PR-C** | §3 timezone helpers (only after written product decision) | After decision |
| — | §4 verification on staging/local | After PR-A (and C if done) |

---

## 7. Contact / context from mobile audit

- Flutter apply leave and approve screens expect canonical statuses.  
- Staff leave dashboard already exposes `status` + `statusLabel`; apply response should match that contract.  
- Questions on TZ or holiday image: ask product/ops before coding §2/§3.

---

## Changelog of this document

| Date | Note |
|------|------|
| 2026-03-26 | Initial handoff after Flutter-only fix pass |
| 2026-03-26 | Expanded for backend-dev handoff: exact snippets, routes, tests, 17-feature matrix, PR plan |
