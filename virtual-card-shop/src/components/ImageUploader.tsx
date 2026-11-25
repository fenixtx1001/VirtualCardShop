"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { readDroppedImage, supportsImageDrop } from "@/lib/image-drop";
import PasteImageButton from "@/components/PasteImageButton";

type Props = {
  label: string;
  value: string | null | undefined;
  onUploaded: (url: string) => void;
  /** Condensed drop / upload / preview controls for dense admin tables. */
  compact?: boolean;
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

export default function ImageUploader({ label, value, onUploaded, compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);
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
    async (image: File | string) => {
      setBusy(true);
      setErr(null);
      try {
        let res: Response;
        if (typeof image === "string") {
          res = await fetch("/api/admin/import-image-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: image }),
          });
        } else {
          if (!image.type.startsWith("image/")) {
            throw new Error("Please upload an image file (jpg/png/webp/gif).");
          }
          const fd = new FormData();
          fd.append("file", image);
          res = await fetch("/api/upload", { method: "POST", body: fd });
        }
        const result = await res.json().catch(() => null);
        if (!res.ok) throw new Error(result?.error ?? "Image upload failed (" + res.status + ")");
        const normalized = normalizeUploadedUrl(result?.url);
        if (!normalized) throw new Error("Image uploaded but no URL was returned.");
        onUploaded(normalized);
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Image import failed. Try saving the image first.");
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

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!supportsImageDrop(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!supportsImageDrop(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setDragActive(false);
      if (busy) return;
      const image = await readDroppedImage(e.dataTransfer);
      if (!image) {
        setErr("No image was supplied. Drag the picture itself, or save it and choose the file.");
        return;
      }
      await uploadFile(image);
    },
    [uploadFile, busy]
  );

  const previewHref = useMemo(() => {
    // Normalize preview too, just in case old values are relative
    return normalizeUploadedUrl(value) ?? null;
  }, [value]);

  if (compact) {
    return (
      <div
        className={"vcs-admin-image-compact" + (dragActive ? " is-dragging" : "")}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={onDrop}
        title={`Drop an image file or web image to update ${label.toLowerCase()}`}
      >
        {dragActive ? <div className="vcs-admin-image-drop-overlay" aria-hidden="true">Drop image here</div> : null}
        <div className="vcs-admin-image-compact-main">
          {previewHref ? (
            <a href={previewHref} target="_blank" rel="noreferrer" title={`View ${label.toLowerCase()}`}>View ↗</a>
          ) : (
            <span className="vcs-admin-image-missing">No image</span>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-label={`Upload ${label.toLowerCase()}`}
          >
            {busy ? "Uploading…" : previewHref ? "Replace" : "Upload"}
          </button>
          <PasteImageButton onImage={uploadFile} disabled={busy} compact />
          <input ref={inputRef} type="file" accept="image/*" onChange={onPick} style={{ display: "none" }} />
        </div>
        {warning ? <span className="vcs-admin-image-warning" title={warning}>Legacy URL ⚠</span> : null}
        {err ? <span className="vcs-admin-image-error" role="alert">{err}</span> : null}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 900 }}>{label}</div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={onDrop}
          style={{
            width: 220,
            height: 44,
            border: dragActive ? "2px dashed #138c92" : "1px dashed #999",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            padding: "0 10px",
            background: dragActive ? "#d9f1ee" : "#fafafa",
            color: dragActive ? "#075e63" : "#444",
            fontSize: 12,
          }}
          title="Drag an image file or website image here"
        >
          {busy ? "Uploading…" : dragActive ? "Drop image here" : "Drop file or web image here"}
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

        <PasteImageButton onImage={uploadFile} disabled={busy} />

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
