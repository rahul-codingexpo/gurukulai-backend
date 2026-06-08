import { PutObjectCommand } from "@aws-sdk/client-s3";
import { S3Client } from "@aws-sdk/client-s3";
import { ENV } from "../config/env.js";
import { normalizeSpacesPublicUrl } from "./spacesPublicUrl.util.js";

const region = ENV.DO_SPACES_REGION || "sfo3";
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

const s3 =
  ENV.DO_SPACES_KEY && ENV.DO_SPACES_SECRET && bucket
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

const publicFileUrl = (key) => {
  let base = String(ENV.DO_SPACES_ENDPOINT || "").trim().replace(/\/$/, "");
  if (base) {
    if (!/^https?:\/\//i.test(base)) {
      base = `https://${base.replace(/^\/+/, "")}`;
    }
    return normalizeSpacesPublicUrl(`${base}/${key}`);
  }
  return `https://${bucket}.${region}.digitaloceanspaces.com/${key}`;
};

export const uploadBufferToSpaces = async ({
  buffer,
  key,
  contentType = "application/octet-stream",
  acl,
}) => {
  if (!s3 || !bucket) {
    throw new Error("DigitalOcean Spaces is not configured");
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: acl || ENV.DO_SPACES_ACL || "public-read",
    }),
  );

  return publicFileUrl(key);
};
