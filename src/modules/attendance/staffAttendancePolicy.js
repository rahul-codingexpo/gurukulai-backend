/** Parse "HH:mm" or "H:mm" → minutes from midnight, or null. */
export function parseHhmmToMinutes(value) {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export function normalizeHhmm(value, fallback = "08:00") {
  const mins = parseHhmmToMinutes(value);
  if (mins == null) return fallback;
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function resolveAttendanceSettings(schoolOrSettings) {
  const raw =
    schoolOrSettings?.attendanceSettings ||
    schoolOrSettings ||
    {};
  const staffStartTime = normalizeHhmm(raw.staffStartTime, "08:00");
  let staffGraceMinutes = Number(raw.staffGraceMinutes);
  if (!Number.isFinite(staffGraceMinutes) || staffGraceMinutes < 0) {
    staffGraceMinutes = 5;
  }
  staffGraceMinutes = Math.min(180, Math.round(staffGraceMinutes));
  return { staffStartTime, staffGraceMinutes };
}

/**
 * Present if entry is before (start + grace).
 * Example: start 08:00, grace 5 → Present until 08:04; 08:05+ is Late.
 * Before start counts as Present. Missing entry with non-Absent → Present fallback.
 */
export function resolveStaffMarkTypeFromEntry({
  entryTime,
  status,
  markType,
  attendanceSettings,
}) {
  const selected = String(markType || status || "").trim();
  if (selected === "Absent" || String(status || "").trim() === "Absent") {
    return "Absent";
  }

  const { staffStartTime, staffGraceMinutes } =
    resolveAttendanceSettings(attendanceSettings);
  const entryMins = parseHhmmToMinutes(entryTime);
  if (entryMins == null) {
    return selected === "Late" ? "Late" : "Present";
  }

  const startMins = parseHhmmToMinutes(staffStartTime) ?? 8 * 60;
  const lateFrom = startMins + staffGraceMinutes;
  return entryMins >= lateFrom ? "Late" : "Present";
}

export function buildStaffAttendancePayload({
  status,
  markType,
  entryTime,
  exitTime,
  attendanceSettings,
  nowHhmm,
}) {
  const selected = String(markType || status || "").trim();
  if (selected === "Absent") {
    return {
      status: "Absent",
      markType: "Absent",
      entryTime: entryTime || "",
      exitTime: exitTime || "",
    };
  }

  const computedEntry =
    entryTime !== undefined && entryTime !== null && String(entryTime).trim() !== ""
      ? String(entryTime).trim()
      : nowHhmm || "";

  const resolvedMarkType = resolveStaffMarkTypeFromEntry({
    entryTime: computedEntry,
    status: "Present",
    markType: selected,
    attendanceSettings,
  });

  return {
    status: "Present",
    markType: resolvedMarkType,
    entryTime: computedEntry,
    exitTime: exitTime || "",
  };
}
