import fs from "fs/promises";
import path from "path";
import { toLocalUploadPath, normalizeSpacesPublicUrl } from "./spacesPublicUrl.util.js";

const uploadsRoot = () => path.resolve(process.cwd(), "uploads");

const resolveLocalFilePath = (fileUrl) => {
  if (!fileUrl) return null;
  const normalized = normalizeSpacesPublicUrl(fileUrl);
  const local = toLocalUploadPath(normalized) || normalized;

  if (!local.startsWith("/uploads/") && local !== "/uploads") return null;

  const rel = local.replace(/^\/+/, "");
  const abs = path.resolve(process.cwd(), rel);
  const root = uploadsRoot();
  if (!abs.startsWith(root)) return null;
  return abs;
};

/** Delete a file from local uploads (name kept for existing call sites). */
export const deleteFromSpacesByUrl = async (fileUrl) => {
  if (!fileUrl) return false;
  const abs = resolveLocalFilePath(fileUrl);
  if (!abs) return false;

  try {
    await fs.unlink(abs);
    return true;
  } catch {
    return false;
  }
};
