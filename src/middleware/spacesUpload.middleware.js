import fs from "fs";
import path from "path";
import multer from "multer";

const normalizeFileName = (name = "file") =>
  String(name)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

const buildUniqueName = (originalName = "") => {
  const safeName = normalizeFileName(originalName || "file");
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`;
};

const resolveUploadDir = (folder = "") => {
  const cleanFolder = String(folder || "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\\/g, "/");
  const abs = path.resolve(process.cwd(), cleanFolder || "uploads");
  fs.mkdirSync(abs, { recursive: true });
  return abs;
};

/**
 * Local disk upload (replaces DigitalOcean Spaces / multer-s3).
 * Keeps the same export name so existing route imports keep working.
 */
export const createSpacesUpload = ({ folder = "uploads", fileFilter, limits } = {}) => {
  const destinationDir = resolveUploadDir(folder);

  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, destinationDir),
      filename: (_req, file, cb) => cb(null, buildUniqueName(file.originalname)),
    }),
    ...(fileFilter ? { fileFilter } : {}),
    ...(limits ? { limits } : {}),
  });
};
