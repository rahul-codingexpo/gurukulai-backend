/**
 * Calendar-day helpers — keep mobile mark and web read on the same local day.
 * YYYY-MM-DD must not be parsed as UTC midnight (avoids off-by-one in IST etc.).
 */

export const parseDateOnlyLocal = (input) => {
  if (input === undefined || input === null || input === "") return null;

  if (typeof input === "string") {
    const trimmed = input.trim();
    const isoDay = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDay) {
      const y = Number(isoDay[1]);
      const m = Number(isoDay[2]);
      const d = Number(isoDay[3]);
      const local = new Date(y, m - 1, d, 0, 0, 0, 0);
      return Number.isNaN(local.getTime()) ? null : local;
    }
  }

  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

export const dateOnlyRange = (dateOnly) => {
  const base = parseDateOnlyLocal(dateOnly);
  if (!base) return { start: null, end: null };
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

export const attendanceStudentIdKey = (studentId) =>
  String(studentId?._id ?? studentId ?? "");
