import Timetable from "../timetable/timetable.model.js";
import ClassTimetable from "../classTimetable/classTimetable.model.js";
import Student from "../student/student.model.js";
import Staff from "../staff/staff.model.js";
import ClassModel from "../academic/class.model.js";
import Section from "../academic/section.model.js";

const DAY_MAP = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Thr: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Monday: "Monday",
  Tuesday: "Tuesday",
  Wednesday: "Wednesday",
  Thursday: "Thursday",
  Friday: "Friday",
  Saturday: "Saturday",
};

const SHORT_DAY = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
};

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const SHORT_DAY_ORDER = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5 };

const CATEGORY_PALETTE = [
  "#E3F2FD",
  "#F3E5F5",
  "#E8F5E9",
  "#FFF3E0",
  "#FCE4EC",
  "#E0F7FA",
  "#F1F8E9",
];

const parseTimeToMinutes = (t) => {
  if (!t) return 0;
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

const formatTime12h = (hhmm) => {
  if (!hhmm) return "";
  const m = String(hhmm).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return String(hhmm);
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ap = h >= 12 ? "PM" : "AM";
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${ap}`;
};

const formatDurationLabel = (mins) => {
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const parts = [];
  if (h) parts.push(h === 1 ? "1 hour" : `${h} hours`);
  if (m) parts.push(`${m} min`);
  return parts.join(" ") || "0 min";
};

const categoryColorFromCode = (code) => {
  let h = 0;
  const s = String(code || "X");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length];
};

const isLiveSlot = (fullDayNames, startTime, endTime) => {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const now = new Date();
  const todayName = dayNames[now.getDay()];
  if (!fullDayNames.includes(todayName)) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = parseTimeToMinutes(startTime);
  const e = parseTimeToMinutes(endTime);
  return cur >= s && cur < e;
};

const computeNextClass = (fullDayNames, startTime) => {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const allowed = new Set(fullDayNames);
  const now = new Date();
  let best = null;
  for (let add = 0; add < 14; add++) {
    const d = new Date(now);
    d.setDate(d.getDate() + add);
    const name = dayNames[d.getDay()];
    if (!allowed.has(name)) continue;
    const parts = String(startTime).split(":");
    const hh = parseInt(parts[0], 10) || 0;
    const mm = parseInt(parts[1], 10) || 0;
    const slot = new Date(d);
    slot.setHours(hh, mm, 0, 0);
    if (slot > now && (!best || slot < best)) best = slot;
  }
  if (!best) return { at: null, label: null };
  const timeStr = formatTime12h(startTime);
  const t0 = new Date(now);
  t0.setHours(0, 0, 0, 0);
  const t1 = new Date(best);
  t1.setHours(0, 0, 0, 0);
  const diffDays = Math.round((t1 - t0) / 86400000);
  let label;
  if (diffDays === 0) label = `Today at ${timeStr}`;
  else if (diffDays === 1) label = `Tomorrow at ${timeStr}`;
  else {
    const dn = dayNames[best.getDay()];
    label = `${SHORT_DAY[dn] || dn} at ${timeStr}`;
  }
  return { at: best, label };
};

const normalizeDay = (day) => {
  if (!day) return null;
  const key = String(day).trim();
  return DAY_MAP[key] || null;
};

/** GET /api/mobile/timetable?day=Mon */
export const getMobileTimetable = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    const inputDay = req.query.day || "Mon";
    const day = normalizeDay(inputDay);

    if (!day) {
      return res.status(400).json({
        success: false,
        message: "Invalid day. Use Mon/Tue/Wed/Thu/Fri/Sat or full day name",
      });
    }

    let schoolId = req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
    const filter = { day };
    const classIdFilter = {};
    const sectionIdFilter = {};

    if (["Student", "Parent"].includes(roleName)) {
      const student =
        roleName === "Student"
          ? await Student.findOne({ "studentLogin.userId": req.user._id }).select(
              "_id schoolId className section"
            )
          : await Student.findOne({ "parentLogin.userId": req.user._id }).select(
              "_id schoolId className section"
            );

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found for this user",
        });
      }

      schoolId = student.schoolId;
      filter.schoolId = schoolId;

      // Student model has className/section as string; timetable uses ObjectIds.
      const classes = await ClassModel.find({
        schoolId,
        name: student.className,
      }).select("_id");

      if (!classes.length) {
        return res.json({
          success: true,
          data: {
            selectedDay: SHORT_DAY[day],
            fullDay: day,
            slots: [],
          },
        });
      }

      const classIds = classes.map((c) => c._id);
      const sections = await Section.find({
        schoolId,
        classId: { $in: classIds },
        name: student.section,
      }).select("_id classId");

      if (!sections.length) {
        return res.json({
          success: true,
          data: {
            selectedDay: SHORT_DAY[day],
            fullDay: day,
            slots: [],
          },
        });
      }

      classIdFilter.$in = classIds;
      sectionIdFilter.$in = sections.map((s) => s._id);
    } else if (roleName === "Teacher") {
      filter.schoolId = schoolId;
      filter.teacherId = req.user._id;
    } else if (["Admin", "Principal", "Staff", "Accountant", "Librarian"].includes(roleName)) {
      filter.schoolId = schoolId;
      // For non-teacher staff/admin mobile pages, allow optional class/section query
      if (req.query.classId) classIdFilter.$in = [req.query.classId];
      if (req.query.sectionId) sectionIdFilter.$in = [req.query.sectionId];
      if (req.query.teacherId) filter.teacherId = req.query.teacherId;
    } else if (roleName === "SuperAdmin") {
      const selectedSchoolId = req.query.schoolId;
      if (!selectedSchoolId) {
        return res.status(400).json({
          success: false,
          message: "schoolId is required for SuperAdmin",
        });
      }
      filter.schoolId = selectedSchoolId;
      if (req.query.classId) classIdFilter.$in = [req.query.classId];
      if (req.query.sectionId) sectionIdFilter.$in = [req.query.sectionId];
      if (req.query.teacherId) filter.teacherId = req.query.teacherId;
    } else {
      return res.status(403).json({
        success: false,
        message: "Role not allowed",
      });
    }

    if (!filter.schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    // Preferred: Timetable (period based) -> map to time slots using Period.startTime/endTime
    const ttFilter = { schoolId: filter.schoolId, day: filter.day };
    if (filter.teacherId) ttFilter.teacherId = filter.teacherId;
    if (classIdFilter.$in) ttFilter.classId = classIdFilter;
    if (sectionIdFilter.$in) ttFilter.sectionId = sectionIdFilter;

    let slots = [];

    const ttEntries = await Timetable.find(ttFilter)
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name code")
      .populate("teacherId", "name")
      .populate("periodId", "periodNumber startTime endTime isBreak")
      .sort({ "periodId.periodNumber": 1 })
      .lean();

    if (ttEntries?.length) {
      slots = ttEntries
        .filter((e) => !e.periodId?.isBreak)
        .map((e) => ({
          _id: e._id,
          subject: e.subjectId?.name || "",
          subjectCode: e.subjectId?.code || "",
          className: e.classId?.name || "",
          section: e.sectionId?.name || "",
          teacherName: e.teacherId?.name || "",
          roomNumber: "",
          startTime: e.periodId?.startTime || "",
          endTime: e.periodId?.endTime || "",
          day: e.day,
          shortDay: SHORT_DAY[e.day] || e.day,
          periodNumber: e.periodId?.periodNumber ?? null,
        }))
        .sort((a, b) => (a.periodNumber ?? 0) - (b.periodNumber ?? 0));
    } else {
      // Fallback: ClassTimetable (explicit time range)
      const ctFilter = { ...filter };
      if (classIdFilter.$in) ctFilter.classId = classIdFilter;
      if (sectionIdFilter.$in) ctFilter.sectionId = sectionIdFilter;

      const ctEntries = await ClassTimetable.find(ctFilter)
        .populate("classId", "name")
        .populate("sectionId", "name")
        .populate("subjectId", "name code")
        .populate("teacherId", "name")
        .sort({ startTime: 1 })
        .lean();

      slots = ctEntries.map((e) => ({
        _id: e._id,
        subject: e.subjectId?.name || "",
        subjectCode: e.subjectId?.code || "",
        className: e.classId?.name || "",
        section: e.sectionId?.name || "",
        teacherName: e.teacherId?.name || "",
        roomNumber: e.roomNumber || "",
        startTime: e.startTime,
        endTime: e.endTime,
        day: e.day,
        shortDay: SHORT_DAY[e.day] || e.day,
        periodNumber: null,
      }));
    }

    res.json({
      success: true,
      data: {
        selectedDay: SHORT_DAY[day],
        fullDay: day,
        slots,
      },
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/mobile/timetable/courses — aggregated recurring “course” cards (week view) */
export const getMobileTimetableCourses = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    let schoolId = req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
    const classIdFilter = {};
    const sectionIdFilter = {};
    let studentForCount = null;

    if (["Student", "Parent"].includes(roleName)) {
      const student =
        roleName === "Student"
          ? await Student.findOne({ "studentLogin.userId": req.user._id }).select(
              "_id schoolId className section"
            )
          : await Student.findOne({ "parentLogin.userId": req.user._id }).select(
              "_id schoolId className section"
            );

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found for this user",
        });
      }

      schoolId = student.schoolId;
      studentForCount = {
        schoolId: student.schoolId,
        className: student.className,
        section: student.section,
      };

      const classes = await ClassModel.find({
        schoolId,
        name: student.className,
      }).select("_id");

      if (!classes.length) {
        return res.json({ success: true, data: { courses: [] } });
      }

      const classIds = classes.map((c) => c._id);
      const sections = await Section.find({
        schoolId,
        classId: { $in: classIds },
        name: student.section,
      }).select("_id classId");

      if (!sections.length) {
        return res.json({ success: true, data: { courses: [] } });
      }

      classIdFilter.$in = classIds;
      sectionIdFilter.$in = sections.map((s) => s._id);
    } else if (roleName === "Teacher") {
      // schoolId from user context
    } else if (["Admin", "Principal", "Staff", "Accountant", "Librarian"].includes(roleName)) {
      if (req.query.classId) classIdFilter.$in = [req.query.classId];
      if (req.query.sectionId) sectionIdFilter.$in = [req.query.sectionId];
    } else if (roleName === "SuperAdmin") {
      const selectedSchoolId = req.query.schoolId;
      if (!selectedSchoolId) {
        return res.status(400).json({
          success: false,
          message: "schoolId is required for SuperAdmin",
        });
      }
      schoolId = selectedSchoolId;
      if (req.query.classId) classIdFilter.$in = [req.query.classId];
      if (req.query.sectionId) sectionIdFilter.$in = [req.query.sectionId];
    } else {
      return res.status(403).json({
        success: false,
        message: "Role not allowed",
      });
    }

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    const ttFilter = {
      schoolId,
      day: { $in: WEEKDAYS },
    };
    if (roleName === "Teacher") ttFilter.teacherId = req.user._id;
    if (req.query.teacherId && ["Admin", "Principal", "Staff", "Accountant", "Librarian", "SuperAdmin"].includes(roleName)) {
      ttFilter.teacherId = req.query.teacherId;
    }
    if (classIdFilter.$in) ttFilter.classId = classIdFilter;
    if (sectionIdFilter.$in) ttFilter.sectionId = sectionIdFilter;

    let normalized = [];

    const ttEntries = await Timetable.find(ttFilter)
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name code")
      .populate("teacherId", "name")
      .populate("periodId", "periodNumber startTime endTime isBreak")
      .sort({ day: 1, "periodId.periodNumber": 1 })
      .lean();

    if (ttEntries?.length) {
      normalized = ttEntries
        .filter((e) => !e.periodId?.isBreak)
        .map((e) => ({
          classId: e.classId?._id,
          sectionId: e.sectionId?._id,
          subjectId: e.subjectId?._id,
          teacherId: e.teacherId?._id,
          subject: e.subjectId?.name || "",
          subjectCode: e.subjectId?.code || "",
          className: e.classId?.name || "",
          section: e.sectionId?.name || "",
          teacherName: e.teacherId?.name || "",
          roomNumber: "",
          startTime: e.periodId?.startTime || "",
          endTime: e.periodId?.endTime || "",
          day: e.day,
          joinLink: null,
        }));
    } else {
      const ctFilter = {
        schoolId,
        day: { $in: WEEKDAYS },
      };
      if (roleName === "Teacher") ctFilter.teacherId = req.user._id;
      if (req.query.teacherId && ["Admin", "Principal", "Staff", "Accountant", "Librarian", "SuperAdmin"].includes(roleName)) {
        ctFilter.teacherId = req.query.teacherId;
      }
      if (classIdFilter.$in) ctFilter.classId = classIdFilter;
      if (sectionIdFilter.$in) ctFilter.sectionId = sectionIdFilter;

      const ctEntries = await ClassTimetable.find(ctFilter)
        .populate("classId", "name")
        .populate("sectionId", "name")
        .populate("subjectId", "name code")
        .populate("teacherId", "name")
        .sort({ day: 1, startTime: 1 })
        .lean();

      normalized = ctEntries.map((e) => ({
        classId: e.classId?._id,
        sectionId: e.sectionId?._id,
        subjectId: e.subjectId?._id,
        teacherId: e.teacherId?._id,
        subject: e.subjectId?.name || "",
        subjectCode: e.subjectId?.code || "",
        className: e.classId?.name || "",
        section: e.sectionId?.name || "",
        teacherName: e.teacherId?.name || "",
        roomNumber: e.roomNumber || "",
        startTime: e.startTime,
        endTime: e.endTime,
        day: e.day,
        joinLink: e.joinLink && String(e.joinLink).trim() ? String(e.joinLink).trim() : null,
      }));
    }

    const groupMap = new Map();

    for (const row of normalized) {
      const cid = row.classId?.toString?.() || String(row.classId || "");
      const sid = row.sectionId?.toString?.() || String(row.sectionId || "");
      const sub = row.subjectId?.toString?.() || String(row.subjectId || "");
      const tid = row.teacherId?.toString?.() || String(row.teacherId || "");
      const key = `${cid}_${sid}_${sub}_${tid}_${row.startTime}_${row.endTime}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          days: new Set(),
          joinLink: null,
          meta: { ...row },
        });
      }
      const g = groupMap.get(key);
      g.days.add(row.day);
      if (row.joinLink && !g.joinLink) g.joinLink = row.joinLink;
    }

    let cachedStudentTotal = null;
    if (studentForCount) {
      cachedStudentTotal = await Student.countDocuments({
        schoolId: studentForCount.schoolId,
        className: studentForCount.className,
        section: studentForCount.section,
        status: "ACTIVE",
      });
    }

    const classSectionTotals = new Map();
    const getTotalStudents = async (className, section) => {
      const k = `${className}||${section}`;
      if (classSectionTotals.has(k)) return classSectionTotals.get(k);
      const n = await Student.countDocuments({
        schoolId,
        className,
        section,
        status: "ACTIVE",
      });
      classSectionTotals.set(k, n);
      return n;
    };

    const courses = [];

    for (const [, g] of groupMap) {
      const m = g.meta;
      const fullDayNames = [...g.days].sort(
        (a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b)
      );
      const shortDays = fullDayNames.map((d) => SHORT_DAY[d] || d).sort(
        (a, b) => (SHORT_DAY_ORDER[a] ?? 99) - (SHORT_DAY_ORDER[b] ?? 99)
      );
      const scheduleSummary = `${shortDays.join(", ")} - ${formatTime12h(m.startTime)}`;
      const durationMinutes =
        parseTimeToMinutes(m.endTime) - parseTimeToMinutes(m.startTime);
      const durationLabel = formatDurationLabel(durationMinutes);

      const totalStudents = studentForCount
        ? cachedStudentTotal
        : await getTotalStudents(m.className, m.section);

      const { at: nextAt, label: nextClass } = computeNextClass(fullDayNames, m.startTime);

      courses.push({
        title: `${m.subject} - ${m.className}`.trim(),
        subtitle: m.section ? `Section ${m.section}` : "",
        subject: m.subject,
        subjectCode: m.subjectCode,
        className: m.className,
        section: m.section,
        instructorName: m.teacherName,
        scheduleSummary,
        days: fullDayNames,
        shortDays,
        startTime: m.startTime,
        endTime: m.endTime,
        durationMinutes: durationMinutes > 0 ? durationMinutes : null,
        durationLabel,
        roomNumber: m.roomNumber || "",
        totalStudents,
        isLive: isLiveSlot(fullDayNames, m.startTime, m.endTime),
        nextClass,
        nextClassAt: nextAt ? nextAt.toISOString() : null,
        joinLink: g.joinLink,
        categoryColor: categoryColorFromCode(m.subjectCode),
      });
    }

    courses.sort((a, b) => {
      if (!a.nextClassAt && !b.nextClassAt) return 0;
      if (!a.nextClassAt) return 1;
      if (!b.nextClassAt) return -1;
      return new Date(a.nextClassAt) - new Date(b.nextClassAt);
    });

    res.json({
      success: true,
      data: { courses },
    });
  } catch (error) {
    next(error);
  }
};

