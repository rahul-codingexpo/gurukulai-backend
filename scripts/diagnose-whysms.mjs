/**
 * WhySMS / WhatsApp delivery diagnostic (run when API says accepted but phone is empty).
 *
 * Usage: npm run diagnose:whysms
 * Optional: npm run diagnose:whysms -- 919876543210
 */
import "../src/config/env.js";
import { ENV } from "../src/config/env.js";
import {
  checkWhySmsAccountValidity,
  checkWhySmsConversationValidity,
  sendWhySmsTextMessage,
} from "../src/services/whatsapp/whatsAppProvider.service.js";
import { normalizeWhatsAppPhone } from "../src/utils/phone.util.js";

const contact =
  normalizeWhatsAppPhone(process.argv[2] || process.env.WHYSMS_DEBUG_CONTACT) ||
  normalizeWhatsAppPhone("919716170773");

if (!contact) {
  console.error("Pass a valid phone: npm run diagnose:whysms -- 919876543210");
  process.exit(1);
}

const businessFrom = ENV.WHYSMS_WHATSAPP_FROM || "(unknown — set WHYSMS_WHATSAPP_FROM in .env)";

console.log("\n=== GurukulAI WhySMS diagnostic ===\n");
console.log("Recipient (Contact):", contact);
console.log("Business sender (WHYSMS_WHATSAPP_FROM):", businessFrom);
console.log("Template name:", ENV.WHYSMS_TPL_FEE_INVOICE_NAME || process.env.WHYSMS_TPL_FEE_INVOICE_NAME);
console.log("");

try {
  const account = await checkWhySmsAccountValidity();
  console.log("Account:", account.data?.CompanyName, "| WhatsApp balance:", account.data?.WhatsAppBalance);
} catch (e) {
  console.error("Account check failed:", e.message);
}

try {
  const conv = await checkWhySmsConversationValidity(contact);
  const validity = conv.data?.Conversation_Validity;
  const optIn = conv.data?.ContactInfo?.OptIn;
  console.log("Conversation:", validity, "| OptIn:", optIn);
  if (validity === "Expired") {
    console.warn(
      "  → 24h chat window is expired. Template messages should still work if OptIn is Yes.",
    );
    console.warn(
      `  → From phone ${contact}, send "Hi" to business WhatsApp ${businessFrom} then re-run this script.`,
    );
  }
} catch (e) {
  console.error("Conversation check failed:", e.message);
}

console.log("\n--- Test 1: plain text (session message; needs open 24h window) ---");
try {
  const text = await sendWhySmsTextMessage(contact, `GurukulAI test ${Date.now()}`);
  console.log("Text API response:", text.raw?.slice(0, 300));
  console.log("If you did NOT receive this text, open chat with business number first.");
} catch (e) {
  console.error("Text send failed:", e.message);
}

console.log("\n--- Test 2: fee invoice template (no PDF) ---");
const auth = {
  LicenseNumber: String(ENV.WHYSMS_LICENSE_KEY || "").trim(),
  APIKey: String(ENV.WHYSMS_API_KEY || "").trim(),
};
const vars = [
  "Atul",
  "5/22/26 at 8:11 PM",
  "DIAG-001",
  "GV1002",
  "Grade 1 - A",
  "Tuition Fees",
  "1000",
  "5",
  "950",
  "650",
  "300",
  "Partial",
  "5/30/2026",
];
const q = new URLSearchParams({
  ...auth,
  Contact: contact,
  Template: ENV.WHYSMS_TPL_FEE_INVOICE_NAME || "fee_invoice_generate",
  Param: vars.join(","),
  Name: "Test",
});
const base = String(ENV.WHYSMS_WAPP_API_BASE || "https://wapp.whysms.in/api").replace(/\/$/, "");
const res = await fetch(`${base}/sendtemplate.php?${q.toString()}`);
const body = await res.text();
console.log(body);

let wamid = null;
try {
  wamid = JSON.parse(body)?.ApiMessage?.messages?.[0]?.id;
} catch {
  /* ignore */
}
if (wamid) {
  console.log("\nMeta message id (search in WhySMS panel):", wamid);
}

console.log(`
--- What to do if still no message on the phone ---
1. WhatsApp → Settings → verify this phone is exactly: +${contact.slice(0, 2)} ${contact.slice(2)}
2. Open chat from business number ${businessFrom} (not your personal contacts). Check "Updates" tab.
3. Settings → Privacy → Blocked — unblock the business number.
4. From your phone, message "Hi" to ${businessFrom}, then run this script again.
5. In WhySMS / Meta Business Manager, check delivery status for wamid above (failed / authentication / payment).
6. Ask WhySMS (Medhyx Tech license) to confirm WABA phone is verified and billing is active.
`);
