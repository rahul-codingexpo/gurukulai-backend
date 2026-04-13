import Gallery from "./gallery.model.js";
import { uploadedFileUrl } from "../../utils/uploadFile.util.js";

const resolveSchoolId = (req) => {
  const roleName = req.user?.roleId?.name;
  if (roleName === "SuperAdmin") {
    return req.query.schoolId || req.body.schoolId || req.params.schoolId || null;
  }
  return req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
};

const detectMediaType = (mimetype = "") => {
  if (mimetype.startsWith("image/")) return "IMAGE";
  if (mimetype.startsWith("video/")) return "VIDEO";
  return null;
};

export const uploadGalleryMedia = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          req.user?.roleId?.name === "SuperAdmin"
            ? "schoolId is required (query/body)"
            : "School context missing",
      });
    }

    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({
        success: false,
        message: "At least one media file is required. Use field name: mediaFiles",
      });
    }

    const title = req.body.title || "";
    const description = req.body.description || "";

    const docs = [];
    for (const f of files) {
      const mediaType = detectMediaType(f.mimetype);
      if (!mediaType) continue;
      docs.push({
        schoolId,
        title,
        description,
        mediaType,
        mediaUrl: uploadedFileUrl(f),
        mimeType: f.mimetype || "",
        size: f.size || 0,
        uploadedBy: req.user._id,
      });
    }

    if (!docs.length) {
      return res.status(400).json({
        success: false,
        message: "No valid media files found (allowed: images/videos)",
      });
    }

    const created = await Gallery.insertMany(docs);
    res.status(201).json({
      success: true,
      message: "Media uploaded successfully",
      data: created,
    });
  } catch (error) {
    next(error);
  }
};

export const getGalleryList = async (req, res, next) => {
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

    const { mediaType, search } = req.query;
    const filter = { schoolId };
    if (mediaType) filter.mediaType = String(mediaType).toUpperCase();
    if (search) {
      filter.$or = [
        { title: { $regex: String(search), $options: "i" } },
        { description: { $regex: String(search), $options: "i" } },
      ];
    }

    const items = await Gallery.find(filter)
      .populate("uploadedBy", "name roleId")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};

export const getGalleryById = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({ success: false, message: "School context missing" });
    }

    const item = await Gallery.findOne({ _id: req.params.id, schoolId }).populate(
      "uploadedBy",
      "name roleId",
    );
    if (!item) {
      return res.status(404).json({ success: false, message: "Gallery item not found" });
    }
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

export const updateGalleryItem = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({ success: false, message: "School context missing" });
    }

    const item = await Gallery.findOne({ _id: req.params.id, schoolId });
    if (!item) {
      return res.status(404).json({ success: false, message: "Gallery item not found" });
    }

    if (req.body.title !== undefined) item.title = req.body.title;
    if (req.body.description !== undefined) item.description = req.body.description;

    if (req.file) {
      const mediaType = detectMediaType(req.file.mimetype);
      if (!mediaType) {
        return res.status(400).json({
          success: false,
          message: "Invalid media file (allowed: images/videos)",
        });
      }
      item.mediaType = mediaType;
      item.mediaUrl = uploadedFileUrl(req.file);
      item.mimeType = req.file.mimetype || "";
      item.size = req.file.size || 0;
    }

    await item.save();
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

export const deleteGalleryItem = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) {
      return res.status(400).json({ success: false, message: "School context missing" });
    }

    const deleted = await Gallery.findOneAndDelete({ _id: req.params.id, schoolId });
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Gallery item not found" });
    }
    res.json({ success: true, message: "Gallery item deleted" });
  } catch (error) {
    next(error);
  }
};

