# GurukulAI Backend – API Documentation

**Base URL:** `http://localhost:5000/api`  
**Auth:** All protected routes need header: `Authorization: Bearer <token>`

---

## 1. Health Check (no auth)

**GET** `/api/health`

**Request:** No body, no auth.

**Response (200):**
```json
{
  "success": true,
  "message": "API Running 🚀"
}
```

---

## 2. Auth

### 2.1 Login  
**POST** `/api/auth/login`

**Request (JSON):**
```json
{
  "email": "admin@school.com",
  "password": "12345"
}
```
*Or for Student/Parent/Staff use: `"loginId": "9876543210"` or `"phone"` / `"username"` instead of `email`.*

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "_id": "...",
      "name": "Admin User",
      "email": "admin@school.com",
      "roleId": { "name": "Admin", "_id": "..." },
      "schoolId": "..."
    }
  }
}
```

**Error (401):**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

---

### 2.2 Forgot Password  
**POST** `/api/auth/forgot-password`

**Request (JSON):**
```json
{
  "email": "admin@school.com"
}
```
*Or `loginId` / `phone` for phone-based roles.*

**Response (200):**
```json
{
  "success": true,
  "message": "If account exists, OTP has been sent",
  "data": { "message": "...", "otp": "123456" }
}
```
*`otp` only in dev; in production OTP is sent via SMS/email.*

---

### 2.3 Reset Password  
**POST** `/api/auth/reset-password`

**Request (JSON):**
```json
{
  "email": "admin@school.com",
  "otp": "123456",
  "newPassword": "newSecurePass123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password reset successful",
  "data": { "message": "Password reset successful" }
}
```



## 4. Schools

### 4.1 Get All Schools  
**GET** `/api/schools`

**Headers:** `Authorization: Bearer <token>`  
**Query (SuperAdmin):** `?schoolId=...` not needed; others see only their school.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "schoolCode": "ABC001",
      "name": "ABC Public School",
      "logo": "/uploads/...",
      "address": "...",
      "status": "ACTIVE"
    }
  ]
}
```

---

### 4.2 Create School (SuperAdmin only)  
**POST** `/api/schools`

**Headers:** `Authorization: Bearer <superadmin_token>`  
**Body:** form-data with `logo` (file) + fields: `schoolCode`, `name`, `yearEstablished`, `affiliation`, `address`, `city`, `state`, `pincode`, `phone`, `email`, `website`, `status`.

**Response (201):**
```json
{
  "success": true,
  "data": { "_id": "...", "name": "...", "schoolCode": "..." }
}
```

---

### 4.3 Update School (SuperAdmin only)  
**PUT** `/api/schools/:id`

**Headers:** `Authorization: Bearer <superadmin_token>`  
**Body:** form-data (same as create, optional logo).

**Response (200):** `{ "success": true, "data": { ...school } }`


---

## 3. Users

### 3.1 Create Admin (SuperAdmin only)  
**POST** `/api/users/create-admin`

**Headers:** `Authorization: Bearer <superadmin_token>`

**Request (JSON):**
```json
{
  "name": "School Admin",
  "email": "admin@school.com",
  "phone": "9876543210",
  "schoolId": "SCHOOL_OBJECT_ID",
  "password": "12345"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "School Admin",
    "email": "admin@school.com",
    "roleId": "...",
    "schoolId": "..."
  }
}
```

---

### 3.2 Create Principal (SuperAdmin only)  
**POST** `/api/users/create-principal`

**Headers:** `Authorization: Bearer <superadmin_token>`

**Request (JSON):**
```json
{
  "name": "Principal Name",
  "email": "principal@school.com",
  "phone": "9876543211",
  "schoolId": "SCHOOL_OBJECT_ID",
  "password": "12345"
}
```

**Response (201):** Same shape as create-admin.

---

### 3.3 Get Profile  
**GET** `/api/users/profile`

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "user": {
    "_id": "...",
    "name": "...",
    "email": "...",
    "roleId": { "name": "Admin", "_id": "..." },
    "schoolId": "..."
  }
}
```

---



## 5. Students

### 5.1 Create Admission  
**POST** `/api/students/admission`

**Headers:** `Authorization: Bearer <admin_or_principal_token>`  
**Body:** form-data or JSON. Example JSON (without files):
```json
{
  "name": "Rahul Sharma",
  "gender": "Male",
  "dob": "2010-05-12",
  "admissionNumber": "ADM1001",
  "rollNumber": "12",
  "className": "5",
  "section": "A",
  "admissionDate": "2026-03-12",
  "parents": {
    "father": { "name": "Rajesh", "phone": "9876543210", "occupation": "Engineer" },
    "mother": { "name": "Sunita", "phone": "9876543211", "occupation": "Teacher" }
  },
  "studentLogin": { "type": "NEW_USER", "password": "123456" },
  "parentLogin": { "type": "NEW_USER", "password": "123456" }
}
```
*SuperAdmin must send `schoolId` in body or query.*

**Response (201):**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "Rahul Sharma",
    "admissionNumber": "ADM1001",
    "className": "5",
    "section": "A",
    "studentLogin": { "enabled": true, "userId": "..." }
  }
}
```

---

### 5.2 Get All Students  
**GET** `/api/students`

**Query (optional):** `?schoolId=...` (required for SuperAdmin)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "name": "...",
      "admissionNumber": "...",
      "className": "...",
      "section": "...",
      "status": "ACTIVE"
    }
  ]
}
```

---

### 5.3 Get Student by ID  
**GET** `/api/students/:id`

**Query (SuperAdmin):** `?schoolId=...`

**Response (200):** `{ "success": true, "data": { ...student } }`

**Error (404):** `{ "success": false, "message": "Student not found" }`

---

### 5.4 Update Student  
**PUT** `/api/students/:id`

**Headers:** `Authorization: Bearer <admin_or_principal_token>`  
**Body (JSON):** `name`, `gender`, `dob`, `rollNumber`, `className`, `section`, `parents`, `previousSchool`, `feeStructure` (any subset).

**Response (200):** `{ "success": true, "data": { ...student } }`

---

### 5.5 Update Student Status  
**PUT** `/api/students/:id/status`

**Body (JSON):**
```json
{
  "status": "ACTIVE",
  "suspension": { "startDate": "...", "endDate": "...", "reason": "..." }
}
```

**Response (200):** `{ "success": true, "data": { ...student } }`

---

### 5.6 Update Student Suspension  
**PUT** `/api/students/:id/suspend`

**Body (JSON):** `{ "suspension": { "startDate": "...", "endDate": "...", "reason": "..." } }`

**Response (200):** `{ "success": true, "data": { ...student } }`

---

### 5.7 Delete Student  
**DELETE** `/api/students/:id`

**Response (200):** `{ "success": true, "message": "Student deleted successfully" }`

---

## 6. Staff

### 6.1 Create Staff  
**POST** `/api/staff`

**Headers:** `Authorization: Bearer <admin_or_principal_token>`  
**Body (JSON):**
```json
{
  "name": "Teacher Name",
  "email": "teacher@school.com",
  "phone": "9876543212",
  "designation": "Teacher",
  "joiningDate": "2025-04-01",
  "status": "ACTIVE",
  "username": "teacher1",
  "password": "12345"
}
```
*SuperAdmin: add `schoolId`.*

**Response (201):** `{ "success": true, "data": { ...staff } }`

---

### 6.2 Get All Staff  
**GET** `/api/staff`

**Query (SuperAdmin):** `?schoolId=...`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "name": "...",
      "email": "...",
      "designation": "Teacher",
      "userId": "..."
    }
  ]
}
```

---

### 6.3 Update Staff  
**PUT** `/api/staff/:id`

**Body (JSON):** Any of `name`, `email`, `phone`, `designation`, `joiningDate`, `status`, etc.

**Response (200):** `{ "success": true, "data": { ...staff } }`

---

### 6.4 Delete Staff  
**DELETE** `/api/staff/:id`

**Response (200):** `{ "success": true, "message": "Staff deleted" }`

---

## 7. Sessions (Academic)

### 7.1 Create Session  
**POST** `/api/sessions`

**Headers:** `Authorization: Bearer <admin_token>`, injectSchool used.  
**Body (JSON):**
```json
{
  "name": "2025-26",
  "startDate": "2025-04-01",
  "endDate": "2026-03-31"
}
```

**Response (201):** `{ "success": true, "data": { ...session } }`

---

### 7.2 Get Sessions  
**GET** `/api/sessions`

**Response (200):** `{ "success": true, "data": [ ... ] }`

---

### 7.3 Activate Session  
**PUT** `/api/sessions/activate/:id`

**Response (200):** `{ "success": true, "data": { ...session, "isActive": true } }`

---

## 8. Classes

### 8.1 Create Class  
**POST** `/api/classes`

**Body (JSON):** `{ "name": "Grade 5", "sessionId": "SESSION_ID" }`  
*SuperAdmin: add `schoolId` in query/body.*

**Response (201):** `{ "success": true, "data": { ...class } }`

---

### 8.2 Get Classes  
**GET** `/api/classes`

**Query (SuperAdmin):** `?schoolId=...`

**Response (200):** `{ "success": true, "data": [ ... ] }`

---

### 8.3 Update Class  
**PUT** `/api/classes/:id`

**Body (JSON):** `{ "name": "Grade 5A", "sessionId": "..." }`

**Response (200):** `{ "success": true, "data": { ...class } }`

---

### 8.4 Delete Class  
**DELETE** `/api/classes/:id`

**Response (200):** `{ "success": true, "message": "Class deleted successfully" }`

---

## 9. Sections

### 9.1 Create Section  
**POST** `/api/sections`

**Body (JSON):**
```json
{
  "name": "A",
  "classId": "CLASS_ID",
  "sessionId": "SESSION_ID",
  "classTeacherId": "USER_ID"
}
```

**Response (201):** `{ "success": true, "data": { ...section } }`

---

### 9.2 Get Sections  
**GET** `/api/sections`

**Response (200):** `{ "success": true, "data": [ ... ] }`

---

### 9.3 Update Section  
**PUT** `/api/sections/:id`

**Body (JSON):** `name`, `classId`, `classTeacherId`, `sessionId`

**Response (200):** `{ "success": true, "data": { ...section } }`

---

### 9.4 Delete Section  
**DELETE** `/api/sections/:id`

**Response (200):** `{ "success": true, "message": "Section deleted successfully" }`

---

## 10. Subjects

### 10.1 Create Subject  
**POST** `/api/subjects`

**Body (JSON):**
```json
{
  "name": "Mathematics",
  "code": "MATH-5",
  "type": "Theory",
  "classId": "CLASS_ID",
  "sessionId": "SESSION_ID"
}
```

**Response (201):** `{ "success": true, "data": { ...subject } }`

---

### 10.2 Get Subjects  
**GET** `/api/subjects`

**Response (200):** `{ "success": true, "data": [ ... ] }`

---

### 10.3 Update Subject  
**PUT** `/api/subjects/:id`

**Body (JSON):** `name`, `code`, `type`, `classId`, `sessionId`

**Response (200):** `{ "success": true, "data": { ...subject } }`

---

### 10.4 Delete Subject  
**DELETE** `/api/subjects/:id`

**Response (200):** `{ "success": true, "message": "Subject deleted" }`

---

## 11. Events

### 11.1 Create Event  
**POST** `/api/events`

**Headers:** `Authorization: Bearer <admin_or_principal_token>`  
**Body (JSON):**
```json
{
  "schoolId": "SCHOOL_ID",
  "title": "Annual Day",
  "description": "Annual function",
  "location": "Auditorium",
  "startAt": "2026-04-01T09:00:00.000Z",
  "endAt": "2026-04-01T12:00:00.000Z",
  "organizationFor": ["STUDENTS", "PARENTS"],
  "status": "UPCOMING"
}
```
*Non-SuperAdmin: omit `schoolId` (taken from token).*

**Response (201):** `{ "success": true, "data": { ...event } }`

---

### 11.2 Get Events  
**GET** `/api/events`

**Query:** `?schoolId=...` (required for SuperAdmin), optional `?status=UPCOMING`, `?from=...`, `?to=...`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "title": "...",
      "description": "...",
      "startAt": "...",
      "endAt": "...",
      "location": "...",
      "organizationFor": ["STUDENTS"],
      "status": "UPCOMING"
    }
  ]
}
```

---

### 11.3 Get Event by ID  
**GET** `/api/events/:id`

**Query:** `?schoolId=...` (SuperAdmin)

**Response (200):** `{ "success": true, "data": { ...event } }`

---

### 11.4 Update Event  
**PUT** `/api/events/:id`

**Body (JSON):** `title`, `description`, `location`, `startAt`, `endAt`, `organizationFor`, `status`

**Response (200):** `{ "success": true, "data": { ...event } }`

---

### 11.5 Delete Event  
**DELETE** `/api/events/:id`

**Query:** `?schoolId=...` (SuperAdmin)

**Response (200):** `{ "success": true, "message": "Event deleted" }`

---

## 12. Class Timetable

### 12.1 Create Timetable Entry  
**POST** `/api/class-timetable`

**Body (JSON):**
```json
{
  "classId": "CLASS_ID",
  "sectionId": "SECTION_ID",
  "subjectId": "SUBJECT_ID",
  "teacherId": "TEACHER_USER_ID",
  "startTime": "09:00",
  "endTime": "09:45",
  "day": "Monday",
  "roomNumber": "101"
}
```
*SuperAdmin: add `schoolId`.*

**Response (201):** `{ "success": true, "data": { ...entry } }`

---

### 12.2 Get Timetable (List)  
**GET** `/api/class-timetable`

**Query:** `?schoolId=...`, `?classId=...`, `?sectionId=...`, `?day=Monday`

**Response (200):** `{ "success": true, "data": [ ... ] }`

---

### 12.3 Get Timetable by Class & Section  
**GET** `/api/class-timetable/class/:classId/section/:sectionId`

**Query:** `?schoolId=...` (SuperAdmin)

**Response (200):** `{ "success": true, "data": [ ... ] }`

---

### 12.4 Get Timetable by Teacher  
**GET** `/api/class-timetable/teacher/:teacherId`

**Query:** `?schoolId=...` (SuperAdmin)

**Response (200):** `{ "success": true, "data": [ ... ] }`

---

### 12.5 Get Timetable Entry by ID  
**GET** `/api/class-timetable/:id`

**Query:** `?schoolId=...` (SuperAdmin)

**Response (200):** `{ "success": true, "data": { ...entry } }`

---

### 12.6 Update Timetable Entry  
**PUT** `/api/class-timetable/:id`

**Body (JSON):** `classId`, `sectionId`, `subjectId`, `startTime`, `endTime`, `day`, `roomNumber`, `teacherId`

**Response (200):** `{ "success": true, "data": { ...entry } }`

---

### 12.7 Delete Timetable Entry  
**DELETE** `/api/class-timetable/:id`

**Query:** `?schoolId=...` (SuperAdmin)

**Response (200):** `{ "success": true, "message": "Timetable entry deleted" }`

---

## 12b. Timetable (Legacy – period-based)

*Uses `periodId`; no auth on routes in current code. Prefer Class Timetable (section 12) for new work.*

- **POST** `/api/timetable` – Body: `classId`, `sectionId`, `day`, `periodId`, `subjectId`, `teacherId`, `schoolId`
- **GET** `/api/timetable/class/:classId/:sectionId` – Get by class & section
- **GET** `/api/timetable/teacher/:teacherId` – Get by teacher
- **DELETE** `/api/timetable/:id` – Delete entry

---

## 13. Attendance

### 13.1 Mark Student Attendance  
**POST** `/api/attendance/students`

**Body (JSON) – single:**
```json
{
  "date": "2026-03-15",
  "studentId": "STUDENT_ID",
  "status": "Present"
}
```
**Bulk:**
```json
{
  "date": "2026-03-15",
  "entries": [
    { "studentId": "ID1", "status": "Present" },
    { "studentId": "ID2", "status": "Absent" }
  ]
}
```
*SuperAdmin: add `schoolId` in body or query.*

**Response (200):** `{ "success": true, "data": ... }`

---

### 13.2 Get Student Attendance  
**GET** `/api/attendance/students`

**Query:** `?date=2026-03-15`, optional `?className=5`, `?section=A`, `?schoolId=...` (SuperAdmin).  
*If no date: returns last 365 days. Student role: own only.*

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "date": "...",
      "studentName": "...",
      "rollNumber": "...",
      "class": "5",
      "section": "A",
      "status": "Present",
      "markedBy": "Teacher Name"
    }
  ]
}
```

---

### 13.3 Update Student Attendance  
**PUT** `/api/attendance/students/:id`

**Body (JSON):** `{ "status": "Absent" }`

**Response (200):** `{ "success": true, "data": { ... } }`

---

### 13.4 Delete Student Attendance  
**DELETE** `/api/attendance/students/:id`

**Query:** `?schoolId=...` (SuperAdmin)

**Response (200):** `{ "success": true, "message": "Student attendance record deleted" }`

---

### 13.5 Mark Staff Attendance  
**POST** `/api/attendance/staff`

**Body (JSON) – single:**
```json
{
  "date": "2026-03-15",
  "staffId": "STAFF_ID",
  "status": "Present",
  "entryTime": "09:00",
  "exitTime": "17:30"
}
```
**Bulk:** `{ "date": "2026-03-15", "entries": [ { "staffId": "...", "status": "Present", "entryTime": "09:00", "exitTime": "17:30" } ] }`

**Response (200):** `{ "success": true, "data": ... }`

---

### 13.6 Get Staff Attendance  
**GET** `/api/attendance/staff`

**Query:** `?date=2026-03-15`, `?schoolId=...` (SuperAdmin). *Staff/Teacher/Principal: own only.*

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "date": "...",
      "staffId": "...",
      "name": "...",
      "role": "Teacher",
      "status": "Present",
      "entryTime": "09:00",
      "exitTime": "17:30"
    }
  ]
}
```

---

### 13.7 Update Staff Attendance  
**PUT** `/api/attendance/staff/:id`

**Body (JSON):** `{ "status": "Present", "entryTime": "09:00", "exitTime": "18:00" }`

**Response (200):** `{ "success": true, "data": { ... } }`

---

### 13.8 Delete Staff Attendance  
**DELETE** `/api/attendance/staff/:id`

**Response (200):** `{ "success": true, "message": "Staff attendance record deleted" }`

---

## 14. Leaves

### 14.1 Create Student Leave  
**POST** `/api/leaves/students`

**Body (JSON) – student applying own:**  
`{ "reason": "Fever", "leaveFrom": "2026-03-20", "leaveTo": "2026-03-22" }`

**Admin/Principal/Teacher creating for a student:**  
`{ "schoolId": "...", "studentId": "...", "reason": "...", "leaveFrom": "...", "leaveTo": "..." }`

**Response (201):**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "admissionNumber": "...",
    "studentName": "...",
    "class": "5",
    "section": "A",
    "appliedDate": "...",
    "reason": "...",
    "leaveFrom": "...",
    "leaveTo": "...",
    "status": "Unapproved"
  }
}
```

---

### 14.2 Get Student Leaves  
**GET** `/api/leaves/students`

**Query:** `?schoolId=...` (SuperAdmin), `?studentId=...`, `?status=Approved`

**Response (200):** `{ "success": true, "data": [ ... ] }`  
*Student role: own only.*

---

### 14.3 Get Student Leave by ID  
**GET** `/api/leaves/students/:id`

**Query:** `?schoolId=...` (SuperAdmin)

**Response (200):** `{ "success": true, "data": { ... } }`

---

### 14.4 Update Student Leave (Edit)  
**PUT** `/api/leaves/students/:id`

**Body (JSON):** `{ "reason": "...", "leaveFrom": "...", "leaveTo": "..." }`

**Response (200):** `{ "success": true, "data": { ... } }`

---

### 14.5 Approve/Unapprove Student Leave  
**PUT** `/api/leaves/students/:id/status`

**Body (JSON):** `{ "status": "Approved" }` or `{ "status": "Unapproved" }`

**Response (200):** `{ "success": true, "data": { ... } }`

---

### 14.6 Delete Student Leave  
**DELETE** `/api/leaves/students/:id`

**Response (200):** `{ "success": true, "message": "Student leave deleted" }`

---

### 14.7 Create Staff Leave  
**POST** `/api/leaves/staff`

**Body (JSON) – staff applying own:**  
`{ "reason": "Personal", "leaveFrom": "2026-03-18", "leaveTo": "2026-03-18" }`

**Admin/Principal for a staff:**  
`{ "schoolId": "...", "staffId": "...", "reason": "...", "leaveFrom": "...", "leaveTo": "..." }`

**Response (201):** `{ "success": true, "data": { ... } }`

---

### 14.8 Get Staff Leaves  
**GET** `/api/leaves/staff`

**Query:** `?schoolId=...`, `?staffId=...`, `?status=Approved`

**Response (200):** `{ "success": true, "data": [ ... ] }`

---

### 14.9 Get Staff Leave by ID  
**GET** `/api/leaves/staff/:id`

**Response (200):** `{ "success": true, "data": { ... } }`

---

### 14.10 Update Staff Leave  
**PUT** `/api/leaves/staff/:id`

**Body (JSON):** `reason`, `leaveFrom`, `leaveTo`

**Response (200):** `{ "success": true, "data": { ... } }`

---

### 14.11 Approve/Unapprove Staff Leave  
**PUT** `/api/leaves/staff/:id/status`

**Body (JSON):** `{ "status": "Approved" }` or `{ "status": "Unapproved" }`

**Response (200):** `{ "success": true, "data": { ... } }`

---

### 14.12 Delete Staff Leave  
**DELETE** `/api/leaves/staff/:id`

**Response (200):** `{ "success": true, "message": "Staff leave deleted" }`

---

## 15. Study Materials

### 15.1 Create Study Material  
**POST** `/api/study-materials`

**Headers:** `Authorization: Bearer <admin_or_principal_or_teacher_token>`  
**Body:** form-data: `classId`, `sectionId`, `subjectId`, `title`, `description` (optional), `url` (optional), `downloadable` (optional, true/false), `files` (optional, multiple files).  
*SuperAdmin: add `schoolId`.*

**Response (201):**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "classId": { "name": "Grade 5" },
    "sectionId": { "name": "A" },
    "subjectId": { "name": "Mathematics" },
    "title": "Chapter 5 Notes",
    "description": "...",
    "url": "...",
    "downloadable": true,
    "files": ["/uploads/..."]
  }
}
```

---

### 15.2 Get Study Materials  
**GET** `/api/study-materials`

**Query:** `?schoolId=...` (SuperAdmin), `?classId=...`, `?sectionId=...`, `?subjectId=...`

**Response (200):** `{ "success": true, "data": [ ... ] }`

---

### 15.3 Get Study Material by ID  
**GET** `/api/study-materials/:id`

**Query:** `?schoolId=...` (SuperAdmin)

**Response (200):** `{ "success": true, "data": { ... } }`

---

### 15.4 Update Study Material  
**PUT** `/api/study-materials/:id`

**Body:** form-data (same as create); new files are appended. Or JSON for non-file fields only.

**Response (200):** `{ "success": true, "data": { ... } }`

---

### 15.5 Delete Study Material  
**DELETE** `/api/study-materials/:id`

**Query:** `?schoolId=...` (SuperAdmin)

**Response (200):** `{ "success": true, "message": "Study material deleted" }`

---

## 16. Student Promotion

Promote students from one session/class to the next. Use **Current Session**, **Promote to Session**, **Promotion From Class**, **Promotion To Class**, then map sections and optionally select students to promote.

**Note:** Promoting students updates their class/section to the next session and creates a promotion (enrollment) record.

**Roles:** Admin, Principal; SuperAdmin must send `schoolId` in query/body where applicable.

---

### 16.1 List students for promotion (Students Of Class)

**GET** `/api/promote/students`

**Query:**
- `fromClassId` (required) – Class ID to list students from (e.g. Grade 4).
- `fromSectionId` (optional) – Section ID to filter by section.
- `schoolId` (optional) – Required for SuperAdmin to scope by school.

**Example:** `GET /api/promote/students?fromClassId=CLASS_ID&fromSectionId=SECTION_ID`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "STUDENT_ID",
      "enrollmentNo": "SCH-001",
      "studentName": "Aastha",
      "section": "A",
      "rollNo": "32",
      "className": "Grade 4"
    }
  ]
}
```

---

### 16.2 Get sections for Map Class Section

**GET** `/api/promote/sections-map`

**Query:**
- `fromClassId` (required) – From class ID (e.g. Grade 4).
- `toClassId` (required) – To class ID (e.g. Grade 5).
- `schoolId` (optional) – For SuperAdmin.

**Example:** `GET /api/promote/sections-map?fromClassId=ID&toClassId=ID`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "fromClass": { "_id": "...", "name": "Grade 4" },
    "toClass": { "_id": "...", "name": "Grade 5" },
    "fromSections": [{ "_id": "SEC_A_ID", "name": "A" }, { "_id": "SEC_B_ID", "name": "B" }],
    "toSections": [{ "_id": "SEC_A_ID", "name": "A" }, { "_id": "SEC_B_ID", "name": "B" }]
  }
}
```

---

### 16.3 Promote students (Manage Promotion)

**POST** `/api/promote`

**Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`

**Body (JSON):**
- `toSessionId` (required) – Target session ID (e.g. 2025-2026).
- `fromClassId` (required) – Current class ID (e.g. Grade 4).
- `toClassId` (required) – Target class ID (e.g. Grade 5).
- `sectionMappings` (required) – Array of `{ fromSectionId, toSectionId }` (map each from-section to a to-section).
- `studentIds` (optional) – Array of student IDs to promote. If omitted, all students in the from-class (that have a mapping) are promoted.
- `schoolId` (optional) – For SuperAdmin.

**Example:**
```json
{
  "toSessionId": "SESSION_2025_26_ID",
  "fromClassId": "GRADE_4_CLASS_ID",
  "toClassId": "GRADE_5_CLASS_ID",
  "sectionMappings": [
    { "fromSectionId": "GRADE4_SECTION_A_ID", "toSectionId": "GRADE5_SECTION_A_ID" },
    { "fromSectionId": "GRADE4_SECTION_B_ID", "toSectionId": "GRADE5_SECTION_B_ID" }
  ],
  "studentIds": ["STUDENT_ID_1", "STUDENT_ID_2"]
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Promoted 2 student(s)",
  "data": {
    "promoted": [
      {
        "_id": "STUDENT_ID",
        "admissionNumber": "SCH-001",
        "name": "Aastha",
        "newClassName": "Grade 5",
        "newSection": "A"
      }
    ],
    "errors": []
  }
}
```
If some students fail (e.g. already promoted, or no mapping), they appear in `data.errors` with `studentId`, `admissionNumber`, and `reason`.

---

### 16.4 Promotion history

**GET** `/api/promote/history`

**Query:**
- `toSessionId` (optional) – Filter by target session.
- `studentId` (optional) – Filter by student.
- `schoolId` (optional) – For SuperAdmin.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "studentId": { "name": "Aastha", "admissionNumber": "SCH-001" },
      "fromSessionId": { "name": "2024-2025" },
      "toSessionId": { "name": "2025-2026" },
      "fromClassId": { "name": "Grade 4" },
      "toClassId": { "name": "Grade 5" },
      "fromSectionId": { "name": "A" },
      "toSectionId": { "name": "A" },
      "promotedBy": { "name": "Admin User" },
      "createdAt": "..."
    }
  ]
}
```

---

## 17. Live Class

Live class scheduling: **title**, **class**, **sections**, **date**, **time**, **subject**, **teacher**, **class link/URL**.

**Roles:** Create/Update/Delete – Admin, Principal, Teacher; GET – any authenticated user. SuperAdmin must send `schoolId` in query/body.

**Base path:** `/api/live-class`

---

### 17.1 Create Live Class

**POST** `/api/live-class`

**Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`

**Body (JSON):**
- `title` (required)
- `classId` (required) – Class reference
- `sectionIds` (optional) – Array of section IDs; can be empty
- `date` (required) – ISO date string
- `time` (required) – e.g. `"10:00"` or `"10:00 AM"`
- `subjectId` (required)
- `teacherId` (required) – User ID of teacher (teacher name returned via populate)
- `classLink` (optional) – Meeting URL/link

**Example:**
```json
{
  "title": "Math Live Session - Algebra",
  "classId": "CLASS_ID",
  "sectionIds": ["SECTION_A_ID", "SECTION_B_ID"],
  "date": "2026-03-15",
  "time": "10:00 AM",
  "subjectId": "SUBJECT_ID",
  "teacherId": "TEACHER_USER_ID",
  "classLink": "https://meet.example.com/abc-xyz"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "title": "Math Live Session - Algebra",
    "classId": { "_id": "...", "name": "Grade 5" },
    "sectionIds": [{ "_id": "...", "name": "A" }, { "_id": "...", "name": "B" }],
    "date": "2026-03-15T00:00:00.000Z",
    "time": "10:00 AM",
    "subjectId": { "_id": "...", "name": "Mathematics", "code": "MATH" },
    "teacherId": { "_id": "...", "name": "Ramesh Kumar" },
    "classLink": "https://meet.example.com/abc-xyz",
    "schoolId": "...",
    "createdAt": "..."
  }
}
```

---

### 17.2 List Live Classes

**GET** `/api/live-class`

**Query:** `classId`, `subjectId`, `teacherId`, `dateFrom`, `dateTo`, `schoolId` (SuperAdmin)

**Example:** `GET /api/live-class?classId=CLASS_ID&dateFrom=2026-03-01&dateTo=2026-03-31`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "title": "Math Live Session - Algebra",
      "classId": { "name": "Grade 5" },
      "sectionIds": [{ "name": "A" }, { "name": "B" }],
      "date": "2026-03-15T00:00:00.000Z",
      "time": "10:00 AM",
      "subjectId": { "name": "Mathematics", "code": "MATH" },
      "teacherId": { "name": "Ramesh Kumar" },
      "classLink": "https://meet.example.com/abc-xyz"
    }
  ]
}
```

---

### 17.3 Get Live Class by ID

**GET** `/api/live-class/:id`

**Query:** `schoolId` (SuperAdmin)

**Response (200):** `{ "success": true, "data": { ... } }`

---

### 17.4 Update Live Class

**PUT** `/api/live-class/:id`

**Body (JSON):** Same fields as create (all optional for update).

**Response (200):** `{ "success": true, "data": { ... } }`

---

### 17.5 Delete Live Class

**DELETE** `/api/live-class/:id`

**Query:** `schoolId` (SuperAdmin)

**Response (200):** `{ "success": true, "message": "Live class deleted" }`

---

## Common Error Responses

- **401 Unauthorized:** `{ "success": false, "message": "Not authorized, token missing" }` or `"Invalid token"`
- **403 Forbidden:** `{ "success": false, "message": "You do not have permission" }`
- **404 Not Found:** `{ "success": false, "message": "<Resource> not found" }`
- **400 Bad Request:** `{ "success": false, "message": "<validation message>" }`

All success responses use `"success": true`; error responses use `"success": false` and a `message` (and optional `stack` in dev).
