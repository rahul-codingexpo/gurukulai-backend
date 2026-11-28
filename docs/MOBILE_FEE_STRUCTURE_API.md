# Mobile Fee Structure API (Flutter handoff)

Use this endpoint on the **Fees** screen to show each student’s assigned fee structure and any fixed rupee discounts.

**Auth:** `Authorization: Bearer <token>`  
**Roles:** `Student`, `Parent` only (`protect` + `mobileOnly`)  
**Base path:** `/api/mobile`

---

## Endpoint

### `GET /api/mobile/fees/structure`

Returns the saved fee structure for the logged-in student, or for linked children when the caller is a Parent.

| Query | Required | Description |
|-------|----------|-------------|
| `studentId` | No | Parent with multiple children: limit to one owned student. Ignored / self for Student. Invalid id → `403`. |

#### Ownership

- **Student** → own profile only.
- **Parent** → students with `parentLogin.userId` = current user.
- Without `studentId`, Parent receives **all** linked children (array of blocks).
- With `studentId`, response has **one** block if owned; otherwise `403`.

#### Success (200)

```json
{
  "success": true,
  "data": [
    {
      "studentId": "65f0a1b2c3d4e5f678901234",
      "studentName": "Aarav Sharma",
      "admissionNumber": "ADM1002",
      "className": "5",
      "section": "A",
      "feeStructure": [
        {
          "feeType": "Tuition Fee",
          "period": "Monthly",
          "amount": 5000,
          "billingMode": "perMonth",
          "discountAmount": 500,
          "netAmount": 4500
        },
        {
          "feeType": "Transport",
          "period": "Monthly",
          "amount": 1200,
          "billingMode": "perMonth",
          "discountAmount": 0,
          "netAmount": 1200
        },
        {
          "feeType": "Admission Fee",
          "period": "One Time",
          "amount": 10000,
          "billingMode": "oneTime",
          "discountAmount": 0,
          "netAmount": 10000
        }
      ],
      "totalAmount": 16200,
      "totalDiscount": 500,
      "totalNet": 15700
    }
  ]
}
```

#### Field reference

| Field | Type | Notes |
|-------|------|--------|
| `studentId` | string | Mongo id |
| `studentName` | string | |
| `admissionNumber` | string | |
| `className` | string | Class label as stored on student |
| `section` | string | |
| `feeStructure` | array | Lines from `Student.feeStructure` |
| `feeStructure[].feeType` | string | Display name |
| `feeStructure[].period` | string | e.g. Monthly / One Time |
| `feeStructure[].amount` | number | Gross amount (₹) |
| `feeStructure[].billingMode` | `"perMonth"` \| `"oneTime"` | Defaults to `perMonth` if missing |
| `feeStructure[].discountAmount` | number | Fixed ₹ discount for that fee type (0 if none) |
| `feeStructure[].netAmount` | number | `max(0, amount - discountAmount)` |
| `totalAmount` | number | Sum of line `amount` |
| `totalDiscount` | number | Sum of line `discountAmount` |
| `totalNet` | number | Sum of line `netAmount` |

Empty structure (student has no fee lines) → `feeStructure: []` and totals `0`.

#### Errors

| Status | When |
|--------|------|
| `403` | Role not Student/Parent, or `studentId` not owned |
| `404` | No linked student profile |

```json
{ "success": false, "message": "Only Student and Parent can access fee structure" }
```

```json
{ "success": false, "message": "Not allowed to access this student's fees" }
```

```json
{ "success": false, "message": "Student profile not found" }
```

---

## Discount rules (backend)

- Discounts come from **`StudentFeeDiscount`** (fixed ₹ per fee type per student).
- Matched by **fee type name**: `FeeType.name` (from discount’s `feeTypeId`) ↔ `feeStructure[].feeType` (case-insensitive).
- Only rows with `discountAmount > 0` are applied.
- `netAmount` never goes below `0`.

This is the **assigned structure**, not invoice balances. For dues / payments continue using:

- `GET /api/mobile/fees/history`
- `GET /api/mobile/invoices`

(same ownership / optional `?studentId=`).

---

## Flutter integration notes

1. Call after login with the same Bearer token as other mobile APIs.
2. **Parent multi-child:** either call once without `studentId` and pick a child in UI, or pass `studentId` when the user selects a child (same pattern as invoices).
3. Prefer showing **`netAmount`** as the payable line amount; show `amount` + `discountAmount` when you want a “was / discount / now” breakdown.
4. Use `billingMode` to label recurring vs one-time rows (`perMonth` vs `oneTime`).
5. Totals on the block (`totalNet`, etc.) are ready for a footer; do not re-sum unless you filter lines client-side.
6. Amounts are rupees as numbers (2-decimal rounding on the server). Format with your existing currency helper.

### Example requests

```http
GET /api/mobile/fees/structure
Authorization: Bearer <token>
```

```http
GET /api/mobile/fees/structure?studentId=65f0a1b2c3d4e5f678901234
Authorization: Bearer <token>
```

### Suggested UI

- List fee lines: fee type, period, gross / discount / net.
- Footer: total gross, total discount, **total net**.
- Optional chip for `billingMode` (Monthly / One-time).
- If `feeStructure` is empty, show an empty state (“Fee structure not assigned yet”).
