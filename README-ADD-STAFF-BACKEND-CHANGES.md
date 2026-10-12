# Backend README: Support “Add Staff” FormData + Documents

## Why this is needed
Your frontend **Add Staff** page (`src/pages/Roles/AddStaff/AddStaffPage.jsx`) submits the staff form using **`multipart/form-data`** (because it supports file uploads).

Your current backend staff create controller (`src/modules/staff/staff.controller.js`) reads only `req.body` and your staff model (`src/modules/staff/staff.model.js`) does **not** include fields for staff documents.

So backend must be updated to:
1. Parse multipart uploads (multer or equivalent)
2. Store uploaded files (or at least store their URLs/paths in DB)
3. Extend the Staff schema to save those document URLs/paths
4. Allow create/update endpoints to accept the same multipart field names

---

## Frontend payload (what backend must accept)

### Endpoint
- `POST /staff`

### Content-Type
- `multipart/form-data`

### Non-file fields sent (from FormData)
- `name` *(required, string, trimmed)*
- `designation` *(required, string: Principal/Teacher/Staff)*
- `email` *(optional, string)*
- `phone` *(optional, string)*
- `salary` *(required, number)*
- `joiningDate` *(required, string in `YYYY-MM-DD` format from `<input type="date">`)*
- `status` *(required, string: `ACTIVE` or `INACTIVE`)*
- `username` *(optional)*
- `password` *(optional)*

### File fields sent (REQUIRED)
- `photo` *(image file)*
- `aadharDocument` *(file)*
- `panDocument` *(file)*
- `experienceDocument` *(file)*

Notes:
- If a field is empty on the frontend, it may not be appended to FormData.
- Backend must validate that all required document fields are present.

---

## Roles / Authorization (match current behavior)
Your backend already restricts staff create/update/delete by role in `staff.routes.js`:
- `POST /staff`: allowed roles **Admin, Principal**
- `PUT /staff/:id`: allowed roles **Admin, Principal**
- `DELETE /staff/:id`: allowed roles **Admin, Principal**

Frontend behavior:
- Only Admin/Principal can actually submit the form (SuperAdmin can view but submit is blocked in UI).

Backend should still enforce role checks (do not rely on UI).

---

## Required backend changes

### 1) Add multipart middleware (multer)
Update `staff.routes.js` to use multer middleware for `POST /staff` (and `PUT /staff/:id` if you want to support updating documents too).

Multer must accept these field names exactly:
- `photo` (max 1)
- `aadharDocument` (max 1)
- `panDocument` (max 1)
- `experienceDocument` (max 1)

Recommended multer config behavior:
- Validate file size limits (e.g. 2MB-10MB depending on your preference)
- Validate mimetypes (photo: image/*; documents: pdf/doc/image as you allow)

### 2) Extend Staff model to store file references
Update `src/modules/staff/staff.model.js` to add optional fields, for example:
- `photoUrl` (or `photoPath`)
- `aadharDocumentUrl` (or `aadharDocumentPath`)
- `panDocumentUrl` (or `panDocumentPath`)
- `experienceDocumentUrl` (or `experienceDocumentPath`)

Storage option:
- Store as a string path/URL to where you upload them (local disk, S3, Cloudinary, etc.)

### 3) Update staff controller logic
Update `createStaff`:
1. Use existing logic to create optional `User` if `username` + `password` exist
2. Create `Staff` record as usual
3. If files exist in `req.files`, store their paths/URLs into the newly added Staff document fields

Update `updateStaff`:
- Currently it does `Staff.findByIdAndUpdate(req.params.id, req.body)`
- If you want to support updating documents via frontend later, ensure `updateStaff` also handles multipart files and updates the document fields.

### 4) Ensure `getStaff` returns these fields
`getStaff` already populates `userId` and returns staff documents automatically if they exist in the Staff schema.
So just extending the schema + saving values in create/update is typically enough.

---

## Data validation rules (recommended)
- `name`: required non-empty
- `designation`: must be one of `Principal`, `Teacher`, `Staff`
- `salary`: numeric >= 0
- `joiningDate`: valid date; store as Date
- `status`: one of `ACTIVE`, `INACTIVE`

Documents (REQUIRED):
- Validate each uploaded document:
  - `photo`: must be an image (image/*)
  - `aadharDocument`, `panDocument`, `experienceDocument`: validate allowed mimetypes and size limits

Auth:
- if only `username` exists but `password` missing, backend can either:
  - reject (`400 Bad Request`), or
  - ignore username/password creation and create staff without login credentials
Choose one behavior and implement consistently.

---

## Expected success response (align with frontend)
Your current controller returns:
- `201` with `{ success: true, data: staff }`

Backend should continue returning:
- `{ success: true, data: <createdStaffRecord> }`
and include the document URL/path fields once schema is updated.

---

## Files / code locations to modify (backend)
1. `src/modules/staff/staff.routes.js`
   - add multer middleware to `router.post("/")` and (optionally) `router.put("/:id")`

2. `src/modules/staff/staff.model.js`
   - add document URL/path fields

3. `src/modules/staff/staff.controller.js`
   - handle files in `createStaff` and (optionally) `updateStaff`

4. Add multer upload handler/storage module if you prefer cleaner code (recommended)

---

## Questions for backend developer (confirm)
1. Where do you want to store uploaded files: **local disk** or **cloud**?
2. What max size + allowed mimetypes should we support for each field?
3. If `username` exists but `password` missing, should we reject or skip login creation?
4. Confirm again: are **all 4 documents always required** for every staff type?

