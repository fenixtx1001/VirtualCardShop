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
  bookValue: number;
  ownedAfter: number;
};

type OpenResult = {
  ok: boolean;
  productId: string;
  packImageUrl: string | null;
  cardsPerPack: number;
  cards: Card[];
};

type PackMeta = {
  ok: boolean;
  productId: string;
  displayName: string;
  packImageUrl: string | null;
};

export default function OpenPackClient({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [meta, setMeta] = useState<PackMeta | null>(null);
  const [data, setData] = useState<OpenResult | null>(null);

  const [opened, setOpened] = useState(false);
  const [idx, setIdx] = useState(0);

  // Flip state for the CURRENT card (left panel)
  const [flipped, setFlipped] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const cards = data?.cards ?? [];
  const current = cards[idx] ?? null;
  const prevCard = idx > 0 ? cards[idx - 1] : null;

  const canNext = opened && idx < cards.length - 1;
  const canPrev = opened && idx > 0;

  // ---- Pack meta (so pack image shows before opening) ----
  useEffect(() => {
    let cancelled = false;

    async function loadMeta() {
      if (!productId) return;
      setMetaLoading(true);
      try {
        // If this endpoint exists, great. If not, it will fail gracefully.
        const res = await fetch(`/api/open-pack/meta/${encodeURIComponent(productId)}`, {
          cache: "no-store",
        });

        const raw = await res.text();
        let j: any = {};
        try {
          j = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error(`Meta returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
        }

        if (!res.ok) throw new Error(j?.error ?? `Failed to load pack meta (${res.status})`);
        if (!cancelled) setMeta(j as PackMeta);
      } catch {
        // Do not block opening a pack if meta fails
        if (!cancelled) setMeta(null);
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    }

    loadMeta();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const titleText = meta?.displayName ?? productId;
  const packImageUrl = meta?.packImageUrl ?? data?.packImageUrl ?? null;

  // ---- Summary helpers ----
  const fmtMoney = (v: number | null | undefined) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
    return n.toFixed(2);
  };

  const progressText = useMemo(() => {
    if (!opened || !cards.length) return "";
    const expected = data?.cardsPerPack ?? cards.length;
    return `${idx + 1} / ${cards.length} (expected ${expected})`;
  }, [opened, cards.length, idx, data?.cardsPerPack]);

  const mismatch = useMemo(() => {
    if (!opened || !data) return false;
    return data.cardsPerPack !== data.cards.length;
  }, [opened, data]);

  // Show a small "stack" of the last few opened card backs on the right
  const stack = useMemo(() => {
    if (!opened) return [];
    const openedCards = cards.slice(0, idx); // cards already passed
    return openedCards.slice(-4); // last 4
  }, [opened, cards, idx]);

  async function openPack() {
    setLoading(true);
    setError(null);
    setData(null);
    setOpened(false);
    setIdx(0);
    setFlipped(false);

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
    setFlipped(false);
    setIdx((v) => Math.min(v + 1, cards.length - 1));
  }

  function prev() {
    if (!canPrev) return;
    setFlipped(false);
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
      } else if (e.key.toLowerCase() === "f") {
        // quick flip
        setFlipped((x) => !x);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, cards.length, idx]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/inventory" style={{ textDecoration: "underline" }}>
          ← Back to Inventory
        </Link>
        <div style={{ fontWeight: 800 }}>Open Pack: {titleText}</div>
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

          {metaLoading ? (
            <div style={{ width: 260, padding: 10, border: "1px solid #ddd" }}>(Loading pack image…)</div>
          ) : packImageUrl ? (
            <img
              src={packImageUrl}
              alt="Pack"
              style={{ width: 260, height: "auto", border: "1px solid #ddd", borderRadius: 6 }}
            />
          ) : (
            <div style={{ width: 260, padding: 10, border: "1px solid #ddd" }}>(No pack image set)</div>
          )}

          <button onClick={openPack} disabled={loading || !productId} style={{ width: 180, padding: "10px 12px" }}>
            {loading ? "Opening..." : "Open 1 Pack"}
          </button>
        </div>
      ) : (
        <div ref={containerRef} tabIndex={-1} style={{ outline: "none", display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 14, color: "#444" }}>
              Space advances • ←/→ navigate • Click card to flip • Press <b>F</b> to flip
            </div>
            <div style={{ fontWeight: 900 }}>{progressText}</div>
          </div>

          {mismatch && (
            <div style={{ padding: 10, background: "#fff6d6", border: "1px solid #e6c76a" }}>
              Heads up: server returned <b>{data?.cards.length}</b> cards but product says <b>{data?.cardsPerPack}</b>.
            </div>
          )}

          {/* Main 2-panel layout: current card (left) + stack/back (right) */}
          <div
            style={{
              border: "1px solid #ddd",
              padding: 12,
              display: "grid",
              gridTemplateColumns: "360px 360px 1fr",
              gap: 14,
              alignItems: "start",
              userSelect: "none",
            }}
          >
            {/* LEFT: current card front/back */}
            <div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                Current card ({flipped ? "Back" : "Front"})
              </div>

              <div
                onClick={() => setFlipped((x) => !x)}
                style={{
                  cursor: "pointer",
                  width: 360,
                }}
              >
                {(() => {
                  const url = flipped ? current?.backImageUrl : current?.frontImageUrl;
                  const label = flipped ? "(No back image)" : "(No front image)";

                  return url ? (
                    <img
                      src={url}
                      alt="Card"
                      style={{ width: 360, height: "auto", border: "1px solid #ddd", borderRadius: 8 }}
                    />
                  ) : (
                    <div style={{ width: 360, padding: 12, border: "1px solid #ddd" }}>{label}</div>
                  );
                })()}
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                <button onClick={prev} disabled={!canPrev} style={{ padding: "8px 10px" }}>
                  ← Prev
                </button>
                <button onClick={next} disabled={!canNext} style={{ padding: "8px 10px" }}>
                  Next →
                </button>
              </div>
            </div>

            {/* RIGHT: shows back of the previous card like it landed on the stack */}
            <div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Top of opened stack (Back)</div>

              {prevCard?.backImageUrl ? (
                <img
                  src={prevCard.backImageUrl}
                  alt="Previous card back"
                  style={{ width: 360, height: "auto", border: "1px solid #ddd", borderRadius: 8 }}
                />
              ) : prevCard ? (
                <div style={{ width: 360, padding: 12, border: "1px solid #ddd" }}>(No back image)</div>
              ) : (
                <div style={{ width: 360, padding: 12, border: "1px solid #ddd" }}>(No cards in stack yet)</div>
              )}

              {/* little stacked look */}
              {stack.length > 1 && (
                <div style={{ position: "relative", height: 90, marginTop: 12 }}>
                  {stack
                    .slice(0, -1) // everything under the top card
                    .map((c, i) => {
                      const offset = (stack.length - 2 - i) * 8;
                      return (
                        <div
                          key={c.id}
                          style={{
                            position: "absolute",
                            left: offset,
                            top: offset,
                            width: 120,
                            height: 75,
                            border: "1px solid #ddd",
                            borderRadius: 6,
                            background: "#f8f8f8",
                            display: "grid",
                            placeItems: "center",
                            fontSize: 11,
                            color: "#666",
                          }}
                          title={`#${c.cardNumber} — ${c.player}`}
                        >
                          Back
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* INFO PANEL */}
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
                <b>Book:</b> ${fmtMoney(current?.bookValue)} {"  "}•{"  "}
                <b>You own:</b> {current?.ownedAfter ?? "—"}
              </div>

              {packImageUrl ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Pack art</div>
                  <img
                    src={packImageUrl}
                    alt="Pack"
                    style={{ width: 220, height: "auto", border: "1px solid #ddd", borderRadius: 6 }}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {/* Pack complete + summary */}
          {!canNext && (
            <div style={{ marginTop: 10, padding: 12, background: "#efe", border: "1px solid #9f9" }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Pack complete.</div>

              <div style={{ fontSize: 14, color: "#333", marginBottom: 10 }}>
                You received <b>{cards.length}</b> cards (expected <b>{data?.cardsPerPack ?? cards.length}</b>).
              </div>

              <div style={{ fontSize: 13, color: "#333" }}>
                <b>Pack summary:</b>
                <ol style={{ marginTop: 8, paddingLeft: 18 }}>
                  {cards.map((c) => (
                    <li key={c.id} style={{ marginBottom: 6 }}>
                      <div style={{ fontWeight: 800 }}>
                        #{c.cardNumber} — {c.player} {c.isInsert ? "(Insert)" : ""}
                      </div>
                      <div style={{ fontSize: 12, color: "#333" }}>
                        Book: <b>${fmtMoney(c.bookValue)}</b> • You own: <b>{c.ownedAfter}</b>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: "#666" }}>
            Tip: If cards ever “skip,” something is firing twice. Space should advance exactly one card.
          </div>
        </div>
      )}
    </div>
  );
}
