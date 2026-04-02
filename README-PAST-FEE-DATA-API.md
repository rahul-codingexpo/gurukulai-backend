# Past Fee Data API (Separate “Old Dues” Archive)

## Purpose
Backend developer guide for the separate module **Past Fee Data** (old fees/bulk imported historical dues).

This is meant to let schools **upload and store past fee related data in bulk** and then **view it in UI** for reporting and tracking.

## Frontend Origin
- Frontend page scaffold: `src/pages/Accounting/PastFeeData/PastFeeDataPage.jsx`
- Current UI contains:
  - Bulk import section (CSV/Excel)
  - Filters placeholders (Session/Year, Class, Student search)
  - “Import history” table (currently dummy data)

## Roles / Scope (No SuperAdmin)
- **Allowed roles for import/upload:** `Admin`, `Principal`
- **Allowed roles for viewing lists:** `Admin`, `Principal`
- Any other role: `403 Forbidden`

## Authentication
- All endpoints require Bearer token auth.
- Frontend sends `Authorization: Bearer <token>` (token stored in `localStorage.getItem("token")`).

### School scoping (recommended)
Backend should derive `schoolId` from the authenticated user (preferred).
- Example source: `req.user.schoolId`

### Response format convention
Match the existing project style:
- JSON with `success: true/false`
- On success, return `data: ...`
- On failure, return `message` (and optional `errors`)

---

## Data to Import (CSV/Excel Columns)
Use a template with these columns (order flexible, header names matter):
1. `AdmissionNo` (string, required for matching student)
2. `StudentName` (string, optional if AdmissionNo exists)
3. `Class` (string/int, required or used for display)
4. `Section` (string, optional)
5. `Session` (string like `2022-23`, required)
6. `DueAmount` (number, required; >= 0)
7. `PaidAmount` (number, optional; default 0)
8. `DueDate` (date string, optional but recommended)
9. `Remarks` (string, optional)

## Validation Rules (recommended)
- `AdmissionNo`: required and must match an existing student for the same `schoolId`
- `DueAmount`: required, number >= 0
- `PaidAmount`: optional, number >= 0 (should not exceed `DueAmount`; either cap or reject—choose one)
- `Session`: required
- `DueDate`: if provided, must be parseable as a date

---

## Endpoint 1: Bulk Import Past Fee Data
### `POST /api/accounting/past-fees/import`
Uploads a CSV/Excel file, parses rows, validates, and stores past fee records.

#### Auth / Roles
- Only `Admin`, `Principal`

#### Request
- `Content-Type: multipart/form-data`

Recommended form fields:
- `file`: the CSV/Excel file (required)
- `sessionYear` (optional): if you want to override/force a session for all rows
- `importName` (optional): display name for import batch (e.g. `Legacy import #3`)

If you keep `Session` inside the file, then `sessionYear` can be omitted.

#### Response (201 Created)
Return an import batch summary and counts.
```json
{
  "success": true,
  "message": "Past fee data imported",
  "data": {
    "batchId": "66f2a....",
    "batchName": "Legacy import #3",
    "session": "2022-23",
    "totals": {
      "recordsRead": 200,
      "recordsImported": 180,
      "recordsSkipped": 20
    }
  }
}
```

#### Error Responses
- `400 Bad Request`: invalid file format, missing file, or header mismatch
- `401 Unauthorized`: missing/invalid token
- `403 Forbidden`: user not allowed to import

---

## Endpoint 2: List Import History (Batches)
### `GET /api/accounting/past-fees/imports`
Used to show the UI table “Import history”.

#### Query Params (optional)
- `session` (string)
- `fromDate` / `toDate` (optional)
- `page`, `limit`

#### Response
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "batchId": "66f2a....",
        "batchName": "Legacy import #3",
        "session": "2022-23",
        "importedOn": "2026-03-31T10:20:30.123Z",
        "records": 180,
        "createdBy": { "name": "Admin" }
      }
    ],
    "total": 12,
    "page": 1,
    "limit": 25
  }
}
```

---

## Endpoint 3: List Past Fee Records (with Filters)
### `GET /api/accounting/past-fees`
Shows past fee dues in a list view (or can be used by the UI table in a later step).

#### Query Params
- `session` (string) — optional
- `className` or `classId` (optional)
- `section` (optional)
- `search` (optional) — match student name/admission no
- `status` (optional) — `Unpaid`, `Partially Paid`, `Paid`
- `page`, `limit`

#### Response
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "....",
        "studentId": "....",
        "studentName": "Rahul Sharma",
        "admissionNumber": "A001",
        "className": "8",
        "section": "A",
        "session": "2022-23",
        "dueAmount": 15000,
        "paidAmount": 0,
        "balance": 15000,
        "dueDate": "2023-03-31",
        "remarks": "Old transport dues",
        "createdAt": "2026-03-31T10:20:30.123Z"
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 25
  }
}
```

---

## (Optional) Endpoint 4: Past Fee Summary by Student
If you plan to show old dues inside Student Profile.

### `GET /api/accounting/past-fees/students/:studentId/summary`

Response example:
```json
{
  "success": true,
  "data": {
    "studentId": "...",
    "totalBilled": 42000,
    "totalPaid": 20000,
    "balance": 22000,
    "bySession": [
      { "session": "2022-23", "balance": 12000 },
      { "session": "2021-22", "balance": 10000 }
    ]
  }
}
```

---

## Suggested Database Models (Minimal)
1. `PastFeeImportBatch`
   - `schoolId`
   - `batchName`
   - `session`
   - `fileMeta` (optional: filename, original size)
   - `createdBy`
   - `importedOn`
   - `recordsRead`, `recordsImported`, `recordsSkipped`

2. `PastFeeRecord`
   - `schoolId`
   - `studentId`
   - `className`, `section`
   - `session`
   - `dueAmount`, `paidAmount`, `balance`
   - `dueDate` (optional)
   - `remarks` (optional)
   - `importBatchId` (link to batch)
   - `createdAt`, `updatedAt`

---

## Questions for Backend Developer (confirm)
1. Should we **reject rows** when `AdmissionNo` not found, or **skip** them with a count?
2. Should `PaidAmount` be allowed to be > `DueAmount` (then compute negative balance) or validate and reject?
3. For `session` derive: should it come from **file column `Session`** only, or can backend accept an override?

