"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CardRow = {
  cardId: number;
  cardNumber: string;
  player: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  isInsert: boolean;
  quantity: number;
  bookValue: number | null;
  frontImageUrl: string | null;
  backImageUrl: string | null;
};

type ApiResponse = {
  ok: boolean;
  productId: string;
  uniqueOwned: number;
  totalCards: number;
  percentComplete: number;
  totalQty: number;
  cards: CardRow[];
};

function fmtMoney(v: number | null | undefined) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return `$${n.toFixed(2)}`;
}

export default function CollectionSetClient({ productId }: { productId: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showBack, setShowBack] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/collection/product/${encodeURIComponent(productId)}`, {
        cache: "no-store",
      });
      const raw = await res.text();
      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Set returned non-JSON (${res.status}): ${raw.slice(0, 180)}`);
      }
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      setData(j as ApiResponse);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load set");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const cards = data?.cards ?? [];

  // Default select first card when data loads
  useEffect(() => {
    if (!cards.length) return;
    setSelectedId((prev) => (prev == null ? cards[0].cardId : prev));
    setShowBack(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.productId, cards.length]);

  const selected = useMemo(() => {
    if (!cards.length) return null;
    return cards.find((c) => c.cardId === selectedId) ?? cards[0];
  }, [cards, selectedId]);

  const imageUrl = useMemo(() => {
    if (!selected) return null;
    const front = selected.frontImageUrl;
    const back = selected.backImageUrl;
    if (showBack) return back ?? front ?? null;
    return front ?? back ?? null;
  }, [selected, showBack]);

  function selectCard(id: number) {
    setSelectedId(id);
    setShowBack(false);
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <Link href="/collection" style={{ textDecoration: "underline", fontWeight: 700 }}>
          ← Back to Collection
        </Link>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>{productId}</h1>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={load} style={{ padding: "8px 12px" }}>
          Refresh
        </button>

        <Link href={`/checklist/${encodeURIComponent(productId)}`} style={{ textDecoration: "underline", fontWeight: 800 }}>
          Checklist →
        </Link>
      </div>

      <hr style={{ margin: "14px 0" }} />

      {err && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {err}
        </div>
      )}

      {loading ? (
        <div>Loading…</div>
      ) : !data ? (
        <div>No data.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Complete</div>
              <div style={{ fontWeight: 900 }}>{data.percentComplete.toFixed(1)}%</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Unique Owned</div>
              <div style={{ fontWeight: 900 }}>{data.uniqueOwned}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Total Cards</div>
              <div style={{ fontWeight: 900 }}>{data.totalCards}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Total Qty</div>
              <div style={{ fontWeight: 900 }}>{data.totalQty}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
            {/* LEFT: big card */}
            <div style={{ border: "1px solid #ddd", padding: 12, minHeight: 520 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>
                  #{selected?.cardNumber ?? "—"} — {selected?.player ?? "—"}
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>Click card to flip ({showBack ? "Back" : "Front"})</div>
              </div>

              <div
                onClick={() => setShowBack((v) => !v)}
                style={{ cursor: "pointer", display: "grid", placeItems: "center" }}
                title="Click to flip"
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Card"
                    style={{
                      width: "100%",
                      maxWidth: 520,
                      height: "auto",
                      border: "1px solid #ddd",
                      background: "#fff",
                    }}
                  />
                ) : (
                  <div style={{ width: "100%", padding: 18, border: "1px solid #ddd" }}>(No image for this card yet)</div>
                )}
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 6, fontSize: 14 }}>
                <div>
                  <b>Qty:</b> {selected?.quantity ?? 0}
                </div>
                <div>
                  <b>Book:</b> {fmtMoney(selected?.bookValue)}
                </div>
                <div style={{ color: "#444" }}>
                  {selected?.team ?? "—"}
                  {selected?.subset ? ` • ${selected.subset}` : ""}
                  {selected?.variant ? ` • ${selected.variant}` : ""}
                  {selected?.isInsert ? " • Insert" : " • Base"}
                </div>
              </div>
            </div>

            {/* RIGHT: scrollable widget */}
            <div style={{ border: "1px solid #ddd", height: 620, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: 10, borderBottom: "1px solid #ddd", background: "#f7f7f7", fontWeight: 900 }}>
                Your Cards (click a row)
              </div>

              <div style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: "#fff" }}>
                    <tr>
                      {["#", "Player", "Qty", "Book"].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: 10,
                            borderBottom: "1px solid #eee",
                            fontSize: 12,
                            color: "#555",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map((c, idx) => {
                      const active = c.cardId === selected?.cardId;
                      return (
                        <tr
                          key={c.cardId}
                          onClick={() => selectCard(c.cardId)}
                          style={{
                            cursor: "pointer",
                            background: active ? "#eef6ff" : idx % 2 === 0 ? "#fff" : "#fcfcfc",
                          }}
                        >
                          <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0", fontWeight: 800 }}>{c.cardNumber}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                            <div style={{ fontWeight: 800 }}>{c.player}</div>
                            <div style={{ fontSize: 12, color: "#666" }}>
                              {c.team ?? "—"}
                              {c.subset ? ` • ${c.subset}` : ""}
                              {c.variant ? ` • ${c.variant}` : ""}
                              {c.isInsert ? " • Insert" : ""}
                            </div>
                          </td>
                          <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0", fontWeight: 800 }}>{c.quantity}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>{fmtMoney(c.bookValue)}</td>
                        </tr>
                      );
                    })}

                    {cards.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ padding: 12 }}>
                          No cards owned in this set yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
