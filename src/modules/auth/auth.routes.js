import express from "express";
import { login } from "./auth.controller.js";

const router = express.Router();

router.get("/test", (req, res) => {
  res.json({ message: "Auth route working" });
});

router.post("/login", login);

export default router;
