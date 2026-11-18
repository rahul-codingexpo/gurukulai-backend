/**
 * School wall-clock helpers for mobile attendance (and similar).
 * Prefer SCHOOL_TIMEZONE; fall back to FEE_DUE_REMINDER_TZ then Asia/Kolkata.
 */

const DEFAULT_SCHOOL_TIMEZONE = "Asia/Kolkata";

export const getSchoolTimeZone = () => {
  const fromEnv =
    String(process.env.SCHOOL_TIMEZONE || "").trim() ||
    String(process.env.FEE_DUE_REMINDER_TZ || "").trim();
  return fromEnv || DEFAULT_SCHOOL_TIMEZONE;
};

const formatPartsInSchoolTz = (date = new Date(), options) => {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: getSchoolTimeZone(),
      ...options,
    }).formatToParts(date);
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: DEFAULT_SCHOOL_TIMEZONE,
      ...options,
    }).formatToParts(date);
  }
};

const partValue = (parts, type) => {
  const found = parts.find((p) => p.type === type);
  return found ? found.value : "";
};

/** Current school-local time as "HH:mm" (24h). */
export const hhmmNowInSchoolTz = (date = new Date()) => {
  const parts = formatPartsInSchoolTz(date, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  let hour = partValue(parts, "hour");
  const minute = partValue(parts, "minute");
  // Some engines emit "24" for midnight; normalize to "00".
  if (hour === "24") hour = "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
};

/** Today's calendar date in school TZ as "YYYY-MM-DD". */
export const todayYmdInSchoolTz = (date = new Date()) => {
  const parts = formatPartsInSchoolTz(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const yyyy = partValue(parts, "year");
  const mm = partValue(parts, "month").padStart(2, "0");
  const dd = partValue(parts, "day").padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
