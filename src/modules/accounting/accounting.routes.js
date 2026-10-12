import express from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import {
  injectSchool,
  injectBranchSchoolScope,
} from "../../middleware/injectSchool.middleware.js";

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
  restoreInvoice,
  sendInvoicesWhatsApp,
  prepareManualWhatsApp,
  downloadInvoicePdf,
} from "./feeInvoice.controller.js";
import {
  listFeeAuditLogs,
  getFeeAuditTimeline,
  permanentlyDeleteFeeSources,
} from "./feeAudit/feeAudit.controller.js";
import {
  recordPayment,
  getPayments,
  getPaymentsByInvoiceId,
} from "./payment.controller.js";
import { getDashboard } from "./dashboard.controller.js";
import { getStudentFeeStatus } from "./feeStatus.controller.js";
import {
  listWalletPayments,
  approveWalletPayment,
  rejectWalletPayment,
} from "./walletApproval.controller.js";

import pastFeeDataRoutes from "./pastFees/pastFeeData.routes.js";

const router = express.Router();

// ---------- Fee Types ----------
router.post(
  "/fee-types",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  injectBranchSchoolScope,
  createFeeType
);
router.get(
  "/fee-types",
  protect,
  authorize("Admin", "Principal", "Accountant", "Teacher", "SuperAdmin"),
  injectSchool,
  injectBranchSchoolScope,
  getFeeTypes
);
router.get(
  "/fee-types/:id",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  injectBranchSchoolScope,
  getFeeTypeById
);
router.put(
  "/fee-types/:id",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  injectBranchSchoolScope,
  updateFeeType
);
router.delete(
  "/fee-types/:id",
  protect,
  authorize("Admin", "Principal"),
  injectSchool,
  injectBranchSchoolScope,
  deleteFeeType
);

// ---------- Fee Invoices ----------
router.post(
  "/fee-invoices",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  injectBranchSchoolScope,
  createInvoice
);
router.post(
  "/fee-invoices/bulk",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  injectBranchSchoolScope,
  createBulkInvoices
);
router.get(
  "/fee-invoices",
  protect,
  authorize("Admin", "Principal", "Accountant", "SuperAdmin"),
  injectSchool,
  injectBranchSchoolScope,
  getInvoices
);
router.post(
  "/fee-invoices/send-whatsapp",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  injectBranchSchoolScope,
  sendInvoicesWhatsApp
);
router.post(
  "/fee-invoices/manual-whatsapp",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  injectBranchSchoolScope,
  prepareManualWhatsApp
);
router.get(
  "/fee-invoices/:id/pdf",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  injectBranchSchoolScope,
  downloadInvoicePdf
);
router.get(
  "/fee-invoices/:id",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  injectBranchSchoolScope,
  getInvoiceById
);
router.put(
  "/fee-invoices/:id",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  injectBranchSchoolScope,
  updateInvoice
);
router.delete(
  "/fee-invoices/:id",
  protect,
  authorize("Admin", "Principal"),
  injectSchool,
  injectBranchSchoolScope,
  deleteInvoice
);
router.post(
  "/fee-invoices/:id/restore",
  protect,
  authorize("Admin", "Principal"),
  injectSchool,
  injectBranchSchoolScope,
  restoreInvoice
);

// ---------- Payments ----------
router.post(
  "/payments",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  injectBranchSchoolScope,
  recordPayment
);
router.get(
  "/payments",
  protect,
  authorize("Admin", "Principal", "Accountant", "SuperAdmin"),
  injectSchool,
  injectBranchSchoolScope,
  getPayments
);
router.get(
  "/payments/invoice/:invoiceId",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  injectBranchSchoolScope,
  getPaymentsByInvoiceId
);

// ---------- Dashboard (mount first so "accounting/dashboard" is not parsed as fee-invoices/:id) ----------
router.get(
  "/accounting/dashboard",
  protect,
  authorize("Admin", "Principal", "Accountant", "SuperAdmin"),
  injectSchool,
  injectBranchSchoolScope,
  getDashboard
);

// ---------- Paid/Unpaid student table ----------
router.get(
  "/fee-status",
  protect,
  authorize("Admin", "Principal", "Accountant", "SuperAdmin"),
  injectSchool,
  injectBranchSchoolScope,
  getStudentFeeStatus
);

// ---------- Wallet Payments (Student/Parent uploads) approval flow ----------
router.get(
  "/wallet-payments",
  protect,
  authorize("Admin", "Principal", "Accountant", "SuperAdmin"),
  injectSchool,
  injectBranchSchoolScope,
  listWalletPayments
);
router.put(
  "/wallet-payments/:id/approve",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  injectBranchSchoolScope,
  approveWalletPayment
);
router.put(
  "/wallet-payments/:id/reject",
  protect,
  authorize("Admin", "Principal", "Accountant"),
  injectSchool,
  injectBranchSchoolScope,
  rejectWalletPayment
);

// ---------- Fee Data History (read-only audit log) — before past-fee mounts ----------
router.get(
  "/accounting/fee-audit",
  protect,
  authorize("Admin", "Principal", "SuperAdmin"),
  injectSchool,
  injectBranchSchoolScope,
  listFeeAuditLogs,
);
router.post(
  "/accounting/fee-audit/permanent-delete",
  protect,
  authorize("Admin", "Principal"),
  injectSchool,
  injectBranchSchoolScope,
  permanentlyDeleteFeeSources,
);
router.get(
  "/accounting/fee-audit/:sourceType/:sourceId",
  protect,
  authorize("Admin", "Principal", "SuperAdmin"),
  injectSchool,
  injectBranchSchoolScope,
  getFeeAuditTimeline,
);

// ---------- Past Fee Data (Old Dues Archive) ----------
router.use(pastFeeDataRoutes);

export default router;