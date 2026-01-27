export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import { v2 as cloudinary } from "cloudinary";
import { r2Configured, uploadToR2 } from "@/lib/r2Upload";

function isProd() {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

function sanitizeFilename(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
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
  }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        public_id,
        overwrite: false,
      },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error("Cloudinary upload failed"));
        resolve({
          url: (result.secure_url || result.url) as string,
          public_id: result.public_id as string,
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
    console.log("[upload] start", {
      vercelEnv: process.env.VERCEL_ENV,
      nodeEnv: process.env.NODE_ENV,
      r2Configured: r2Configured(),
      cloudinaryConfigured: cloudinaryConfigured(),
    });

    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      console.warn("[upload] missing file");
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const mime = file.type || "";
    if (!mime.startsWith("image/")) {
      console.warn("[upload] invalid mime", mime);
      return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 400 });
    }

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      console.warn("[upload] too large", file.size);
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // In production, REQUIRE R2 (and do not silently fall back to local FS).
    if (isProd() && !r2Configured()) {
      console.error("[upload] R2 env missing in production");
      return NextResponse.json(
        { error: "Upload not configured: missing R2 env vars in production." },
        { status: 500 }
      );
    }

    // Prefer R2 whenever configured.
    if (r2Configured()) {
      const original = sanitizeFilename(file.name || "image");
      const originalExt = path.extname(original);
      const ext = originalExt || extFromMime(mime) || ".img";
      const baseName = originalExt ? original.slice(0, -originalExt.length) : original;
      const stamp = Date.now();

      // Keep keys stable & simple. You can refine later (by product/set/etc).
      const key = `virtual-card-shop/uploads/${baseName}-${stamp}${ext}`;

      console.log("[upload] uploading to R2", { name: file.name, size: file.size, mime, key });
      const url = await uploadToR2({ buffer, key, contentType: mime });

      return NextResponse.json({
        ok: true,
        url,
        storageProvider: "r2",
        storageKey: key,
        bytes: file.size,
        mime,
      });
    }

    // Optional fallback during transition ONLY (dev / local testing).
    if (cloudinaryConfigured()) {
      console.log("[upload] uploading to cloudinary", { name: file.name, size: file.size, mime });
      const result = await uploadToCloudinary(buffer, file.name || "image", mime);
      console.log("[upload] cloudinary ok", { public_id: result.public_id });

      return NextResponse.json({
        ok: true,
        url: result.url,
        storageProvider: "cloudinary",
        storageKey: result.public_id,
        bytes: file.size,
        mime,
      });
    }

    // Local fallback (dev only)
    console.log("[upload] uploading locally", { name: file.name, size: file.size, mime });
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
    console.error("[upload] error", e);
    return NextResponse.json({ error: e?.message ?? "Upload failed" }, { status: 500 });
  }
}
