"use client";

import { useState } from "react";
import Link from "next/link";

export default function AdminImportPage() {
  const [text, setText] = useState("");
  const [productSetIdOverride, setProductSetIdOverride] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  async function onImport() {
    if (importing || !text.trim() || !productSetIdOverride.trim()) return;
    setImporting(true);
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

      const raw = await res.text();
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        setStatus("Error: API returned non-JSON (" + res.status + "). First chars: " + raw.slice(0, 160));
        return;
      }

      if (!res.ok) {
        setStatus("Error: " + (data?.error ?? "Import failed"));
        setResult(data);
        return;
      }

      setResult(data);
      const created = data?.results?.created ?? 0;
      const updated = data?.results?.updated ?? 0;
      const total = data?.results?.total ?? 0;
      setStatus("Done. Total " + total + ". Created " + created + ", Updated " + updated + ".");
    } catch (err: any) {
      setStatus("Error: " + (err?.message ?? "Request failed"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="vcs-admin-import">
      <h1>Paste import</h1>
      <p style={{ marginTop: 5, marginBottom: 20, color: "#546c7a" }}>
        Add checklist records from copied Google Sheets or TCDB rows. This tool can create and
        update records in the product set you choose. Review the destination before importing.
      </p>
      <section className="vcs-admin-import-section">
        <label htmlFor="admin-import-product-set-id">1. Destination product set ID</label>
        <input
          id="admin-import-product-set-id"
          value={productSetIdOverride}
          onChange={(e) => setProductSetIdOverride(e.target.value)}
          placeholder="e.g., 1991_Donruss_Baseball_Base"
          autoComplete="off"
          style={{ maxWidth: 490 }}
        />
        <small>
          The override is applied to <strong>every pasted row</strong>. Create or verify the target in{" "}
          <Link href="/admin/product-sets">Product Sets</Link>, or open a product from{" "}
          <Link href="/admin/products">Products</Link> first.
        </small>
      </section>

      <section className="vcs-admin-import-section">
        <label htmlFor="admin-import-data">2. Rows to import</label>
        <textarea
          id="admin-import-data"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste copied spreadsheet or checklist rows here…"
          spellCheck={false}
        />
        <small>
          Paste the copied rows from your source. The importer uses the existing VCS import
          rules to interpret and save them; it does not change the selected product set&apos;s
          pack odds, pricing rules, or release status.
        </small>
      </section>

      <div className="vcs-admin-import-submit">
        <button
          type="button"
          onClick={onImport}
          disabled={importing || !text.trim() || !productSetIdOverride.trim()}
        >{importing ? "Importing…" : "Import rows ↗"}</button>
        <span style={{ color: "#5a6f7b", fontSize: 12 }}>
          {importing ? "Submitting rows to VCS…" : "Both fields are required. Check the ID before submitting."}
        </span>
      </div>

      {status && <div role={status.startsWith("Error:") ? "alert" : "status"} className="vcs-admin-import-result">{status}</div>}
      {result ? (
        <details style={{ marginTop: 14 }}>
          <summary>Technical import response</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>
        </details>
      ) : null}
    </main>
  );
}
