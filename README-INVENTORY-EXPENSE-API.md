# Inventory Expense API (for Inventory -> Add Item form)

## Purpose
This API is for the UI modal on **Inventory -> Add Item** (currently implemented on `src/pages/Inventory/InventoryItemsPage.jsx`).

The modal collects and submits an **inventory expense/transaction** with the following fields:
- **Expense Type** (dropdown)
- **Date**
- **Amount**
- **Person Name**
- **Notes** (optional)

This README defines a clean backend contract so the backend developer can implement the required endpoints.

---

## Assumptions / School Scoping
The frontend page does not send `schoolId` directly.

Backend should scope data using one of these approaches (pick one and keep it consistent):
1. **Preferred**: derive `schoolId` from the authenticated user (`req.user.schoolId` or similar).
2. **Alternative**: accept `schoolId` from request body/query only when the user has cross-school permission.

If you choose option (2), allow `schoolId` in the request (see examples).

---

## Authentication
- All requests require Bearer token auth.
- The frontend uses `localStorage.getItem("token")` and sends `Authorization: Bearer <token>`.

Expected server behavior:
- If token is missing/invalid -> `401 Unauthorized`

---

## Expense Type
Frontend currently uses these sample values:
- `Purchase`
- `Repair`
- `Transport`
- `Stock Issue`
- `Other`

Backend should treat `expenseType` as either:
- a validated enum of allowed values, OR
- accept any non-empty string and store it (recommended for flexibility).

---

## Endpoint 1: Create Inventory Expense

### `POST /api/inventory/expenses`
Creates a new inventory expense record.

#### Request Body (JSON)
```json
{
  "expenseType": "Purchase",
  "date": "2026-03-31",
  "amount": 15000,
  "personName": "Rahul Sharma",
  "notes": "Optional note text"
}
```

##### Optional (only if you support cross-school override)
```json
{
  "schoolId": "SCH-001",
  "expenseType": "Purchase",
  "date": "2026-03-31",
  "amount": 15000,
  "personName": "Rahul Sharma",
  "notes": "Optional note text"
}
```

#### Field Validation Rules
- `expenseType`: required, string (non-empty)
- `date`: required, must be a valid date
  - The frontend date input sends `YYYY-MM-DD`
  - Backend can store as ISO date or as `Date` with day precision.
- `amount`: required, number > 0
- `personName`: required, string (non-empty)
- `notes`: optional, string (can be empty)
- `schoolId`: optional only if backend supports cross-school override; otherwise derive from token

#### Response (201 Created)
Return the created record:
```json
{
  "success": true,
  "message": "Expense created successfully",
  "data": {
    "_id": "64f2c9a1f....",
    "schoolId": "SCH-001",
    "expenseType": "Purchase",
    "date": "2026-03-31",
    "amount": 15000,
    "personName": "Rahul Sharma",
    "notes": "Optional note text",
    "createdBy": {
      "_id": "64f1aa....",
      "name": "Admin User"
    },
    "createdAt": "2026-03-31T10:20:30.123Z",
    "updatedAt": "2026-03-31T10:20:30.123Z"
  }
}
```

#### Error Responses
- `400 Bad Request`: validation errors
  ```json
  {
    "success": false,
    "message": "Invalid amount",
    "errors": { "amount": "amount must be > 0" }
  }
  ```
- `401 Unauthorized`: invalid/missing token
- `403 Forbidden`: user is not allowed to create inventory expenses

---

## Endpoint 2 (Recommended for next UI step): List Expenses
The current UI only shows an items table (dummy for now), but for future implementation you will likely need a listing endpoint.

### `GET /api/inventory/expenses`
#### Query Params (recommended)
- `schoolId` (only if option 2 scoping is used)
- `fromDate` / `toDate` (optional)
- `expenseType` (optional)
- `page` / `limit` (optional)

#### Response shape (suggested)
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "...",
        "date": "2026-03-31",
        "expenseType": "Purchase",
        "amount": 15000,
        "personName": "Rahul Sharma",
        "notes": "...",
        "createdAt": "..."
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 25
  }
}
```

---

## Endpoint 3: Update Inventory Expense (Admin/Principal allowed)

### `PUT /api/inventory/expenses/:expenseId`
Updates an existing inventory expense record.

#### Path Params
- `expenseId`: id of the expense record to update

#### Request Body (JSON)
```json
{
  "expenseType": "Purchase",
  "date": "2026-03-31",
  "amount": 15000,
  "personName": "Rahul Sharma",
  "notes": "Optional note text"
}
```

##### Validation Rules
Same validation as `POST /api/inventory/expenses`:
- `expenseType`: required, string (non-empty)
- `date`: required, must be a valid date
- `amount`: required, number > 0
- `personName`: required, non-empty string
- `notes`: optional string

#### Authorization / Roles
- Allowed: **Admin**, **Principal**
- Forbidden: any other role -> `403 Forbidden`

#### Response (200 OK)
Return the updated record:
```json
{
  "success": true,
  "message": "Expense updated successfully",
  "data": {
    "_id": "64f2c9a1f....",
    "expenseType": "Purchase",
    "date": "2026-03-31",
    "amount": 15000,
    "personName": "Rahul Sharma",
    "notes": "Optional note text",
    "updatedAt": "2026-03-31T10:20:30.123Z"
  }
}
```

---

## Endpoint 4: Delete Inventory Expense (Principal scope)

### `DELETE /api/inventory/expenses/:expenseId`
Deletes an existing inventory expense record.

#### Path Params
- `expenseId`: id of the expense record to delete

#### Authorization / Roles
- Allowed: **Principal**
- Forbidden: **Admin** should NOT be able to delete (per your requirement)
- Forbidden: any other role -> `403 Forbidden`

#### Response (200 OK)
Example:
```json
{
  "success": true,
  "message": "Expense deleted successfully"
}
```

#### Error Responses
- `403 Forbidden`: user is not allowed to delete
  ```json
  {
    "success": false,
    "message": "Not allowed to delete expenses"
  }
  ```

---

## Database Model (Suggested)
Collection name: `InventoryExpenses` (or similar)

Suggested fields:
- `schoolId` (required)
- `expenseType` (required string)
- `date` (required Date, store day precision)
- `amount` (required Number)
- `personName` (required string)
- `notes` (optional string)
- `createdBy` (ref to User)
- `createdAt`, `updatedAt`

---

## Frontend Contract Notes (Important)
1. The modal currently logs payload and shows “frontend only” message.
2. After backend is ready, the frontend should call `POST /api/inventory/expenses` with:
   - `expenseType`
   - `date` (YYYY-MM-DD)
   - `amount` (number)
   - `personName`
   - `notes` (string, optional)

---

## Questions for the backend developer (please confirm)
1. Should `expenseType` be strict enum-only, or accept any string?
2. How do we derive `schoolId` from token in your backend?
3. Do you want an additional `expenseCategory` or will `expenseType` handle it?

