import path from "path";
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client } from "@aws-sdk/client-s3";
import { ENV } from "../config/env.js";

const normalizeFileName = (name = "file") =>
  String(name)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

const buildObjectKey = (folder = "", originalName = "") => {
  const cleanFolder = String(folder || "").replace(/^\/+|\/+$/g, "");
  const safeName = normalizeFileName(originalName || "file");
  const uniqueName = `${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`;
  return cleanFolder ? `${cleanFolder}/${uniqueName}` : uniqueName;
};

const requiredEnv = ["DO_SPACES_KEY", "DO_SPACES_SECRET", "DO_SPACES_BUCKET"];
const missing = requiredEnv.filter((k) => !process.env[k]);
if (missing.length) {
  throw new Error(
    `Missing required DigitalOcean Spaces env vars: ${missing.join(", ")}`,
  );
}

const region = ENV.DO_SPACES_REGION || "blr1";
const rawEndpoint =
  ENV.DO_SPACES_ENDPOINT || `https://${region}.digitaloceanspaces.com`;
const bucket = String(ENV.DO_SPACES_BUCKET || "").trim();

const normalizeEndpoint = (value, bucketName, fallbackRegion) => {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const bucketPrefix = `${String(bucketName || "").toLowerCase()}.`;
    if (bucketPrefix !== "." && host.startsWith(bucketPrefix)) {
      parsed.hostname = host.slice(bucketPrefix.length);
      parsed.pathname = "/";
      return parsed.toString().replace(/\/$/, "");
    }
    return value;
  } catch {
    return `https://${fallbackRegion}.digitaloceanspaces.com`;
  }
};

const endpoint = normalizeEndpoint(rawEndpoint, bucket, region);

const s3 = new S3Client({
  region,
  endpoint,
    forcePathStyle: false,
  credentials: {
    accessKeyId: ENV.DO_SPACES_KEY,
    secretAccessKey: ENV.DO_SPACES_SECRET,
  },
});

export const createSpacesUpload = ({ folder = "", fileFilter, limits } = {}) =>
  multer({
    storage: multerS3({
      s3,
      bucket,
      acl: ENV.DO_SPACES_ACL || "public-read",
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (req, file, cb) => {
        cb(null, buildObjectKey(folder, file.originalname));
      },
    }),
    ...(fileFilter ? { fileFilter } : {}),
    ...(limits ? { limits } : {}),
  });

