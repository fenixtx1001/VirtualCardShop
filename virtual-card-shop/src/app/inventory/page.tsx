"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  id: number;
  productId: string;
  packsOwned: number;
  product: {
    id: string;
    year: number | null;
    brand: string | null;
    sport: string | null;
    packPriceCents: number;
    packsPerBox: number | null;
    packImageUrl: string | null;
    boxImageUrl: string | null;
    cardsPerPack?: number | null;
  };
  updatedAt: string;
};

function centsToDollars(cents: number | null | undefined) {
  const c = typeof cents === "number" ? cents : 0;
  return (c / 100).toFixed(2);
}

export default function InventoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/inventory", { cache: "no-store" });
      const raw = await res.text();
      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Inventory returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }
      if (!res.ok) throw new Error(j?.error ?? `Failed to load (${res.status})`);
      setRows(j);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 32, fontWeight: 900, marginTop: 0 }}>Inventory</h1>
      <p style={{ marginTop: 6 }}>Unopened packs you own. (Boxes are stored as packs.)</p>

      <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={load} style={{ padding: "8px 12px" }}>
          Refresh
        </button>
        <Link href="/shop" style={{ textDecoration: "underline", fontWeight: 700 }}>
          Go to Shop
        </Link>
        <Link href="/" style={{ textDecoration: "underline", fontWeight: 700 }}>
          Home
        </Link>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {err ? (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {err}
        </div>
      ) : null}

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
              <tr>
                {["Product", "Packs Owned", "Pack Price", "Cards/Pack", "Updated", "Action"].map((h) => (
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
              {rows.map((r, idx) => {
                const zebra = idx % 2 === 0 ? "#fff" : "#fcfcfc";
                const canOpen = (r.packsOwned ?? 0) > 0;

                // ✅ Link DIRECTLY to open-pack route (no redirect hop)
                const openHref = `/open-pack/${encodeURIComponent(r.productId)}`;

                return (
                  <tr key={r.id} style={{ background: zebra }}>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 800 }}>{r.productId}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.packsOwned}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>${centsToDollars(r.product.packPriceCents)}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.product.cardsPerPack ?? "—"}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{new Date(r.updatedAt).toLocaleString()}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      {canOpen ? (
                        <Link href={openHref} style={{ textDecoration: "underline", fontWeight: 800 }}>
                          Open Pack
                        </Link>
                      ) : (
                        <span style={{ color: "#777" }}>No packs</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 12 }}>
                    No inventory yet. Buy packs/boxes in the Shop.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
