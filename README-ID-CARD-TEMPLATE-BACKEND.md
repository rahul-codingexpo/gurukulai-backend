# ID Card Template Backend API (Node.js + MongoDB)

## Purpose
Backend handoff document to implement production-ready ID card template storage for:
- Student ID card template
- Staff ID card template

The frontend editor already exists and currently saves in browser storage.  
This backend should provide persistent, school-scoped storage using MongoDB + Spaces/S3.

## Scope (MVP Production)
- Save/load template JSON per school and type (`student` or `staff`)
- Upload/remove background image in Spaces
- Restrict edit access to `Admin` and `Principal` only (same school)
- Keep response format consistent with existing project style (`success`, `data`, `message`)

## Non-Goals (for this phase)
- Version history
- Draft/publish workflow
- Audit log UI
- Multi-template variants per school/type

---

## Auth and Authorization

### Authentication
All endpoints require Bearer token auth.

### Allowed roles
- `Admin`
- `Principal`

### School scoping
- Derive `schoolId` from authenticated user (`req.user.schoolId`)
- Do not trust schoolId in body/query for these endpoints in this phase
- Admin/Principal can only access their own school template

---

## Data Model

Create a model: `src/modules/school/idCardTemplate.model.js`

```js
{
  schoolId: ObjectId,         // required, ref School, indexed
  type: "student"|"staff",    // required, indexed
  version: Number,            // default 1
  cardSizeMm: {
    width: Number,            // required, >0
    height: Number            // required, >0
  },
  frontUrl: String|null,      // Spaces URL
  backUrl: String|null,       // optional for future
  fields: [
    {
      id: String,             // required
      key: String,            // required
      kind: "text"|"image"|"qr",
      xMm: Number,
      yMm: Number,
      wMm: Number,
      hMm: Number,
      fontSizeMm: Number,
      fontWeight: Number,
      color: String,          // #RRGGBB for text, default #000000
      borderRadiusMm: Number
    }
  ]
}
```

### Required indexes
- Unique compound: `{ schoolId: 1, type: 1 }`

---

## API Endpoints

Suggested base route: `/api/school/id-card-template`

### 1) Get template
`GET /api/school/id-card-template?type=student|staff`

#### Access
`Admin`, `Principal`

#### Behavior
- If template exists: return saved template
- If not found: return normalized default template for requested type

#### Success response
```json
{
  "success": true,
  "data": {
    "type": "student",
    "version": 1,
    "cardSizeMm": { "width": 86, "height": 54 },
    "frontUrl": null,
    "backUrl": null,
    "fields": []
  }
}
```

---

### 2) Save template JSON
`PUT /api/school/id-card-template`

#### Access
`Admin`, `Principal`

#### Request body
```json
{
  "type": "student",
  "version": 1,
  "cardSizeMm": { "width": 86, "height": 54 },
  "frontUrl": "https://.../id-card-bg.png",
  "backUrl": null,
  "fields": [
    {
      "id": "fld_abcd1",
      "key": "schoolName",
      "kind": "text",
      "xMm": 3,
      "yMm": 3,
      "wMm": 18,
      "hMm": 6,
      "fontSizeMm": 3.2,
      "fontWeight": 700,
      "color": "#000000",
      "borderRadiusMm": 0
    }
  ]
}
```

#### Validation rules
- `type`: required, `student|staff`
- `cardSizeMm.width/height`: required, number > 0
- `fields`: array (max 100 recommended)
- each field:
  - `kind` must be `text|image|qr`
  - numeric properties must be finite numbers
  - `color` for text should be normalized to `#RRGGBB`, default `#000000`
- reject payloads that are too large (recommended max raw JSON: 1 MB)

#### Success response
```json
{
  "success": true,
  "message": "ID card template saved",
  "data": { "...": "normalized template document" }
}
```

---

### 3) Upload/replace background image
`POST /api/school/id-card-template/background`

#### Access
`Admin`, `Principal`

#### Content type
`multipart/form-data`

#### Fields
- `type`: `student|staff` (required)
- `backgroundFile`: image file (required)

#### Behavior
- Upload file to Spaces
- Upsert template for `(schoolId, type)` and set `frontUrl`
- If old `frontUrl` exists, delete old file from Spaces

#### Success response
```json
{
  "success": true,
  "message": "Background uploaded",
  "data": {
    "type": "student",
    "frontUrl": "https://cdn.../school-xyz/student-front-123.png"
  }
}
```

---

### 4) Remove background image
`DELETE /api/school/id-card-template/background?type=student|staff`

#### Access
`Admin`, `Principal`

#### Behavior
- If `frontUrl` exists: delete from Spaces
- Set `frontUrl` to `null`
- Keep the rest of template unchanged

#### Success response
```json
{
  "success": true,
  "message": "Background removed",
  "data": {
    "type": "student",
    "frontUrl": null
  }
}
```

---

## Suggested Backend File Structure

- `src/modules/school/idCardTemplate.model.js`
- `src/modules/school/idCardTemplate.controller.js`
- `src/modules/school/idCardTemplate.routes.js`
- `src/modules/school/idCardTemplate.validation.js` (optional but recommended)

Also update central route registration:
- `src/app.js` (or current route aggregator)

Reuse existing file upload and Spaces utilities where possible:
- existing upload middleware
- existing Spaces delete utility

---

## Error Handling Contract

Use existing API style:

```json
{
  "success": false,
  "message": "Human readable error",
  "errors": []
}
```

### Recommended status codes
- `400` invalid type/payload/file
- `401` unauthenticated
- `403` role not allowed
- `404` if explicitly requesting delete on missing template (optional; `200` no-op is also fine)
- `500` unexpected error

---

## Frontend Integration Notes (for alignment)

Frontend expects:
- One template per school + type
- Template fields include `color` for text rows
- Print renderer uses same template payload as preview

Recommended migration behavior:
1. On first load, frontend calls GET endpoint.
2. If backend has no saved template, frontend may push existing local template once via PUT.
3. After migration, frontend should use backend as source of truth.

---

## Security and Limits

- Validate mime type and extension for uploaded backgrounds (`png`, `jpg`, `jpeg`, `webp`)
- Enforce file size limit (recommended 2 MB)
- Sanitize all numeric and string values
- Do not allow arbitrary URL injection for `frontUrl` unless validated domain strategy is acceptable

---

## Implementation Checklist

- [ ] Create mongoose model and unique index
- [ ] Add routes with `protect` + `authorize("Admin", "Principal")`
- [ ] Implement GET/PUT template handlers
- [ ] Implement POST/DELETE background handlers with Spaces cleanup
- [ ] Add request validation and normalization
- [ ] Register routes in app router
- [ ] Add basic API docs / Postman collection
- [ ] Test with two schools to verify isolation

---

## Quick Test Cases

1. Admin (School A) saves student template -> can fetch same data later.
2. Principal (School A) can edit same template.
3. School B user cannot see School A template.
4. Upload background replaces old image and old object is deleted.
5. Invalid `type` returns `400`.
6. Unauthorized role returns `403`.

---

## Future Enhancements (Phase 2)

- Template versioning (`draft`, `published`)
- Change history with `updatedBy`, diff snapshot
- Default global templates set by SuperAdmin
- Server-side print preset profiles (PVC layout presets)

