import express from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { injectSchool } from "../../middleware/injectSchool.middleware.js";

import {
  createFeeType,
  getFeeTypes,
  getFeeTypeById,
  updateFeeType,
  deleteFeeType,
} from "./feeType.controller.js";
import {
  createInvoice,
  createBulkInvoices,
  getInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
} from "./feeInvoice.controller.js";
import {
  recordPayment,
  getPayments,
  getPaymentsByInvoiceId,
} from "./payment.controller.js";
import { getDashboard } from "./dashboard.controller.js";

const router = express.Router();

// ---------- Fee Types ----------
router.post(
  "/fee-types",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  createFeeType
);
router.get(
  "/fee-types",
  protect,
  authorize("Admin", "Principal", "Accountant", "Teacher", "SuperAdmin"),
  injectSchool,
  getFeeTypes
);
router.get(
  "/fee-types/:id",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  getFeeTypeById
);
router.put(
  "/fee-types/:id",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  updateFeeType
);
router.delete(
  "/fee-types/:id",
  protect,
  authorize("Admin", "Principal"),
  injectSchool,
  deleteFeeType
);

// ---------- Fee Invoices ----------
router.post(
  "/fee-invoices",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  createInvoice
);
router.post(
  "/fee-invoices/bulk",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  createBulkInvoices
);
router.get(
  "/fee-invoices",
  protect,
  authorize("Admin", "Principal", "Accountant", "SuperAdmin"),
  injectSchool,
  getInvoices
);
router.get(
  "/fee-invoices/:id",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  getInvoiceById
);
router.put(
  "/fee-invoices/:id",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  updateInvoice
);
router.delete(
  "/fee-invoices/:id",
  protect,
  authorize("Admin", "Principal"),
  injectSchool,
  deleteInvoice
);

// ---------- Payments ----------
router.post(
  "/payments",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  recordPayment
);
router.get(
  "/payments",
  protect,
  authorize("Admin", "Principal", "Accountant", "SuperAdmin"),
  injectSchool,
  getPayments
);
router.get(
  "/payments/invoice/:invoiceId",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  getPaymentsByInvoiceId
);

// ---------- Dashboard (mount first so "accounting/dashboard" is not parsed as fee-invoices/:id) ----------
router.get(
  "/accounting/dashboard",
  protect,
  authorize("Admin", "Principal", "Accountant", "SuperAdmin"),
  injectSchool,
  getDashboard
);

export default router;