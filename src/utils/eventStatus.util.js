import Event from "../modules/events/event.model.js";

/**
 * Live event status from start/end datetime.
 * now < start → UPCOMING
 * start ≤ now ≤ end → ONGOING
 * now > end → COMPLETED
 */
export function deriveEventStatus(startAt, endAt, now = new Date()) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  const t = now.getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "UPCOMING";
  if (t < start) return "UPCOMING";
  if (t > end) return "COMPLETED";
  return "ONGOING";
}

export function applyLiveEventStatus(event, now = new Date()) {
  if (!event) return event;
  const obj = typeof event.toObject === "function" ? event.toObject() : { ...event };
  obj.status = deriveEventStatus(obj.startAt, obj.endAt, now);
  return obj;
}

export async function persistStaleEventStatuses(events, now = new Date()) {
  if (!Array.isArray(events) || !events.length) return;
  const ops = [];
  for (const event of events) {
    const live = deriveEventStatus(event.startAt, event.endAt, now);
    if (event.status !== live && event._id) {
      ops.push({
        updateOne: {
          filter: { _id: event._id },
          update: { $set: { status: live } },
        },
      });
    }
  }
  if (ops.length) {
    Event.bulkWrite(ops).catch(() => {});
  }
}
