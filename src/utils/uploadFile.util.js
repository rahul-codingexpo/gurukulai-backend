export const uploadedFileUrl = (file) => {
  if (!file) return undefined;
  if (file.location) return file.location;
  if (file.path && /^https?:\/\//i.test(file.path)) return file.path;
  if (file.filename) return `/uploads/${file.filename}`;
  if (file.path) return String(file.path).startsWith("/") ? file.path : `/${file.path}`;
  return undefined;
};

