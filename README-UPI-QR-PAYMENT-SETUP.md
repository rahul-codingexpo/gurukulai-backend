# School Payment Setup (UPI ID + QR) — Backend README

This document defines the backend contract required by the **School Payment Setup** UI in the frontend (Accounting → Fee Invoices → “School Payment Setup” card).

The purpose is **not** to process online payments. This is **offline UPI collection** where the school displays:

- **UPI ID** (text)
- **UPI QR image** (uploaded file)

The UI uses these fields so parents can scan/pay outside the system, and accountants can still record payments manually (via `/payments`).

---

## What the frontend currently does

Frontend screen: `GurukulAI-frontend/src/pages/Accounting/FeeInvoices/FeeInvoicesPage.jsx`

When “Save Payment Setup” is clicked, the frontend calls:

- `PUT /api/schools/:id` with `multipart/form-data`

and sends **these form keys**:

- `upiId` (string)
- `paymentUpiId` (string)  *(duplicate key; same value as `upiId`)*
- `qrCode` (file)          *(image file)*
- `paymentQr` (file)       *(duplicate key; same file as `qrCode`)*

The UI also expects that `GET /api/schools` returns the saved values in **any** of these locations:

- `school.upiId` OR `school.paymentUpiId` OR `school.payment.upiId`
- `school.qrCode` OR `school.paymentQr` OR `school.payment.qrCode` OR `school.payment.qrImage`

To avoid breaking the UI, the backend should **store** and **return** at least:

- `upiId`
- `qrCode` (URL/path to the stored QR image)

Optionally, you can also return aliases (`paymentUpiId`, `paymentQr`) for compatibility.

---

## Required backend changes (current state vs required)

### Current backend limitations (observed)

- `School` model (`src/modules/school/school.model.js`) currently **does not include** UPI or QR fields.
- `PUT /schools/:id` (`src/modules/school/school.routes.js`) currently uses `upload.single("logo")` and `updateSchool` writes only `req.body`.
  - This means uploaded fields like `qrCode` / `paymentQr` are **ignored** right now.

### Required backend additions

1. **Schema fields** on `School`:
   - `upiId: string` (or `paymentUpiId: string` alias)
   - `qrCode: string` (path/URL to uploaded image)
   - (Optional) nested structure:
     - `payment: { upiId: string, qrCode: string }`

2. **Upload support** on `PUT /api/schools/:id`:
   - Accept file upload for `qrCode` (and optionally `paymentQr`)
   - Store the file in the same uploads strategy as logo (e.g. `/uploads/<filename>`)

3. **Response payload**:
   - The update API must return the updated school object with the UPI + QR fields populated.

---

## API Contract

### Update School Payment Setup

**Method:** `PUT`  
**Path:** `/api/schools/:id`  
**Auth:** `protect` + `authorize("SuperAdmin")` *(matches current routes)*

**Content-Type:** `multipart/form-data`

#### Request (multipart fields)

- **Text**
  - `upiId` *(string, optional, may be empty string)*
  - `paymentUpiId` *(string, optional; same value as `upiId`)*

- **File**
  - `qrCode` *(file, optional; image/png, image/jpeg, image/jpg, image/webp)*
  - `paymentQr` *(file, optional; alias of `qrCode`)*

Notes:
- Frontend may send **either** `upiId` or `paymentUpiId` or both.
- Frontend may send **either** `qrCode` or `paymentQr` or both.
- If no new QR file is provided, the backend must **keep existing** QR.

#### Response (success)

```json
{
  "success": true,
  "data": {
    "_id": "665a1f...",
    "name": "Gurukul Global",
    "upiId": "schoolname@upi",
    "qrCode": "/uploads/school-qr-665a1f.png"
  }
}
```

Recommended: also include compatibility aliases if easy:

```json
{
  "success": true,
  "data": {
    "_id": "665a1f...",
    "upiId": "schoolname@upi",
    "paymentUpiId": "schoolname@upi",
    "qrCode": "/uploads/school-qr-665a1f.png",
    "paymentQr": "/uploads/school-qr-665a1f.png"
  }
}
```

#### Response (error)

- `400` if the file type is not allowed or invalid payload

```json
{ "success": false, "message": "Invalid QR image type. Allowed: png, jpg, jpeg, webp." }
```

- `401/403` if auth/role fails (handled by middleware)

---

## Storage & URL expectations

Frontend renders the QR preview using this logic:

- If the stored value starts with `http`, use it directly
- Otherwise, it prefixes with API base URL (stripping `/api`)

So the backend may return either:

- Absolute: `https://api.example.com/uploads/qr.png`
- Relative: `/uploads/qr.png` *(works if API serves `/uploads`)*

**Requirement:** ensure uploads are publicly accessible at a stable URL path.

---

## Validation rules

- **UPI ID**
  - Optional (UI allows empty)
  - If provided: trim whitespace, store lower/upper as-is (UPI is typically case-insensitive, but keep original)
  - Suggested validation (lightweight): must contain exactly one `@` and no spaces (e.g. `example@upi`)

- **QR image**
  - Optional
  - Must be an image: PNG/JPG/JPEG/WEBP
  - Suggested max size: 1–2 MB

---

## Compatibility mapping (important)

To match the current frontend without changing UI code, backend should interpret incoming and outgoing fields like this:

### Incoming (request → storage)

- `upiId` or `paymentUpiId` → store as `upiId` (single canonical field)
- `qrCode` or `paymentQr` → store as `qrCode` (single canonical field)

### Outgoing (storage → response)

At minimum return:
- `upiId`
- `qrCode`

Optionally also return:
- `paymentUpiId` = `upiId`
- `paymentQr` = `qrCode`

---

## Example cURL

```bash
curl -X PUT "https://api.example.com/api/schools/665a1f..." \
  -H "Authorization: Bearer <TOKEN>" \
  -F "upiId=gurukulglobal@upi" \
  -F "qrCode=@./school-qr.png"
```

---

## Related APIs (already used by the UI)

### Record payment (manual/offline)

The school UPI + QR setup is just display metadata. Actual fee payment entries are recorded by staff via:

- `POST /api/payments` (see `src/modules/accounting/payment.controller.js`)

Fields used by current frontend payment dialog:

- `invoiceId`
- `amount`
- `method` (UI options include: `Cash`, `Cheque`, `Bank Transfer`, `UPI`, `Other`)

Note: backend currently validates `method` as one of:
`Cash`, `Cheque`, `Bank Transfer`, `UPI`
So if UI sends `Other`, backend should either:
- reject it (current behavior), or
- extend allowed methods to include `Other`.

---

## Implementation notes (backend dev)

- Update the school update route to accept **multiple upload fields** (logo + QR), e.g.:
  - `logo`
  - `qrCode` / `paymentQr`
- In controller, map the uploaded QR file to a stored path (same pattern used for logo: `/uploads/<filename>`).
- Make sure `updateSchool` uses both `req.body` and `req.files` (or `req.file`) when saving.

