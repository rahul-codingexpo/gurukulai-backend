import { ENV } from "../../config/env.js";

const TEMPLATE_TYPES = new Set(["student", "staff"]);
const FIELD_KINDS = new Set(["text", "image", "qr"]);
const MAX_FIELDS = 100;
const MAX_JSON_BYTES = 1024 * 1024;

const sanitizeIdKey = (s, maxLen) => {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, maxLen);
};

export const parseTemplateType = (raw) => {
  const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!TEMPLATE_TYPES.has(t)) return null;
  return t;
};

const normalizeHexColor = (c) => {
  if (c == null || typeof c !== "string") return "#000000";
  const s = c.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return "#000000";
};

/**
 * Accept only HTTPS URLs that point to this app's configured Spaces bucket.
 */
export const isTrustedSpacesObjectUrl = (url) => {
  if (url == null || url === "") return true;
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return false;
    const bucket = String(ENV.DO_SPACES_BUCKET || "").trim().toLowerCase();
    const region = String(ENV.DO_SPACES_REGION || "blr1").trim().toLowerCase();
    if (!bucket) return false;
    const host = u.hostname.toLowerCase();
    if (host === `${bucket}.${region}.digitaloceanspaces.com`) return true;
    if (host === `${region}.digitaloceanspaces.com`) {
      const prefix = `/${bucket}/`.toLowerCase();
      return u.pathname.toLowerCase().startsWith(prefix);
    }
    return false;
  } catch {
    return false;
  }
};

const assertFinite = (label, v, errors) => {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    errors.push(`${label} must be a finite number`);
    return false;
  }
  return true;
};

export const validateAndNormalizeSaveBody = (body, existingDoc) => {
  const errors = [];
  if (!body || typeof body !== "object") {
    return { ok: false, errors: ["Invalid JSON body"], normalized: null };
  }

  let rawSize = 0;
  try {
    rawSize = Buffer.byteLength(JSON.stringify(body), "utf8");
  } catch {
    errors.push("Payload could not be serialized");
  }
  if (rawSize > MAX_JSON_BYTES) {
    errors.push("Template JSON exceeds maximum size (1 MB)");
  }

  const type = parseTemplateType(body.type);
  if (!type) errors.push('type must be "student" or "staff"');

  const w = body.cardSizeMm?.width;
  const h = body.cardSizeMm?.height;
  const widthOk = assertFinite("cardSizeMm.width", w, errors);
  if (widthOk && w <= 0) {
    errors.push("cardSizeMm.width must be greater than 0");
  }
  const heightOk = assertFinite("cardSizeMm.height", h, errors);
  if (heightOk && h <= 0) {
    errors.push("cardSizeMm.height must be greater than 0");
  }

  const versionRaw = body.version;
  let version = 1;
  if (versionRaw !== undefined && versionRaw !== null) {
    if (typeof versionRaw !== "number" || !Number.isFinite(versionRaw) || versionRaw < 1) {
      errors.push("version must be a finite number >= 1");
    } else {
      version = Math.floor(versionRaw);
    }
  }

  if (!Array.isArray(body.fields)) {
    errors.push("fields must be an array");
  } else if (body.fields.length > MAX_FIELDS) {
    errors.push(`fields array exceeds maximum (${MAX_FIELDS})`);
  }

  const normalizedFields = [];
  if (Array.isArray(body.fields) && body.fields.length <= MAX_FIELDS) {
    body.fields.forEach((f, i) => {
      const prefix = `fields[${i}]`;
      if (!f || typeof f !== "object") {
        errors.push(`${prefix} must be an object`);
        return;
      }
      const id = sanitizeIdKey(f.id, 128);
      const key = sanitizeIdKey(f.key, 128);
      if (!id) errors.push(`${prefix}.id is required`);
      if (!key) errors.push(`${prefix}.key is required`);
      const kind = typeof f.kind === "string" ? f.kind.trim().toLowerCase() : "";
      if (!FIELD_KINDS.has(kind)) {
        errors.push(`${prefix}.kind must be text, image, or qr`);
      }
      const nums = [
        ["xMm", f.xMm],
        ["yMm", f.yMm],
        ["wMm", f.wMm],
        ["hMm", f.hMm],
        ["fontSizeMm", f.fontSizeMm],
        ["fontWeight", f.fontWeight],
        ["borderRadiusMm", f.borderRadiusMm],
      ];
      for (const [label, val] of nums) {
        assertFinite(`${prefix}.${label}`, val, errors);
      }
      if (
        id &&
        key &&
        FIELD_KINDS.has(kind) &&
        nums.every(([, val]) => typeof val === "number" && Number.isFinite(val))
      ) {
        normalizedFields.push({
          id,
          key,
          kind,
          xMm: f.xMm,
          yMm: f.yMm,
          wMm: f.wMm,
          hMm: f.hMm,
          fontSizeMm: f.fontSizeMm,
          fontWeight: f.fontWeight,
          color: normalizeHexColor(f.color),
          borderRadiusMm: f.borderRadiusMm,
        });
      }
    });
  }

  let frontUrl = null;
  if (body.frontUrl === undefined) {
    frontUrl = existingDoc?.frontUrl ?? null;
  } else if (body.frontUrl === null || body.frontUrl === "") {
    frontUrl = null;
  } else if (typeof body.frontUrl === "string") {
    const trimmed = body.frontUrl.trim();
    if (!isTrustedSpacesObjectUrl(trimmed)) {
      errors.push("frontUrl must be null or a trusted storage URL");
    } else {
      frontUrl = trimmed;
    }
  } else {
    errors.push("frontUrl must be a string or null");
  }

  let backUrl = null;
  if (body.backUrl === undefined) {
    backUrl = existingDoc?.backUrl ?? null;
  } else if (body.backUrl === null || body.backUrl === "") {
    backUrl = null;
  } else if (typeof body.backUrl === "string") {
    const trimmed = body.backUrl.trim();
    if (!isTrustedSpacesObjectUrl(trimmed)) {
      errors.push("backUrl must be null or a trusted storage URL");
    } else {
      backUrl = trimmed;
    }
  } else {
    errors.push("backUrl must be a string or null");
  }

  if (errors.length) {
    return { ok: false, errors, normalized: null };
  }

  return {
    ok: true,
    errors: [],
    normalized: {
      type,
      version,
      cardSizeMm: { width: w, height: h },
      frontUrl,
      backUrl,
      fields: normalizedFields,
    },
  };
};

export const defaultTemplateForType = (type) => ({
  type,
  version: 1,
  cardSizeMm: { width: 86, height: 54 },
  frontUrl: null,
  backUrl: null,
  fields: [],
});
