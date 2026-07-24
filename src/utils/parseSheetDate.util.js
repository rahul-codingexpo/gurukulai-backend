/**
 * Parse school Excel/CSV date values as calendar dates (India: DD/MM/YYYY).
 * Never use ambiguous `new Date("12-05-2018")` — Node/V8 treats that as MM-DD-YYYY.
 *
 * IMPORTANT: Read workbooks with `cellDates: false`. If `cellDates: true`, SheetJS
 * converts strings like "12/5/2018" into US dates (Dec 5) before our parser runs.
 *
 * Tolerates Excel noise: spaces, NBSP, slash or dash (05/04/2020 === 05-04-2020).
 */

const pad2 = (n) => String(n).padStart(2, "0");

/** Strip Excel whitespace / alignment padding (incl. NBSP and other unicode spaces). */
export const normalizeSheetText = (value) => {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * Phone from Excel: drop spaces and common separators; keep digits (+ optional leading +).
 * " 9155 750257 " / "9155-750257" → "9155750257"
 */
export const normalizeSheetPhone = (value) => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  const raw = normalizeSheetText(value);
  if (!raw) return "";
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    return `+${digits.slice(1).replace(/\D/g, "")}`;
  }
  return digits.replace(/\D/g, "");
};

/** Compact date string: remove all spaces so " 05 / 04 / 2020 " → "05/04/2020". */
export const compactSheetDateText = (value) => {
  const t = normalizeSheetText(value);
  if (!t) return "";
  return t.replace(/\s+/g, "");
};

/** 00–69 → 2000–2069, 70–99 → 1970–1999 */
export const expandTwoDigitYear = (yy) => {
  const n = Number(yy);
  if (!Number.isFinite(n) || n < 0 || n > 99) return null;
  return n <= 69 ? 2000 + n : 1900 + n;
};

export const isValidCalendarDate = (day, month, year) => {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (y < 1900 || y > 2100) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};

/** UTC midnight for a calendar day — ISO date prefix matches the intended day. */
export const calendarDateLocal = (day, month, year) => {
  if (!isValidCalendarDate(day, month, year)) return null;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0));
};

/**
 * Excel serial → calendar date via SheetJS when available, else UTC day math.
 * @param {number} serial
 * @param {{ parse_date_code?: Function } | null} ssf
 */
export const excelSerialToDate = (serial, ssf = null) => {
  if (typeof serial !== "number" || !Number.isFinite(serial)) return null;
  if (ssf?.parse_date_code) {
    const parsed = ssf.parse_date_code(serial);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return calendarDateLocal(parsed.d, parsed.m, parsed.y);
    }
  }
  const excelEpoch = Date.UTC(1899, 11, 30);
  const ms = excelEpoch + Math.floor(serial) * 86400000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return calendarDateLocal(d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear());
};

/**
 * If a Date slipped in (e.g. old cellDates:true), recover calendar day.
 * Prefer UTC YMD when the instant is UTC midnight (typical SheetJS/CSV parse).
 */
const dateObjectToCalendar = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const utcMidnight =
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0;
  if (utcMidnight) {
    return calendarDateLocal(value.getUTCDate(), value.getUTCMonth() + 1, value.getUTCFullYear());
  }
  return calendarDateLocal(value.getDate(), value.getMonth() + 1, value.getFullYear());
};

/**
 * @param {*} value - Date | Excel serial | string (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, …)
 * @param {{ parse_date_code?: Function } | null} ssf - optional XLSX.SSF
 * @returns {Date|null}
 */
export const parseSheetDate = (value, ssf = null) => {
  if (value === undefined || value === null || value === "") return null;

  if (value instanceof Date) {
    return dateObjectToCalendar(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialToDate(value, ssf);
  }

  const asText = compactSheetDateText(value);
  if (!asText) return null;

  // Reject English locale date strings from String(Date) — cannot recover safely
  if (/[a-zA-Z]/.test(asText)) return null;

  // YYYY-MM-DD or YYYY/MM/DD (from our normalized CSV)
  const iso = asText.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    return calendarDateLocal(Number(iso[3]), Number(iso[2]), Number(iso[1]));
  }

  // Always DD/MM/YYYY (or DD-MM-YYYY / DD.MM.YYYY) — India school sheets
  const dmy = asText.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (dmy[3].length === 2) {
      year = expandTwoDigitYear(year);
      if (year == null) return null;
    }
    return calendarDateLocal(day, month, year);
  }

  return null;
};

/** @returns {string|null} YYYY-MM-DD */
export const parseSheetDateToIso = (value, ssf = null) => {
  const d = parseSheetDate(value, ssf);
  if (!d) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
