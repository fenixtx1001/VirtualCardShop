export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth-options";
import { r2Configured, uploadToR2 } from "@/lib/r2Upload";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function isPublicIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function checkedUrl(value: string): URL {
  if (value.length > 2048) throw new Error("Image URL is too long.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" || url.username || url.password ||
    (url.port && url.port !== "443") ||
    !url.hostname.includes(".") || isIP(url.hostname) !== 0 ||
    /\.(?:localhost|local|internal|test|invalid)$/i.test(url.hostname)
  ) {
    throw new Error("Only public HTTPS image addresses can be imported.");
  }
  return url;
}

function imageIsValid(bytes: Buffer, mime: string) {
  if (mime === "image/jpeg") return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (mime === "image/gif") return bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6));
  return false;
}

/**
 * User-initiated, authenticated import of a public image only.
 * Pin the verified public IPv4 address for the TLS request to avoid private
 * network access / DNS rebinding. Never forward cookies or authorization.
 */
async function readPublicImage(input: URL, redirects = 0): Promise<{ bytes: Buffer; mime: string }> {
  if (redirects > 2) throw new Error("Too many image redirects.");
  const url = checkedUrl(input.toString());
  const addresses = await lookup(url.hostname, { family: 4, all: true });
  if (!addresses.length || addresses.some((entry) => !isPublicIpv4(entry.address))) {
    throw new Error("Image server does not have a permitted public address.");
  }
  const pinned = addresses[0].address;

  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        timeout: 8000,
        headers: { accept: "image/jpeg,image/png,image/webp,image/gif", "user-agent": "VCS manual image import/1.0" },
        lookup: (_hostname, _options, callback) => callback(null, pinned, 4),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = response.headers.location;
          response.resume();
          if (!location) { reject(new Error("Image redirect had no destination.")); return; }
          try {
            const nextUrl = checkedUrl(new URL(location, url).toString());
            void readPublicImage(nextUrl, redirects + 1).then(resolve, reject);
          } catch (error) { reject(error); }
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          reject(new Error(status === 403 || status === 401
            ? "The source site blocked image access. Save the image locally if you have permission, then upload the file."
            : "The image source returned HTTP " + status + ". Try again or upload a saved image."));
          return;
        }
        const mime = String(response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
        if (!ALLOWED_MIMES[mime]) {
          response.resume();
          reject(new Error("The dropped link did not return a supported image (JPG, PNG, WebP or GIF)."));
          return;
        }
        const declaredLength = Number(response.headers["content-length"] ?? 0);
        if (declaredLength > MAX_IMAGE_BYTES) {
          response.resume();
          reject(new Error("Image exceeds the 5 MB upload limit."));
          return;
        }
        let size = 0;
        const parts: Buffer[] = [];
        response.on("data", (part: Buffer) => {
          size += part.length;
          if (size > MAX_IMAGE_BYTES) {
            response.destroy(new Error("Image exceeds the 5 MB upload limit."));
            return;
          }
          parts.push(part);
        });
        response.on("error", reject);
        response.on("end", () => resolve({ bytes: Buffer.concat(parts), mime }));
      }
    );
    request.on("timeout", () => request.destroy(new Error("Image source timed out. Try a saved file instead.")));
    request.on("error", reject);
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Please sign in to VCS before importing images." }, { status: 401 });
  }
  if (req.headers.get("sec-fetch-site") && req.headers.get("sec-fetch-site") !== "same-origin") {
    return NextResponse.json({ error: "Image import must originate from VCS." }, { status: 403 });
  }
  if (!r2Configured()) {
    return NextResponse.json({ error: "R2 storage is not configured." }, { status: 503 });
  }

  let sourceHost = "unknown";
  try {
    const payload = await req.json();
    if (typeof payload?.url !== "string") throw new Error("Missing image URL.");
    const url = checkedUrl(payload.url);
    sourceHost = url.hostname;
    const { bytes, mime } = await readPublicImage(url);
    if (!imageIsValid(bytes, mime)) throw new Error("The source did not return a valid image file.");
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 24);
    const key = "virtual-card-shop/uploads/web-" + hash + ALLOWED_MIMES[mime];
    const storedUrl = await uploadToR2({ buffer: bytes, key, contentType: mime });
    return NextResponse.json({ ok: true, url: storedUrl, bytes: bytes.length, mime, storageProvider: "r2" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image import failed.";
    console.warn("[manual-image-import] rejected", { sourceHost, reason: message.slice(0, 180) });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
