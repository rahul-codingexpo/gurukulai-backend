// import express from "express";
// import { protect } from "../../middleware/auth.middleware.js";

// const router = express.Router();

// router.get("/profile", protect, (req, res) => {
//   res.json({
//     success: true,
//     user: req.user,
//   });
// });

// export default router;

import express from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";

const router = express.Router();

// Only SuperAdmin & Admin allowed
router.get(
  "/profile",
  protect,
  authorize("Admin", "SuperAdmin"),
  (req, res) => {
    res.json({
      success: true,
      user: req.user,
    });
  },
);

export default router;
