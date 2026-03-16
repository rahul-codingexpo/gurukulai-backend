import StaffAttendance from "./staffAttendance.model.js";
import Staff from "../staff/staff.model.js";

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

    if (entries && Array.isArray(entries)) {
      const toUpsert = entries.map((e) => ({
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
            status: e.status === "Absent" ? "Absent" : "Present",
            entryTime: e.entryTime || "",
            exitTime: e.exitTime || "",
          },
          upsert: true,
        },
      }));
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
        message: "staffId and status (Present/Absent) are required",
      });
    }

    const record = await StaffAttendance.findOneAndUpdate(
      { schoolId, date: dateOnly, staffId },
      {
        schoolId,
        date: dateOnly,
        staffId,
        status: status === "Absent" ? "Absent" : "Present",
        entryTime: entryTime || "",
        exitTime: exitTime || "",
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
    if (["Staff", "Teacher", "Principal"].includes(roleName)) {
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

    const records = await StaffAttendance.find(filter)
      .populate("staffId", "name designation")
      .sort({ date: -1, "staffId.name": 1 });

    const data = records.map((r) => ({
      _id: r._id,
      date: r.date,
      staffId: r.staffId?._id,
      name: r.staffId?.name,
      role: r.staffId?.designation,
      status: r.status,
      entryTime: r.entryTime,
      exitTime: r.exitTime,
    }));

    res.json({
      success: true,
      data,
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

    const { status, entryTime, exitTime } = req.body;
    if (status !== undefined) record.status = status === "Absent" ? "Absent" : "Present";
    if (entryTime !== undefined) record.entryTime = entryTime;
    if (exitTime !== undefined) record.exitTime = exitTime;
    await record.save();

    const data = {
      _id: record._id,
      date: record.date,
      staffId: record.staffId?._id,
      name: record.staffId?.name,
      role: record.staffId?.designation,
      status: record.status,
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
