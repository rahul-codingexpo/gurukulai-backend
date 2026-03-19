# Accounting Module — Backend Design

This document outlines the backend architecture required to power the Accounting section UI (Dashboard, Fee Types, Fee Invoices).

---

## Complete Flow Diagram

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    ACCOUNTING MODULE — COMPLETE FLOW                    ║
╚══════════════════════════════════════════════════════════════════════════╝


═══════════════════════════════════════════
  PHASE 1: ONE-TIME SETUP (by Admin/Principal)
═══════════════════════════════════════════

  Admin logs in
      │
      ▼
  Opens Accounting → Fee Types
      │
      ▼
  Creates fee categories for the school:
      │
      ├── Tuition Fee    → ₹15,000/month
      ├── Transport Fee  → ₹3,500/month
      ├── Lab Fee        → ₹8,000/year
      ├── Library Fee    → ₹2,000/year
      └── Sports Fee     → ₹5,000/year
      │
      ▼
  ✅ Fee Types saved in DB (scoped to this school)
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄


═══════════════════════════════════════════
  PHASE 2: GENERATE INVOICES (by Accountant — monthly/yearly)
═══════════════════════════════════════════

  Accountant logs in
      │
      ▼
  Opens Accounting → Fee Invoices → "Create Invoice"
      │
      ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  WHERE DO STUDENT NAMES COME FROM?                          │
  │                                                             │
  │  Students are ALREADY in the database.                      │
  │  They were added via Student → Admission page.              │
  │  The existing API: GET /api/students?schoolId=xxx           │
  │  returns all students for this school.                      │
  │                                                             │
  │  The UI shows a searchable dropdown/autocomplete:           │
  │                                                             │
  │   ┌────────────────────────────────────────┐                │
  │   │ 🔍 Search student...  │ Class: 10-A ▼ │                │
  │   ├────────────────────────────────────────┤                │
  │   │  Aarav Sharma    | 10-A | Roll: 101   │                │
  │   │  Arjun Nair      | 10-A | Roll: 102   │                │
  │   │  Priya Patel     | 10-A | Roll: 103   │                │
  │   │  Rohan Gupta     | 10-A | Roll: 104   │                │
  │   │  ...                                   │                │
  │   └────────────────────────────────────────┘                │
  │                                                             │
  │  HOW IT WORKS (API calls):                                  │
  │                                                             │
  │  1. Page loads → fetch GET /api/fee-types (dropdown)        │
  │  2. Accountant picks a Class → fetch GET /api/students      │
  │     with ?schoolId=xxx&className=10-A                       │
  │  3. Student list populates the dropdown                     │
  │  4. Accountant types "Aar..." → autocomplete filters        │
  │     to "Aarav Sharma"                                       │
  │  5. Accountant selects student + fee type + due date        │
  │  6. Submit → POST /api/fee-invoices                         │
  │                                                             │
  │  The student data flow:                                     │
  │                                                             │
  │  Admission Page ──saves──▶ Student DB ──fetches──▶ Invoice  │
  │  (already done)           (already exists)        (new)     │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘
      │
      ├── OPTION A: Single Invoice
      │     Select student → Select fee type → Set due date
      │     → Creates 1 invoice (e.g. INV-2026-042)
      │
      └── OPTION B: Bulk Invoice (common use case)
            Select class (e.g. "10-A") → system fetches ALL
            students in that class from GET /api/students
            → Select fee type (e.g. "Tuition Fee")
            → Set due date (e.g. 15 Mar 2026)
            → System auto-creates invoices for ALL students in 10-A
            → 45 students = 45 invoices generated at once
      │
      ▼
  ✅ Invoices created with status = "Pending"
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄


═══════════════════════════════════════════
  PHASE 3: REAL WORLD — PARENT PAYS AT SCHOOL
═══════════════════════════════════════════

  ┌─────────────────────────────────────────────┐
  │  THIS HAPPENS OUTSIDE THE SYSTEM            │
  │                                             │
  │  Parent visits school office                │
  │      │                                      │
  │      ├── Pays ₹15,000 Cash                  │
  │      │   OR                                 │
  │      ├── Gives a Cheque                     │
  │      │   OR                                 │
  │      ├── Shows UPI payment screenshot       │
  │      │   OR                                 │
  │      └── Bank transfer (shows receipt)      │
  │                                             │
  │  School staff collects the money/cheque     │
  └─────────────────────────────────────────────┘
      │
      ▼
  Now the accountant needs to RECORD this in the system...
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄


═══════════════════════════════════════════
  PHASE 4: RECORD PAYMENT (by Accountant — the KEY step)
═══════════════════════════════════════════

  Accountant opens Fee Invoices page
      │
      ▼
  Searches for the student's invoice:
      │
      │   ┌──────────────────────────────────────────┐
      │   │ 🔍 Search by student name, invoice ID... │
      │   └──────────────────────────────────────────┘
      │
      │   This searches the INVOICES table (not students).
      │   GET /api/fee-invoices?search=Aarav&status=Pending
      │
      │   Each invoice already has the student's name,
      │   class, and roll number stored (populated from
      │   the Student model via studentId reference).
      │
      │   So the accountant types "Aarav" → sees:
      │   ┌────────────────────────────────────────────────┐
      │   │ INV-2026-042 | Aarav Sharma | 10-A | ₹15,000  │
      │   │ Status: Pending | Due: 15 Mar 2026             │
      │   └────────────────────────────────────────────────┘
      │
      ▼
  Finds the pending invoice → Clicks "Record Payment"
      │
      ▼
  Fills the payment form:
      │
      │   ┌──────────────────────────────────────┐
      │   │  Amount:      ₹15,000                │
      │   │  Method:      Cash  ▼                 │
      │   │  Receipt No:  RB-456                  │
      │   │  Date:        18 Mar 2026             │
      │   │  Remarks:     Paid by father          │
      │   │                                       │
      │   │        [ Cancel ]  [ Save Payment ]   │
      │   └──────────────────────────────────────┘
      │
      ▼
  System does (automatically):
      │
      ├── 1. Creates Payment record in DB
      │       → amount, method, receipt no., who recorded it
      │
      ├── 2. Updates the Invoice
      │       → invoice.paid += ₹15,000
      │       → if (paid >= amount) → status = "Paid" ✅
      │       → if (paid < amount)  → status = "Partial" ⏳
      │
      └── 3. Dashboard stats refresh
              → Total collected goes up
              → Pending count goes down
      │
      ▼
  ✅ Payment recorded. Invoice marked Paid.
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄


═══════════════════════════════════════════
  PHASE 4B: PARTIAL PAYMENT (alternate flow)
═══════════════════════════════════════════

  Invoice = ₹15,000 (Tuition Fee)
      │
      ▼
  Parent pays ₹5,000 today (can't afford full amount)
      │
      ▼
  Accountant records: ₹5,000 Cash
      │
      ▼
  System updates:
      │   paid = ₹5,000 / ₹15,000
      │   status = "Partial" ⏳
      │   balance = ₹10,000 remaining
      │
      ▼
  ... 2 weeks later, parent pays remaining ₹10,000 ...
      │
      ▼
  Accountant records: ₹10,000 Cash
      │
      ▼
  System updates:
      │   paid = ₹15,000 / ₹15,000
      │   status = "Paid" ✅
      │   paidDate = today
      │
      ▼
  ✅ Both payments are linked to the same invoice
     (full payment history preserved)
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄


═══════════════════════════════════════════
  PHASE 5: PRINT RECEIPT (by Accountant)
═══════════════════════════════════════════

  After recording payment
      │
      ▼
  Accountant clicks "Print Receipt"
      │
      ▼
  System generates a printable receipt:
      │
      │   ┌──────────────────────────────────────┐
      │   │       GURUKUL GLOBAL SCHOOL           │
      │   │         FEE RECEIPT                   │
      │   │                                       │
      │   │  Receipt No:   RB-456                 │
      │   │  Date:         18 Mar 2026            │
      │   │  Student:      Aarav Sharma (10-A)    │
      │   │  Fee Type:     Tuition Fee            │
      │   │  Amount Paid:  ₹15,000                │
      │   │  Method:       Cash                   │
      │   │  Balance:      ₹0                     │
      │   │                                       │
      │   │  Received by:  Mr. Rajesh (Accountant)│
      │   └──────────────────────────────────────┘
      │
      ▼
  Receipt given to parent as proof of payment
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄


═══════════════════════════════════════════
  PHASE 6: OVERDUE DETECTION (automatic)
═══════════════════════════════════════════

  Every day (or on each page load):
      │
      ▼
  System checks all invoices where:
      │   status = "Pending"  AND  dueDate < today
      │
      ▼
  Auto-marks them as "Overdue" 🔴
      │
      ▼
  Dashboard shows:
      │   "14 overdue invoices — ₹1,56,200 outstanding"
      │
      ▼
  Admin/Accountant can filter → see exactly which
  students haven't paid → follow up with parents
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄


═══════════════════════════════════════════
  PHASE 7: DASHBOARD & REPORTS (by Admin/Principal)
═══════════════════════════════════════════

  Admin opens Accounting → Dashboard
      │
      ▼
  Sees at a glance:
      │
      ├── 💰 Total Revenue:       ₹12,45,800
      ├── 📈 Collected This Month: ₹3,24,500
      ├── ⏳ Pending Fees:         ₹4,82,300 (32 students)
      ├── 🔴 Overdue Amount:       ₹1,56,200 (14 invoices)
      │
      ├── Monthly Collection Chart (Apr → Mar)
      │     → Which months met collection target
      │     → Which months fell short
      │
      ├── Fee Distribution Breakdown
      │     → 55% Tuition, 20% Transport, 12% Lab, etc.
      │
      └── Recent Invoices Table
            → Latest 6 invoices with status
            → Quick link to view all invoices


═══════════════════════════════════════════
  SUMMARY: WHO DOES WHAT
═══════════════════════════════════════════

  ┌───────────────┬──────────────────────────────────────────────┐
  │ Admin/        │ • Create fee types (one-time setup)          │
  │ Principal     │ • View dashboard & reports                   │
  │               │ • Delete fee types / cancel invoices         │
  │               │ • Full oversight of all accounting data      │
  ├───────────────┼──────────────────────────────────────────────┤
  │ Accountant    │ • Generate invoices (single + bulk)          │
  │               │ • Record offline payments (cash/cheque)      │
  │               │ • Print receipts for parents                 │
  │               │ • View dashboard & track pending/overdue     │
  │               │ • Day-to-day fee collection operations       │
  ├───────────────┼──────────────────────────────────────────────┤
  │ SuperAdmin    │ • View-only dashboard across all schools     │
  │               │ • Cannot modify any accounting data          │
  ├───────────────┼──────────────────────────────────────────────┤
  │ Teacher       │ • NO access to accounting                    │
  ├───────────────┼──────────────────────────────────────────────┤
  │ Student /     │ • NO access to accounting                    │
  │ Parent        │ • (Future: read-only "My Fees" view)         │
  └───────────────┴──────────────────────────────────────────────┘
```

---

## Where Does The Data Come From?

The accounting module does NOT store student names, class names, or school data itself. It **references existing data** from other modules that are already built:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA DEPENDENCY CHAIN                         │
│                                                                 │
│   ALREADY EXISTS (built)          NEW (accounting module)       │
│   ─────────────────────           ──────────────────────        │
│                                                                 │
│   School Module                                                 │
│   └── School (_id, name)  ◄────── schoolId on every record     │
│                                                                 │
│   Student Module                                                │
│   └── Student (_id, name,  ◄───── studentId on Invoice/Payment │
│       className, section,         (student name shows from here)│
│       rollNumber, phone,                                        │
│       admissionNumber)                                          │
│                                                                 │
│   Auth Module                                                   │
│   └── User (_id, name,    ◄───── receivedBy on Payment         │
│       roleId)                     (tracks which staff recorded) │
│                                                                 │
│                              ┌── FeeType (name, amount, period) │
│                              │                                  │
│              NEW ──────────▶ ├── FeeInvoice (links student +    │
│                              │     fee type + amount + status)  │
│                              │                                  │
│                              └── Payment (links invoice +       │
│                                    amount + method + receipt)   │
└─────────────────────────────────────────────────────────────────┘
```

### API calls the frontend makes to show student data:

| When                           | What frontend calls                                   | What it gets                     |
|--------------------------------|-------------------------------------------------------|----------------------------------|
| Creating a single invoice      | `GET /api/students?schoolId=xxx&className=10-A`       | List of students (name, roll, class) to pick from |
| Creating bulk invoices         | `GET /api/students?schoolId=xxx&className=10-A`       | All students in that class       |
| Viewing invoice list           | `GET /api/fee-invoices?schoolId=xxx`                  | Invoices with student name populated (via Mongoose `.populate("studentId", "name className rollNumber")`) |
| Searching invoices             | `GET /api/fee-invoices?search=Aarav`                  | Server searches student name inside the populated field |
| Viewing payment history        | `GET /api/payments/invoice/:id`                       | Payments with `receivedBy` populated (staff name) |

### How Mongoose `.populate()` works here:

When the server fetches invoices, it does:
```js
const invoices = await FeeInvoice.find({ schoolId })
  .populate("studentId", "name className section rollNumber phone")
  .populate("feeTypeId", "name code amount period");
```

This means the API response includes the full student name and class info **without storing it** in the invoice itself:
```json
{
  "invoiceNumber": "INV-2026-042",
  "studentId": {
    "_id": "665a...",
    "name": "Aarav Sharma",
    "className": "10",
    "section": "A",
    "rollNumber": "101"
  },
  "feeTypeId": {
    "_id": "665b...",
    "name": "Tuition Fee",
    "code": "TF"
  },
  "amount": 15000,
  "paid": 0,
  "status": "Pending"
}
```

So the accountant sees "Aarav Sharma — 10-A — ₹15,000 — Pending" in the UI, but the database only stores the student's `_id` reference.

---

## Who Uses This & How Payments Work

### Target Users (Who operates these APIs)

This module is **NOT for students or parents**. It is an **internal school administration tool** used by:

| Role            | What they can do                                                     |
|-----------------|----------------------------------------------------------------------|
| **Admin**       | Full access — create fee types, generate invoices, record payments, delete records |
| **Principal**   | Full access — same as Admin                                          |
| **Accountant**  | Day-to-day operations — create invoices, record payments, view reports. Cannot delete fee types. |
| **SuperAdmin**  | Read-only dashboard view across schools. Cannot modify data directly. |

**Students, Parents, and Teachers have NO access** to accounting APIs. They don't see this section at all.

### The Real-World Payment Flow

Since your school collects fees **offline (cash, cheque, bank transfer)** — not through the website — the system works as a **digital register/ledger**, not a payment gateway.

Here's how it works in practice:

```
Step 1: SETUP (one-time)
   Admin/Principal defines Fee Types (Tuition, Transport, Lab, etc.)
        ↓
Step 2: GENERATE INVOICES (monthly/yearly)
   Accountant generates invoices for students
   (bulk: "Create Tuition Fee invoice for all Class 10 students")
        ↓
Step 3: PARENT PAYS OFFLINE
   Parent comes to school office → pays Cash / gives Cheque
   (This happens OUTSIDE the system — in real life)
        ↓
Step 4: RECORD PAYMENT (the key step)
   Accountant opens the student's invoice on the dashboard
   → Clicks "Record Payment"
   → Fills in: Amount, Method (Cash/Cheque), Cheque No. / Receipt No.
   → System auto-updates invoice status (Paid / Partial)
        ↓
Step 5: PRINT RECEIPT
   Accountant prints a fee receipt for the parent as proof
        ↓
Step 6: TRACK & REPORT
   Admin/Principal views Dashboard → sees who paid, who hasn't, overdue list
```

### Why This Approach is Best

1. **No online payment integration needed** — saves complexity, no payment gateway fees
2. **Works exactly like the school already operates** — cash/cheque at the counter
3. **Digital record of every transaction** — who paid, how much, when, method, collected by whom
4. **Receipt generation** — printable receipts replace handwritten ones
5. **Overdue tracking** — instantly see which students haven't paid instead of checking registers manually
6. **Reports for management** — monthly collection, pending amounts, fee-wise breakdowns

### Payment Recording — Detailed Flow

When the accountant records an offline payment, the system does this:

```
Accountant submits: { invoiceId, amount: 5000, method: "Cash" }
        ↓
Server creates a Payment record (with timestamp + who recorded it)
        ↓
Server updates the Invoice:
   invoice.paid += 5000
   if (paid >= amount)  → status = "Paid", set paidDate
   if (paid > 0 but < amount) → status = "Partial"
        ↓
Dashboard stats auto-update (total collected, pending, etc.)
```

**Partial payments are supported.** If a parent pays ₹5,000 of a ₹15,000 invoice today and the rest next month, both transactions are recorded separately and linked to the same invoice.

### Payment Methods Supported

| Method            | What to record in `transactionId` field        |
|-------------------|-------------------------------------------------|
| **Cash**          | Receipt book number (e.g. "RB-456")            |
| **Cheque**        | Cheque number (e.g. "CHQ-789012")              |
| **Bank Transfer** | UTR / reference number                          |
| **UPI**           | UPI transaction ID (if parent shows screenshot) |

The `receivedBy` field automatically captures which staff member (logged-in user) recorded the payment — useful for accountability.

### What Students/Parents See (Future Scope)

Currently, students/parents have **no access** to accounting. In the future, you could add:
- A read-only "My Fees" tab in the student/parent portal showing their invoices and payment history
- This would use a separate API like `GET /api/fee-invoices/my` scoped to `req.user.studentId`
- **But this is NOT part of the current design** — keep it simple for now

---

## Database Models

### 1. FeeType (`feeType.model.js`)

Stores the fee categories a school defines (e.g. Tuition, Transport, Lab).

| Field            | Type       | Required | Notes                                              |
|------------------|------------|----------|----------------------------------------------------|
| `name`           | String     | Yes      | e.g. "Tuition Fee"                                 |
| `code`           | String     | Yes      | Short unique code, e.g. "TF". Unique per school.   |
| `amount`         | Number     | Yes      | Default amount in ₹                                |
| `period`         | String     | Yes      | Enum: `Monthly`, `Quarterly`, `Half-Yearly`, `Yearly`, `One-Time` |
| `description`    | String     | No       | Brief description of the fee                       |
| `icon`           | String     | No       | Icon key for frontend (`school`, `bus`, `lab`, etc.) |
| `status`         | String     | Yes      | Enum: `Active`, `Inactive`. Default: `Active`      |
| `schoolId`       | ObjectId   | Yes      | Ref → `School`. Scopes data per school.            |
| `createdAt`      | Date       | Auto     | Mongoose timestamps                                |
| `updatedAt`      | Date       | Auto     | Mongoose timestamps                                |

**Indexes:**
- `{ code: 1, schoolId: 1 }` — unique compound (no duplicate codes within a school)

---

### 2. FeeInvoice (`feeInvoice.model.js`)

An invoice issued to a student for a specific fee.

| Field            | Type       | Required | Notes                                              |
|------------------|------------|----------|----------------------------------------------------|
| `invoiceNumber`  | String     | Yes      | Auto-generated, e.g. "INV-2026-001". Unique per school. |
| `studentId`      | ObjectId   | Yes      | Ref → `Student`                                    |
| `feeTypeId`      | ObjectId   | Yes      | Ref → `FeeType`                                    |
| `amount`         | Number     | Yes      | Total invoice amount in ₹                          |
| `paid`           | Number     | Yes      | Amount paid so far. Default: `0`                   |
| `status`         | String     | Yes      | Enum: `Paid`, `Pending`, `Overdue`, `Partial`, `Cancelled`. Default: `Pending` |
| `dueDate`        | Date       | Yes      | Payment deadline                                   |
| `paidDate`       | Date       | No       | Date when fully paid (set automatically)           |
| `period`         | String     | No       | e.g. "March 2026" or "2025-26"                     |
| `remarks`        | String     | No       | Optional notes                                     |
| `schoolId`       | ObjectId   | Yes      | Ref → `School`                                     |
| `createdAt`      | Date       | Auto     | Mongoose timestamps                                |
| `updatedAt`      | Date       | Auto     | Mongoose timestamps                                |

**Indexes:**
- `{ invoiceNumber: 1, schoolId: 1 }` — unique compound
- `{ studentId: 1, schoolId: 1 }` — for student-scoped queries
- `{ status: 1, schoolId: 1 }` — for filtered listing

**Auto-status logic (pre-save hook):**
- If `paid >= amount` → status = `Paid`, set `paidDate`
- If `paid > 0 && paid < amount` → status = `Partial`
- If `paid === 0 && dueDate < today` → status = `Overdue`

---

### 3. Payment (`payment.model.js`)

Each row = one offline payment recorded by school staff. This is NOT an online transaction — it's a manual entry when a parent pays at the school counter.

| Field            | Type       | Required | Notes                                              |
|------------------|------------|----------|----------------------------------------------------|
| `invoiceId`      | ObjectId   | Yes      | Ref → `FeeInvoice`                                 |
| `studentId`      | ObjectId   | Yes      | Ref → `Student`                                    |
| `amount`         | Number     | Yes      | Amount received in this transaction (₹)            |
| `method`         | String     | Yes      | Enum: `Cash`, `Cheque`, `Bank Transfer`, `UPI`. **No "Online" — all offline.** |
| `receiptNumber`  | String     | No       | School's receipt book number, e.g. "RB-456"        |
| `chequeNumber`   | String     | No       | Only if method = `Cheque`                          |
| `bankRef`        | String     | No       | UTR/reference for bank transfer or UPI             |
| `paymentDate`    | Date       | Yes      | Actual date parent paid (may differ from entry date) |
| `receivedBy`     | ObjectId   | Yes      | Ref → `User`. Auto-set from `req.user._id` — tracks who entered this record. |
| `remarks`        | String     | No       | Optional notes (e.g. "Father paid", "Cheque post-dated") |
| `schoolId`       | ObjectId   | Yes      | Ref → `School`                                     |
| `createdAt`      | Date       | Auto     | When the entry was made in the system              |

---

## API Endpoints — Complete Request / Response Reference

All endpoints are prefixed with `/api` and require `protect` middleware (JWT auth).

**Standard response format used across the entire codebase:**
```js
// SUCCESS
{ "success": true, "data": { ... } }

// ERROR
{ "success": false, "message": "Something went wrong" }
```

---

### Fee Types — `/api/fee-types`

| Method   | Path              | Auth Roles                        | Description                |
|----------|-------------------|-----------------------------------|----------------------------|
| `POST`   | `/`               | Admin, Principal, Accountant      | Create a new fee type      |
| `GET`    | `/`               | Admin, Principal, Accountant, Teacher, SuperAdmin | List all fee types for school |
| `GET`    | `/:id`            | Admin, Principal, Accountant      | Get single fee type        |
| `PUT`    | `/:id`            | Admin, Principal, Accountant      | Update a fee type          |
| `DELETE` | `/:id`            | Admin, Principal                  | Delete a fee type          |

**POST `/` — Create fee type:**
```json
// REQUEST
{
  "name": "Tuition Fee",
  "code": "TF",
  "amount": 15000,
  "period": "Monthly",
  "description": "Regular monthly tuition charges",
  "icon": "school"
}

// SUCCESS RESPONSE (201)
{
  "success": true,
  "data": {
    "_id": "665b2f...",
    "name": "Tuition Fee",
    "code": "TF",
    "amount": 15000,
    "period": "Monthly",
    "description": "Regular monthly tuition charges",
    "icon": "school",
    "status": "Active",
    "schoolId": "665a1f...",
    "createdAt": "2026-03-18T10:30:00.000Z",
    "updatedAt": "2026-03-18T10:30:00.000Z"
  }
}

// ERROR — duplicate code (409)
{ "success": false, "message": "Fee type with code 'TF' already exists in this school" }
```

**GET `/` — List fee types:**
```
GET /api/fee-types?schoolId=665a1f...&status=Active&search=tuition
```
```json
// RESPONSE (200)
{
  "success": true,
  "data": [
    {
      "_id": "665b2f...",
      "name": "Tuition Fee",
      "code": "TF",
      "amount": 15000,
      "period": "Monthly",
      "description": "Regular monthly tuition charges",
      "icon": "school",
      "status": "Active",
      "schoolId": "665a1f..."
    },
    ...
  ]
}
```

**Query params for GET `/`:**
- `status` — filter by `Active` / `Inactive`
- `search` — search by name or code (server uses case-insensitive regex: `new RegExp(search, "i")`)

**PUT `/:id` — same body as POST, only send fields that changed.**

**DELETE `/:id` — see Edge Cases section for what happens to linked invoices.**

---

### Fee Invoices — `/api/fee-invoices`

| Method   | Path                  | Auth Roles                        | Description                    |
|----------|-----------------------|-----------------------------------|--------------------------------|
| `POST`   | `/`                   | Admin, Principal, Accountant      | Create a single invoice        |
| `POST`   | `/bulk`               | Admin, Principal, Accountant      | Create invoices for multiple students at once |
| `GET`    | `/`                   | Admin, Principal, Accountant, SuperAdmin | List invoices (with filters) |
| `GET`    | `/:id`                | Admin, Principal, Accountant      | Get single invoice with payment history |
| `PUT`    | `/:id`                | Admin, Principal, Accountant      | Update invoice details         |
| `DELETE` | `/:id`                | Admin, Principal                  | Cancel/delete invoice          |

**POST `/` — Create single invoice:**
```json
// REQUEST
{
  "studentId": "665c3a...",
  "feeTypeId": "665b2f...",
  "amount": 15000,
  "dueDate": "2026-04-15",
  "period": "April 2026",
  "remarks": ""
}

// SUCCESS RESPONSE (201)
{
  "success": true,
  "data": {
    "_id": "665d4b...",
    "invoiceNumber": "INV-2026-043",
    "studentId": {
      "_id": "665c3a...",
      "name": "Aarav Sharma",
      "className": "10",
      "section": "A",
      "rollNumber": "101"
    },
    "feeTypeId": {
      "_id": "665b2f...",
      "name": "Tuition Fee",
      "code": "TF"
    },
    "amount": 15000,
    "paid": 0,
    "status": "Pending",
    "dueDate": "2026-04-15T00:00:00.000Z",
    "paidDate": null,
    "period": "April 2026",
    "schoolId": "665a1f...",
    "createdAt": "2026-03-18T11:00:00.000Z"
  }
}
```

**POST `/bulk` — Create invoices for an entire class:**
```json
// REQUEST
{
  "className": "10",
  "section": "A",
  "feeTypeId": "665b2f...",
  "amount": 15000,
  "dueDate": "2026-04-15",
  "period": "April 2026"
}

// HOW IT WORKS ON SERVER:
// 1. Fetch all students: Student.find({ schoolId, className: "10", section: "A" })
// 2. For each student → create an invoice
// 3. Skip students who already have an invoice for same feeType + period (no duplicates)

// SUCCESS RESPONSE (201)
{
  "success": true,
  "data": {
    "created": 43,
    "skipped": 2,
    "skippedReason": "Already have invoice for Tuition Fee - April 2026",
    "invoices": [ ... ]
  }
}
```

**GET `/` — List invoices (with filters + pagination):**
```
GET /api/fee-invoices?schoolId=665a1f...&status=Pending&search=Aarav&page=1&limit=20
```
```json
// RESPONSE (200)
{
  "success": true,
  "data": {
    "invoices": [
      {
        "_id": "665d4b...",
        "invoiceNumber": "INV-2026-043",
        "studentId": {
          "_id": "665c3a...",
          "name": "Aarav Sharma",
          "className": "10",
          "section": "A",
          "rollNumber": "101",
          "phone": "9876543210"
        },
        "feeTypeId": {
          "_id": "665b2f...",
          "name": "Tuition Fee",
          "code": "TF"
        },
        "amount": 15000,
        "paid": 5000,
        "status": "Partial",
        "dueDate": "2026-04-15T00:00:00.000Z",
        "period": "April 2026"
      },
      ...
    ],
    "pagination": {
      "total": 87,
      "page": 1,
      "limit": 20,
      "totalPages": 5
    }
  }
}
```

**How search works on server:**
```js
// In the controller, search across student name AND invoice number:
const query = { schoolId: req.schoolId };

if (status) query.status = status;
if (feeTypeId) query.feeTypeId = feeTypeId;

// For search by student name — use aggregation with $lookup:
// 1. $lookup to join Student collection
// 2. $match on student.name with case-insensitive regex
// OR simpler approach: search invoiceNumber directly with regex,
//    and for student name search, first find matching studentIds
//    then filter invoices by those IDs:
if (search) {
  const matchingStudents = await Student.find({
    schoolId: req.schoolId,
    name: new RegExp(search, "i"),
  }).select("_id");
  const studentIds = matchingStudents.map((s) => s._id);

  query.$or = [
    { invoiceNumber: new RegExp(search, "i") },
    { studentId: { $in: studentIds } },
  ];
}

const invoices = await FeeInvoice.find(query)
  .populate("studentId", "name className section rollNumber phone")
  .populate("feeTypeId", "name code amount period")
  .sort({ createdAt: -1 })
  .skip((page - 1) * limit)
  .limit(limit);

const total = await FeeInvoice.countDocuments(query);
```

**Query params for GET `/`:**
- `status` — `Paid`, `Pending`, `Overdue`, `Partial`
- `studentId` — filter by student
- `feeTypeId` — filter by fee type
- `fromDate`, `toDate` — date range for due date
- `search` — search by student name or invoice number
- `page`, `limit` — pagination (default: page=1, limit=20)

**GET `/:id` — Single invoice with payment history:**
```json
// RESPONSE (200)
{
  "success": true,
  "data": {
    "invoice": {
      "_id": "665d4b...",
      "invoiceNumber": "INV-2026-043",
      "studentId": { "_id": "...", "name": "Aarav Sharma", "className": "10", "section": "A", "rollNumber": "101", "phone": "9876543210" },
      "feeTypeId": { "_id": "...", "name": "Tuition Fee", "code": "TF" },
      "amount": 15000,
      "paid": 15000,
      "status": "Paid",
      "dueDate": "2026-04-15T00:00:00.000Z",
      "paidDate": "2026-04-10T00:00:00.000Z",
      "period": "April 2026"
    },
    "payments": [
      {
        "_id": "665e5c...",
        "amount": 5000,
        "method": "Cash",
        "receiptNumber": "RB-456",
        "paymentDate": "2026-03-18T00:00:00.000Z",
        "receivedBy": { "_id": "...", "name": "Mr. Rajesh" },
        "remarks": "Partial payment by father",
        "createdAt": "2026-03-18T11:30:00.000Z"
      },
      {
        "_id": "665f6d...",
        "amount": 10000,
        "method": "Cheque",
        "chequeNumber": "CHQ-789012",
        "paymentDate": "2026-04-10T00:00:00.000Z",
        "receivedBy": { "_id": "...", "name": "Mr. Rajesh" },
        "remarks": "Remaining amount",
        "createdAt": "2026-04-10T09:15:00.000Z"
      }
    ]
  }
}
```

---

### Payments — `/api/payments`

| Method   | Path              | Auth Roles                        | Description                    |
|----------|-------------------|-----------------------------------|--------------------------------|
| `POST`   | `/`               | Admin, Principal, Accountant      | Record a payment against an invoice |
| `GET`    | `/`               | Admin, Principal, Accountant, SuperAdmin | List payments (with filters) |
| `GET`    | `/invoice/:invoiceId` | Admin, Principal, Accountant  | Get all payments for an invoice |

**POST `/` — Recording an offline cash payment:**
```json
// REQUEST
{
  "invoiceId": "665d4b...",
  "amount": 5000,
  "method": "Cash",
  "receiptNumber": "RB-456",
  "paymentDate": "2026-03-18",
  "remarks": "Partial payment by father"
}

// SUCCESS RESPONSE (201)
{
  "success": true,
  "data": {
    "payment": {
      "_id": "665e5c...",
      "invoiceId": "665d4b...",
      "studentId": "665c3a...",
      "amount": 5000,
      "method": "Cash",
      "receiptNumber": "RB-456",
      "paymentDate": "2026-03-18T00:00:00.000Z",
      "receivedBy": "665f1a...",
      "schoolId": "665a1f...",
      "createdAt": "2026-03-18T11:30:00.000Z"
    },
    "invoice": {
      "_id": "665d4b...",
      "invoiceNumber": "INV-2026-043",
      "amount": 15000,
      "paid": 5000,
      "status": "Partial"
    }
  }
}
```

**POST `/` — Recording a cheque payment:**
```json
// REQUEST
{
  "invoiceId": "665d4b...",
  "amount": 15000,
  "method": "Cheque",
  "chequeNumber": "CHQ-789012",
  "paymentDate": "2026-03-15",
  "remarks": "Post-dated cheque, clears 20 Mar"
}
```

**Server-side logic for POST `/` (pseudo-code):**
```js
export const recordPayment = async (req, res, next) => {
  try {
    const { invoiceId, amount, method, receiptNumber, chequeNumber, bankRef, paymentDate, remarks } = req.body;

    // 1. Find the invoice
    const invoice = await FeeInvoice.findOne({ _id: invoiceId, schoolId: req.schoolId });
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    // 2. Validate payment amount
    const balance = invoice.amount - invoice.paid;
    if (amount <= 0) return res.status(400).json({ success: false, message: "Amount must be greater than 0" });
    if (amount > balance) return res.status(400).json({ success: false, message: `Amount exceeds balance of ₹${balance}` });
    if (invoice.status === "Paid") return res.status(400).json({ success: false, message: "Invoice is already fully paid" });
    if (invoice.status === "Cancelled") return res.status(400).json({ success: false, message: "Cannot pay a cancelled invoice" });

    // 3. Create payment record
    const payment = await Payment.create({
      invoiceId,
      studentId: invoice.studentId,
      amount,
      method,
      receiptNumber,
      chequeNumber,
      bankRef,
      paymentDate: paymentDate || new Date(),
      receivedBy: req.user._id,    // <-- auto from logged-in user
      schoolId: req.schoolId,
    });

    // 4. Update invoice
    invoice.paid += amount;
    if (invoice.paid >= invoice.amount) {
      invoice.status = "Paid";
      invoice.paidDate = new Date();
    } else {
      invoice.status = "Partial";
    }
    await invoice.save();

    // 5. Return both
    res.status(201).json({ success: true, data: { payment, invoice } });
  } catch (error) {
    next(error);
  }
};
```

---

### Dashboard Stats — `/api/accounting/dashboard`

| Method | Path    | Auth Roles                        | Description                   |
|--------|---------|-----------------------------------|-------------------------------|
| `GET`  | `/`     | Admin, Principal, Accountant, SuperAdmin | Aggregated accounting stats |

```
GET /api/accounting/dashboard?schoolId=665a1f...
```

**Full response shape:**
```json
{
  "success": true,
  "data": {
    "totalRevenue": 1245800,
    "collectedThisMonth": 324500,
    "pendingFees": 482300,
    "overdueAmount": 156200,
    "pendingStudentCount": 32,
    "overdueInvoiceCount": 14,
    "monthlyCollection": [
      { "month": "Apr", "collected": 280000, "target": 350000 },
      { "month": "May", "collected": 310000, "target": 350000 },
      { "month": "Jun", "collected": 295000, "target": 350000 },
      { "month": "Jul", "collected": 340000, "target": 350000 },
      { "month": "Aug", "collected": 320000, "target": 350000 },
      { "month": "Sep", "collected": 355000, "target": 350000 },
      { "month": "Oct", "collected": 290000, "target": 350000 },
      { "month": "Nov", "collected": 330000, "target": 350000 },
      { "month": "Dec", "collected": 315000, "target": 350000 },
      { "month": "Jan", "collected": 345000, "target": 350000 },
      { "month": "Feb", "collected": 310000, "target": 350000 },
      { "month": "Mar", "collected": 324500, "target": 350000 }
    ],
    "feeDistribution": [
      { "name": "Tuition Fee", "amount": 685000, "percent": 55 },
      { "name": "Transport Fee", "amount": 248500, "percent": 20 },
      { "name": "Lab Fee", "amount": 149700, "percent": 12 },
      { "name": "Library Fee", "amount": 87200, "percent": 7 },
      { "name": "Others", "amount": 75400, "percent": 6 }
    ],
    "recentInvoices": [
      {
        "invoiceNumber": "INV-2026-043",
        "student": "Aarav Sharma",
        "class": "10-A",
        "feeType": "Tuition Fee",
        "amount": 15000,
        "status": "Paid",
        "date": "2026-03-18"
      }
    ]
  }
}
```

**How `target` in monthlyCollection is calculated:**
```
target = sum of (feeType.amount × active students for that fee type)
         averaged across months
```
Or simpler: Admin sets a monthly collection target in school settings. For MVP, hardcode or calculate from total expected yearly revenue / 12.

This endpoint uses MongoDB aggregation pipelines to compute:
1. **totalRevenue** — `sum(paid)` across all invoices for the school
2. **collectedThisMonth** — `sum(amount)` from Payment collection where `paymentDate` is in current month
3. **pendingFees** — `sum(amount - paid)` where status is `Pending` or `Partial`
4. **overdueAmount** — `sum(amount - paid)` where status is `Overdue`
5. **monthlyCollection** — group Payment records by month for the current session year
6. **feeDistribution** — group invoices by `feeTypeId`, sum `paid` amounts, populate fee type name
7. **recentInvoices** — latest 6 invoices, populated with student and fee type info

---

## Validation Rules

### Fee Type Validations
| Field       | Rule                                                    |
|-------------|---------------------------------------------------------|
| `name`      | Required. Min 2 chars, max 100 chars. Trimmed.         |
| `code`      | Required. 2-10 uppercase chars. Unique per school.     |
| `amount`    | Required. Must be > 0. Max 10,00,000 (₹10 lakh).      |
| `period`    | Required. Must be one of: `Monthly`, `Quarterly`, `Half-Yearly`, `Yearly`, `One-Time` |
| `icon`      | Optional. If provided, must be one of: `school`, `bus`, `lab`, `library`, `sports`, `computer` |

### Fee Invoice Validations
| Field       | Rule                                                    |
|-------------|---------------------------------------------------------|
| `studentId` | Required. Must be a valid student in the same school.   |
| `feeTypeId` | Required. Must be a valid active fee type in same school.|
| `amount`    | Required. Must be > 0.                                  |
| `dueDate`   | Required. Must be a valid future date (or today).       |
| `period`    | Optional. Free text, e.g. "March 2026" or "2025-26".   |
| **Duplicate check** | No two invoices for the same student + feeType + period. Return error if exists. |

### Payment Validations
| Field          | Rule                                                 |
|----------------|------------------------------------------------------|
| `invoiceId`    | Required. Must be a valid invoice in same school.    |
| `amount`       | Required. Must be > 0. Must not exceed remaining balance (`invoice.amount - invoice.paid`). |
| `method`       | Required. Must be one of: `Cash`, `Cheque`, `Bank Transfer`, `UPI` |
| `paymentDate`  | Required. Cannot be a future date.                   |
| `chequeNumber` | Required if method = `Cheque`.                       |
| `bankRef`      | Required if method = `Bank Transfer` or `UPI`.       |
| **Invoice status check** | Cannot record payment if invoice status is `Paid` or `Cancelled`. |

---

## Edge Cases & How To Handle Them

```
┌─────────────────────────────────────┬────────────────────────────────────────────────┐
│ EDGE CASE                           │ HOW TO HANDLE                                  │
├─────────────────────────────────────┼────────────────────────────────────────────────┤
│ Delete a FeeType that has invoices  │ BLOCK deletion. Return error:                  │
│                                     │ "Cannot delete: 23 invoices use this fee type."│
│                                     │ Suggest: set status to "Inactive" instead.     │
├─────────────────────────────────────┼────────────────────────────────────────────────┤
│ Create duplicate invoice (same      │ BLOCK. Return error:                           │
│ student + same feeType + same       │ "Invoice already exists for Aarav Sharma -     │
│ period)                             │ Tuition Fee - April 2026"                      │
├─────────────────────────────────────┼────────────────────────────────────────────────┤
│ Payment amount > remaining balance  │ BLOCK. Return error:                           │
│ (e.g. invoice balance ₹5000 but    │ "Amount ₹8,000 exceeds balance of ₹5,000"     │
│ payment ₹8000)                      │                                                │
├─────────────────────────────────────┼────────────────────────────────────────────────┤
│ Payment on already Paid invoice     │ BLOCK. Return error:                           │
│                                     │ "Invoice is already fully paid"                │
├─────────────────────────────────────┼────────────────────────────────────────────────┤
│ Payment on Cancelled invoice        │ BLOCK. Return error:                           │
│                                     │ "Cannot record payment on cancelled invoice"   │
├─────────────────────────────────────┼────────────────────────────────────────────────┤
│ Delete an invoice that has payments │ BLOCK deletion. Return error:                  │
│                                     │ "Cannot delete: invoice has 2 payment records."│
│                                     │ Suggest: set status to "Cancelled" instead.    │
├─────────────────────────────────────┼────────────────────────────────────────────────┤
│ Edit invoice amount AFTER partial   │ ALLOW, but new amount must be >= paid amount.  │
│ payment (e.g. paid ₹5000, admin    │ Recalculate status after update.               │
│ changes total from ₹15000 to       │ If new amount = paid → mark Paid.              │
│ ₹12000)                            │                                                │
├─────────────────────────────────────┼────────────────────────────────────────────────┤
│ Bulk invoice → some students        │ SKIP those students (don't error).             │
│ already have invoice for same      │ Return: { created: 43, skipped: 2 }            │
│ feeType + period                    │                                                │
├─────────────────────────────────────┼────────────────────────────────────────────────┤
│ Student deleted/transferred after  │ Invoice still exists (studentId becomes null    │
│ invoice was created                │ on populate). Show "Student removed" in UI.     │
│                                     │ Don't cascade-delete invoices.                 │
├─────────────────────────────────────┼────────────────────────────────────────────────┤
│ Cheque bounces after recording     │ Admin manually creates a negative adjustment    │
│                                     │ OR deletes the payment + reverts invoice.paid.  │
│                                     │ (Future: add "Reversed" payment status)        │
├─────────────────────────────────────┼────────────────────────────────────────────────┤
│ SuperAdmin tries to create/edit    │ BLOCK. SuperAdmin only has GET (read) access.   │
│ any accounting data                │ authorize() middleware handles this.             │
└─────────────────────────────────────┴────────────────────────────────────────────────┘
```

---

## File Structure

```
gurukulai-backend/src/modules/accounting/
├── feeType.model.js
├── feeType.controller.js
├── feeInvoice.model.js
├── feeInvoice.controller.js
├── payment.model.js
├── payment.controller.js
├── dashboard.controller.js
└── accounting.routes.js
```

**Route registration in `src/routes/index.js`:**
```js
import accountingRoutes from "../modules/accounting/accounting.routes.js";
router.use("/fee-types", accountingRoutes.feeTypeRoutes);
router.use("/fee-invoices", accountingRoutes.feeInvoiceRoutes);
router.use("/payments", accountingRoutes.paymentRoutes);
router.use("/accounting/dashboard", accountingRoutes.dashboardRoutes);
```

---

## Middleware Usage

Every route uses the same middleware pattern as the rest of the codebase:

```
protect → authorize("Admin", "Principal", "Accountant") → injectSchool → controller
```

- **`protect`** — validates JWT, sets `req.user`
- **`authorize`** — checks role
- **`injectSchool`** — sets `req.schoolId` (SuperAdmin picks from query/body, others use their own)

---

## Frontend ↔ Backend Mapping

| Frontend Page          | Tab ID          | APIs Used                                          |
|------------------------|-----------------|-----------------------------------------------------|
| Accounting Dashboard   | `ac-dashboard`  | `GET /api/accounting/dashboard`                     |
| Fee Types              | `ac-feetypes`   | `GET/POST/PUT/DELETE /api/fee-types`                |
| Fee Invoices           | `ac-feeinvoices`| `GET/POST/PUT/DELETE /api/fee-invoices`, `POST /api/payments` |

**Redux slice needed:** `features/accounting/accountingSlice.js`
- Async thunks: `fetchFeeTypes`, `createFeeType`, `updateFeeType`, `deleteFeeType`, `fetchInvoices`, `createInvoice`, `recordPayment`, `fetchDashboardStats`
- State: `{ feeTypes, invoices, dashboardStats, loading, error }`

---

## Invoice Number Generation

Auto-increment per school per year:

```
INV-{YEAR}-{SEQ}
```

Example: `INV-2026-001`, `INV-2026-002`, ...

Implementation: Query the last invoice for the school in the current year, extract the sequence number, and increment. Use a counter collection or `findOne().sort({ createdAt: -1 })` approach.

---

## Overdue Detection

A scheduled job (or on-read hook) should mark invoices as `Overdue` when:
- `status` is `Pending`
- `dueDate < Date.now()`

This can be handled either:
1. **On query** — in the `getInvoices` controller, update stale invoices before returning
2. **Cron job** — a daily task using `node-cron` that bulk-updates overdue invoices
