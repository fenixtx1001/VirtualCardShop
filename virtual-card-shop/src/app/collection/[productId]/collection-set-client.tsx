"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ProductSetOption = {
  id: string;
  isBase: boolean;
  name: string | null;
};

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

  // ✅ new (from API)
  productSetId: string;
  productSetIsBase: boolean;
  productSets: ProductSetOption[];

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

function safeNum(v: any, fallback = 0) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

// --- Card number-aware sorting (ignores any prefix)
// Works for: "BC-14", "DK-007", "10a", "A12b", etc.
function parseCardNo(raw: string | null | undefined) {
  const s = (raw ?? "").trim();
  const lower = s.toLowerCase();

  const m = lower.match(/(\d+)/);
  if (!m || m.index == null) {
    return { n: Number.POSITIVE_INFINITY, suf: lower, raw: lower };
  }

  const numStr = m[1];
  const n = parseInt(numStr, 10);

  const start = m.index;
  const end = start + numStr.length;
  const suffixRaw = lower.slice(end);
  const suf = suffixRaw.replace(/[^a-z0-9]+/g, "");

  return {
    n: Number.isFinite(n) ? n : Number.POSITIVE_INFINITY,
    suf,
    raw: lower,
  };
}

function cardNoCompare(aNo: string, bNo: string) {
  const a = parseCardNo(aNo);
  const b = parseCardNo(bNo);
  if (a.n !== b.n) return a.n - b.n;
  if (a.suf !== b.suf) return a.suf.localeCompare(b.suf);
  return a.raw.localeCompare(b.raw);
}

function formatSetLabel(ps: ProductSetOption) {
  const base = ps.name?.trim() ? ps.name!.trim() : ps.id;
  return ps.isBase ? `Base — ${base}` : `Insert — ${base}`;
}

export default function CollectionSetClient({ productId }: { productId: string }) {
  // 🔐 HARD GUARD — prevents undefined ever leaking into fetches
  if (!productId) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui" }}>
        <div style={{ padding: 12, background: "#fee", border: "1px solid #f99" }}>
          Missing productId
        </div>
      </div>
    );
  }

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // dropdown state
  const [selectedProductSetId, setSelectedProductSetId] = useState<string>("");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showBack, setShowBack] = useState(false);

  async function load(explicitProductSetId?: string) {
    setLoading(true);
    setErr(null);

    try {
      const qs = new URLSearchParams();
      const psid = (explicitProductSetId ?? selectedProductSetId).trim();
      if (psid) qs.set("productSetId", psid);

      const url =
        `/api/collection/product/${encodeURIComponent(productId)}` +
        (qs.toString() ? `?${qs.toString()}` : "");

      const res = await fetch(url, { cache: "no-store" });

      const raw = await res.text();
      let j: any = null;

      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Set returned non-JSON (${res.status}): ${raw.slice(0, 180)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      const next = j as ApiResponse;
      setData(next);

      // lock dropdown to whatever API selected if we don't have a selection yet
      if (!selectedProductSetId && next?.productSetId) {
        setSelectedProductSetId(next.productSetId);
      }
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

  // Sort productSets: base first, then inserts
  const productSetsSorted = useMemo(() => {
    const arr = data?.productSets ?? [];
    return [...arr].sort((a, b) => Number(b.isBase) - Number(a.isBase));
  }, [data]);

  // Sort owned cards list using cardNoCompare
  const cards = useMemo(() => {
    const arr = data?.cards ?? [];
    return [...arr].sort((a, b) => cardNoCompare(a.cardNumber, b.cardNumber));
  }, [data]);

  // ✅ Always ensure a valid selected card after load / refresh
  useEffect(() => {
    if (!cards.length) {
      setSelectedId(null);
      return;
    }

    setSelectedId((prev) => {
      const stillExists = cards.some((c) => c.cardId === prev);
      return stillExists ? prev : cards[0].cardId;
    });

    setShowBack(false);
  }, [cards]);

  const selected = useMemo(() => {
    if (!cards.length) return null;
    return cards.find((c) => c.cardId === selectedId) ?? cards[0];
  }, [cards, selectedId]);

  const imageUrl = useMemo(() => {
    if (!selected) return null;
    if (showBack) return selected.backImageUrl ?? selected.frontImageUrl ?? null;
    return selected.frontImageUrl ?? selected.backImageUrl ?? null;
  }, [selected, showBack]);

  function selectCard(id: number) {
    setSelectedId(id);
    setShowBack(false);
  }

  const pct = safeNum(data?.percentComplete, 0);

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <Link href="/collection" style={{ textDecoration: "underline", fontWeight: 700 }}>
          ← Back to Collection
        </Link>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>{productId}</h1>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={() => load()} style={{ padding: "8px 12px" }}>
          Refresh
        </button>

        <Link
          href={`/checklist/${encodeURIComponent(productId)}`}
          style={{ textDecoration: "underline", fontWeight: 800 }}
        >
          Checklist →
        </Link>
      </div>

      <hr style={{ margin: "14px 0" }} />

      {/* ✅ ProductSet dropdown */}
      {data?.productSets?.length ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ fontWeight: 900 }}>Viewing:</div>
          <select
            value={selectedProductSetId}
            onChange={(e) => {
              const nextId = e.target.value;
              setSelectedProductSetId(nextId);
              load(nextId);
            }}
            style={{
              padding: "8px 10px",
              border: "1px solid #ddd",
              borderRadius: 10,
              minWidth: 320,
              fontWeight: 700,
            }}
          >
            {productSetsSorted.map((ps) => (
              <option key={ps.id} value={ps.id}>
                {formatSetLabel(ps)}
              </option>
            ))}
          </select>

          <div style={{ color: "#666", fontWeight: 700 }}>
            {data.productSetIsBase ? "Base set completion" : "Insert set completion"}
          </div>
        </div>
      ) : null}

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
          {/* Stats */}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Complete</div>
              <div style={{ fontWeight: 900 }}>{pct.toFixed(1)}%</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Unique Owned</div>
              <div style={{ fontWeight: 900 }}>{safeNum(data.uniqueOwned)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Total Cards</div>
              <div style={{ fontWeight: 900 }}>{safeNum(data.totalCards)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Total Qty</div>
              <div style={{ fontWeight: 900 }}>{safeNum(data.totalQty)}</div>
            </div>
          </div>

          {/* Split layout */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              alignItems: "start",
            }}
          >
            {/* LEFT: Card preview */}
            <div style={{ border: "1px solid #ddd", padding: 12, minHeight: 520 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontWeight: 900 }}>
                  #{selected?.cardNumber ?? "—"} — {selected?.player ?? "—"}
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  Click card to flip ({showBack ? "Back" : "Front"})
                </div>
              </div>

              <div onClick={() => setShowBack((v) => !v)} style={{ cursor: "pointer", display: "grid", placeItems: "center" }}>
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Card"
                    style={{
                      width: "100%",
                      maxWidth: 520,
                      border: "1px solid #ddd",
                      background: "#fff",
                    }}
                  />
                ) : (
                  <div style={{ width: "100%", padding: 18, border: "1px solid #ddd" }}>
                    (No image for this card yet)
                  </div>
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
                  {data.productSetIsBase ? " • Base" : " • Insert"}
                </div>
              </div>
            </div>

            {/* RIGHT: Scrollable list */}
            <div
              style={{
                border: "1px solid #ddd",
                height: 620,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: 10, borderBottom: "1px solid #ddd", background: "#f7f7f7", fontWeight: 900 }}>
                Your Cards (click a row)
              </div>

              <div style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: "#fff" }}>
                    <tr>
                      {["#", "Player", "Qty", "Book"].map((h) => (
                        <th key={h} style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
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
                          <td style={{ padding: 10, fontWeight: 800 }}>{c.cardNumber}</td>
                          <td style={{ padding: 10 }}>
                            <div style={{ fontWeight: 800 }}>{c.player}</div>
                            <div style={{ fontSize: 12, color: "#666" }}>
                              {c.team ?? "—"}
                              {c.subset ? ` • ${c.subset}` : ""}
                              {c.variant ? ` • ${c.variant}` : ""}
                              {!data.productSetIsBase ? " • Insert" : ""}
                            </div>
                          </td>
                          <td style={{ padding: 10, fontWeight: 800 }}>{c.quantity}</td>
                          <td style={{ padding: 10 }}>{fmtMoney(c.bookValue)}</td>
                        </tr>
                      );
                    })}

                    {cards.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ padding: 12 }}>
                          No cards owned in this product set yet.
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
