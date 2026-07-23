/**
 * Normalize stored file URLs and map DigitalOcean Spaces URLs to local /uploads paths.
 */

const SPACES_HOST_RE =
  /(?:https?:\/\/)?(?:[a-z0-9-]+\.)?digitaloceanspaces\.com\/?/i;

export const toLocalUploadPath = (value) => {
  if (value == null) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  // Already a local uploads path
  if (raw.startsWith("/uploads/") || raw === "/uploads") return raw;
  if (raw.startsWith("uploads/")) return `/${raw}`;

  // Full Spaces URL or host-less Spaces-style path
  try {
    let pathname = "";
    if (/^https?:\/\//i.test(raw) || raw.startsWith("//")) {
      const u = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
      if (!/digitaloceanspaces\.com$/i.test(u.hostname)) return "";
      pathname = u.pathname || "";
    } else if (SPACES_HOST_RE.test(raw) || /digitaloceanspaces\.com/i.test(raw)) {
      const withoutHost = raw
        .replace(/^https?:\/\//i, "")
        .replace(/^\/\//, "")
        .replace(/^[^/]*digitaloceanspaces\.com\/?/i, "");
      pathname = `/${withoutHost}`;
    } else {
      return "";
    }

    let key = pathname.replace(/^\/+/, "");
    // path-style: /bucket/uploads/...
    if (key.toLowerCase().startsWith("gurukul-uploads/")) {
      key = key.slice("gurukul-uploads/".length);
    }
    key = key.replace(/^\/+/, "");
    if (!key) return "";
    if (!key.startsWith("uploads/")) {
      key = `uploads/${key}`;
    }
    return `/${key}`;
  } catch {
    return "";
  }
};

export const normalizeSpacesPublicUrl = (value) => {
  if (value == null) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  const local = toLocalUploadPath(raw);
  if (local) return local;

  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;

  const withoutLeadingSlash = raw.replace(/^\/+/, "");
  if (/^[a-z0-9.-]+\.digitaloceanspaces\.com\//i.test(withoutLeadingSlash)) {
    const converted = toLocalUploadPath(`https://${withoutLeadingSlash}`);
    return converted || `https://${withoutLeadingSlash}`;
  }

  if (
    /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(withoutLeadingSlash) &&
    !withoutLeadingSlash.startsWith("uploads/")
  ) {
    return `https://${withoutLeadingSlash}`;
  }

  return raw.startsWith("/") ? raw : `/${raw}`;
};

export const normalizeFileUrlList = (files) =>
  Array.isArray(files)
    ? files.map((f) => normalizeSpacesPublicUrl(f)).filter(Boolean)
    : [];
