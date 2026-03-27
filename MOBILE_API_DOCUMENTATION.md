# GurukulAI Backend – Mobile API Documentation

**Base URL:** `http://localhost:5000/api`  
**Auth header (protected APIs):** `Authorization: Bearer <token>`

This document is focused on **mobile app usage** (Student/Parent/Teacher login → Dashboard).
All `/api/mobile/*` endpoints are restricted to these roles only: `Student`, `Parent`, `Teacher`, `Staff`.

---

## 1) Auth (Mobile)

### 1.1 Login
**POST** `/api/auth/login`  
**Content-Type:** `application/json`

#### Student login (phone/username)
**Request (JSON):**
```json
{
  "loginId": "ADM1002",
  "password": "123456"
}
```
or
```json
{
  "phone": "9876543210",
  "password": "123456"
}
```

#### Parent login (phone/username)
**Request (JSON):**
```json
{
  "loginId": "9876543210",
  "password": "123456"
}
```

#### Teacher login (email)
**Request (JSON):**
```json
{
  "email": "teacher@school.com",
  "password": "123456"
}
```

**Success (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "JWT_TOKEN_HERE",
    "user": {
      "_id": "USER_ID",
      "name": "Rahul Sharma",
      "email": "student.adm1002@local.invalid",
      "username": "ADM1002",
      "roleId": { "name": "Student" },
      "schoolId": "SCHOOL_ID"
    }
  }
}
```

**Common errors:**
- **400** missing JSON/body fields  
- **401** invalid credentials / wrong identifier for role

---

### 1.2 Forgot Password (OTP)
**POST** `/api/auth/forgot-password`  
**Content-Type:** `application/json`

**Request examples:**
```json
{ "email": "teacher@school.com" }
```
```json
{ "loginId": "ADM1002" }
```
```json
{ "phone": "9876543210" }
```

**Success (200):**
```json
{
  "success": true,
  "message": "If account exists, OTP has been sent",
  "data": {
    "message": "If account exists, OTP has been sent",
    "otp": "123456"
  }
}
```
Note: OTP is returned for testing in non-production (or if `RETURN_RESET_OTP=true`).

---

### 1.3 Reset Password (OTP)
**POST** `/api/auth/reset-password`  
**Content-Type:** `application/json`

**Request (JSON):**
```json
{
  "loginId": "ADM1002",
  "otp": "123456",
  "newPassword": "newpass123"
}
```

**Success (200):**
```json
{
  "success": true,
  "message": "Password reset successful",
  "data": {
    "message": "Password reset successful"
  }
}
```

---

## 2) Mobile Dashboard

### 2.1 Dashboard (User card + Events)
**GET** `/api/mobile/dashboard`  
**Auth:** Required

**Request headers:**
- `Authorization: Bearer <token>`

**Success (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "USER_ID",
      "name": "Rahul Sharma",
      "role": "Student",
      "profilePhoto": "/uploads/17123456789_photo.png"
    },
    "events": [
      {
        "_id": "EVENT_ID",
        "title": "Annual Function",
        "description": "School annual function",
        "location": "Main Auditorium",
        "startAt": "2026-03-30T10:00:00.000Z",
        "endAt": "2026-03-30T14:00:00.000Z",
        "organizationFor": ["ALL"],
        "status": "UPCOMING"
      }
    ]
  }
}
```

**Notes:**
- Events are filtered by the logged-in user’s role audience:
  - Student → `STUDENTS`
  - Parent → `PARENTS`
  - Teacher → `TEACHERS`
  - Staff → `STAFF`
  - Others → `ALL`
- Only **UPCOMING** and **ONGOING** events are returned (max 10).
- `profilePhoto` is currently:
  - Student → `Student.documents.studentPhoto` (if present)
  - Parent → child student’s `studentPhoto` (fallback)
  - Teacher → `null` (no photo field exists in current schema)

---

### 2.2 Profile (tap header avatar → profile screen)
**GET** `/api/mobile/profile`  
**Auth:** Required

**Response notes:**
- `entityType` is `student` for Student/Parent users (Parent sees child student profile data).
- `entityType` is `staff` for Teacher/Staff users.
- Some screenshot fields like address/blood group are returned as empty strings because they don’t exist in current DB schema.

**Success (200) – Student/Parent example:**
```json
{
  "success": true,
  "data": {
    "entityType": "student",
    "header": {
      "displayName": "Ambika Sharma",
      "subTitle": "ADM-102",
      "profilePhoto": "/uploads/student_photo.png"
    },
    "academicDetails": {
      "school": "Crestwood Academy",
      "schoolCode": "SCH202423",
      "className": "7",
      "section": "A",
      "rollNumber": "31",
      "admissionNumber": "ADM-102",
      "admissionDate": "2026-03-12",
      "dateOfBirth": "2006-11-22"
    },
    "generalInformation": {
      "phone": "9999999999",
      "gender": "Female",
      "bloodGroup": "",
      "currentAddress": "",
      "permanentAddress": ""
    },
    "emergencyContact": {
      "contactName": "Mr. Rajesh Sharma",
      "contactRelation": "Father",
      "contactPhone": "+91 9229739229"
    }
  }
}
```

## 3) Events (Mobile)

### 3.1 List Events (All / Read / Unread)
**GET** `/api/mobile/events`  
**Auth:** Required

**Query params:**
- `filter` = `all` | `read` | `unread` (default `all`)
- `status` (optional) = `UPCOMING` | `ONGOING` | `COMPLETED`

**Example:**
- All: `GET /api/mobile/events?filter=all`
- Unread only: `GET /api/mobile/events?filter=unread`
- Read only: `GET /api/mobile/events?filter=read`

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "EVENT_ID",
      "title": "Annual Function",
      "description": "School annual function",
      "location": "Main Auditorium",
      "startAt": "2026-03-30T10:00:00.000Z",
      "endAt": "2026-03-30T14:00:00.000Z",
      "organizationFor": ["ALL"],
      "status": "UPCOMING",
      "isRead": false
    }
  ]
}
```

---

### 3.2 Event Details (click event → details screen)
**GET** `/api/mobile/events/:id`  
**Auth:** Required

This returns the full event object for the logged-in user’s school, and ensures the event is allowed for that audience (`organizationFor` includes `ALL` or the user’s audience type).

**Success (200):**
```json
{
  "success": true,
  "data": {
    "_id": "EVENT_ID",
    "title": "Annual Function",
    "description": "School annual function",
    "location": "Main Auditorium",
    "startAt": "2026-03-30T10:00:00.000Z",
    "endAt": "2026-03-30T14:00:00.000Z",
    "organizationFor": ["ALL"],
    "status": "UPCOMING",
    "schoolId": "SCHOOL_ID"
  }
}
```

**Error (404):**
```json
{ "success": false, "message": "Event not found" }
```

---

### 3.3 Mark Event as Read
**PUT** `/api/mobile/events/:id/read`  
**Auth:** Required

Use this when the user opens the event details page.

**Success (200):**
```json
{ "success": true, "message": "Marked as read" }
```

---

## 4) Events (optional – if app needs a full events list page)

If the app needs a dedicated events list screen (beyond dashboard), it can use the existing web API:

### 4.1 List Events
**GET** `/api/events`  
**Auth:** Required

**Optional query:** `status`, `organizationFor`, `from`, `to`, `schoolId` (SuperAdmin)

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "EVENT_ID",
      "title": "Annual Function",
      "startAt": "2026-03-30T10:00:00.000Z",
      "endAt": "2026-03-30T14:00:00.000Z",
      "status": "UPCOMING"
    }
  ]
}
```

---

## Common Error Responses

- **401 Unauthorized:** `{ "success": false, "message": "Not authorized, token missing" }` or `"Invalid token"`
- **403 Forbidden:** `{ "success": false, "message": "You do not have permission" }`
- **400 Bad Request:** `{ "success": false, "message": "<validation message>" }`
- **404 Not Found:** `{ "success": false, "message": "<Resource> not found" }`

---

## 5) Attendance (Mobile)

### 5.1 Student Attendance (Student/Parent) – Month View
Shows summary + day-wise attendance for a selected month (as in the screenshot).  
For students: **ignore entry/exit time** (not returned).

**GET** `/api/mobile/attendance/student?month=11&year=2025`  
**Auth:** Student or Parent token

**Success (200):**
```json
{
  "success": true,
  "data": {
    "student": {
      "_id": "STUDENT_ID",
      "name": "Rahul Sharma",
      "admissionNumber": "ADM1002",
      "className": "5",
      "section": "A",
      "rollNumber": "12"
    },
    "summary": {
      "totalDays": 22,
      "present": 18,
      "absent": 4,
      "percentage": 82
    },
    "days": [
      { "date": "2025-11-17T00:00:00.000Z", "status": "Present" },
      { "date": "2025-11-14T00:00:00.000Z", "status": "Absent" }
    ]
  }
}
```

---

### 5.2 Staff Attendance (Staff/Teacher) – Month View

**GET** `/api/mobile/attendance/staff?month=11&year=2025`  
**Auth:** Staff/Teacher token

**Success (200):**
```json
{
  "success": true,
  "data": {
    "staff": { "_id": "STAFF_ID", "name": "Ramesh Kumar", "designation": "Teacher" },
    "summary": { "totalDays": 22, "present": 20, "absent": 2, "percentage": 91 },
    "days": [
      { "date": "2025-11-17T00:00:00.000Z", "status": "Present", "entryTime": "08:10", "exitTime": "14:10" }
    ]
  }
}
```

---

### 5.3 Teacher – Get students list by class (and optional section)
Teacher selects class first → gets all students list to mark.

**GET** `/api/mobile/attendance/teacher/students?className=5&section=A`  
**Auth:** Teacher token

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "STUDENT_ID",
      "name": "Rahul Sharma",
      "admissionNumber": "ADM1002",
      "rollNumber": "12",
      "className": "5",
      "section": "A"
    }
  ]
}
```

---

### 5.4 Teacher – Mark attendance by date (single or bulk)
Teacher can mark **one-by-one** (send one entry) or **bulk** (send many entries).

**POST** `/api/mobile/attendance/teacher/mark-students`  
**Content-Type:** `application/json`

**Bulk example:**
```json
{
  "date": "2025-11-17",
  "entries": [
    { "studentId": "STUDENT_ID_1", "status": "Present" },
    { "studentId": "STUDENT_ID_2", "status": "Absent" }
  ]
}
```

---

## 6) Timetable (Mobile)

Timetable UI with day tabs (`Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`) can call one endpoint by selected day.

### 6.1 Get timetable by day
**GET** `/api/mobile/timetable?day=Tue`  
**Auth:** Required

**Role behavior:**
- Student/Parent: returns own class/section timetable
- Teacher: returns own timetable (`teacherId = logged-in user`)
- Staff: can use optional filters

**Optional query params (Staff only):**
- `classId`
- `sectionId`
- `teacherId`

**Success (200):**
```json
{
  "success": true,
  "data": {
    "selectedDay": "Tue",
    "fullDay": "Tuesday",
    "slots": [
      {
        "_id": "TIMETABLE_ID",
        "subject": "English",
        "subjectCode": "ENG",
        "className": "Grade 1",
        "section": "B",
        "teacherName": "Ramesh Kumar",
        "roomNumber": "R-12",
        "startTime": "09:00",
        "endTime": "09:30",
        "day": "Tuesday",
        "shortDay": "Tue"
      },
      {
        "_id": "TIMETABLE_ID_2",
        "subject": "Science",
        "subjectCode": "SCI",
        "className": "Grade 1",
        "section": "A",
        "teacherName": "Ramesh Kumar",
        "roomNumber": "R-8",
        "startTime": "09:30",
        "endTime": "10:00",
        "day": "Tuesday",
        "shortDay": "Tue"
      }
    ]
  }
}
```

---

## 7) Leaves (Mobile – Separate Student/Staff APIs)

These clean APIs map directly to your separate DB collections:
- `studentleaves` → `/api/mobile/leaves/students/...`
- `staffleaves` → `/api/mobile/leaves/staff/...`

### 7.1 Student Leave APIs

- **Apply (self)**: `POST /api/mobile/leaves/students/me/apply`
- **My list**: `GET /api/mobile/leaves/students/me?status=Approved|Unapproved`
- **Update my leave**: `PUT /api/mobile/leaves/students/me/:id`
- **Delete my leave**: `DELETE /api/mobile/leaves/students/me/:id`
- **Pending list (approver)**: `GET /api/mobile/leaves/students/pending`
- **Approve/Unapprove**: `PUT /api/mobile/leaves/students/:id/status`

**Student apply request:**
```json
{
  "reason": "Fever",
  "leaveFrom": "2026-03-28",
  "leaveTo": "2026-03-29"
}
```

---

## 8) Exams / Admit Card / Marksheet (Mobile GET)

These are read APIs for mobile app screens.

### 8.1 List exams
**GET** `/api/mobile/exams?sessionId=&classId=&sectionId=`  
**Auth:** Student / Parent / Teacher / Staff

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "EXAM_ID",
      "name": "Half Yearly",
      "sessionId": "SESSION_ID",
      "sessionName": "2026-27",
      "classId": "CLASS_ID",
      "className": "Grade 7",
      "sectionId": "SECTION_ID",
      "sectionName": "A"
    }
  ]
}
```

### 8.2 Get exam details (for admit card schedule)
**GET** `/api/mobile/exams/:examId`  
**Auth:** Student / Parent / Teacher / Staff

**Response**

```json
{
  "success": true,
  "data": {
    "id": "EXAM_ID",
    "name": "Half Yearly",
    "sessionId": "SESSION_ID",
    "sessionName": "2026-27",
    "classId": "CLASS_ID",
    "className": "Grade 7",
    "sectionId": "SECTION_ID",
    "sectionName": "A",
    "instructions": "Reach 30 min early",
    "subjects": [
      { "subjectId": "SUB_MATH", "subjectName": "Mathematics", "maxMarks": 100, "passMarks": 35 }
    ],
    "schedule": [
      { "subjectId": "SUB_MATH", "subjectName": "Mathematics", "examDate": "2026-09-10T00:00:00.000Z", "startTime": "10:00", "endTime": "12:00" }
    ]
  }
}
```
Returns exam meta + subjects + schedule + instructions.

### 8.3 Get exam marks
**GET** `/api/mobile/exams/:examId/marks`  
**Optional:** `?studentId=STUDENT_ID`
**Auth:** Student / Parent / Teacher / Staff
**response**
```json
{
  "success": true,
  "data": {
    "STUDENT_ID_1": {
      "SUB_MATH": "82",
      "SUB_ENG": "AB"
    },
    "STUDENT_ID_2": {
      "SUB_MATH": "91",
      "SUB_ENG": "88"
    }
  }
}
```
**Behavior:**
- Student/Parent: auto-returns only self student marks.
- Teacher/Staff: can pass optional `studentId` query for specific student.

**Success (200):**
```json
{
  "success": true,
  "data": {
    "STUDENT_ID": {
      "SUBJECT_ID_1": "82",
      "SUBJECT_ID_2": "AB"
    }
  }
}
```

### 8.4 Get students by exam scope (admit/marks entry helper)
**GET** `/api/mobile/exams/:examId/students`  
**Auth:** Teacher / Staff

Returns students filtered by exam scope:
- Class 1-10: by class
- Class 11-12: by class + section

**Response**

```json
{
  "success": true,
  "data": [
    {
      "_id": "STUDENT_ID",
      "name": "Rahul Sharma",
      "admissionNumber": "ADM1002",
      "rollNumber": "31",
      "className": "7",
      "section": "A"
    }
  ]
}
```

**Student status update request (Teacher):**
```json
{
  "status": "Approved"
}
```

---

## 9) Gallery (Web + Mobile)

### 9.1 Upload gallery media (Web admin panel)
**POST** `/api/gallery/upload`  
**Auth:** Admin / Principal  
**Content-Type:** `multipart/form-data`

**Form fields:**
- `title` (optional)
- `description` (optional)
- `mediaFiles` (required, multiple: image/video)

**Success (201):**
```json
{
  "success": true,
  "message": "Media uploaded successfully",
  "data": [
    {
      "_id": "GALLERY_ID",
      "title": "Sports Day",
      "description": "Opening ceremony",
      "mediaType": "IMAGE",
      "mediaUrl": "uploads/gallery/1773951200000-sports.jpg",
      "mimeType": "image/jpeg",
      "size": 145920,
      "schoolId": "SCHOOL_ID"
    }
  ]
}
```

### 9.2 List gallery items (Web)
**GET** `/api/gallery?mediaType=IMAGE&search=sports`  
**Auth:** Any authenticated school user
**response**
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


### 9.3 Get single gallery item (Web)
**GET** `/api/gallery/:id`  
**Auth:** Any authenticated school user

**response**

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
    "size": 145920,
    "uploadedBy": {
      "_id": "USER_ID",
      "name": "Admin Name",
      "roleId": "ROLE_ID"
    },
    "createdAt": "2026-03-27T10:00:00.000Z",
    "updatedAt": "2026-03-27T10:00:00.000Z"
  }
}
```

### 9.4 Update gallery item (Web admin panel)
**PUT** `/api/gallery/:id`  
**Auth:** Admin / Principal  
**Content-Type:** `multipart/form-data` (optional `mediaFile`) or JSON

### 9.5 Delete gallery item (Web admin panel)
**DELETE** `/api/gallery/:id`  
**Auth:** Admin / Principal

### 9.6 Mobile gallery list
**GET** `/api/mobile/gallery?mediaType=VIDEO&search=annual`  
**Auth:** Student / Parent / Teacher / Staff

**response**
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

### 9.7 Mobile gallery details
**GET** `/api/mobile/gallery/:id`  
**Auth:** Student / Parent / Teacher / Staff
**response**

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
    "size": 145920,
    "uploadedBy": {
      "_id": "USER_ID",
      "name": "Admin Name",
      "roleId": "ROLE_ID"
    },
    "createdAt": "2026-03-27T10:00:00.000Z",
    "updatedAt": "2026-03-27T10:00:00.000Z"
  }
}
```


---

### 7.2 Staff Leave APIs

- **Apply (self)**: `POST /api/mobile/leaves/staff/me/apply`
- **My list**: `GET /api/mobile/leaves/staff/me?status=Approved|Unapproved`
- **Update my leave**: `PUT /api/mobile/leaves/staff/me/:id`
- **Delete my leave**: `DELETE /api/mobile/leaves/staff/me/:id`
- **Pending list (approver)**: `GET /api/mobile/leaves/staff/pending`
- **Approve/Unapprove**: `PUT /api/mobile/leaves/staff/:id/status`

**Staff apply request:**
```json
{
  "reason": "Personal work",
  "leaveFrom": "2026-03-28",
  "leaveTo": "2026-03-28"
}
```

**Staff status update request (Teacher):**
```json
{
  "status": "Unapproved"
}
```

---

### 7.3 Lock rule after review

Once Teacher has reviewed a leave (approved or changed status), student/staff cannot edit/delete it.

Error example:
```json
{
  "success": false,
  "message": "Leave is already reviewed and cannot be deleted"
}
```

