import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { errorHandler, notFound } from "./middleware/error.middleware.js";
import routes from "./routes/index.js";

const app = express();

app.use(errorHandler);
app.use(
  cors({
    origin: "*", // later replace with frontend domain
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

app.use("/api", routes);
// unknown route handler
app.use(notFound);

// global error handler (LAST)
app.use(errorHandler);
export default app;
