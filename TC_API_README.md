# Transfer Certificate (TC) API README

This document defines a **production-ready TC API contract** for GurukulAI so frontend and backend teams can implement the same behavior without confusion.

---

## 1) Goal

- Support two TC workflows from UI:
  - **Upload Existing TC** (signed PDF/image file)
  - **Generate TC Data** (structured fields, printable as PDF)
- Keep TC linked to student and school.
- Allow quick search and future audit history.

---

## 2) Base Setup

- **Base URL:** `http://localhost:5000/api`
- **Module Base Path:** `/students/tc`
- **Auth:** `Authorization: Bearer <token>`
- **Allowed Roles:**
  - Create/Update/Delete: `Admin`, `Principal`
  - View/List: `Admin`, `Principal`, `Teacher`
  - For `SuperAdmin`, `schoolId` is required in query/body.

---

## 3) Data Model (Mongo Suggested)

Collection: `transfercertificates`

```json
{
  "_id": "ObjectId",
  "schoolId": "ObjectId",
  "studentId": "ObjectId",
  "admissionNumber": "string",
  "mode": "UPLOAD | GENERATED",
  "tcNumber": "string",
  "issueDate": "date",
  "status": "ACTIVE | CANCELLED",
  "file": {
    "path": "string",
    "originalName": "string",
    "mimeType": "string",
    "size": 12345
  },
  "content": {
    "studentName": "string",
    "rollNumber": "string",
    "dob": "date",
    "fatherName": "string",
    "motherName": "string",
    "classLastAttended": "string",
    "section": "string",
    "academicSession": "string",
    "admissionDate": "date",
    "leavingDate": "date",
    "reasonForLeaving": "string",
    "conduct": "Excellent | Very Good | Good | Satisfactory",
    "feesCleared": "Yes | No",
    "resultStatus": "string",
    "remarks": "string",
    "notes": "string"
  },
  "createdBy": "ObjectId",
  "updatedBy": "ObjectId",
  "createdAt": "date",
  "updatedAt": "date"
}
```

### Required validation

- `tcNumber` unique per school (recommended compound unique index: `schoolId + tcNumber`)
- `issueDate` required
- `mode` required
- For `UPLOAD`: `file.path` required
- For `GENERATED`: `content.studentName`, `content.fatherName`, `content.motherName`, `content.classLastAttended`, `content.section`, `content.leavingDate`, `content.reasonForLeaving` required

---

## 4) API Endpoints

## 4.1 Upload Existing TC

**POST** `/api/students/tc/upload`

Content type: `multipart/form-data`

### Form fields

- `tcFile` (required) -> PDF/JPG/JPEG/PNG
- `tcNumber` (required)
- `issueDate` (required, `YYYY-MM-DD`)
- `admissionNumber` (optional)
- `studentId` (optional but preferred if known)
- `notes` (optional)
- `schoolId` (SuperAdmin only)

### Success Response (201)

```json
{
  "success": true,
  "message": "TC uploaded successfully",
  "data": {
    "_id": "TC_ID",
    "mode": "UPLOAD",
    "tcNumber": "TC-2026-0012",
    "issueDate": "2026-03-24T00:00:00.000Z",
    "admissionNumber": "ADM1001",
    "file": {
      "path": "/uploads/tc/1711260000000_tc.pdf"
    }
  }
}
```

### Error examples

- `400`: missing file or required fields
- `409`: duplicate `tcNumber` in same school
- `415`: invalid file type

---

## 4.2 Create Generated TC Record

**POST** `/api/students/tc`

Content type: `application/json`

### Request Body

```json
{
  "tcNumber": "TC-2026-0013",
  "issueDate": "2026-03-24",
  "studentId": "STUDENT_OBJECT_ID",
  "admissionNumber": "ADM1001",
  "content": {
    "studentName": "Rahul Sharma",
    "rollNumber": "12",
    "dob": "2010-05-12",
    "fatherName": "Rajesh Sharma",
    "motherName": "Sunita Sharma",
    "classLastAttended": "5",
    "section": "A",
    "academicSession": "2025-26",
    "admissionDate": "2021-04-05",
    "leavingDate": "2026-03-24",
    "reasonForLeaving": "Parent transfer",
    "conduct": "Good",
    "feesCleared": "Yes",
    "resultStatus": "Promoted",
    "remarks": "Eligible for next class",
    "notes": "Generated from TC page"
  }
}
```

### Success Response (201)

```json
{
  "success": true,
  "message": "TC created successfully",
  "data": {
    "_id": "TC_ID",
    "mode": "GENERATED",
    "tcNumber": "TC-2026-0013",
    "issueDate": "2026-03-24T00:00:00.000Z",
    "content": {
      "studentName": "Rahul Sharma",
      "classLastAttended": "5",
      "section": "A"
    }
  }
}
```

---

## 4.3 Get TC List

**GET** `/api/students/tc`

### Query Params

- `schoolId` (SuperAdmin required)
- `studentId` (optional)
- `admissionNumber` (optional)
- `tcNumber` (optional)
- `mode` = `UPLOAD|GENERATED` (optional)
- `fromDate` / `toDate` (optional)
- `page` (default `1`)
- `limit` (default `10`)

### Success Response (200)

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "TC_ID",
        "tcNumber": "TC-2026-0013",
        "issueDate": "2026-03-24T00:00:00.000Z",
        "mode": "GENERATED",
        "admissionNumber": "ADM1001",
        "content": {
          "studentName": "Rahul Sharma",
          "classLastAttended": "5",
          "section": "A"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1
    }
  }
}
```

---

## 4.4 Get TC by ID

**GET** `/api/students/tc/:id`

### Success Response (200)

```json
{
  "success": true,
  "data": {
    "_id": "TC_ID",
    "tcNumber": "TC-2026-0013",
    "mode": "GENERATED",
    "file": null,
    "content": {
      "studentName": "Rahul Sharma"
    }
  }
}
```

---

## 4.5 Update TC

**PUT** `/api/students/tc/:id`

- For `GENERATED`: JSON body (partial update of `content` allowed)
- For `UPLOAD`: allow metadata update (and optional new file via multipart endpoint if needed)

---

## 4.6 Cancel/Delete TC

Two patterns (pick one):

- **Soft cancel (recommended):** `PUT /api/students/tc/:id/status` with `{ "status": "CANCELLED" }`
- **Hard delete:** `DELETE /api/students/tc/:id`

---

## 4.7 Download Uploaded TC File

**GET** `/api/students/tc/:id/download`

- Works only for `mode = UPLOAD`
- Returns file stream for browser download/preview.

---

## 5) Frontend -> Backend Mapping (Important)

This mapping is based on `TCPage.jsx`.

## 5.1 Upload Tab Mapping

| Frontend field (`uploadForm`) | API field | Required | Notes |
|---|---|---|---|
| `tcFile` | `tcFile` | Yes | multipart file |
| `tcNumber` | `tcNumber` | Yes | unique per school |
| `issueDate` | `issueDate` | Yes | `YYYY-MM-DD` |
| `admissionNumber` | `admissionNumber` | No | used to link student |
| `notes` | `notes` -> `content.notes` | No | free text |

Current frontend call is already: `POST /students/tc/upload`.

## 5.2 Generate Tab Mapping

| Frontend field (`generateForm`) | API request field (`content.*`) | Required |
|---|---|---|
| `studentName` | `content.studentName` | Yes |
| `admissionNumber` | top-level `admissionNumber` | Preferred |
| `rollNumber` | `content.rollNumber` | No |
| `dob` | `content.dob` | No |
| `fatherName` | `content.fatherName` | Yes |
| `motherName` | `content.motherName` | Yes |
| `classLastAttended` | `content.classLastAttended` | Yes |
| `section` | `content.section` | Yes |
| `academicSession` | `content.academicSession` | No |
| `admissionDate` | `content.admissionDate` | No |
| `leavingDate` | `content.leavingDate` | Yes |
| `reasonForLeaving` | `content.reasonForLeaving` | Yes |
| `conduct` | `content.conduct` | No (default `Good`) |
| `feesCleared` | `content.feesCleared` | No (default `Yes`) |
| `resultStatus` | `content.resultStatus` | No |
| `remarks` | `content.remarks` | No |
| `tcNumber` | top-level `tcNumber` | Yes |
| `issueDate` | top-level `issueDate` | Yes |

---

## 6) Suggested Backend Folder Structure

```text
src/modules/tc/
  tc.model.js
  tc.controller.js
  tc.routes.js
  tc.validation.js
```

Also register route in `src/routes/index.js`:

- `router.use("/students/tc", tcRoutes);`

---

## 7) Validation Rules (Developer Checklist)

- Reject if both `studentId` and `admissionNumber` missing (at least one needed for linkage).
- If `admissionNumber` exists, auto-lookup student and set `studentId`.
- If `studentId` exists, verify student belongs to same `schoolId`.
- Normalize dates to ISO.
- Strip unsafe characters from file names.
- Enforce max file size (example: 10MB).

---

## 8) Minimal Implementation Priority

If developer wants phased delivery, implement in this order:

1. `POST /students/tc/upload`
2. `POST /students/tc` (generated record create)
3. `GET /students/tc` and `GET /students/tc/:id`
4. `GET /students/tc/:id/download`
5. Update/Delete endpoints

---

## 9) Example Frontend Integration Notes

- Upload tab can stay unchanged (already posts to `/students/tc/upload`).
- Generate tab currently only prints PDF; add one more button: **"Save TC Record"** to call `POST /students/tc`.
- On success, show toast and optionally navigate to a future "TC List" page.

---

## 10) Common Response Format

Use one standard response shape across all TC endpoints:

```json
{
  "success": true,
  "message": "Human readable message",
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "message": "Validation or business error"
}
```

---

## 11) Final Notes for Developer

- This spec is designed to match current frontend naming (`tcNumber`, `issueDate`, `admissionNumber`, `reasonForLeaving`, etc.).
- Keep backend field names stable to avoid UI rework.
- If API naming changes, update mapping table first and share with frontend before coding.

