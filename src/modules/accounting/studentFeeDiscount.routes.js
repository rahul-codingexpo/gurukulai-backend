import express from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { injectSchool } from "../../middleware/injectSchool.middleware.js";
import {
  listStudentFeeDiscounts,
  getStudentFeeDiscountsByStudent,
  upsertStudentFeeDiscounts,
} from "./studentFeeDiscount.controller.js";

const router = express.Router();

const readAccess = ["Admin", "Principal", "Accountant", "SuperAdmin"];
const writeAccess = ["Admin", "Principal", "Accountant"];

router.get(
  "/accounting/student-fee-discounts",
  protect,
  authorize(...readAccess),
  injectSchool,
  listStudentFeeDiscounts,
);
router.get(
  "/accounting/student-fee-discounts/student/:studentId",
  protect,
  authorize(...readAccess),
  injectSchool,
  getStudentFeeDiscountsByStudent,
);
router.put(
  "/accounting/student-fee-discounts",
  protect,
  authorize(...writeAccess),
  injectSchool,
  upsertStudentFeeDiscounts,
);

export default router;
