import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { errorHandler, notFound } from "./middleware/error.middleware.js";
import routes from "./routes/index.js";

const app = express();

/* ---------- Core Middleware ---------- */
app.use(
  cors({
    origin: "*",
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

app.use("/uploads", express.static("uploads"));

/* ---------- Routes ---------- */
app.use("/api", routes);

/* ---------- Unknown Route ---------- */
app.use(notFound);

/* ---------- Global Error Handler (LAST) ---------- */
app.use(errorHandler);

export default app;
