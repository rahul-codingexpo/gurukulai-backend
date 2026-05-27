import cron from "node-cron";
import { runFeeDueDateReminderBatch } from "../services/whatsapp/notifications/feeOverdueDue.notification.js";

let running = false;

export const runFeeDueDateReminderJobOnce = async () => {
  if (running) {
    return { skipped: true, reason: "Previous run still in progress" };
  }
  running = true;
  try {
    return await runFeeDueDateReminderBatch();
  } finally {
    running = false;
  }
};

/**
 * Daily job: WhatsApp parents/students when invoice due date is today and balance > 0.
 * Enable with FEE_DUE_REMINDER_CRON_ENABLED=true
 */
export const startFeeDueDateReminderJob = () => {
  const enabled = String(process.env.FEE_DUE_REMINDER_CRON_ENABLED || "").toLowerCase() === "true";
  if (!enabled) return;

  const schedule = process.env.FEE_DUE_REMINDER_CRON || "0 9 * * *";
  const timeZone = process.env.FEE_DUE_REMINDER_TZ || "Asia/Kolkata";

  cron.schedule(
    schedule,
    async () => {
      console.log("[cron:fee_due_reminder] starting…");
      try {
        const result = await runFeeDueDateReminderJobOnce();
        console.log("[cron:fee_due_reminder] done", {
          today: result.today,
          matched: result.matched,
          sent: result.sent,
          skipped: result.skipped,
          failed: result.failed,
        });
      } catch (err) {
        console.error("[cron:fee_due_reminder]", err.message);
      }
    },
    { timezone: timeZone },
  );

  console.log(`[cron:fee_due_reminder] scheduled "${schedule}" (${timeZone})`);
};
