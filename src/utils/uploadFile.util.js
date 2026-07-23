import path from "path";
import { toLocalUploadPath } from "./spacesPublicUrl.util.js";

/**
 * Return a public app path for an uploaded file, e.g. /uploads/gallery/x.png
 */
export const uploadedFileUrl = (file) => {
  if (!file) return undefined;

  // Legacy S3/Spaces multer-s3 shape
  if (file.location) {
    return toLocalUploadPath(file.location) || file.location;
  }

  if (file.path) {
    const abs = path.resolve(String(file.path));
    const cwd = process.cwd();
    const rel = path.relative(cwd, abs).split(path.sep).join("/");
    if (rel && !rel.startsWith("..")) {
      return rel.startsWith("/") ? rel : `/${rel}`;
    }
    if (/^https?:\/\//i.test(String(file.path))) {
      return toLocalUploadPath(file.path) || file.path;
    }
  }

  if (file.key) {
    const key = String(file.key).replace(/^\/+/, "");
    return key.startsWith("uploads/") ? `/${key}` : `/uploads/${key}`;
  }

  if (file.filename) {
    return `/uploads/${file.filename}`;
  }

  return undefined;
};
