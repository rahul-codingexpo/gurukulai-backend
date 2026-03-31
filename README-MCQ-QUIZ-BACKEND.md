# MCQ Quiz Backend Implementation Guide

> **For Backend Developer** — This document covers everything needed to build the backend for the SuperAdmin MCQ Quiz Upload feature. The frontend is already complete; you just need to wire up the APIs.

---

## Overview

The SuperAdmin can upload MCQ questions in two ways:
1. **CSV / JSON / XLSX bulk upload** — upload many questions at once via a file
2. **Single question entry** — manually fill and save one question at a time

Frontend page is already built at:
```
src/pages/SchoolAcademic/MCQQuizzes/MCQQuizzesPage.jsx
```

---

## 1) Backend Module Structure

Create the following files in the backend:

```
src/modules/quiz/
├── quizQuestion.model.js
├── quizQuestion.controller.js
└── quizQuestion.routes.js
```

---

## 2) MongoDB Schema

Create **one document per question**.

```js
// quizQuestion.model.js

const quizQuestionSchema = new Schema({
  schoolId: {
    type: ObjectId,
    ref: "School",
    required: true,
  },
  class: {
    type: String,
    required: true,
    // e.g. "Class 1", "Class 2", ..., "Class 12"
  },
  subject: {
    type: String,
    required: true,
    // e.g. "Mathematics", "Science", "English", "Hindi", "Social Science", "Computer"
  },
  quizTitle: {
    type: String,
    required: true,
    // e.g. "Class 8 Algebra Practice - Set 1"
  },
  questionText: {
    type: String,
    required: true,
  },
  options: {
    A: { type: String, required: true },
    B: { type: String, required: true },
    C: { type: String, required: true },
    D: { type: String, required: true },
  },
  correctOption: {
    type: String,
    required: true,
    enum: ["A", "B", "C", "D"],
  },
  explanation: {
    type: String,
    default: "",
  },
  marks: {
    type: Number,
    default: 1,
    min: 1,
  },
  difficulty: {
    type: String,
    enum: ["easy", "medium", "hard"],
    default: "medium",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: ObjectId,
    ref: "User",
    required: true, // SuperAdmin user id
  },
}, { timestamps: true });
```

**Recommended Indexes:**
```js
quizQuestionSchema.index({ schoolId: 1, class: 1, subject: 1, quizTitle: 1 });
quizQuestionSchema.index({ schoolId: 1, isActive: 1 });
```

---

## 3) API Endpoints

Base path: `/api/quiz-questions`

All **write** endpoints (POST, PATCH, DELETE) must be protected — **SuperAdmin only**.
Read endpoints can optionally allow Admin/Teacher access scoped to their school.

---

### A) Upload Single Question

**`POST /api/quiz-questions`**

Headers:
```
Authorization: Bearer <token>
Content-Type: application/json
```

Request Body:
```json
{
  "schoolId": "64abc...",
  "class": "Class 8",
  "subject": "Mathematics",
  "quizTitle": "Class 8 Algebra Practice - Set 1",
  "questionText": "What is 2x + 3x?",
  "optionA": "3x",
  "optionB": "5x",
  "optionC": "6x",
  "optionD": "2x²",
  "correctOption": "B",
  "explanation": "Like terms add up: 2x + 3x = 5x.",
  "marks": 1
}
```

> **Note:** Frontend sends options as flat fields `optionA`, `optionB`, `optionC`, `optionD`. The backend should map them to the `options: { A, B, C, D }` schema structure internally.

Success Response `201`:
```json
{
  "success": true,
  "message": "Question created successfully",
  "data": {
    "id": "64xyz..."
  }
}
```

---

### B) Bulk Upload (CSV / JSON / XLSX)

**`POST /api/quiz-questions/bulk-upload`**

Headers:
```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

Form Fields:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | ✅ Yes | `.csv`, `.json`, or `.xlsx` file |
| `class` | String | ✅ Yes | e.g. `"Class 8"` |
| `subject` | String | ✅ Yes | e.g. `"Mathematics"` |
| `quizTitle` | String | ✅ Yes | e.g. `"Class 8 Algebra - Set 1"` |
| `schoolId` | String | Optional | If not provided, derive from authenticated user |

Success Response `200`:
```json
{
  "success": true,
  "message": "Bulk upload processed",
  "data": {
    "createdCount": 42,
    "errorCount": 3,
    "errors": [
      { "row": 5, "message": "correctOption must be one of A/B/C/D" },
      { "row": 9, "message": "questionText is required" },
      { "row": 14, "message": "marks must be a number >= 1" }
    ]
  }
}
```

---

### C) List Questions

**`GET /api/quiz-questions`**

Query Params:
| Param | Type | Description |
|-------|------|-------------|
| `schoolId` | String | Required |
| `class` | String | Filter by class |
| `subject` | String | Filter by subject |
| `quizTitle` | String | Filter by quiz title |
| `page` | Number | Default: 1 |
| `limit` | Number | Default: 20 |

Success Response `200`:
```json
{
  "success": true,
  "data": {
    "questions": [ /* array of question objects */ ],
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

---

### D) Update Question

**`PATCH /api/quiz-questions/:id`**

Headers:
```
Authorization: Bearer <token>
Content-Type: application/json
```

Body: any subset of the question fields (partial update supported).

Success Response `200`:
```json
{
  "success": true,
  "message": "Question updated successfully",
  "data": { /* updated question */ }
}
```

---

### E) Delete Question (Soft Delete)

**`DELETE /api/quiz-questions/:id`**

Sets `isActive: false` — do **not** hard delete from DB.

Success Response `200`:
```json
{
  "success": true,
  "message": "Question deleted successfully"
}
```

---

## 4) CSV File Format

The frontend provides a downloadable template. Expected headers:

```csv
questionText,optionA,optionB,optionC,optionD,correctOption,explanation,marks
"What is 2+2?","3","4","5","6","B","Basic addition","1"
"Capital of India?","Mumbai","Delhi","Kolkata","Chennai","B","Delhi is the capital city","1"
"Which planet is the Red Planet?","Earth","Venus","Mars","Jupiter","C","Mars appears red","2"
```

**Validation Rules per row:**
| Field | Rule |
|-------|------|
| `questionText` | Required, non-empty string |
| `optionA`, `optionB`, `optionC`, `optionD` | All required, non-empty string |
| `correctOption` | Required, must be exactly `A`, `B`, `C`, or `D` |
| `marks` | Must be a number ≥ 1. Default to `1` if missing |
| `explanation` | Optional |

**Error Handling during bulk upload:**
- Do **not** abort the entire upload on a single bad row
- Collect per-row errors with row number + reason
- Insert all valid rows using `insertMany`
- Return summary with `createdCount`, `errorCount`, `errors[]`

---

## 5) JSON File Format

If the uploaded file is `.json`, expect an array of question objects:

```json
[
  {
    "questionText": "What is 2+2?",
    "optionA": "3",
    "optionB": "4",
    "optionC": "5",
    "optionD": "6",
    "correctOption": "B",
    "explanation": "Basic addition",
    "marks": 1
  }
]
```

Apply the same validation rules as CSV rows.

---

## 6) Auth & Authorization

| Endpoint | Allowed Roles |
|----------|--------------|
| `POST /api/quiz-questions` | SuperAdmin only |
| `POST /api/quiz-questions/bulk-upload` | SuperAdmin only |
| `PATCH /api/quiz-questions/:id` | SuperAdmin only |
| `DELETE /api/quiz-questions/:id` | SuperAdmin only |
| `GET /api/quiz-questions` | SuperAdmin, Admin, Teacher (school-scoped) |

Middleware chain for write routes:
```js
router.post("/", authMiddleware, requireRole("SuperAdmin"), createQuestion);
router.post("/bulk-upload", authMiddleware, requireRole("SuperAdmin"), upload.single("file"), bulkUpload);
router.patch("/:id", authMiddleware, requireRole("SuperAdmin"), updateQuestion);
router.delete("/:id", authMiddleware, requireRole("SuperAdmin"), deleteQuestion);
router.get("/", authMiddleware, listQuestions);
```

---

## 7) Controller Flow — Bulk Upload

```
1. Validate required fields: class, subject, quizTitle
2. Determine file type from mimetype or extension (.csv / .json / .xlsx)
3. Parse file:
   - CSV  → use "csv-parse" or "papaparse"
   - XLSX → use "xlsx" (SheetJS)
   - JSON → JSON.parse()
4. For each row:
   a. Trim whitespace from all string fields
   b. Validate required fields
   c. Validate correctOption is in ["A","B","C","D"]
   d. Normalize marks to Number (default 1)
   e. If valid → push to validRows[]
   f. If invalid → push to errors[] with { row, message }
5. Insert validRows using insertMany()
6. Return: { createdCount, errorCount, errors[] }
```

---

## 8) Frontend Field → Backend Field Mapping

| Frontend State Field | Backend API Field | Notes |
|----------------------|-------------------|-------|
| `subject` | `subject` | Dropdown: Mathematics, Science, English, Hindi, Social Science, Computer |
| `quizClass` | `class` | Dropdown: Class 1 – Class 12 |
| `quizTitle` | `quizTitle` | Free text input |
| `singleQuestion.questionText` | `questionText` | |
| `singleQuestion.optionA` | `optionA` | Backend maps to `options.A` |
| `singleQuestion.optionB` | `optionB` | Backend maps to `options.B` |
| `singleQuestion.optionC` | `optionC` | Backend maps to `options.C` |
| `singleQuestion.optionD` | `optionD` | Backend maps to `options.D` |
| `singleQuestion.correctOption` | `correctOption` | One of: A, B, C, D |
| `singleQuestion.explanation` | `explanation` | Optional |
| `singleQuestion.marks` | `marks` | Number ≥ 1 |
| `quizFile` | `file` (FormData) | `.csv`, `.json`, or `.xlsx` |

---

## 9) Error Response Format

All errors should follow this format:

```json
{
  "success": false,
  "message": "Descriptive error message",
  "errors": [ /* optional field-level errors */ ]
}
```

Common HTTP status codes:
| Code | Meaning |
|------|---------|
| `201` | Created |
| `200` | OK |
| `400` | Bad Request (validation error) |
| `401` | Unauthorized (not logged in) |
| `403` | Forbidden (not SuperAdmin) |
| `404` | Not Found |
| `500` | Internal Server Error |

---

## 10) Suggested npm Packages

| Package | Purpose |
|---------|---------|
| `multer` | Handle `multipart/form-data` file uploads |
| `csv-parse` or `papaparse` | Parse CSV files |
| `xlsx` (SheetJS) | Parse XLSX files |
| `mongoose` | MongoDB ODM |

---

## 11) Implementation Checklist

- [ ] Create `quizQuestion.model.js` with schema above
- [ ] Create `quizQuestion.routes.js` with all 5 endpoints
- [ ] Create `quizQuestion.controller.js` with all handlers
- [ ] Add `requireRole("SuperAdmin")` middleware to write routes
- [ ] Implement CSV parser with row-level validation
- [ ] Implement JSON file parser
- [ ] Implement XLSX parser (optional but supported by frontend)
- [ ] Add `class` and `subject` to all query/filter logic
- [ ] Return row-wise error array in bulk upload response
- [ ] Share final base URL so frontend can configure `REACT_APP_API_BASE_URL`
