# GurukulAI Backend - Gallery API Documentation

Base URL: `http://localhost:5000/api`  
Auth header (protected APIs): `Authorization: Bearer <token>`

## Overview

Gallery module allows Admin/Principal to upload image/video media for a school.
The same media can be shown on web and mobile app.

- Upload/manage (create/update/delete): Admin, Principal
- View gallery on web: authenticated users (school scoped)
- View gallery on mobile: Student, Parent, Teacher, Staff

Media files are stored in: `uploads/gallery/`  
Saved field format: `mediaUrl = uploads/gallery/<filename>`

---

## Data Shape (Gallery Item)

```json
{
  "_id": "GALLERY_ID",
  "schoolId": "SCHOOL_ID",
  "title": "Sports Day",
  "description": "Opening ceremony",
  "mediaType": "IMAGE",
  "mediaUrl": "uploads/gallery/1773951200000-sports.jpg",
  "mimeType": "image/jpeg",
  "size": 145920,
  "uploadedBy": "USER_ID",
  "createdAt": "2026-03-27T10:00:00.000Z",
  "updatedAt": "2026-03-27T10:00:00.000Z"
}
```

---

## 1) Upload Gallery Media (Web)

### Endpoint
`POST /api/gallery/upload`

### Auth
Admin / Principal

### Content-Type
`multipart/form-data`

### Form fields
- `title` (optional string)
- `description` (optional string)
- `mediaFiles` (required, multiple files)

### Example success response (201)
```json
{
  "success": true,
  "message": "Media uploaded successfully",
  "data": [
    {
      "_id": "GALLERY_ID",
      "schoolId": "SCHOOL_ID",
      "title": "Sports Day",
      "description": "Opening ceremony",
      "mediaType": "IMAGE",
      "mediaUrl": "uploads/gallery/1773951200000-sports.jpg",
      "mimeType": "image/jpeg",
      "size": 145920,
      "uploadedBy": "USER_ID",
      "createdAt": "2026-03-27T10:00:00.000Z",
      "updatedAt": "2026-03-27T10:00:00.000Z"
    }
  ]
}
```

### Errors
- `400` invalid/no files
- `401` missing/invalid token
- `403` role not allowed

---

## 2) List Gallery Items (Web)

### Endpoint
`GET /api/gallery?mediaType=IMAGE&search=sports`

### Auth
Any authenticated user (school scoped)

### Query params (optional)
- `mediaType`: `IMAGE` or `VIDEO`
- `search`: title/description search

### Example success response (200)
```json
{
  "success": true,
  "data": [
    {
      "_id": "GALLERY_ID",
      "schoolId": "SCHOOL_ID",
      "title": "Sports Day",
      "description": "Opening ceremony",
      "mediaType": "IMAGE",
      "mediaUrl": "uploads/gallery/1773951200000-sports.jpg",
      "mimeType": "image/jpeg",
      "size": 145920,
      "uploadedBy": {
        "_id": "USER_ID",
        "name": "Admin Name",
        "roleId": "ROLE_ID"
      },
      "createdAt": "2026-03-27T10:00:00.000Z",
      "updatedAt": "2026-03-27T10:00:00.000Z"
    }
  ]
}
```

---

## 3) Get Gallery Item By ID (Web)

### Endpoint
`GET /api/gallery/:id`

### Auth
Any authenticated user

### Example success response (200)
```json
{
  "success": true,
  "data": {
    "_id": "GALLERY_ID",
    "schoolId": "SCHOOL_ID",
    "title": "Sports Day",
    "description": "Opening ceremony",
    "mediaType": "IMAGE",
    "mediaUrl": "uploads/gallery/1773951200000-sports.jpg",
    "mimeType": "image/jpeg",
    "size": 145920
  }
}
```

### Not found (404)
```json
{ "success": false, "message": "Gallery item not found" }
```

---

## 4) Update Gallery Item (Web)

### Endpoint
`PUT /api/gallery/:id`

### Auth
Admin / Principal

### Option A: JSON body
```json
{
  "title": "Sports Day 2026",
  "description": "Updated description"
}
```

### Option B: multipart/form-data
- `title` (optional)
- `description` (optional)
- `mediaFile` (optional, single image/video)

### Example success response (200)
```json
{
  "success": true,
  "data": {
    "_id": "GALLERY_ID",
    "title": "Sports Day 2026",
    "description": "Updated description"
  }
}
```

---

## 5) Delete Gallery Item (Web)

### Endpoint
`DELETE /api/gallery/:id`

### Auth
Admin / Principal

### Example success response (200)
```json
{ "success": true, "message": "Gallery item deleted" }
```

---

## 6) Mobile Gallery APIs

### 6.1 List gallery (mobile)
`GET /api/mobile/gallery?mediaType=VIDEO&search=annual`

Auth: Student / Parent / Teacher / Staff

### 6.2 Get gallery details (mobile)
`GET /api/mobile/gallery/:id`

Auth: Student / Parent / Teacher / Staff

Response format is same as web gallery list/details.

---

## Common Error Responses

- 401 Unauthorized: `{ "success": false, "message": "Not authorized, token missing" }` or `"Invalid token"`
- 403 Forbidden: `{ "success": false, "message": "You do not have permission" }`
- 400 Bad Request: `{ "success": false, "message": "<validation message>" }`
- 404 Not Found: `{ "success": false, "message": "<resource> not found" }`

