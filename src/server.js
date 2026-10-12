import app from "./app.js";
import { connectDB } from "./config/db.js";
import { ENV } from "./config/env.js";
import { startFeeDueDateReminderJob } from "./jobs/feeDueDateReminder.job.js";

const startServer = async () => {
  await connectDB();
  startFeeDueDateReminderJob();

  app.listen(ENV.PORT, () => {
    console.log(`🚀 Server running on port ${ENV.PORT}`);
  });
};

startServer();
