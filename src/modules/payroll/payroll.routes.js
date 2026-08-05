import express from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { injectSchool } from "../../middleware/injectSchool.middleware.js";
import {
  getPayrollDashboard,
  listSalarySlips,
  getSalarySlipById,
  generateMonthlySalaries,
  createSalarySlip,
  updateSalarySlip,
  recordSalaryPayment,
  prepareSalaryWhatsApp,
} from "./payroll.controller.js";

const router = express.Router();

const readAccess = ["Admin", "Principal", "Accountant", "SuperAdmin"];
const writeAccess = ["Admin", "Principal", "Accountant"];

router.get("/payroll/dashboard", protect, authorize(...readAccess), injectSchool, getPayrollDashboard);
router.get("/payroll/slips", protect, authorize(...readAccess), injectSchool, listSalarySlips);
router.get("/payroll/slips/:id", protect, authorize(...readAccess), injectSchool, getSalarySlipById);
router.post("/payroll/slips/generate", protect, authorize(...writeAccess), injectSchool, generateMonthlySalaries);
router.post("/payroll/slips", protect, authorize(...writeAccess), injectSchool, createSalarySlip);
router.put("/payroll/slips/:id", protect, authorize(...writeAccess), injectSchool, updateSalarySlip);
router.post("/payroll/payments", protect, authorize(...writeAccess), injectSchool, recordSalaryPayment);
router.post(
  "/payroll/slips/:id/manual-whatsapp",
  protect,
  authorize(...writeAccess),
  injectSchool,
  prepareSalaryWhatsApp,
);

export default router;
