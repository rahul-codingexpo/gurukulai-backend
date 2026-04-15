import IdCardTemplate from "./idCardTemplate.model.js";
import { deleteFromSpacesByUrl } from "../../utils/spacesFile.util.js";
import { uploadedFileUrl } from "../../utils/uploadFile.util.js";
import {
  parseTemplateType,
  validateAndNormalizeSaveBody,
  defaultTemplateForType,
  isTrustedSpacesObjectUrl,
} from "./idCardTemplate.validation.js";

const schoolIdFromUser = (req) => req.user?.schoolId;

export const getIdCardTemplate = async (req, res, next) => {
  try {
    const type = parseTemplateType(req.query.type);
    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Query "type" must be student or staff',
        errors: [],
      });
    }
    const schoolId = schoolIdFromUser(req);
    if (!schoolId) {
      return res.status(403).json({
        success: false,
        message: "School context required",
        errors: [],
      });
    }

    const doc = await IdCardTemplate.findOne({ schoolId, type }).lean();
    if (!doc) {
      return res.json({
        success: true,
        data: defaultTemplateForType(type),
      });
    }

    return res.json({
      success: true,
      data: {
        type: doc.type,
        version: doc.version,
        cardSizeMm: doc.cardSizeMm,
        frontUrl: doc.frontUrl ?? null,
        backUrl: doc.backUrl ?? null,
        fields: doc.fields || [],
      },
    });
  } catch (err) {
    next(err);
  }
};

export const saveIdCardTemplate = async (req, res, next) => {
  try {
    const schoolId = schoolIdFromUser(req);
    if (!schoolId) {
      return res.status(403).json({
        success: false,
        message: "School context required",
        errors: [],
      });
    }

    const bodyType = parseTemplateType(req.body?.type);
    if (!bodyType) {
      return res.status(400).json({
        success: false,
        message: 'type must be "student" or "staff"',
        errors: [],
      });
    }

    const existing = await IdCardTemplate.findOne({ schoolId, type: bodyType });

    const { ok, errors, normalized } = validateAndNormalizeSaveBody(req.body, existing);
    if (!ok) {
      return res.status(400).json({
        success: false,
        message: errors[0] || "Invalid payload",
        errors,
      });
    }

    const oldFront =
      existing?.frontUrl && isTrustedSpacesObjectUrl(existing.frontUrl)
        ? existing.frontUrl
        : null;
    const newFront = normalized.frontUrl;
    if (oldFront && oldFront !== newFront) {
      await deleteFromSpacesByUrl(oldFront);
    }

    const oldBack =
      existing?.backUrl && isTrustedSpacesObjectUrl(existing.backUrl)
        ? existing.backUrl
        : null;
    const newBack = normalized.backUrl;
    if (oldBack && oldBack !== newBack) {
      await deleteFromSpacesByUrl(oldBack);
    }

    const doc = await IdCardTemplate.findOneAndUpdate(
      { schoolId, type: normalized.type },
      {
        $set: {
          schoolId,
          type: normalized.type,
          version: normalized.version,
          cardSizeMm: normalized.cardSizeMm,
          frontUrl: normalized.frontUrl,
          backUrl: normalized.backUrl,
          fields: normalized.fields,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();

    return res.json({
      success: true,
      message: "ID card template saved",
      data: {
        type: doc.type,
        version: doc.version,
        cardSizeMm: doc.cardSizeMm,
        frontUrl: doc.frontUrl ?? null,
        backUrl: doc.backUrl ?? null,
        fields: doc.fields || [],
      },
    });
  } catch (err) {
    next(err);
  }
};

export const uploadIdCardBackground = async (req, res, next) => {
  try {
    const schoolId = schoolIdFromUser(req);
    if (!schoolId) {
      return res.status(403).json({
        success: false,
        message: "School context required",
        errors: [],
      });
    }

    const type = parseTemplateType(req.body?.type);
    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Field "type" must be student or staff',
        errors: [],
      });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: "backgroundFile is required",
        errors: [],
      });
    }

    const newUrl = uploadedFileUrl(file);
    if (!newUrl || !/^https?:\/\//i.test(newUrl)) {
      return res.status(500).json({
        success: false,
        message: "Upload did not return a public URL",
        errors: [],
      });
    }

    const existing = await IdCardTemplate.findOne({ schoolId, type });
    const oldUrl =
      existing?.frontUrl && isTrustedSpacesObjectUrl(existing.frontUrl)
        ? existing.frontUrl
        : null;

    const doc = await IdCardTemplate.findOneAndUpdate(
      { schoolId, type },
      {
        $set: {
          schoolId,
          type,
          frontUrl: newUrl,
          ...(existing
            ? {}
            : {
                version: 1,
                cardSizeMm: { width: 86, height: 54 },
                backUrl: null,
                fields: [],
              }),
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();

    if (oldUrl && oldUrl !== newUrl) {
      await deleteFromSpacesByUrl(oldUrl);
    }

    return res.json({
      success: true,
      message: "Background uploaded",
      data: {
        type: doc.type,
        frontUrl: doc.frontUrl ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const removeIdCardBackground = async (req, res, next) => {
  try {
    const schoolId = schoolIdFromUser(req);
    if (!schoolId) {
      return res.status(403).json({
        success: false,
        message: "School context required",
        errors: [],
      });
    }

    const type = parseTemplateType(req.query.type);
    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Query "type" must be student or staff',
        errors: [],
      });
    }

    const existing = await IdCardTemplate.findOne({ schoolId, type });
    if (!existing) {
      return res.json({
        success: true,
        message: "Background removed",
        data: { type, frontUrl: null },
      });
    }

    const oldUrl =
      existing.frontUrl && isTrustedSpacesObjectUrl(existing.frontUrl)
        ? existing.frontUrl
        : null;
    if (oldUrl) {
      await deleteFromSpacesByUrl(oldUrl);
    }

    existing.frontUrl = null;
    await existing.save();

    return res.json({
      success: true,
      message: "Background removed",
      data: {
        type: existing.type,
        frontUrl: null,
      },
    });
  } catch (err) {
    next(err);
  }
};
