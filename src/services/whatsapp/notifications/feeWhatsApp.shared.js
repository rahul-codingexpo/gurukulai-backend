import { ENV } from "../../../config/env.js";
import { normalizeWhatsAppPhone } from "../../../utils/phone.util.js";

export const roundMoney = (n) => Math.round(Number(n) * 100) / 100;

export const invoiceBalance = (invoice) =>
  roundMoney((Number(invoice?.amount) || 0) - (Number(invoice?.paid) || 0));

/** No thousand commas — WhySMS Param= is comma-separated. */
export const formatAmountPlain = (n) => String(Math.round(Number(n ?? 0)));

/** M/D/YYYY */
export const formatDueDate = (d) => {
  const x = new Date(d);
  return `${x.getMonth() + 1}/${x.getDate()}/${x.getFullYear()}`;
};

export const collectStudentFamilyRecipients = (student) => {
  const out = [];
  const add = (phone, recipientType) => {
    const normalized = normalizeWhatsAppPhone(phone);
    if (!normalized) return;
    out.push({ phone: normalized, recipientType });
  };

  add(student.phone, "student");
  add(student.parents?.father?.phone, "father");
  add(student.parents?.mother?.phone, "mother");

  const seen = new Set();
  return out.filter((r) => {
    if (seen.has(r.phone)) return false;
    seen.add(r.phone);
    return true;
  });
};

/** Dev: route all sends to WHYSMS_DEBUG_CONTACT when NODE_ENV=development. */
export const applyDebugContactRouting = (family, student, logTag) => {
  const rawDebug = process.env.WHYSMS_DEBUG_CONTACT;
  const debugContact = normalizeWhatsAppPhone(rawDebug);
  if (!debugContact || String(ENV.NODE_ENV || "").toLowerCase() !== "development") {
    return family;
  }

  const rawDigits = String(rawDebug || "").replace(/\D/g, "");
  if (rawDigits.startsWith("971") && !debugContact.startsWith("971")) {
    console.warn(
      `[whatsapp:${logTag}] WHYSMS_DEBUG_CONTACT starts with 971 but was sent as ${debugContact}. For UAE use 12 digits e.g. 971501234567`,
    );
  }
  console.warn(
    `[whatsapp:${logTag}] WHYSMS_DEBUG_CONTACT=${debugContact} — all sends routed to this number only`,
  );
  return [{ phone: debugContact, recipientType: "debug" }];
};

/** YYYY-MM-DD in IANA timezone (for due-date matching). */
export const getCalendarDayInTimeZone = (date, timeZone) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    date,
  );
