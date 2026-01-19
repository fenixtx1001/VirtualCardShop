"use client";

import { useEffect, useMemo, useState } from "react";

type CardRow = {
  id: number;
  productSetId: string | null;
  cardNumber: string;
  player: string;
  team: string | null;
  subset: string | null;
  insert: string | null;
  variant: string | null;
  quantityOwned: number;
  bookValue: number;
  imageUrl: string | null;
};

function money(v: number) {
  if (!Number.isFinite(v)) return "0.00";
  return v.toFixed(2);
}

export default function CollectionClient() {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/cards?owned=1", { cache: "no-store" });
      const raw = await res.text();
      let j: any;
      try {
        j = raw ? JSON.parse(raw) : [];
      } catch {
        throw new Error(`API returned non-JSON (${res.status}): ${raw.slice(0, 120)}`);
      }
      if (!res.ok) throw new Error(j?.error ?? `Failed to load (${res.status})`);
      setCards(j as CardRow[]);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(() => {
    const arr = [...cards];
    arr.sort((a, b) => {
      const ps = (a.productSetId ?? "").localeCompare(b.productSetId ?? "");
      if (ps !== 0) return ps;
      return a.id - b.id;
    });
    return arr;
  }, [cards]);

  return (
    <main>
      <h1 style={{ fontSize: 32, fontWeight: 900, margin: "6px 0 10px" }}>Collection</h1>
      <p style={{ marginTop: 0, color: "#333" }}>Opened cards you own (Qty &gt; 0). (Single-user for now.)</p>

      {err && <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>{err}</div>}

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
              <tr>
                {["Set", "#", "Player", "Team", "Subset", "Insert", "Variant", "Qty", "Book", "Image"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, idx) => (
                <tr key={c.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>{c.productSetId ?? "—"}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.cardNumber}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.player}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.team ?? "—"}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.subset ?? "—"}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.insert ?? "—"}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.variant ?? "—"}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.quantityOwned}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{money(c.bookValue ?? 0)}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.imageUrl ? "✅" : "—"}</td>
                </tr>
              ))}

              {sorted.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: 12 }}>
                    You don’t own any cards yet. Rip some packs once we wire that up.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
