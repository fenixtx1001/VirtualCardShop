"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ChecklistRow = {
  cardId: number;
  cardNumber: string;
  player: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  isInsert: boolean;
  bookValue: number | null;
  ownedQty: number;
};

type ChecklistResponse = {
  ok: boolean;
  productId: string;
  totalCards: number;
  uniqueOwned: number;
  percentComplete: number;
  rows?: ChecklistRow[];  // some versions
  cards?: ChecklistRow[]; // other versions
};

export default function ChecklistClient({ productId }: { productId: string }) {
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const url = `/api/checklist/product/${encodeURIComponent(productId)}`;
      const res = await fetch(url, { cache: "no-store" });
      const raw = await res.text();

      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Checklist returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      setData(j as ChecklistResponse);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load checklist");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const sorted = useMemo(() => {
    const rows = (data?.rows ?? data?.cards ?? []) as ChecklistRow[];
    return [...rows].sort((a, b) => {
      const an = Number(a.cardNumber);
      const bn = Number(b.cardNumber);
      const aNum = Number.isFinite(an);
      const bNum = Number.isFinite(bn);
      if (aNum && bNum) return an - bn;
      return String(a.cardNumber).localeCompare(String(b.cardNumber));
    });
  }, [data]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Link href={`/collection/${encodeURIComponent(productId)}`} style={{ textDecoration: "underline", fontWeight: 800 }}>
          ← Back to Set
        </Link>

        <div style={{ fontWeight: 900, fontSize: 22 }}>Checklist: {productId}</div>

        <button onClick={load} style={{ padding: "6px 10px" }}>
          Refresh
        </button>

        <Link href="/collection" style={{ textDecoration: "underline", fontWeight: 800 }}>
          Collection →
        </Link>
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
            Complete: {data.percentComplete.toFixed(1)}% ({data.uniqueOwned}/{data.totalCards} unique)
          </div>

          {sorted.length === 0 ? (
            <div style={{ padding: 10, border: "1px solid #ddd", background: "#fffdf2" }}>
              Checklist loaded but returned 0 rows. This usually means your API is returning a different field name (fixed above),
              or your API query is filtering out the set.
            </div>
          ) : null}

          <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
                <tr>
                  {["Owned", "#", "Player", "Team", "Subset", "Variant", "Type", "Qty"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, idx) => {
                  const owned = (r.ownedQty ?? 0) > 0;
                  return (
                    <tr key={r.cardId} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>{owned ? "✅" : "⬜"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>{r.cardNumber}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.player}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.team ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.subset ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.variant ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.isInsert ? "Insert" : "Base"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 800 }}>{r.ownedQty ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
