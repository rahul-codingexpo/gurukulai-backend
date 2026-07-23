import fs from "fs/promises";
import path from "path";

/**
 * Write a buffer into the local uploads tree and return a public /uploads/... path.
 * Keeps the previous Spaces helper name for existing call sites.
 */
export const uploadBufferToSpaces = async ({
  buffer,
  key,
  contentType = "application/octet-stream",
}) => {
  if (!buffer) throw new Error("Missing file buffer");
  if (!key) throw new Error("Missing file key");

  let rel = String(key).replace(/^\/+/, "").replace(/\\/g, "/");
  if (!rel.startsWith("uploads/")) {
    rel = `uploads/${rel}`;
  }

  const abs = path.resolve(process.cwd(), rel);
  const root = path.resolve(process.cwd(), "uploads");
  if (!abs.startsWith(root)) {
    throw new Error("Invalid upload key");
  }

  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);

  // contentType unused for local disk; kept for API compatibility
  void contentType;

  return `/${rel}`;
};
