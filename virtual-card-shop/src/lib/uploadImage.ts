import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "./r2";

/**
 * Required env vars:
 * - R2_BUCKET_NAME                      (ex: virtual-card-shop-images)
 * - NEXT_PUBLIC_R2_PUBLIC_BASE_URL      (ex: https://pub-xxxx.r2.dev)
 *
 * Notes:
 * - We store objects under: virtual-card-shop/cards/{productSetId}/{cardNumberOrId}/...
 * - We return a PUBLIC URL (R2.dev) so the browser can load it.
 */

function getPublicBaseUrl() {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? "";
  return base.replace(/\/+$/, ""); // strip trailing slashes
}

export async function uploadImageToR2(opts: {
  buffer: Buffer;
  contentType: string;
  key: string; // full object key inside bucket
}) {
  const bucket = process.env.R2_BUCKET_NAME ?? "";
  if (!bucket) throw new Error("Missing env var: R2_BUCKET_NAME");

  const publicBase = getPublicBaseUrl();
  if (!publicBase) throw new Error("Missing env var: NEXT_PUBLIC_R2_PUBLIC_BASE_URL");

  const { buffer, contentType, key } = opts;

  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // With R2 "Public Access: Enabled", this is typically enough.
      // If you later move to signed URLs, you’d remove this.
      ACL: "public-read" as any,
    })
  );

  // Public browser URL
  return `${publicBase}/${encodeURI(key).replace(/%2F/g, "/")}`;
}
