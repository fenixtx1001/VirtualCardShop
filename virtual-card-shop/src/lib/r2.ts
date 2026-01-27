// src/lib/r2.ts
import { S3Client } from "@aws-sdk/client-s3";

const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

if (!endpoint) throw new Error("Missing env CLOUDFLARE_R2_ENDPOINT");
if (!accessKeyId) throw new Error("Missing env CLOUDFLARE_R2_ACCESS_KEY_ID");
if (!secretAccessKey) throw new Error("Missing env CLOUDFLARE_R2_SECRET_ACCESS_KEY");

// ✅ Named export: r2
export const r2 = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

// Optional helpers (useful elsewhere)
export const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET ?? "";
export const R2_PUBLIC_BASE_URL = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL ?? "";
