/**
 * Parse school Excel/CSV date values as calendar dates (India: DD/MM/YYYY).
 * Never use ambiguous `new Date("12-05-2018")` — Node/V8 treats that as MM-DD-YYYY.
 */

const pad2 = (n) => String(n).padStart(2, "0");

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

/** Local midnight Date for a real calendar day, or null. */
export const calendarDateLocal = (day, month, year) => {
  if (!isValidCalendarDate(day, month, year)) return null;
  return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
};

/**
 * @param {*} value - Date | Excel serial | string (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, …)
 * @returns {Date|null}
 */
export const parseSheetDate = (value) => {
  if (value === undefined || value === null || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // Prefer local YMD (SheetJS cellDates usually builds local midnight).
    const local = calendarDateLocal(value.getDate(), value.getMonth() + 1, value.getFullYear());
    if (local) return local;
    return calendarDateLocal(value.getUTCDate(), value.getUTCMonth() + 1, value.getUTCFullYear());
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial (whole days). Defer to caller’s XLSX if available; simple 1899-12-30 epoch.
    const excelEpoch = Date.UTC(1899, 11, 30);
    const ms = excelEpoch + Math.round(value) * 86400000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return calendarDateLocal(d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    return calendarDateLocal(Number(iso[3]), Number(iso[2]), Number(iso[1]));
  }

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (and 2-digit years → full year)
  const dmy = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
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
export const parseSheetDateToIso = (value) => {
  const d = parseSheetDate(value);
  if (!d) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
