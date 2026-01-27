// src/lib/uploadImage.ts
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET, R2_PUBLIC_BASE_URL } from "./r2";

type UploadArgs = {
  key: string; // e.g. cards/<productId>/<cardId>/front.jpg
  buffer: Buffer;
  contentType: string; // "image/jpeg", etc.
  cacheControl?: string; // optional
};

export async function uploadImageToR2({ key, buffer, contentType, cacheControl }: UploadArgs) {
  if (!R2_BUCKET) throw new Error("Missing env CLOUDFLARE_R2_BUCKET");
  if (!R2_PUBLIC_BASE_URL) throw new Error("Missing env CLOUDFLARE_R2_PUBLIC_BASE_URL");

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: cacheControl ?? "public, max-age=31536000, immutable",
    })
  );

  // Ensure base URL has no trailing slash
  const base = R2_PUBLIC_BASE_URL.replace(/\/+$/, "");
  return `${base}/${key.replace(/^\/+/, "")}`;
}
