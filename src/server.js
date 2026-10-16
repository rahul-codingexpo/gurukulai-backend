import app from "./app.js";
import { connectDB } from "./config/db.js";
import { ENV } from "./config/env.js";
import { startFeeDueDateReminderJob } from "./jobs/feeDueDateReminder.job.js";
import { ensureExamMarkIndexes } from "./modules/exam/examMark.model.js";

const startServer = async () => {
  await connectDB();
  await ensureExamMarkIndexes();
  startFeeDueDateReminderJob();

  app.listen(ENV.PORT, () => {
    console.log(`🚀 Server running on port ${ENV.PORT}`);
  });
};

startServer();
