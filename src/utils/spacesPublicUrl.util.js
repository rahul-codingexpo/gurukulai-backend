/**
 * Ensure Spaces (or other remote) file URLs are absolute https links.
 * Fixes values like "sfo3.digitaloceanspaces.com/bucket/key" saved without a scheme.
 */
export const normalizeSpacesPublicUrl = (value) => {
  if (value == null) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;

  const withoutLeadingSlash = raw.replace(/^\/+/, "");
  if (/^[a-z0-9.-]+\.digitaloceanspaces\.com\//i.test(withoutLeadingSlash)) {
    return `https://${withoutLeadingSlash}`;
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(withoutLeadingSlash) && !withoutLeadingSlash.startsWith("uploads/")) {
    return `https://${withoutLeadingSlash}`;
  }

  return raw.startsWith("/") ? raw : `/${raw}`;
};

export const normalizeFileUrlList = (files) =>
  Array.isArray(files) ? files.map((f) => normalizeSpacesPublicUrl(f)).filter(Boolean) : [];
