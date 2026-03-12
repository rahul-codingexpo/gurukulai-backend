import Event from "./event.model.js";

export const createEvent = async (req, res, next) => {
  try {
    const schoolId = req.user.schoolId;
    const userId = req.user._id;

    const {
      title,
      description,
      location,
      startAt,
      endAt,
      organizationFor,
      status,
    } = req.body;

    if (!title || !startAt || !endAt) {
      return res.status(400).json({
        success: false,
        message: "title, startAt and endAt are required",
      });
    }

    if (new Date(endAt).getTime() < new Date(startAt).getTime()) {
      return res.status(400).json({
        success: false,
        message: "endAt must be after startAt",
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
      status,
      createdBy: userId,
    });

    res.status(201).json({
      success: true,
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

export const getEvents = async (req, res, next) => {
  try {
    const schoolId = req.user.schoolId;
    const { status, organizationFor, from, to } = req.query;

    const filter = { schoolId };
    if (status) filter.status = status;
    if (organizationFor) filter.organizationFor = organizationFor;
    if (from || to) {
      filter.startAt = {};
      if (from) filter.startAt.$gte = new Date(from);
      if (to) filter.startAt.$lte = new Date(to);
    }

    const events = await Event.find(filter).sort({ startAt: 1 });

    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    next(error);
  }
};

export const getEventById = async (req, res, next) => {
  try {
    const schoolId = req.user.schoolId;
    const { id } = req.params;

    const event = await Event.findOne({ _id: id, schoolId });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    res.json({
      success: true,
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

export const updateEvent = async (req, res, next) => {
  try {
    const schoolId = req.user.schoolId;
    const { id } = req.params;

    const event = await Event.findOne({ _id: id, schoolId });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const {
      title,
      description,
      location,
      startAt,
      endAt,
      organizationFor,
      status,
    } = req.body;

    if (title !== undefined) event.title = title;
    if (description !== undefined) event.description = description;
    if (location !== undefined) event.location = location;
    if (organizationFor !== undefined) event.organizationFor = organizationFor;
    if (status !== undefined) event.status = status;
    if (startAt !== undefined) event.startAt = startAt;
    if (endAt !== undefined) event.endAt = endAt;

    if (new Date(event.endAt).getTime() < new Date(event.startAt).getTime()) {
      return res.status(400).json({
        success: false,
        message: "endAt must be after startAt",
      });
    }

    await event.save();

    res.json({
      success: true,
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteEvent = async (req, res, next) => {
  try {
    const schoolId = req.user.schoolId;
    const { id } = req.params;

    const deleted = await Event.findOneAndDelete({ _id: id, schoolId });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    res.json({
      success: true,
      message: "Event deleted",
    });
  } catch (error) {
    next(error);
  }
};

