"use client";

import { useCallback, useRef, useState } from "react";

type Props = {
  label: string;
  value: string | null | undefined;
  onUploaded: (url: string) => void;
};

export default function ImageUploader({ label, value, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setErr(null);
      try {
        const fd = new FormData();
        fd.append("file", file);

        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error ?? `Upload failed (${res.status})`);

        if (!j?.url) throw new Error("Upload succeeded but no url returned");
        onUploaded(String(j.url));
      } catch (e: any) {
        setErr(e?.message ?? "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [onUploaded]
  );

  const onPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    e.target.value = "";
  }, [uploadFile]);

  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await uploadFile(file);
  }, [uploadFile]);

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

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onPick}
          style={{ display: "none" }}
        />

        {value ? (
          <a href={value} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
            Preview
          </a>
        ) : (
          <span style={{ fontSize: 12, color: "#777" }}>No image</span>
        )}
      </div>

      {err ? <div style={{ fontSize: 12, color: "#b00020" }}>{err}</div> : null}
      {value ? (
        <div style={{ fontSize: 12, color: "#444" }}>
          URL: <code>{value}</code>
        </div>
      ) : null}
    </div>
  );
}
