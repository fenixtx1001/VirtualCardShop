import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

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

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    const original = sanitizeFilename(file.name || "image");
    const originalExt = path.extname(original);
    const ext = originalExt || extFromMime(mime) || ".img";

    const baseName = originalExt ? original.slice(0, -originalExt.length) : original;
    const stamp = Date.now();
    const finalName = `${baseName}-${stamp}${ext}`;

    const finalPath = path.join(uploadDir, finalName);
    await fs.writeFile(finalPath, buffer);

    const url = `/uploads/${finalName}`;
    return NextResponse.json({
      ok: true,
      url,
      filename: finalName,
      bytes: file.size,
      mime,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Upload failed" },
      { status: 500 }
    );
  }
}
