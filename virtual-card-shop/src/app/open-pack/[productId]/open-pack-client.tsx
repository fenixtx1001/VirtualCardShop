"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Card = {
  id: number;
  productSetId: string | null;
  cardNumber: string;
  player: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  frontImageUrl: string | null;
  backImageUrl: string | null;
  isInsert: boolean;

  bookValue: number;     // ✅ NEW
  ownedAfter: number;    // ✅ NEW (your total after this pack)
};

type OpenResult = {
  ok: boolean;
  productId: string;
  packImageUrl: string | null;
  cardsPerPack: number;
  cards: Card[];
};

export default function OpenPackClient({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OpenResult | null>(null);

  const [opened, setOpened] = useState(false);
  const [idx, setIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const cards = data?.cards ?? [];
  const current = cards[idx] ?? null;

  const canNext = opened && idx < cards.length - 1;
  const canPrev = opened && idx > 0;

  const progressText = useMemo(() => {
    if (!opened || !cards.length) return "";
    const expected = data?.cardsPerPack ?? cards.length;
    return `${idx + 1} / ${cards.length} (expected ${expected})`;
  }, [opened, cards.length, idx, data?.cardsPerPack]);

  const mismatch = useMemo(() => {
    if (!opened || !data) return false;
    return data.cardsPerPack !== data.cards.length;
  }, [opened, data]);

  async function openPack() {
    setLoading(true);
    setError(null);
    setData(null);
    setOpened(false);
    setIdx(0);

    try {
      const res = await fetch("/api/rip/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Open returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Open failed (${res.status})`);

      const result = j as OpenResult;
      setData(result);
      setOpened(true);

      setTimeout(() => containerRef.current?.focus(), 0);
    } catch (e: any) {
      setError(e?.message ?? "Open pack failed");
    } finally {
      setLoading(false);
    }
  }

  function next() {
    if (!canNext) return;
    setIdx((v) => Math.min(v + 1, cards.length - 1));
  }

  function prev() {
    if (!canPrev) return;
    setIdx((v) => Math.max(v - 1, 0));
  }

  // Spacebar + arrow keys
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!opened) return;

      if (e.code === "Space") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowRight") {
        next();
      } else if (e.key === "ArrowLeft") {
        prev();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, cards.length, idx]);

  const fmtMoney = (v: number | null | undefined) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
    return n.toFixed(2);
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/inventory" style={{ textDecoration: "underline" }}>
          ← Back to Inventory
        </Link>
        <div style={{ fontWeight: 800 }}>Open Pack: {productId}</div>
      </div>

      <hr style={{ margin: "14px 0" }} />

      {error && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {error}
        </div>
      )}

      {!opened ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 14, color: "#444" }}>
            This will open 1 pack from your sealed inventory and add the cards to your collection.
          </div>

          {data?.packImageUrl ? (
            <img
              src={data.packImageUrl}
              alt="Pack"
              style={{ width: 260, height: "auto", border: "1px solid #ddd" }}
            />
          ) : (
            <div style={{ width: 260, padding: 10, border: "1px solid #ddd" }}>
              (No pack image set)
            </div>
          )}

          <button onClick={openPack} disabled={loading} style={{ width: 180, padding: "10px 12px" }}>
            {loading ? "Opening..." : "Open 1 Pack"}
          </button>
        </div>
      ) : (
        <div ref={containerRef} tabIndex={-1} style={{ outline: "none", display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 14, color: "#444" }}>
              Click the card image or press <b>Space</b> to advance. (←/→ also works)
            </div>
            <div style={{ fontWeight: 900 }}>{progressText}</div>
          </div>

          {mismatch && (
            <div style={{ padding: 10, background: "#fff6d6", border: "1px solid #e6c76a" }}>
              Heads up: server returned <b>{data?.cards.length}</b> cards but product says{" "}
              <b>{data?.cardsPerPack}</b>. That means your <code>cardsPerPack</code> value (or pack logic) is off.
            </div>
          )}

          <div
            style={{
              border: "1px solid #ddd",
              padding: 12,
              display: "grid",
              gridTemplateColumns: "340px 1fr",
              gap: 14,
              userSelect: "none",
            }}
          >
            {/* Click-to-advance ONLY on the image area */}
            <div
              onClick={() => next()}
              style={{
                cursor: canNext ? "pointer" : "default",
              }}
            >
              {current?.frontImageUrl ? (
                <img
                  src={current.frontImageUrl}
                  alt={`${current.player} front`}
                  style={{ width: 340, height: "auto", border: "1px solid #ddd" }}
                />
              ) : (
                <div style={{ width: 340, padding: 12, border: "1px solid #ddd" }}>(No front image)</div>
              )}
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 22, fontWeight: 900 }}>
                #{current?.cardNumber} — {current?.player}
              </div>

              <div style={{ fontSize: 14, color: "#444" }}>
                {current?.team ?? "—"}
                {current?.subset ? ` • ${current.subset}` : ""}
                {current?.variant ? ` • ${current.variant}` : ""}
              </div>

              <div style={{ fontSize: 14 }}>
                <b>Type:</b> {current?.isInsert ? "Insert" : "Base"}
              </div>

              <div style={{ fontSize: 14 }}>
                <b>Book:</b> ${fmtMoney(current?.bookValue)}
                {"  "}•{"  "}
                <b>You own:</b> {current?.ownedAfter ?? "—"}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    prev();
                  }}
                  disabled={!canPrev}
                  style={{ padding: "8px 10px" }}
                >
                  ← Prev
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    next();
                  }}
                  disabled={!canNext}
                  style={{ padding: "8px 10px" }}
                >
                  Next →
                </button>
              </div>

              {!canNext && (
                <div style={{ marginTop: 10, padding: 10, background: "#efe", border: "1px solid #9f9" }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Pack complete.</div>

                  <div style={{ fontSize: 14, color: "#333", marginBottom: 8 }}>
                    You received <b>{cards.length}</b> cards (expected{" "}
                    <b>{data?.cardsPerPack ?? cards.length}</b>).
                  </div>

                  <div style={{ fontSize: 13, color: "#333" }}>
                    <b>Pack list:</b>
                    <ol style={{ marginTop: 6, paddingLeft: 18 }}>
                      {cards.map((c) => (
                        <li key={c.id} style={{ marginBottom: 4 }}>
                          <span style={{ fontWeight: 700 }}>
                            #{c.cardNumber} — {c.player}
                          </span>{" "}
                          {c.isInsert ? "(Insert)" : ""}
                          <div style={{ fontSize: 12, color: "#333" }}>
                            Book: <b>${fmtMoney(c.bookValue)}</b> • You own: <b>{c.ownedAfter}</b>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ fontSize: 12, color: "#666" }}>
            Tip: Spacebar advances 1 card. If it ever skips again, that means something is firing twice.
          </div>
        </div>
      )}
    </div>
  );
}
