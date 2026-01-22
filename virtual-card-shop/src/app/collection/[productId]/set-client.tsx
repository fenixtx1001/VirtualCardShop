"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CardRow = {
  id: number;
  cardNumber: string;
  player: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  frontImageUrl: string | null;
  backImageUrl: string | null;
  bookValue: number;
  quantity: number;
  productSet: { id: string; isBase: boolean };
};

type Resp = {
  productId: string;
  totalCards: number;
  uniqueOwned: number;
  percentComplete: number;
  cards: CardRow[];
};

export default function CollectionSetClient({ productId }: { productId: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"table" | "grid">("table");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/collection/product/${encodeURIComponent(productId)}`, { cache: "no-store" });
      const raw = await res.text();
      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Set returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      setData(j as Resp);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load set");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [productId]);

  const cards = data?.cards ?? [];
  const sorted = useMemo(() => [...cards].sort((a, b) => a.cardNumber.localeCompare(b.cardNumber)), [cards]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
        <Link href="/collection" style={{ textDecoration: "underline", fontWeight: 800 }}>
          ← Back to Collection
        </Link>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{productId}</h1>
      </div>

      <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={load} style={{ padding: "8px 12px" }}>
          Refresh
        </button>
        <Link href={`/checklist/${encodeURIComponent(productId)}`} style={{ textDecoration: "underline", fontWeight: 800 }}>
          Checklist →
        </Link>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontWeight: 800 }}>View:</span>
          <button onClick={() => setMode("table")} style={{ padding: "6px 10px", fontWeight: mode === "table" ? 900 : 600 }}>
            Table
          </button>
          <button onClick={() => setMode("grid")} style={{ padding: "6px 10px", fontWeight: mode === "grid" ? 900 : 600 }}>
            Cards
          </button>
        </div>
      </div>

      <hr style={{ margin: "14px 0" }} />

      {err && <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>{err}</div>}

      {loading ? (
        <div>Loading…</div>
      ) : !data ? (
        <div>No data.</div>
      ) : (
        <>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>
            Complete: {data.percentComplete.toFixed(1)}% ({data.uniqueOwned}/{data.totalCards})
          </div>

          {mode === "table" ? (
            <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
                  <tr>
                    {["#", "Player", "Team", "Subset", "Variant", "Qty", "Book"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c, idx) => (
                    <tr key={c.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>{c.cardNumber}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 800 }}>{c.player}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.team ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.subset ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.variant ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.quantity}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>${(c.bookValue ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              {sorted.map((c) => (
                <div key={c.id} style={{ border: "1px solid #ddd", padding: 10 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>
                    #{c.cardNumber} • x{c.quantity}
                  </div>
                  {c.frontImageUrl ? (
                    <img src={c.frontImageUrl} alt={c.player} style={{ width: "100%", height: "auto", border: "1px solid #eee" }} />
                  ) : (
                    <div style={{ padding: 10, border: "1px solid #eee" }}>(No image)</div>
                  )}
                  <div style={{ marginTop: 8, fontWeight: 800 }}>{c.player}</div>
                  <div style={{ fontSize: 12, color: "#444" }}>
                    {c.team ?? "—"}
                    {c.subset ? ` • ${c.subset}` : ""}
                    {c.variant ? ` • ${c.variant}` : ""}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    Book: <b>${(c.bookValue ?? 0).toFixed(2)}</b>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
