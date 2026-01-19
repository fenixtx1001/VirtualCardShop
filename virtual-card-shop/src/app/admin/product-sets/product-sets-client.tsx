"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ProductSetRow = {
  id: string;
  productId: string;
  name: string | null;
  isBase: boolean;
  oddsPerPack: number | null;
  _count?: { cards: number };
};

export default function ProductSetsClient() {
  const [rows, setRows] = useState<ProductSetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/product-sets", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load product sets (${res.status})`);
      const data = (await res.json()) as ProductSetRow[];
      setRows(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load product sets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const p = a.productId.localeCompare(b.productId);
      if (p !== 0) return p;
      if (a.isBase !== b.isBase) return a.isBase ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
  }, [rows]);

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 32, fontWeight: 800 }}>Admin: Product Sets</h1>
      <p style={{ marginTop: 6 }}>
        Product Sets are the pools inside a Product (Base, Elite, etc.). Cards attach via <code>productSetId</code>.
      </p>

      <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
        <Link href="/admin" style={{ textDecoration: "underline" }}>
          ← Admin Home
        </Link>
        <Link href="/admin/products" style={{ textDecoration: "underline" }}>
          Admin: Products
        </Link>
        <button onClick={load} style={{ padding: "8px 12px" }}>
          Refresh
        </button>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {error && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
              <tr>
                {["Product", "Product Set ID", "Name", "Base?", "Odds (1:X packs)", "Cards"].map((h) => (
                  <th
                    key={h}
                    style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r, idx) => (
                <tr key={r.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                    <Link
                      href={`/admin/products/${encodeURIComponent(r.productId)}`}
                      style={{ textDecoration: "underline", fontWeight: 700 }}
                    >
                      {r.productId}
                    </Link>
                  </td>

                  <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                    <Link
                      href={`/admin/product-sets/${encodeURIComponent(r.id)}`}
                      style={{ textDecoration: "underline", fontWeight: 700 }}
                    >
                      {r.id}
                    </Link>
                  </td>

                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.name ?? "—"}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.isBase ? "Yes" : "No"}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.oddsPerPack ?? "—"}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r._count?.cards ?? "—"}</td>
                </tr>
              ))}

              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 12 }}>
                    No product sets yet. Create them from a Product detail page.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
