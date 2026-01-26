export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

// Cloudinary (optional, used when env vars exist)
import { v2 as cloudinary } from "cloudinary";

function sanitizeFilename(name: string) {
  // keep letters, numbers, dash, underscore, dot
  const base = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  // prevent sneaky paths
  return base.replace(/^-+/, "").replace(/-+$/, "") || "upload";
}

function extFromMime(mime: string) {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  return "";
}

function cloudinaryConfigured() {
  return (
    !!process.env.CLOUDINARY_CLOUD_NAME &&
    !!process.env.CLOUDINARY_API_KEY &&
    !!process.env.CLOUDINARY_API_SECRET
  );
}

async function uploadToCloudinary(buffer: Buffer, filename: string, mime: string) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
    secure: true,
  });

  const publicIdBase = sanitizeFilename(filename).replace(path.extname(filename), "");
  const stamp = Date.now();
  const public_id = `virtual-card-shop/uploads/${publicIdBase}-${stamp}`;

  return await new Promise<{
    url: string;
    public_id: string;
    bytes?: number;
    format?: string;
    width?: number;
    height?: number;
  }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        public_id,
        overwrite: false,
        // Keep originals reasonably sized; you can remove this if you want full-res always
        // transformation: [{ quality: "auto", fetch_format: "auto" }],
      },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error("Cloudinary upload failed"));
        resolve({
          url: (result.secure_url || result.url) as string,
          public_id: result.public_id as string,
          bytes: result.bytes,
          format: result.format as string,
          width: result.width as number,
          height: result.height as number,
        });
      }
    );

    stream.end(buffer);
  });
}

async function uploadToLocalPublic(buffer: Buffer, originalName: string, mime: string) {
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadDir, { recursive: true });

  const original = sanitizeFilename(originalName || "image");
  const originalExt = path.extname(original);
  const ext = originalExt || extFromMime(mime) || ".img";

  const baseName = originalExt ? original.slice(0, -originalExt.length) : original;
  const stamp = Date.now();
  const finalName = `${baseName}-${stamp}${ext}`;

  const finalPath = path.join(uploadDir, finalName);
  await fs.writeFile(finalPath, buffer);

  return {
    url: `/uploads/${finalName}`,
    filename: finalName,
  };
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    // Basic validation
    const mime = file.type || "";
    if (!mime.startsWith("image/")) {
      return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 400 });
    }

    // Size limit: 5MB
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // If Cloudinary is configured, use it (works on Vercel)
    if (cloudinaryConfigured()) {
      const result = await uploadToCloudinary(buffer, file.name || "image", mime);
      return NextResponse.json({
        ok: true,
        url: result.url,
        // Optional but useful for future migration/deletes:
        storageProvider: "cloudinary",
        storageKey: result.public_id,
        bytes: file.size,
        mime,
      });
    }

    // Otherwise, fallback to local filesystem (dev only)
    const local = await uploadToLocalPublic(buffer, file.name || "image", mime);
    return NextResponse.json({
      ok: true,
      url: local.url,
      storageProvider: "local",
      storageKey: local.filename,
      bytes: file.size,
      mime,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Upload failed" }, { status: 500 });
  }
}
