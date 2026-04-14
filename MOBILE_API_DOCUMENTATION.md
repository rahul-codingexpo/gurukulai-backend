# GurukulAI Backend – Mobile API Documentation

**Base URL:** `http://localhost:5000/api`
**render api** `https://gym-backend-cwp1.onrender.com`
**Base URL:** `
**Auth header (protected APIs):** `Authorization: Bearer <token>`

This document is focused on **mobile app usage** (Student/Parent/Teacher login → Dashboard).
All `/api/mobile/*` endpoints are restricted to these roles only: `Student`, `Parent`, `Teacher`, `Staff`.

### API boundary (Mobile vs Web)
- **Mobile APIs:** Prefer `/api/mobile/*` endpoints for app screens.
- **Shared auth endpoint for mobile login:** `POST /api/auth/login` (used by both web and mobile clients).
- **Web-first APIs:** `/api/events`, `/api/homework`, `/api/gallery` etc. are primarily for web/admin workflows unless explicitly called from mobile.

### Default password (Student/Parent)
When Student/Parent accounts are created during admission (or bulk admission), the backend can auto-set a default password.

- **Default values**:
  - Student: `12345`
  - Parent: `123456`
- **Override via env**:
  - `DEFAULT_STUDENT_PASSWORD`
  - `DEFAULT_PARENT_PASSWORD`
  - or shared `DEFAULT_USER_PASSWORD` (fallback for both)

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
      "schoolId": "SCHOOL_ID",
      "profilePhoto": "/uploads/student-photo.png",
      "profileDetails": {
        "displayName": "Rahul Sharma",
        "admissionNumber": "ADM1002",
        "className": "7",
        "section": "A",
        "rollNumber": "31"
      }
    }
  }
}
```

**Success (200) – Teacher example:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "JWT_TOKEN_HERE",
    "user": {
      "_id": "USER_ID",
      "name": "Ramesh Kumar",
      "email": "teacher@school.com",
      "roleId": { "name": "Teacher" },
      "schoolId": "SCHOOL_ID",
      "profilePhoto": "/uploads/staff-photo.png",
      "profileDetails": {
        "displayName": "Ramesh Kumar",
        "designation": "Teacher",
        "staffId": "STAFF_ID"
      }
    }
  }
}
```

**Role-wise login response notes (mobile):**
- Student: `profilePhoto` from `Student.documents.studentPhoto`, plus `admissionNumber/className/section/rollNumber`.
- Parent: `profilePhoto` from linked child `Student.documents.studentPhoto`, plus `childName/admissionNumber/className/section/rollNumber` and parent contact fields.
- Teacher: `profilePhoto` from `Staff.photoUrl`, plus `designation/staffId`.
- Staff/others: login still works; role-specific `profilePhoto/profileDetails` may be empty if not mapped.

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
- `profilePhoto` is role-based:
  - Student → `Student.documents.studentPhoto` (if present)
  - Parent → child student’s `studentPhoto` (fallback)
  - Teacher/Staff → `Staff.photoUrl` (if present)

### 2.1.1 Teacher Combined Dashboard (single API for home screen)
**GET** `/api/mobile/dashboard/teacher`  
**Auth:** Teacher token only

Use this endpoint for the exact teacher home screen blocks:
- Header (`name`, `profilePhoto`)
- Quick actions (mark attendance, student attendance, add homework, apply leave)
- Today timetable card (first 4 slots + `hasMore`/`moreCount`)
- Recent announcements (top 4)

**Success (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "USER_ID",
      "name": "Ramesh Kumar",
      "role": "Teacher",
      "profilePhoto": "/uploads/staff_photo.png"
    },
    "quickActions": [
      {
        "key": "markAttendance",
        "label": "Mark Attendance",
        "endpoint": "/api/mobile/attendance/teacher/mark-students"
      },
      {
        "key": "studentAttendance",
        "label": "Student Attendance",
        "endpoint": "/api/mobile/attendance/teacher/students"
      },
      {
        "key": "addHomework",
        "label": "Add Homework",
        "endpoint": "/api/mobile/homework"
      },
      {
        "key": "applyLeave",
        "label": "Apply Leave",
        "endpoint": "/api/mobile/leaves/staff/me/apply"
      }
    ],
    "todayTimetable": {
      "selectedDay": "Tue",
      "fullDay": "Tuesday",
      "total": 7,
      "slots": [
        {
          "_id": "TIMETABLE_ID",
          "subject": "Mathematics",
          "subjectCode": "MATH",
          "className": "Grade 1",
          "section": "A",
          "startTime": "09:00",
          "endTime": "09:30",
          "periodNumber": 1,
          "isNow": true
        }
      ],
      "hasMore": true,
      "moreCount": 3
    },
    "announcements": [
      {
        "_id": "EVENT_ID",
        "title": "Spring Break Schedule",
        "description": "The updated schedule for the upcoming spring break...",
        "location": "",
        "startAt": "2026-04-10T00:00:00.000Z",
        "endAt": "2026-04-20T00:00:00.000Z",
        "organizationFor": ["TEACHERS"],
        "status": "UPCOMING"
      }
    ]
  }
}
```

**Error (403):**
```json
{ "success": false, "message": "Only Teacher can access this endpoint" }
```

---

### 2.2 Profile (tap header avatar → profile screen)
**GET** `/api/mobile/profile`  
**Auth:** Required

**Response notes:**
- `entityType` is `student` for Student users.
- `entityType` is `parent` for Parent users.
- `entityType` is `staff` for Teacher/Staff users.
- Some fields like blood group/address/dateOfBirth for Teacher are returned empty because they are not stored in current staff schema.
- For Parent profile, backend returns available fields and `null` for missing values so frontend can render safely.

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
      "contactPhone": "+91 9229739229",
      "fatherPhone": "+91 9229739229",
      "motherPhone": "+91 9111111111"
    }
  }
}
```

**Success (200) – Teacher/Staff example:**
```json
{
  "success": true,
  "data": {
    "entityType": "staff",
    "header": {
      "displayName": "Ramesh Kumar",
      "subTitle": "teacher@school.com",
      "profilePhoto": "/uploads/staff_photo.png"
    },
    "academicDetails": {
      "school": "Crestwood Academy",
      "schoolCode": "SCH202423",
      "designation": "Teacher",
      "joiningDate": "2024-06-10",
      "staffId": "STAFF_ID"
    },
    "generalInformation": {
      "name": "Ramesh Kumar",
      "phone": "9999999999",
      "email": "teacher@school.com",
      "gender": "",
      "dateOfBirth": null,
      "status": "ACTIVE",
      "currentAddress": "",
      "permanentAddress": ""
    }
  }
}
```

**Success (200) – Parent example:**
```json
{
  "success": true,
  "data": {
    "entityType": "parent",
    "header": {
      "displayName": "Mrs. Sharma",
      "subTitle": "9999999999",
      "profilePhoto": "/uploads/student_photo.png"
    },
    "academicDetails": {
      "school": "Crestwood Academy",
      "className": "7",
      "section": "A",
      "rollNumber": "31",
      "admissionNumber": "ADM-102",
      "dateOfBirth": "2006-11-22"
    },
    "parentDetails": {
      "name": "Mrs. Sharma",
      "phone": "9999999999",
      "email": null,
      "relation": "Parent",
      "childName": "Ambika Sharma",
      "childAdmissionNumber": "ADM-102",
      "childClassName": "7",
      "childSection": "A",
      "childRollNumber": "31"
    },
    "emergencyContact": {
      "fatherPhone": "+91 9229739229",
      "motherPhone": "+91 9111111111"
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

### 5.3 Teacher – Get class/section list for attendance dropdown
Use this first when teacher opens Student Attendance screen and needs class picker options.

**GET** `/api/mobile/attendance/teacher/classes`  
**Auth:** Teacher token

**Success (200):**
```json
{
  "success": true,
  "data": [
    { "className": "1", "section": "A", "studentCount": 28 },
    { "className": "1", "section": "B", "studentCount": 31 }
  ]
}
```

---

### 5.4 Teacher – Get students list with attendance status by class/date
Teacher selects class/date and receives students with current status (`Present`, `Absent`, `Late`, or `null` for pending), plus top counters.

**GET** `/api/mobile/attendance/teacher/students?className=1&section=A&date=2026-03-13&filter=all&search=`  
**Auth:** Teacher token

- `filter`: `all` | `present` | `absent` | `late` | `pending`
- `search` (optional): name search text

**Success (200):**
```json
{
  "success": true,
  "data": {
    "className": "1",
    "section": "A",
    "date": "2026-03-13T00:00:00.000Z",
    "dateLabel": "13 MAR",
    "summary": { "present": 8, "absent": 1, "late": 1, "pending": 20, "total": 30 },
    "students": [
      {
        "_id": "STUDENT_ID",
        "name": "Aarav Sharma",
        "rollNumber": "101",
        "admissionNumber": "ADM1002",
        "className": "1",
        "section": "A",
        "status": "Present",
        "markedAt": "2026-03-13T03:15:00.000Z",
        "markedTime": "8:45 AM"
      }
    ]
  }
}
```

---

### 5.5 Teacher – Submit student attendance (single or bulk)
Teacher can mark one-by-one (single entry) or submit full list (bulk).

**POST** `/api/mobile/attendance/teacher/mark-students`  
**Content-Type:** `application/json`

**Bulk example:**
```json
{
  "date": "2025-11-17",
  "entries": [
    { "studentId": "STUDENT_ID_1", "status": "Present" },
    { "studentId": "STUDENT_ID_2", "status": "Absent" },
    { "studentId": "STUDENT_ID_3", "status": "Late" }
  ]
}
```

**Success (200):**
```json
{
  "success": true,
  "message": "Student attendance submitted successfully",
  "data": {
    "summary": { "present": 8, "absent": 1, "late": 1, "totalMarked": 10 },
    "records": [
      {
        "_id": "ATTENDANCE_ID",
        "studentId": "STUDENT_ID_1",
        "name": "Aarav Sharma",
        "rollNumber": "101",
        "className": "1",
        "section": "A",
        "status": "Present",
        "markedBy": "Ramesh Kumar"
      }
    ]
  }
}
```

---

### 5.6 Teacher – Mark self attendance (from dashboard icon)
This is the API for the exact mobile flow in your screenshot where teacher marks their own attendance.

**POST** `/api/mobile/attendance/teacher/self`  
**Auth:** Teacher token  
**Content-Type:** `application/json`

**Request (JSON):**
```json
{
  "date": "2026-03-13",
  "status": "Present"
}
```

- `status` supports: `Present`, `Absent`, `Late`
- `date` is optional; if not sent, server uses today
- Optional: `entryTime`, `exitTime`

**Success (200):**
```json
{
  "success": true,
  "message": "Attendance marked successfully",
  "data": {
    "_id": "ATTENDANCE_ID",
    "date": "2026-03-13T00:00:00.000Z",
    "status": "Present",
    "markType": "Late",
    "checkIn": "08:10",
    "checkOut": null
  }
}
```

---

### 5.7 Teacher – Self attendance month history (cards list)
Use this for the list screen with All / Present / Absent / Late tabs and summary counters.

**GET** `/api/mobile/attendance/teacher/self?month=11&year=2026&filter=all`  
**Auth:** Teacher token

- `filter`: `all` | `present` | `absent` | `late` (default `all`)

**Success (200):**
```json
{
  "success": true,
  "data": {
    "teacher": {
      "_id": "STAFF_ID",
      "name": "Ramesh Kumar",
      "designation": "Teacher"
    },
    "summary": {
      "present": 20,
      "absent": 2,
      "late": 1,
      "pending": 7,
      "totalMarked": 23
    },
    "days": [
      {
        "_id": "ATTENDANCE_ID",
        "date": "2026-11-17T00:00:00.000Z",
        "markType": "Present",
        "status": "Present",
        "checkIn": "08:10",
        "checkOut": "14:10"
      },
      {
        "_id": "ATTENDANCE_ID_2",
        "date": "2026-11-14T00:00:00.000Z",
        "markType": "Absent",
        "status": "Absent",
        "checkIn": null,
        "checkOut": null
      }
    ]
  }
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

### 6.2 Get timetable as course cards (week aggregate)
**GET** `/api/mobile/timetable/courses`  
**Auth:** Required  

Same role and filter rules as **6.1** (Student/Parent: own class/section; Teacher: own slots; Staff: optional `classId`, `sectionId`, `teacherId`). Uses **Monday–Saturday** only.  

If the school uses **period-based** `Timetable` rows for the week, those are used; otherwise **ClassTimetable** rows are used (same as the day endpoint). For **ClassTimetable**, optional `joinLink` on each row is exposed for a “Join class” button.

**Success (200):**
```json
{
  "success": true,
  "data": {
    "courses": [
      {
        "title": "Mathematics - Grade 7",
        "subtitle": "Section A",
        "subject": "Mathematics",
        "subjectCode": "MATH",
        "className": "Grade 7",
        "section": "A",
        "instructorName": "Ramesh Kumar",
        "scheduleSummary": "Mon, Wed, Fri - 9:00 AM",
        "days": ["Monday", "Wednesday", "Friday"],
        "shortDays": ["Mon", "Wed", "Fri"],
        "startTime": "09:00",
        "endTime": "10:00",
        "durationMinutes": 60,
        "durationLabel": "1 hour",
        "roomNumber": "R-12",
        "totalStudents": 32,
        "isLive": false,
        "nextClass": "Tomorrow at 9:00 AM",
        "nextClassAt": "2026-04-04T03:30:00.000Z",
        "joinLink": "https://meet.example.com/abc",
        "categoryColor": "#E3F2FD"
      }
    ]
  }
}
```

- **`isLive`:** `true` when server local time is on one of the course’s days and between `startTime` and `endTime`.
- **`nextClass` / `nextClassAt`:** Earliest upcoming occurrence in the next 14 days (or `null` if none).
- **`joinLink`:** From ClassTimetable only; `null` when using period-based Timetable unless you add links on the web side later.

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

Read-only APIs shaped for the student **Exams** list (tabs + cards) and **exam schedule** screen (per-subject rows).  
**Student / Parent:** exams are **scoped automatically** to the linked student’s class and section (same rules as homework/timetable).  
**Teacher / Staff:** exams for the user’s school; optional query filters apply.

Optional **`syllabusUrl`** on each exam (set from web when creating/updating an exam) powers **View syllabus**; if only **`instructions`** text is set, `hasSyllabus` is still `true` so the app can open an instructions screen.

**Status rules** (from schedule dates, date-only UTC):
- **UPCOMING** — first paper is after today  
- **ONGOING** — today falls on or between first and last paper dates  
- **COMPLETED** — last paper date is before today  

---

### 8.1 List exams (mobile cards + tab counts)

**GET** `/api/mobile/exams`  
**Auth:** Student / Parent / Teacher / Staff

#### Query parameters

| Param | Who | Description |
|--------|-----|-------------|
| `status` | All | `all` (default), `upcoming`, `ongoing`, `completed` — matches tabs **All / Upcoming / Ongoing / Completed** |
| `sessionId` | All | Optional — limit to one academic session |
| `classId` | Teacher / Staff only | Optional filter |
| `sectionId` | Teacher / Staff only | Optional filter |

**No request body.**

#### Success response (200)

```json
{
  "success": true,
  "summary": {
    "upcoming": 2,
    "ongoing": 1,
    "completed": 3
  },
  "data": [
    {
      "id": "EXAM_ID",
      "title": "Final Term Exam",
      "name": "Final Term Exam",
      "displayDate": "11-02-2026",
      "dateStart": "2026-02-10T00:00:00.000Z",
      "dateEnd": "2026-02-15T00:00:00.000Z",
      "status": "UPCOMING",
      "statusKey": "upcoming",
      "sessionId": "SESSION_ID",
      "sessionName": "2026-27",
      "classId": "CLASS_ID",
      "className": "Grade 7",
      "sectionId": "SECTION_ID",
      "sectionName": "A",
      "syllabusUrl": "https://school.example.org/syllabus/final-term.pdf",
      "hasSyllabus": true
    }
  ]
}
```

- **`summary`** counts are computed **before** applying `status` (but **after** session/class filters), so tab badges stay consistent with **All exams**.  
- **`displayDate`** is the **first** paper date (`DD-MM-YYYY`) for the card header.  
- **`title`** duplicates **`name`** for UI labels.  
- Show **View syllabus** when `hasSyllabus` is true: open `syllabusUrl` in a browser/WebView if present, otherwise use **`GET /api/mobile/exams/:examId`** and show `instructions`.

---

### 8.2 Get exam details (schedule screen — per subject)

**GET** `/api/mobile/exams/:examId`  
**Auth:** Student / Parent / Teacher / Staff

**No request body.**

#### Success response (200)

```json
{
  "success": true,
  "data": {
    "id": "EXAM_ID",
    "title": "Final Term Exam",
    "name": "Final Term Exam",
    "displayDate": "11-02-2026",
    "dateStart": "2026-02-11T00:00:00.000Z",
    "dateEnd": "2026-02-11T00:00:00.000Z",
    "status": "ONGOING",
    "statusKey": "ongoing",
    "sessionId": "SESSION_ID",
    "sessionName": "2026-27",
    "classId": "CLASS_ID",
    "className": "Grade 7",
    "sectionId": "SECTION_ID",
    "sectionName": "A",
    "instructions": "Reach 30 minutes early with admit card.",
    "syllabusUrl": "https://school.example.org/syllabus/final-term.pdf",
    "hasSyllabus": true,
    "subjects": [
      {
        "subjectId": "SUB_SCI",
        "subject_name": "Science",
        "subject_code": "SCI",
        "exam_type": "Theory",
        "total_marks": 100,
        "pass_marks": 35,
        "icon_identifier": "sci"
      }
    ],
    "schedule": [
      {
        "subjectId": "SUB_SCI",
        "subject_name": "Science",
        "subject_code": "SCI",
        "exam_type": "Theory",
        "total_marks": 100,
        "pass_marks": 35,
        "date": "11-02-2026",
        "examDate": "2026-02-11T00:00:00.000Z",
        "start_time": "10:00 AM",
        "end_time": "12:00 PM",
        "time_range": "10:00 AM - 12:00 PM",
        "icon_identifier": "sci"
      }
    ]
  }
}
```

- **`exam_type`** comes from the subject’s **`type`** in academics (e.g. `Theory`, `Practical`); if empty, API returns **`Theory`**.  
- **`total_marks`** / **`pass_marks`** on each schedule row are taken from the exam’s subject configuration.  
- **`icon_identifier`** is a stable slug from `subject_code` or `subject_name` for local asset mapping (e.g. flask vs math icons).  
- Times are exactly as stored on the exam (`startTime` / `endTime` strings).

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

---

## 9) MCQ Quizzes (Mobile – Student/Parent)

Mobile quiz APIs are read-only and per-play only – they **do not** store quiz attempts in DB (score is computed on the fly from questions).

### 9.1 Subject list screen (first quiz screen)
Use this for subject cards like Biology / Mathematics.

**GET** `/api/mobile/quiz/subjects`  
**Auth:** Student / Parent

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "subject": "Biology",
      "topicsAvailable": 4,
      "questionsCount": 32,
      "totalMarks": 32
    },
    {
      "subject": "Mathematics",
      "topicsAvailable": 3,
      "questionsCount": 24,
      "totalMarks": 24
    }
  ]
}
```

---

### 9.2 Topic list by subject (second screen)
When user clicks a subject, show topic list.  
Topic name comes from backend `quizTitle`. Description is optional and may be `null`.

**GET** `/api/mobile/quiz/topics?subject=Biology`  
**Auth:** Student / Parent

**Success (200):**
```json
{
  "success": true,
  "data": {
    "subject": "Biology",
    "class": "8",
    "topics": [
      {
        "quizTitle": "Cell Structure",
        "subject": "Biology",
        "class": "8",
        "questionCount": 12,
        "totalMarks": 12,
        "description": "Learn about the basics of cell life",
        "difficulty": "easy"
      },
      {
        "quizTitle": "Genetics",
        "subject": "Biology",
        "class": "8",
        "questionCount": 10,
        "totalMarks": 10,
        "description": null,
        "difficulty": "hard"
      }
    ]
  }
}
```

---

### 9.3 (Optional) List quizzes for logged-in student/parent
This old endpoint is still available and groups by quizTitle + subject.

**GET** `/api/mobile/quiz/quizzes`  
**Auth:** Student / Parent

Uses the linked student’s `schoolId` and `className` to discover available quizzes.

**Optional query params:**
- `subject` — filter by quiz subject (e.g. `"Mathematics"`)

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": {
        "quizTitle": "Class 8 Algebra Practice - Set 1",
        "subject": "Mathematics"
      },
      "quizTitle": "Class 8 Algebra Practice - Set 1",
      "subject": "Mathematics",
      "class": "Class 8",
      "questionCount": 15,
      "totalMarks": 15
    }
  ]
}
```

---

### 9.4 Get questions for a topic (play screen)

**GET** `/api/mobile/quiz/quizzes/questions?quizTitle=&subject=`  
**Auth:** Student / Parent

**Required query params:**
- `quizTitle` — quiz title exactly as created from web (e.g. `"Class 8 Algebra Practice - Set 1"`)
- `subject` — quiz subject (e.g. `"Mathematics"`)

**Success (200):**
```json
{
  "success": true,
  "data": {
    "quizTitle": "Class 8 Algebra Practice - Set 1",
    "subject": "Mathematics",
    "class": "Class 8",
    "totalQuestions": 15,
    "totalMarks": 15,
    "questions": [
      {
        "id": "QUESTION_ID",
        "questionText": "What is 2x + 3x?",
        "options": {
          "A": "3x",
          "B": "5x",
          "C": "6x",
          "D": "2x²"
        },
        "marks": 1
      }
    ]
  }
}
```

> **Note:** Correct answers are **not** returned on this endpoint – only options and marks per question to render the quiz UI.

---

### 9.5 Submit quiz answers (compute score + report/solutions)

**POST** `/api/mobile/quiz/quizzes/submit`  
**Auth:** Student / Parent  
**Content-Type:** `application/json`

**Request body:**
```json
{
  "quizTitle": "Class 8 Algebra Practice - Set 1",
  "subject": "Mathematics",
  "answers": [
    { "questionId": "QUESTION_ID_1", "selectedOption": "B" },
    { "questionId": "QUESTION_ID_2", "selectedOption": "C" }
  ]
}
```

- `selectedOption` must be one of `"A"`, `"B"`, `"C"`, `"D"` (case-insensitive).  
- Any question without a matching entry in `answers` is treated as **not attempted**.

**Success (200):**
```json
{
  "success": true,
  "data": {
    "quizTitle": "Class 8 Algebra Practice - Set 1",
    "subject": "Mathematics",
    "class": "Class 8",
    "totalQuestions": 15,
    "totalMarks": 15,
    "obtainedMarks": 13,
    "percentage": 87,
    "details": [
      {
        "questionId": "QUESTION_ID_1",
        "isCorrect": true,
        "correctOption": "B",
        "selectedOption": "B",
        "marks": 1,
        "earnedMarks": 1
      },
      {
        "questionId": "QUESTION_ID_2",
        "isCorrect": false,
        "correctOption": "C",
        "selectedOption": "B",
        "marks": 1,
        "earnedMarks": 0
      }
    ]
  }
}
```

---

## 10) Gallery (Web + Mobile)

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
**GET** `/api/mobile/gallery`  
optional `?mediaType=VIDEO&search=annual`
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
- **Dashboard list + summary (teacher UI flow)**: `GET /api/mobile/leaves/staff/me/dashboard`
- **Single leave details (popup)**: `GET /api/mobile/leaves/staff/me/:id`
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

**Teacher UI apply request (mobile form):**
```json
{
  "leaveType": "Casual Leave",
  "leaveFrom": "2026-03-13",
  "leaveTo": "2026-03-14",
  "reason": "Family function",
  "emergencyContactName": "Rahul Sharma",
  "emergencyContactPhone": "+91 9876543210"
}
```

**Teacher UI apply success:**
```json
{
  "success": true,
  "message": "Leave application submitted successfully",
  "data": {
    "_id": "LEAVE_ID",
    "leaveType": "Casual Leave",
    "durationDays": 2,
    "status": "Pending Approval",
    "leaveFrom": "2026-03-13T00:00:00.000Z",
    "leaveTo": "2026-03-14T00:00:00.000Z"
  }
}
```

**Teacher dashboard list response (summary + cards):**
```json
{
  "success": true,
  "data": {
    "leaveBalance": { "casualLeave": null, "sickLeave": null },
    "summary": {
      "totalApplied": 8,
      "daysTaken": 8,
      "approved": 5,
      "pending": 2,
      "rejected": 1
    },
    "items": [
      {
        "_id": "LEAVE_ID",
        "leaveType": "Sick Leave",
        "status": "approved",
        "statusLabel": "Approved",
        "appliedDate": "2026-04-08T00:00:00.000Z",
        "leaveFrom": "2026-04-10T00:00:00.000Z",
        "leaveTo": "2026-04-12T00:00:00.000Z",
        "durationDays": 3,
        "reason": "Suffering from viral fever",
        "approvedByName": "Dr. Sharma",
        "approvedAt": "2026-04-09T00:00:00.000Z"
      }
    ]
  }
}
```

**Teacher popup leave details response:**
```json
{
  "success": true,
  "data": {
    "_id": "LEAVE_ID",
    "applicationId": "#ABC123",
    "leaveType": "Sick Leave",
    "status": "approved",
    "statusLabel": "Approved",
    "appliedOn": "2026-04-08T00:00:00.000Z",
    "leaveFrom": "2026-04-10T00:00:00.000Z",
    "leaveTo": "2026-04-12T00:00:00.000Z",
    "durationDays": 3,
    "reason": "Suffering from viral fever",
    "contactInformation": {
      "contactNumber": "+91 9876543210",
      "emergencyContact": "+91 9876543210",
      "emergencyContactName": "Rahul Sharma"
    },
    "approval": {
      "approved": true,
      "approvedBy": "Dr. Sharma",
      "approvedAt": "2026-04-09T00:00:00.000Z"
    }
  }
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

---

## 11) Homework (Mobile)

Uses the same `Homework` collection as the web panel. **Submissions** are stored in `HomeworkSubmission` (one row per student per homework).  
**Roles:** Student / Parent (list, detail, submit), **Teacher** (list own assignments, create, update, delete). **Staff** is not supported on these routes (403).

Attachment types for assign/submit match study materials: PDF, Word, and common images. **Max upload size per file: 10 MB** (`uploadStudyMaterials` limit).

Homework may include optional **`topic`** (e.g. chapter label: “Division”) and **`maxScore`** (points, e.g. `100`) for student detail headers. Set these from web or mobile teacher APIs; if omitted, `topic` is `""` and `maxScore` is `null`.

### 10.1 List homework — Student / Parent
**GET** `/api/mobile/homework?subjectId=&filter=`
**Auth:** Student or Parent

**Query:**
- `subjectId` (optional) — filter by subject (same as subject chips on “All Homework”)
- `subject` (optional) — filter by subject name (e.g. `Mathematics`) for mobile chips
- `filter` (optional) — `pending` (not due yet, not submitted), `overdue` (past `dueDate`, not submitted), `submitted` or `completed` (has submission), or omit for all

**Success (200):**
- **`summary`** — counts for the top dashboard cards (computed **before** applying `filter`, but **after** `subjectId` so chips match the list scope): `pending`, `overdue`, `completed`
- **`data`** — list items for the screen

Each item includes:
- **`status`**: `PENDING` | `OVERDUE` | `SUBMITTED` (badge)
- **`statusLabel`**: `"Pending"` | `"Overdue"` | `"Submitted"`
- **`subjectName`**, **`subjectCode`** — flattened from `subjectId`
- **`topic`**, **`maxScore`** — optional metadata for titles / detail
- **`previewImageUrl`** — first teacher attachment that is an image (JPG/PNG/WebP), for card thumbnails; `null` if none
- **`resourceCount`** — number of teacher resources (files + optional link)
- `hasSubmission`, `isOverdue`, `submission` (raw file paths on list), populated `classId` / `sectionId` / `subjectId`

```json
{
  "success": true,
  "summary": { "pending": 3, "overdue": 1, "completed": 1 },
  "data": [
    {
      "_id": "HOMEWORK_ID",
      "title": "Math Chapter 5 Exercises",
      "description": "Complete exercises 1–20…",
      "topic": "Division",
      "maxScore": 100,
      "date": "2026-03-28T00:00:00.000Z",
      "dueDate": "2026-04-02T23:59:00.000Z",
      "url": "",
      "files": ["/uploads/123-notes.pdf"],
      "downloadable": true,
      "classId": { "_id": "CLASS_ID", "name": "Grade 7" },
      "sectionId": { "_id": "SECTION_ID", "name": "A" },
      "subjectId": { "_id": "SUBJECT_ID", "name": "Mathematics", "code": "MATH" },
      "subjectName": "Mathematics",
      "subjectCode": "MATH",
      "createdBy": { "_id": "USER_ID", "name": "Teacher Name" },
      "status": "PENDING",
      "statusLabel": "Pending",
      "hasSubmission": false,
      "isOverdue": false,
      "previewImageUrl": "/uploads/123-ref.jpg",
      "resourceCount": 2,
      "submission": null
    }
  ]
}
```

### 10.1.1 List homework subjects for chip tabs
**GET** `/api/mobile/homework/subjects`  
**Auth:** Student or Parent

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "subjectId": "SUBJECT_ID",
      "subjectName": "Mathematics",
      "subjectCode": "MATH",
      "totalHomework": 7
    }
  ]
}
```

### 10.2 List homework — Teacher (assignments I created)
**GET** `/api/mobile/homework?classId=&sectionId=&subjectId=&search=&status=`  
**Auth:** Teacher

Optional filters:
- `classId`, `sectionId`, `subjectId` (ObjectId)
- `search` (by title text)
- `status` = `ACTIVE` | `COMPLETED` | `OVERDUE`

**Success (200):**
```json
{
  "success": true,
  "summary": { "active": 4, "completed": 1, "overdue": 1 },
  "data": [
    {
      "_id": "HOMEWORK_ID",
      "title": "Chapter 5: Multiplication Tables",
      "description": "Complete exercises 5.1 to 5.5 from textbook",
      "subjectName": "Mathematics",
      "subjectCode": "MATH",
      "className": "Grade 1",
      "section": "A",
      "assignedDate": "2026-03-05T00:00:00.000Z",
      "dueDate": "2026-04-10T00:00:00.000Z",
      "status": "ACTIVE",
      "statusLabel": "Active",
      "submissionStats": { "submitted": 18, "totalStudents": 30, "percentage": 60 },
      "attachmentsCount": 2
    }
  ]
}
```

### 10.3 Homework detail
**GET** `/api/mobile/homework/:id`  
**Auth:** Student / Parent (must be in that class/section) or Teacher (must be creator)

**Student / Parent** — detail screen payload:
- Same meta as list: `title`, `description`, `dueDate`, `status` / `statusLabel`, `topic`, `maxScore`, `subjectName` / `subjectCode`, etc.
- **`resources`**: teacher attachments for “Resources” list — each item has `type` (`file` | `link`), `url` (path or external link), `fileName`, `mimeType`, `kind` (`pdf` | `image` | `document` | `link` | `other`), `extension`, `sizeBytes` (from disk when available, else `null`), `downloadable`
- **`submission`**: if present, `files` is the same enriched shape as `resources` (for “Your submission” previews)

Use `dueDate` on the client for “Due date” + “Due time” (ISO string). If `maxScore` is `null`, hide or show “—” for points.

**Teacher** — popup-friendly detail payload:
```json
{
  "success": true,
  "data": {
    "_id": "HOMEWORK_ID",
    "subjectName": "Mathematics",
    "className": "Grade 1",
    "section": "A",
    "title": "Chapter 5: Multiplication Tables",
    "description": "Complete exercises 5.1 to 5.5 from textbook",
    "assignedDate": "2026-04-03T00:00:00.000Z",
    "dueDate": "2026-04-10T00:00:00.000Z",
    "submissionStatus": { "submitted": 18, "totalStudents": 30, "percentage": 60 },
    "attachedDocuments": [
      {
        "id": "/uploads/hw1.pdf",
        "type": "file",
        "url": "/uploads/hw1.pdf",
        "fileName": "hw1.pdf",
        "mimeType": "application/pdf",
        "kind": "pdf",
        "sizeBytes": 2516582
      }
    ]
  }
}
```

### 10.4 Teacher — Assign homework
**POST** `/api/mobile/homework`  
**Auth:** Teacher  
**Content-Type:** `multipart/form-data`

**Form fields** (same as web `POST /api/homework`):
- `classId`, `sectionId`, `subjectId`, `title`, `dueDate` (required)
- `topic`, `maxScore` (optional)
- `description`, `date`, `url` (optional)
- `downloadable`, `sendSmsToStudents`, `sendSmsToParents` (optional booleans as strings)
- `files` — optional, multiple files (field name **`files`**)

### 10.5 Teacher — Update / delete
- **PUT** `/api/mobile/homework/:id` — `multipart/form-data`; new files append to `files` (same as web). Only the teacher who created the homework may edit.
- **DELETE** `/api/mobile/homework/:id` — deletes the homework and all submissions for it.

### 10.6 Student / Parent — Submit homework
**POST** `/api/mobile/homework/:id/submit`
**Auth:** Student or Parent (child’s student record)  
**Content-Type:** `multipart/form-data`

**Form fields:**
- `note` — optional text
- `files` — optional multiple uploads

At least one of **note** (non-empty) or **files** is required on first submit. Updating only `note` keeps existing uploaded files; uploading new **files** replaces the file list for that submission.

**Success (201):**
```json
{
  "success": true,
  "data": {
    "_id": "SUBMISSION_ID",
    "homeworkId": "HOMEWORK_ID",
    "note": "Completed in notebook, photos attached",
    "files": ["/uploads/1712345678-work.jpg"],
    "submittedAt": "2026-03-29T12:00:00.000Z",
    "updatedAt": "2026-03-29T12:00:00.000Z"
  }
}
```

**Base URL for files:** prepend your API host to paths like `/uploads/...` (same as other modules).

### 10.7 Student / Parent — Ask teacher a question (from homework detail)
**POST** `/api/mobile/homework/:id/questions`  
**Auth:** Student or Parent  
**Content-Type:** `application/json`

**Request body:**
```json
{
  "question": "Ma'am, should we solve only Exercise 5.1 and 5.2 or all?"
}
```

**Success (201):**
```json
{
  "success": true,
  "message": "Question sent to teacher",
  "data": {
    "_id": "QUESTION_ID",
    "homeworkId": "HOMEWORK_ID",
    "question": "Ma'am, should we solve only Exercise 5.1 and 5.2 or all?",
    "status": "OPEN",
    "createdAt": "2026-04-09T13:15:00.000Z"
  }
}
```

