"use client";

import { useState } from "react";
import Link from "next/link";

export default function AdminImportPage() {
  const [text, setText] = useState("");
  const [productSetIdOverride, setProductSetIdOverride] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  async function onImport() {
    setStatus("Importing…");
    setResult(null);

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: text,
          productSetIdOverride: productSetIdOverride.trim() || undefined,
        }),
      });

      // Read as TEXT first (prevents the "<!DOCTYPE" crash)
      const raw = await res.text();

      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        setStatus(
          `Error: API returned non-JSON (${res.status}). First chars: ${raw.slice(0, 160)}`
        );
        return;
      }

      if (!res.ok) {
        setStatus(`Error: ${data?.error ?? "Import failed"}`);
        setResult(data);
        return;
      }

      setResult(data);
      const created = data?.results?.created ?? 0;
      const updated = data?.results?.updated ?? 0;
      const total = data?.results?.total ?? 0;

      setStatus(`Done. Total ${total}. Created ${created}, Updated ${updated}.`);
    } catch (err: any) {
      setStatus(`Error: ${err?.message ?? "Request failed"}`);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Admin: Paste Import</h1>
      <p style={{ marginBottom: 16 }}>
        Paste rows from Google Sheets / TCDB.{" "}
        <Link href="/" style={{ textDecoration: "underline" }}>
          Back home
        </Link>
      </p>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
          Product Set ID override (applies to every row)
        </label>
        <input
          value={productSetIdOverride}
          onChange={(e) => setProductSetIdOverride(e.target.value)}
          placeholder='e.g., "1991_Donruss_Baseball_Base"'
          style={{ width: 380, padding: 8 }}
        />
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
          Tip: Create the Product Set first on <Link href="/admin/products" style={{ textDecoration: "underline" }}>Admin: Products</Link> →
          Details, then paste its ID here.
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
          Paste data
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste rows here…"
          style={{ width: "100%", height: 320, padding: 12 }}
        />
      </div>

      <button
        onClick={onImport}
        style={{ padding: "10px 14px" }}
        disabled={!text.trim() || !productSetIdOverride.trim()}
      >
        Import
      </button>

      {status && <p style={{ marginTop: 12 }}>{status}</p>}

      {result ? (
        <details style={{ marginTop: 12 }}>
          <summary>Show import response</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </details>
      ) : null}
    </main>
  );
}
