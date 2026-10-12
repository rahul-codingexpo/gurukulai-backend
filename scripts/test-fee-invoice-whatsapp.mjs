/**
 * Local test: send fee-invoice WhatsApp for an existing invoice.
 *
 * Usage:
 *   node scripts/test-fee-invoice-whatsapp.mjs <invoiceMongoId>
 *
 * Requires .env with WHYSMS_* and MONGO_URI. Server does not need to be running.
 */
import "../src/config/env.js";
import "../src/modules/student/student.model.js";
import "../src/modules/accounting/feeType.model.js";
import "../src/modules/school/school.model.js";
import "../src/modules/accounting/feeInvoice.model.js";
import { connectDB } from "../src/config/db.js";
import {
  checkWhySmsAccountValidity,
  listWhatsAppTemplates,
  notifyFeeInvoiceWhatsApp,
} from "../src/services/whatsapp/index.js";

const invoiceId = process.argv[2];

if (!invoiceId) {
  console.error("Usage: node scripts/test-fee-invoice-whatsapp.mjs <invoiceId>");
  process.exit(1);
}

await connectDB();

console.log("Configured templates:", listWhatsAppTemplates());

try {
  const account = await checkWhySmsAccountValidity();
  console.log("WhySMS account validity:", account);
} catch (e) {
  console.warn("WhySMS account check failed:", e.message);
}

console.log("Sending for invoice:", invoiceId);

const result = await notifyFeeInvoiceWhatsApp(invoiceId);
console.log(JSON.stringify(result, null, 2));

process.exit(0);
