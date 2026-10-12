import express from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import {
  createInventoryExpense,
  listInventoryExpenses,
  updateInventoryExpense,
  deleteInventoryExpense,
} from "./inventoryExpense.controller.js";

const router = express.Router();

// Create Inventory Expense (Admin / Principal)
router.post("/expenses", protect, authorize("Admin", "Principal"), createInventoryExpense);

// List Expenses (Admin / Principal)
router.get(
  "/expenses",
  protect,
  authorize("SuperAdmin", "Admin", "Principal"),
  listInventoryExpenses,
);

// Update expense (Admin / Principal)
router.put(
  "/expenses/:expenseId",
  protect,
  authorize("Admin", "Principal"),
  updateInventoryExpense,
);

// Delete expense (Principal only)
router.delete(
  "/expenses/:expenseId",
  protect,
  authorize("Principal","Admin"),
  deleteInventoryExpense,
);

export default router;

