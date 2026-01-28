"use client";

import { useCallback, useMemo, useRef, useState } from "react";

type Props = {
  label: string;
  value: string | null | undefined;
  onUploaded: (url: string) => void;
};

/**
 * If /api/upload returns a relative path ("/virtual-card-shop/uploads/..."),
 * convert it into a fully-qualified public R2 URL so it always works in the shop.
 *
 * Configure via:
 *   NEXT_PUBLIC_R2_PUBLIC_BASE_URL="https://pub-xxxx.r2.dev"
 *
 * Fallbacks to your known public R2 domain.
 */
const DEFAULT_R2_PUBLIC_BASE =
  "https://pub-6efb0e0c843946ccb21628c5d3eb41ad.r2.dev";

function normalizeUploadedUrl(raw: unknown) {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  // Already absolute
  if (/^https?:\/\//i.test(s)) return s;

  const base =
    (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "").trim() || DEFAULT_R2_PUBLIC_BASE;

  // Ensure base has no trailing slash
  const baseNoSlash = base.replace(/\/+$/, "");

  // If it's a root-relative path: "/virtual-card-shop/uploads/..."
  if (s.startsWith("/")) return `${baseNoSlash}${s}`;

  // If it's missing the leading slash: "virtual-card-shop/uploads/..."
  return `${baseNoSlash}/${s}`;
}

export default function ImageUploader({ label, value, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const warning = useMemo(() => {
    const v = (value ?? "").toLowerCase();
    if (!v) return null;
    if (v.includes("cloudinary.com")) {
      return "This looks like a Cloudinary URL. Pack/box art should be on R2 so it loads everywhere.";
    }
    return null;
  }, [value]);

  const uploadFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setErr(null);

      try {
        // Basic guardrails
        if (!file.type.startsWith("image/")) {
          throw new Error("Please upload an image file (jpg/png/webp).");
        }

        const fd = new FormData();
        fd.append("file", file);

        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error ?? `Upload failed (${res.status})`);

        const normalized = normalizeUploadedUrl(j?.url);
        if (!normalized) throw new Error("Upload succeeded but no url returned");

        onUploaded(normalized);
      } catch (e: any) {
        setErr(e?.message ?? "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [onUploaded]
  );

  const onPick = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await uploadFile(file);
      e.target.value = "";
    },
    [uploadFile]
  );

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      await uploadFile(file);
    },
    [uploadFile]
  );

  const previewHref = useMemo(() => {
    // Normalize preview too, just in case old values are relative
    return normalizeUploadedUrl(value) ?? null;
  }, [value]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 900 }}>{label}</div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={onDrop}
          style={{
            width: 220,
            height: 44,
            border: "1px dashed #999",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            padding: "0 10px",
            background: "#fafafa",
            color: "#444",
            fontSize: 12,
          }}
          title="Drag & drop an image here"
        >
          {busy ? "Uploading…" : "Drag & drop image here"}
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "white",
            fontWeight: 800,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Uploading…" : "Choose file"}
        </button>

        <input ref={inputRef} type="file" accept="image/*" onChange={onPick} style={{ display: "none" }} />

        {previewHref ? (
          <a href={previewHref} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
            Preview
          </a>
        ) : (
          <span style={{ fontSize: 12, color: "#777" }}>No image</span>
        )}
      </div>

      {warning ? (
        <div style={{ fontSize: 12, color: "#8a5a00" }}>
          ⚠️ {warning}
        </div>
      ) : null}

      {err ? <div style={{ fontSize: 12, color: "#b00020" }}>{err}</div> : null}

      {previewHref ? (
        <div style={{ fontSize: 12, color: "#444" }}>
          URL: <code>{previewHref}</code>
        </div>
      ) : null}
    </div>
  );
}
