import Event from "../events/event.model.js";
import { deriveEventStatus } from "../../utils/eventStatus.util.js";

const roleNameOf = (req) => req.user?.roleId?.name;

const resolveSchoolId = (req) =>
  req.user?.schoolId?._id ?? req.user?.schoolId ?? null;

const DEFAULT_HOLIDAY_IMAGE =
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3d6.png";

const toDateOnlyString = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const expandEventDays = (event, year, month) => {
  const title = event.title || "Holiday";
  const image = event.imageUrl || DEFAULT_HOLIDAY_IMAGE;
  const description = event.description || "";
  const location = event.location || "";
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  if (Number.isNaN(start.getTime())) return [];

  const last = Number.isNaN(end.getTime()) ? start : end;
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );
  const limit = new Date(
    Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate()),
  );
  const days = [];
  let guard = 0;
  while (cursor.getTime() <= limit.getTime() && guard < 62) {
    const inMonth =
      !year ||
      !month ||
      (cursor.getUTCFullYear() === year && cursor.getUTCMonth() === month - 1);
    if (inMonth) {
      days.push({
        id: String(event._id),
        title,
        date: toDateOnlyString(cursor),
        image,
        description,
        location,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return days.filter((day) => day.date);
};

const audienceForRole = (role) => {
  if (role === "Student") return ["STUDENTS", "ALL"];
  if (role === "Parent") return ["PARENTS", "ALL"];
  if (role === "Teacher") return ["TEACHERS", "ALL"];
  if (role === "Staff") return ["STAFF", "ALL"];
  return ["ALL"];
};

/**
 * GET /api/mobile/holidays
 * Maps school events to holiday cards for the calendar UI.
 * Optional query: year, month (1-12) to narrow the range.
 */
export const listMobileHolidays = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (!["Student", "Parent", "Teacher", "Staff"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Not allowed",
      });
    }

    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    const filter = { schoolId };
    // Teachers and staff manage the calendar, so they see every audience.
    // Students and parents only see events meant for them.
    if (role !== "Teacher" && role !== "Staff") {
      filter.organizationFor = { $in: audienceForRole(role) };
    }

    const year = req.query.year ? Number(req.query.year) : null;
    const month = req.query.month ? Number(req.query.month) : null;
    let rangeYear = null;
    let rangeMonth = null;
    if (year && month && month >= 1 && month <= 12) {
      rangeYear = year;
      rangeMonth = month;
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 1));
      filter.startAt = { $lt: end };
      filter.endAt = { $gte: start };
    }

    const events = await Event.find(filter)
      .select("title description startAt endAt location")
      .sort({ startAt: 1 })
      .lean();

    const data = events.flatMap((event) =>
      expandEventDays(event, rangeYear, rangeMonth),
    );

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const ALLOWED_AUDIENCE = [
  "STUDENTS",
  "TEACHERS",
  "PARENTS",
  "STAFF",
  "ACCOUNTANTS",
  "LIBRARIANS",
  "ALL",
];

const parseDay = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
};

/**
 * POST /api/mobile/events
 * Teacher and Staff add a school calendar event (festival, poster making, etc.).
 * Body: title, date (YYYY-MM-DD), optional endDate, description, location, organizationFor.
 */
export const createMobileEvent = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (role !== "Teacher" && role !== "Staff") {
      return res.status(403).json({
        success: false,
        message: "Only teachers and staff can add events",
      });
    }

    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const location = String(req.body?.location || "").trim();
    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Event title is required",
      });
    }
    if (title.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Title must be 200 characters or less",
      });
    }
    if (description.length > 4000 || location.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Description or location is too long",
      });
    }

    const startDay = parseDay(req.body?.date || req.body?.startDate);
    const endDay = parseDay(req.body?.endDate || req.body?.date || req.body?.startDate);
    if (!startDay || !endDay) {
      return res.status(400).json({
        success: false,
        message: "A valid date (YYYY-MM-DD) is required",
      });
    }
    if (endDay.getTime() < startDay.getTime()) {
      return res.status(400).json({
        success: false,
        message: "End date must be on or after the start date",
      });
    }

    const startAt = new Date(startDay);
    startAt.setUTCHours(0, 0, 0, 0);
    const endAt = new Date(endDay);
    endAt.setUTCHours(23, 59, 59, 0);

    let organizationFor = req.body?.organizationFor ?? ["ALL"];
    if (typeof organizationFor === "string") {
      organizationFor = organizationFor
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (!Array.isArray(organizationFor) || organizationFor.length === 0) {
      organizationFor = ["ALL"];
    }
    organizationFor = [...new Set(organizationFor.map((item) => String(item).toUpperCase()))];
    if (organizationFor.some((item) => !ALLOWED_AUDIENCE.includes(item))) {
      return res.status(400).json({
        success: false,
        message: "Invalid audience",
      });
    }

    const event = await Event.create({
      schoolId,
      title,
      description,
      location,
      startAt,
      endAt,
      organizationFor,
      status: deriveEventStatus(startAt, endAt),
      createdBy: req.user?._id ?? null,
    });

    res.status(201).json({
      success: true,
      data: {
        id: String(event._id),
        title: event.title,
        date: toDateOnlyString(event.startAt),
        endDate: toDateOnlyString(event.endAt),
        description: event.description || "",
        location: event.location || "",
        organizationFor: event.organizationFor,
      },
    });
  } catch (error) {
    next(error);
  }
};
