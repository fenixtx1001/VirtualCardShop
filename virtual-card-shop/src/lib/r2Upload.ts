import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * We intentionally create the R2 client lazily so that
 * environment variables are guaranteed to be loaded
 * (important for scripts run via tsx / dotenv).
 */

let _r2: S3Client | null = null;

function req(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v.trim();
}

function getR2Client() {
  if (_r2) return _r2;

  _r2 = new S3Client({
    region: "auto",
    endpoint: `https://${req("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: req("R2_ACCESS_KEY_ID"),
      secretAccessKey: req("R2_SECRET_ACCESS_KEY"),
    },
  });

  return _r2;
}

export function r2Configured() {
  return (
    !!process.env.R2_ACCOUNT_ID &&
    !!process.env.R2_ACCESS_KEY_ID &&
    !!process.env.R2_SECRET_ACCESS_KEY &&
    !!process.env.R2_BUCKET_NAME &&
    !!process.env.R2_PUBLIC_BASE_URL
  );
}

export async function uploadToR2(params: {
  buffer: Buffer;
  key: string;
  contentType: string;
}) {
  const { buffer, key, contentType } = params;

  const r2 = getR2Client();

  await r2.send(
    new PutObjectCommand({
      Bucket: req("R2_BUCKET_NAME"),
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // Cache aggressively — card images are immutable
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  const base = req("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");
  return `${base}/${key}`;
}
