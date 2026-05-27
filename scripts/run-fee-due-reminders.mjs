/**
 * Manually run due-date fee WhatsApp reminders (same logic as daily cron).
 *
 * Usage: npm run fee:due-reminders
 */
import "../src/config/env.js";
import "../src/modules/student/student.model.js";
import "../src/modules/accounting/feeType.model.js";
import "../src/modules/school/school.model.js";
import "../src/modules/accounting/feeInvoice.model.js";
import { connectDB } from "../src/config/db.js";
import { listWhatsAppTemplates } from "../src/services/whatsapp/index.js";
import { runFeeDueDateReminderBatch } from "../src/services/whatsapp/notifications/feeOverdueDue.notification.js";

await connectDB();
console.log("Templates:", listWhatsAppTemplates());

const result = await runFeeDueDateReminderBatch();
console.log(JSON.stringify(result, null, 2));
process.exit(0);
