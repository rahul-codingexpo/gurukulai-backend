// import express from "express";
// import { createAdmission } from "./student.controller.js";
// import { protect } from "../../middleware/auth.middleware.js";
// import { authorize } from "../../middleware/role.middleware.js";

// const router = express.Router();

// /* Admission */

// router.post(
//   "/admission",
//   protect,
//   authorize("Admin", "Principal"),
//   createAdmission,
// );

// export default router;

//==============updated code================

import express from "express";
import { createAdmission } from "./student.controller.js";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import upload from "../../middleware/upload.middleware.js";
import { uploadExcel } from "../../middleware/upload.middleware.js";
import {
  getStudents,
  getStudentById,
  updateStudent,
  updateStudentStatus,
  updateStudentSuspension,
  deleteStudent,
  bulkCreateStudentsFromExcel,
} from "./student.controller.js";

const router = express.Router();

router.post(
  "/admission",
  protect,
  authorize("Admin", "Principal"),
  upload.fields([
    { name: "studentPhoto", maxCount: 1 },
    { name: "fatherIdProof", maxCount: 1 },
    { name: "motherIdProof", maxCount: 1 },
    { name: "parentSignature", maxCount: 1 },
  ]),
  createAdmission,
);

// Bulk student admission via Excel (.xlsx/.xls)
// multipart/form-data:
// - file field: `excelFile`
// - optional JSON fields: `studentLogin`, `parentLogin` (stringified JSON in frontend)
router.post(
  "/bulk-admission",
  protect,
  authorize("Admin", "Principal"),
  uploadExcel.single("excelFile"),
  bulkCreateStudentsFromExcel,
);

router.get(
  "/",
  protect,
  authorize("Admin", "Principal", "Teacher","SuperAdmin"),
  getStudents,
);

router.get(
  "/:id",
  protect,
  authorize("Admin", "Principal", "Teacher","SuperAdmin"),
  getStudentById,
);

router.put(
  "/:id",
  protect,
  authorize("Admin", "Principal"),
  upload.fields([
    { name: "studentPhoto", maxCount: 1 },
    { name: "fatherIdProof", maxCount: 1 },
    { name: "motherIdProof", maxCount: 1 },
    { name: "parentSignature", maxCount: 1 },
  ]),
  updateStudent,
);

router.put(
  "/:id/status",
  protect,
  authorize("Admin", "Principal"),
  updateStudentStatus,
);

router.put(
  "/:id/suspend",
  protect,
  authorize("Admin", "Principal"),
  updateStudentSuspension,
);
router.delete("/:id", protect, authorize("Admin", "Principal"), deleteStudent);

export default router;
