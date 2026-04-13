import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { ENV } from "../config/env.js";

const region = ENV.DO_SPACES_REGION || "blr1";
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

const endpoint = normalizeEndpoint(
  ENV.DO_SPACES_ENDPOINT || `https://${region}.digitaloceanspaces.com`,
  bucket,
  region,
);

const hasSpacesConfig = Boolean(
  ENV.DO_SPACES_KEY && ENV.DO_SPACES_SECRET && ENV.DO_SPACES_BUCKET,
);

const spacesClient = hasSpacesConfig
  ? new S3Client({
      region,
      endpoint,
      forcePathStyle: false,
      credentials: {
        accessKeyId: ENV.DO_SPACES_KEY,
        secretAccessKey: ENV.DO_SPACES_SECRET,
      },
    })
  : null;

const extractObjectKeyFromUrl = (fileUrl) => {
  if (!fileUrl || !bucket) return null;
  try {
    const url = new URL(fileUrl);
    const parts = url.pathname.replace(/^\/+/, "").split("/");
    if (!parts.length) return null;
    // path-style endpoint => /bucket/key
    if (parts[0] === bucket) {
      return parts.slice(1).join("/");
    }
    // virtual-host endpoint => /key
    return parts.join("/");
  } catch {
    return null;
  }
};

export const deleteFromSpacesByUrl = async (fileUrl) => {
  if (!spacesClient || !bucket || !fileUrl) return false;
  if (!/^https?:\/\//i.test(fileUrl)) return false;

  const key = extractObjectKeyFromUrl(fileUrl);
  if (!key) return false;

  try {
    await spacesClient.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    return true;
  } catch {
    return false;
  }
};

