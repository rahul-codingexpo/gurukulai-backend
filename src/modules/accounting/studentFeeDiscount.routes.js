import express from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import {
  injectSchool,
  injectBranchSchoolScope,
} from "../../middleware/injectSchool.middleware.js";
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
  injectBranchSchoolScope,
  listStudentFeeDiscounts,
);
router.get(
  "/accounting/student-fee-discounts/student/:studentId",
  protect,
  authorize(...readAccess),
  injectSchool,
  injectBranchSchoolScope,
  getStudentFeeDiscountsByStudent,
);
router.put(
  "/accounting/student-fee-discounts",
  protect,
  authorize(...writeAccess),
  injectSchool,
  injectBranchSchoolScope,
  upsertStudentFeeDiscounts,
);

export default router;
