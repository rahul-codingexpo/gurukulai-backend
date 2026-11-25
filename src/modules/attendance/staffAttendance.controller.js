import mongoose from "mongoose";
import StaffAttendance from "./staffAttendance.model.js";
import Staff from "../staff/staff.model.js";
import School from "../school/school.model.js";
import {
  buildStaffAttendancePayload,
  resolveStaffMarkTypeFromEntry,
  resolveAttendanceSettings,
  parseHhmmToMinutes,
} from "./staffAttendancePolicy.js";
import { parseDateOnlyLocal } from "../../utils/dateOnly.util.js";

const EXIT_MIN_GAP_MINUTES = 5;

const hhmmNow = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const minutesBetweenHhmm = (fromHhmm, toHhmm) => {
  const from = parseHhmmToMinutes(fromHhmm);
  const to = parseHhmmToMinutes(toHhmm);
  if (from == null || to == null) return null;
  let diff = to - from;
  // Cross-midnight: treat as next-day exit
  if (diff < 0) diff += 24 * 60;
  return diff;
};

const staffScanResponse = ({ action, alreadyMarked, message, staff, attendance }) => ({
  success: true,
  action,
  alreadyMarked: Boolean(alreadyMarked),
  message,
  data: {
    staff: {
      _id: staff._id,
      name: staff.name,
      designation: staff.designation,
      phone: staff.phone || "",
      email: staff.email || "",
    },
    attendance,
  },
});

const resolveSchoolId = (req) => {
  const roleName = req.user?.roleId?.name;
  if (roleName === "SuperAdmin") {
    return req.query.schoolId || req.body.schoolId || req.params.schoolId || null;
  }
  return req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
};

/**
 * Mark staff attendance (single or bulk).
 * Body: { date, staffId, status, entryTime?, exitTime? } or { date, entries: [ { staffId, status, entryTime?, exitTime? } ] }
 */
export const markStaffAttendance = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query or body)"
            : "School context missing",
      });
    }

    const { date, staffId, status, entryTime, exitTime, entries } = req.body;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "date is required",
      });
    }

    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    const school = await School.findById(schoolId).select("attendanceSettings").lean();
    const attendanceSettings = resolveAttendanceSettings(school);

    if (entries && Array.isArray(entries)) {
      const toUpsert = entries.map((e) => {
        const payload = buildStaffAttendancePayload({
          status: e.status,
          markType: e.markType || e.status,
          entryTime: e.entryTime,
          exitTime: e.exitTime,
          attendanceSettings,
          nowHhmm: hhmmNow(),
        });
        return {
          updateOne: {
            filter: {
              schoolId,
              date: dateOnly,
              staffId: e.staffId,
            },
            update: {
              schoolId,
              date: dateOnly,
              staffId: e.staffId,
              ...payload,
            },
            upsert: true,
          },
        };
      });
      await StaffAttendance.bulkWrite(toUpsert);
      const records = await StaffAttendance.find({
        schoolId,
        date: dateOnly,
        staffId: { $in: entries.map((e) => e.staffId) },
      })
        .populate("staffId", "name designation");
      return res.status(200).json({
        success: true,
        data: records,
      });
    }

    if (!staffId || !status) {
      return res.status(400).json({
        success: false,
        message: "staffId and status (Present/Absent/Late) are required",
      });
    }

    const payload = buildStaffAttendancePayload({
      status,
      markType: status,
      entryTime,
      exitTime,
      attendanceSettings,
      nowHhmm: hhmmNow(),
    });

    const record = await StaffAttendance.findOneAndUpdate(
      { schoolId, date: dateOnly, staffId },
      {
        schoolId,
        date: dateOnly,
        staffId,
        ...payload,
      },
      { upsert: true, new: true }
    ).populate("staffId", "name designation");

    res.status(200).json({
      success: true,
      data: record,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get staff attendance.
 * - date is optional; use dateFrom/dateTo for range, or omit for last 365 days.
 * - If role is Staff/Teacher/Principal: returns only that staff's attendance ("my attendance").
 * - If role is Admin/Principal: can filter by date, staffId.
 */
export const getStaffAttendanceByDate = async (req, res, next) => {
  try {
    const roleName = req.user?.roleId?.name;
    let schoolId = resolveSchoolId(req);

    // Staff/Teacher/Principal viewing own attendance
    if (["Staff", "Teacher"].includes(roleName)) {
      const staff = await Staff.findOne({ userId: req.user._id }).select(
        "_id schoolId"
      );
      if (!staff) {
        return res.status(404).json({
          success: false,
          message: "Staff profile not found for this user",
        });
      }
      schoolId = staff.schoolId;
      req._resolvedStaffId = staff._id;
    }

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          roleName === "SuperAdmin"
            ? "schoolId is required (query). Example: ?schoolId=..."
            : "School context missing",
      });
    }

    const { date, dateFrom, dateTo, staffId } = req.query;

    const filter = { schoolId };

    if (req._resolvedStaffId) {
      filter.staffId = req._resolvedStaffId;
    } else if (staffId) {
      filter.staffId = staffId;
    }

    if (date) {
      const dateOnly = new Date(date);
      dateOnly.setHours(0, 0, 0, 0);
      filter.date = dateOnly;
    } else if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) {
        const d = new Date(dateFrom);
        d.setHours(0, 0, 0, 0);
        filter.date.$gte = d;
      }
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        filter.date.$lte = d;
      }
    } else {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 365);
      start.setHours(0, 0, 0, 0);
      filter.date = { $gte: start, $lte: end };
    }

    const school = await School.findById(schoolId).select("attendanceSettings").lean();
    const attendanceSettings = resolveAttendanceSettings(school);

    const records = await StaffAttendance.find(filter)
      .populate("staffId", "name designation")
      .sort({ date: -1, "staffId.name": 1 });

    const data = records.map((r) => {
      const markType = resolveStaffMarkTypeFromEntry({
        entryTime: r.entryTime,
        status: r.status,
        markType: r.markType || r.status,
        attendanceSettings,
      });
      return {
        _id: r._id,
        date: r.date,
        staffId: r.staffId?._id,
        name: r.staffId?.name,
        role: r.staffId?.designation,
        status: r.status,
        markType,
        entryTime: r.entryTime,
        exitTime: r.exitTime,
      };
    });

    res.json({
      success: true,
      data,
      attendanceSettings,
    });
  } catch (error) {
    next(error);
  }
};

export const updateStaffAttendance = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query or body)"
            : "School context missing",
      });
    }

    const record = await StaffAttendance.findOne({
      _id: req.params.id,
      schoolId,
    }).populate("staffId", "name designation");

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Staff attendance record not found",
      });
    }

    const school = await School.findById(schoolId).select("attendanceSettings").lean();
    const attendanceSettings = resolveAttendanceSettings(school);
    const { status, entryTime, exitTime, markType } = req.body;
    const payload = buildStaffAttendancePayload({
      status: status !== undefined ? status : record.status,
      markType: markType || status || record.markType || record.status,
      entryTime: entryTime !== undefined ? entryTime : record.entryTime,
      exitTime: exitTime !== undefined ? exitTime : record.exitTime,
      attendanceSettings,
      nowHhmm: hhmmNow(),
    });
    record.status = payload.status;
    record.markType = payload.markType;
    record.entryTime = payload.entryTime;
    record.exitTime = payload.exitTime;
    await record.save();

    const data = {
      _id: record._id,
      date: record.date,
      staffId: record.staffId?._id,
      name: record.staffId?.name,
      role: record.staffId?.designation,
      status: record.status,
      markType: record.markType || record.status,
      entryTime: record.entryTime,
      exitTime: record.exitTime,
    };

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteStaffAttendance = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query)"
            : "School context missing",
      });
    }

    const deleted = await StaffAttendance.findOneAndDelete({
      _id: req.params.id,
      schoolId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Staff attendance record not found",
      });
    }

    res.json({
      success: true,
      message: "Staff attendance record deleted",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark staff Present/Late from ID-card QR (or phone fallback).
 * Body: { qrPayload, date? } — QR format STF:{staffId} or STF:{staffId}:{phone}
 */
export const scanStaffAttendance = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query or body)"
            : "School context missing",
      });
    }

    const raw = String(req.body?.qrPayload || "").trim();
    if (!raw) {
      return res.status(400).json({
        success: false,
        message: "qrPayload is required",
      });
    }

    const dateInput =
      req.body?.date ||
      (() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      })();
    const dateOnly = parseDateOnlyLocal(dateInput);
    if (!dateOnly) {
      return res.status(400).json({
        success: false,
        message: "Invalid date",
      });
    }

    const staffSelect = "_id name designation phone email status";
    let staff = null;
    const stfMatch = raw.match(/^STF:([a-fA-F0-9]{24})(?::(.*))?$/i);
    if (stfMatch) {
      const staffId = stfMatch[1];
      const phoneFromQr = String(stfMatch[2] || "").trim();
      if (!mongoose.Types.ObjectId.isValid(staffId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid staff QR code",
        });
      }
      staff = await Staff.findOne({ _id: staffId, schoolId })
        .select(staffSelect)
        .lean();
      if (!staff) {
        return res.status(404).json({
          success: false,
          message: "Staff not found for this school",
        });
      }
      const phoneDb = String(staff.phone || "").trim();
      if (
        phoneFromQr &&
        phoneDb &&
        phoneFromQr.replace(/\s+/g, "") !== phoneDb.replace(/\s+/g, "")
      ) {
        return res.status(400).json({
          success: false,
          message: "QR phone does not match staff record",
        });
      }
    } else {
      const digits = raw.replace(/\D/g, "");
      const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const phoneRe = new RegExp(`^${escaped}$`, "i");
      staff = await Staff.findOne({
        schoolId,
        $or: [
          { phone: phoneRe },
          ...(digits.length >= 8 ? [{ phone: new RegExp(`${digits}$`) }] : []),
          { email: phoneRe },
        ],
      })
        .select(staffSelect)
        .lean();
      if (!staff) {
        return res.status(404).json({
          success: false,
          message: "No staff found for this code",
        });
      }
    }

    if (String(staff.status || "").toUpperCase() === "INACTIVE") {
      return res.status(400).json({
        success: false,
        message: "Staff is inactive",
      });
    }

    const nowHhmm = hhmmNow();
    const existing = await StaffAttendance.findOne({
      schoolId,
      date: dateOnly,
      staffId: staff._id,
    }).lean();

    const hasPresentEntry =
      Boolean(existing) &&
      (existing.status === "Present" ||
        existing.markType === "Present" ||
        existing.markType === "Late") &&
      Boolean(String(existing.entryTime || "").trim());
    const existingExit = String(existing?.exitTime || "").trim();

    // Second (or later) scan: mark / update exit after minimum gap from entry
    if (hasPresentEntry) {
      const gapMinutes = minutesBetweenHhmm(existing.entryTime, nowHhmm);
      const staffPopulate = "name designation phone";

      if (!existingExit) {
        if (gapMinutes == null || gapMinutes < EXIT_MIN_GAP_MINUTES) {
          const waitMins =
            gapMinutes == null
              ? EXIT_MIN_GAP_MINUTES
              : Math.max(1, EXIT_MIN_GAP_MINUTES - gapMinutes);
          const record = await StaffAttendance.findById(existing._id).populate(
            "staffId",
            staffPopulate,
          );
          return res.status(200).json(
            staffScanResponse({
              action: "too_soon",
              alreadyMarked: true,
              message: `Entry already marked at ${existing.entryTime}. Wait ${waitMins} more minute(s) to mark exit.`,
              staff,
              attendance: record,
            }),
          );
        }

        const record = await StaffAttendance.findOneAndUpdate(
          { _id: existing._id },
          { exitTime: nowHhmm },
          { new: true },
        ).populate("staffId", staffPopulate);

        return res.status(200).json(
          staffScanResponse({
            action: "exit",
            alreadyMarked: true,
            message: `Exit marked at ${nowHhmm}`,
            staff,
            attendance: record,
          }),
        );
      }

      const record = await StaffAttendance.findOneAndUpdate(
        { _id: existing._id },
        { exitTime: nowHhmm },
        { new: true },
      ).populate("staffId", staffPopulate);

      return res.status(200).json(
        staffScanResponse({
          action: "exit_update",
          alreadyMarked: true,
          message: `Exit updated to ${nowHhmm}`,
          staff,
          attendance: record,
        }),
      );
    }

    // First scan of the day: mark entry
    const school = await School.findById(schoolId).select("attendanceSettings").lean();
    const attendanceSettings = resolveAttendanceSettings(school);
    const payload = buildStaffAttendancePayload({
      status: "Present",
      markType: "Present",
      entryTime: nowHhmm,
      exitTime: "",
      attendanceSettings,
      nowHhmm,
    });

    const record = await StaffAttendance.findOneAndUpdate(
      { schoolId, date: dateOnly, staffId: staff._id },
      {
        schoolId,
        date: dateOnly,
        staffId: staff._id,
        ...payload,
      },
      { upsert: true, new: true },
    ).populate("staffId", "name designation phone");

    const markLabel = record.markType || record.status || "Present";

    return res.status(200).json(
      staffScanResponse({
        action: "entry",
        alreadyMarked: false,
        message: `Attendance marked ${markLabel} (entry ${record.entryTime || nowHhmm})`,
        staff,
        attendance: record,
      }),
    );
  } catch (error) {
    next(error);
  }
};
