"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Row = {
  productId: string;
  uniqueOwned: number;
  totalCards: number;
  percentComplete: number;
  packImageUrl: string | null;
  totalQty: number;
};

export default function CollectionClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/collection/summary", { cache: "no-store" });
      const raw = await res.text();

      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Collection returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      setRows(j as Row[]);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load collection");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(() => [...rows].sort((a, b) => a.productId.localeCompare(b.productId)), [rows]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <h1 style={{ fontSize: 32, fontWeight: 900, marginTop: 0 }}>Collection</h1>
      <p style={{ marginTop: 6 }}>
        Click a set to view your owned cards + completion. Checklist shows every card with an owned checkbox.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
        <button onClick={load} style={{ padding: "8px 12px" }}>
          Refresh
        </button>
        <Link href="/inventory" style={{ textDecoration: "underline", fontWeight: 700 }}>
          Inventory
        </Link>
        <Link href="/shop" style={{ textDecoration: "underline", fontWeight: 700 }}>
          Shop
        </Link>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {err && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {err}
        </div>
      )}

      {loading ? (
        <div>Loading…</div>
      ) : sorted.length === 0 ? (
        <div>Nothing in your collection yet. Open a pack first, then come back here.</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
              <tr>
                {["Set", "Complete", "Unique Owned", "Total Cards", "Total Qty", "Pack", "Actions"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: 8,
                      borderBottom: "1px solid #ddd",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => {
                const zebra = idx % 2 === 0 ? "#fff" : "#fcfcfc";

                return (
                  <tr key={r.productId} style={{ background: zebra }}>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                      {r.productId}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 800 }}>
                      {Number(r.percentComplete ?? 0).toFixed(1)}%
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.uniqueOwned}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.totalCards}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.totalQty}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      {r.packImageUrl ? (
                        <img
                          src={r.packImageUrl}
                          alt="Pack"
                          style={{ width: 48, height: 64, objectFit: "cover", border: "1px solid #eee" }}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <Link
                          href={`/collection/${encodeURIComponent(r.productId)}`}
                          style={{ textDecoration: "underline", fontWeight: 800 }}
                        >
                          View cards
                        </Link>
                        <Link
                          href={`/checklist/${encodeURIComponent(r.productId)}`}
                          style={{ textDecoration: "underline", fontWeight: 800 }}
                        >
                          Checklist
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
