// src/app/open-pack/[productId]/open-pack-client.tsx
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

const colors = {
  bg: "#fbfaf7", // warm off-white
  card: "#ffffff",
  border: "#e7e3dc",
  text: "#1f1f1f",
  subtext: "#5a5a5a",
  accent: "#2f6fed",
  muted: "#f2efe9",
  soft: "#f8f6f1",
  warnBg: "#fff6d6",
  warnBorder: "#e6c76a",
  errBg: "#fff1f1",
  errBorder: "#f3b7b7",
  okBg: "#eefbf1",
  okBorder: "#a7e7b6",
};

function money(v: number | null | undefined) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return `$${n.toFixed(2)}`;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function OpenPackClient({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [meta, setMeta] = useState<PackMeta | null>(null);
  const [data, setData] = useState<OpenResult | null>(null);

  const [opened, setOpened] = useState(false);
  const [idx, setIdx] = useState(0);

  // Flip state for the CURRENT card
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

  const progressText = useMemo(() => {
    if (!opened || !cards.length) return "";
    const expected = data?.cardsPerPack ?? cards.length;
    return `${idx + 1} / ${cards.length} (expected ${expected})`;
  }, [opened, cards.length, idx, data?.cardsPerPack]);

  const mismatch = useMemo(() => {
    if (!opened || !data) return false;
    return data.cardsPerPack !== data.cards.length;
  }, [opened, data]);

  // stack (last few opened)
  const stack = useMemo(() => {
    if (!opened) return [];
    const openedCards = cards.slice(0, idx);
    return openedCards.slice(-4);
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
        setFlipped((x) => !x);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, cards.length, idx]);

  const cardFront = current?.frontImageUrl ?? null;
  const cardBack = current?.backImageUrl ?? null;

  const cardTitle = useMemo(() => {
    if (!current) return "—";
    return `#${current.cardNumber} — ${current.player}`;
  }, [current]);

  const subline = useMemo(() => {
    if (!current) return "—";
    const parts = [
      current.team ?? "—",
      current.subset ? `• ${current.subset}` : "",
      current.variant ? `• ${current.variant}` : "",
    ].filter(Boolean);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }, [current]);

  const isDone = opened && !canNext;

  return (
    <main className="vcs-pack-root">
      <style jsx global>{`
        .vcs-pack-root {
          background: ${colors.bg};
          min-height: calc(100vh - 80px);
          padding: 18px;
          color: ${colors.text};
          font-family: system-ui;
        }

        .vcs-pack-wrap {
          max-width: 1160px;
          margin: 0 auto;
        }

        .vcs-pack-hero {
          background: ${colors.card};
          border: 1px solid ${colors.border};
          border-radius: 18px;
          padding: 14px 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
          display: flex;
          gap: 12px;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
        }

        .vcs-pack-title {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 260px;
        }

        .vcs-pack-title h1 {
          margin: 0;
          font-size: 18px;
          font-weight: 950;
          letter-spacing: -0.2px;
        }

        .vcs-pack-title .sub {
          color: ${colors.subtext};
          font-size: 13px;
          line-height: 1.35;
          font-weight: 650;
        }

        .vcs-pack-actions {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .btn {
          border: 1px solid ${colors.border};
          background: ${colors.muted};
          color: ${colors.text};
          border-radius: 12px;
          padding: 9px 12px;
          font-weight: 900;
          cursor: pointer;
          transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          user-select: none;
        }

        .btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.06);
        }

        .btn:active {
          transform: translateY(0px);
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
        }

        .btn.primary {
          background: ${colors.accent};
          border-color: rgba(0, 0, 0, 0.08);
          color: white;
          box-shadow: 0 10px 24px rgba(47, 111, 237, 0.22);
        }

        .btn.primary:hover {
          box-shadow: 0 16px 34px rgba(47, 111, 237, 0.26);
        }

        .btn.ghost {
          background: transparent;
        }

        .btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
        }

        .pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 999px;
          border: 1px solid ${colors.border};
          background: ${colors.soft};
          font-weight: 900;
          font-size: 12px;
          color: ${colors.text};
          white-space: nowrap;
        }

        .hint {
          display: inline-flex;
          gap: 8px;
          flex-wrap: wrap;
          color: ${colors.subtext};
          font-size: 12px;
          font-weight: 750;
        }

        .hint kbd {
          border: 1px solid ${colors.border};
          background: white;
          border-bottom-width: 2px;
          border-radius: 8px;
          padding: 2px 6px;
          font-size: 11px;
          font-weight: 900;
          color: ${colors.text};
        }

        .vcs-pack-stage {
          margin-top: 14px;
          background: ${colors.card};
          border: 1px solid ${colors.border};
          border-radius: 18px;
          padding: 14px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
        }

        .alert {
          border-radius: 14px;
          padding: 12px;
          border: 1px solid;
          font-weight: 850;
          font-size: 13px;
        }

        .alert.err {
          background: ${colors.errBg};
          border-color: ${colors.errBorder};
        }

        .alert.warn {
          background: ${colors.warnBg};
          border-color: ${colors.warnBorder};
        }

        .alert.ok {
          background: ${colors.okBg};
          border-color: ${colors.okBorder};
        }

        .open-grid {
          display: grid;
          grid-template-columns: 420px 360px 1fr;
          gap: 14px;
          align-items: start;
        }

        .panel {
          border: 1px solid ${colors.border};
          background: #fff;
          border-radius: 16px;
          padding: 12px;
        }

        .panel-title {
          font-size: 12px;
          color: ${colors.subtext};
          font-weight: 900;
          margin-bottom: 8px;
        }

        /* Flip card */
        .flip-wrap {
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
          cursor: pointer;
          user-select: none;
        }

        .flip-scene {
          position: relative;
          width: 100%;
          aspect-ratio: 2.5 / 3.5; /* feels like a card */
          perspective: 1200px;
        }

        .flip-card {
          position: absolute;
          inset: 0;
          border-radius: 16px;
          border: 1px solid ${colors.border};
          background: ${colors.muted};
          transform-style: preserve-3d;
          transition: transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1);
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.08);
          overflow: hidden;
        }

        .flip-card.is-flipped {
          transform: rotateY(180deg);
        }

        .face {
          position: absolute;
          inset: 0;
          backface-visibility: hidden;
          display: grid;
          place-items: center;
          background: white;
        }

        .face.back {
          transform: rotateY(180deg);
        }

        .face img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: white;
        }

        .img-missing {
          height: 100%;
          width: 100%;
          display: grid;
          place-items: center;
          color: ${colors.subtext};
          font-weight: 900;
          font-size: 12px;
          text-align: center;
          padding: 14px;
          background: ${colors.soft};
        }

        .controls-row {
          display: flex;
          gap: 10px;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }

        .controls-left {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .nav-buttons {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .stat-title {
          font-size: 22px;
          font-weight: 950;
          letter-spacing: -0.3px;
          margin: 0;
        }

        .stat-sub {
          margin-top: 6px;
          color: ${colors.subtext};
          font-size: 13px;
          font-weight: 750;
          line-height: 1.4;
        }

        .kv {
          display: grid;
          gap: 8px;
          margin-top: 10px;
          font-size: 13px;
          font-weight: 800;
          color: ${colors.text};
        }

        .kv b {
          font-weight: 950;
        }

        .pack-art {
          margin-top: 12px;
          display: grid;
          gap: 8px;
        }

        .pack-img {
          width: 220px;
          max-width: 100%;
          height: auto;
          border: 1px solid ${colors.border};
          border-radius: 14px;
          background: white;
        }

        .stack-mini {
          display: grid;
          gap: 10px;
        }

        .stack-top {
          border: 1px solid ${colors.border};
          border-radius: 14px;
          overflow: hidden;
          background: white;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.06);
        }

        .stack-top img {
          width: 100%;
          height: auto;
          display: block;
          background: white;
          object-fit: contain;
        }

        .stack-placeholder {
          padding: 14px;
          color: ${colors.subtext};
          font-weight: 900;
          font-size: 12px;
          background: ${colors.soft};
          text-align: center;
        }

        .stack-fan {
          position: relative;
          height: 92px;
        }

        .stack-chip {
          position: absolute;
          width: 122px;
          height: 76px;
          border-radius: 12px;
          border: 1px solid ${colors.border};
          background: ${colors.soft};
          display: grid;
          place-items: center;
          color: ${colors.subtext};
          font-weight: 900;
          font-size: 11px;
          box-shadow: 0 10px 18px rgba(0, 0, 0, 0.06);
        }

        .summary {
          margin-top: 12px;
          border-radius: 16px;
          border: 1px solid ${colors.okBorder};
          background: ${colors.okBg};
          padding: 14px;
        }

        .summary h3 {
          margin: 0 0 8px 0;
          font-size: 16px;
          font-weight: 950;
        }

        .summary ol {
          margin: 10px 0 0 0;
          padding-left: 18px;
        }

        .summary li {
          margin-bottom: 8px;
        }

        .summary .line1 {
          font-weight: 900;
        }

        .summary .line2 {
          font-size: 12px;
          color: ${colors.text};
          font-weight: 750;
          opacity: 0.9;
        }

        .footer-tip {
          margin-top: 10px;
          color: ${colors.subtext};
          font-size: 12px;
          font-weight: 750;
        }

        /* Responsive: collapse to 1 column on smaller screens */
        @media (max-width: 980px) {
          .open-grid {
            grid-template-columns: 1fr;
          }
          .flip-wrap {
            max-width: 520px;
          }
          .pack-img {
            width: 200px;
          }
        }

        /* Mobile: slightly bigger text + comfy padding, darker text for readability */
        @media (max-width: 560px) {
          .vcs-pack-root {
            padding: 12px;
          }
          .vcs-pack-stage {
            padding: 12px;
          }
          .vcs-pack-title h1 {
            font-size: 17px;
          }
          .vcs-pack-title .sub {
            font-size: 13px;
            color: #3f3f3f; /* darker on phones */
          }
          .hint {
            color: #3f3f3f; /* darker on phones */
          }
          .panel {
            padding: 12px;
          }
          .stat-title {
            font-size: 20px;
          }
          .btn {
            padding: 10px 12px;
            border-radius: 14px;
          }
        }
      `}</style>

      <div className="vcs-pack-wrap">
        {/* Top header */}
        <div className="vcs-pack-hero">
          <div className="vcs-pack-title">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Link href="/inventory" className="btn ghost" style={{ fontWeight: 950 }}>
                ← Inventory
              </Link>
              <span className="pill">Open Pack</span>
            </div>

            <h1>{titleText}</h1>
            <div className="sub">Flip, scroll through, and enjoy the rip — clean and calm.</div>
          </div>

          <div className="vcs-pack-actions">
            {opened ? (
              <>
                <span className="pill">{progressText}</span>
                <button className="btn" onClick={() => setFlipped((x) => !x)} disabled={!current}>
                  {flipped ? "Show Front" : "Flip (F)"}
                </button>
                <div className="nav-buttons">
                  <button className="btn" onClick={prev} disabled={!canPrev}>
                    ← Prev
                  </button>
                  <button className="btn" onClick={next} disabled={!canNext}>
                    Next →
                  </button>
                </div>
              </>
            ) : (
              <>
                <Link href="/shop" className="btn">
                  Shop →
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Errors */}
        {error && (
          <div className={cx("alert", "err")} style={{ marginTop: 12 }}>
            {error}
          </div>
        )}

        {/* Stage */}
        <div className="vcs-pack-stage">
          {!opened ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ color: colors.subtext, fontSize: 13, fontWeight: 750, lineHeight: 1.45 }}>
                This will open <b>1 pack</b> from your sealed inventory and add the cards to your collection.
              </div>

              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                {metaLoading ? (
                  <div className="panel" style={{ width: 280 }}>
                    <div className="panel-title">Pack art</div>
                    <div style={{ color: colors.subtext, fontWeight: 850 }}>(Loading…)</div>
                  </div>
                ) : packImageUrl ? (
                  <div className="panel" style={{ width: 300 }}>
                    <div className="panel-title">Pack art</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="pack-img" src={packImageUrl} alt="Pack" />
                  </div>
                ) : (
                  <div className="panel" style={{ width: 280 }}>
                    <div className="panel-title">Pack art</div>
                    <div style={{ color: colors.subtext, fontWeight: 850 }}>(No pack image set)</div>
                  </div>
                )}

                <div className="panel" style={{ flex: "1 1 260px" }}>
                  <div className="panel-title">Ready?</div>
                  <div style={{ color: colors.text, fontWeight: 900, fontSize: 14, lineHeight: 1.4 }}>
                    Tap <b>Open 1 Pack</b> to rip.
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button className="btn primary" onClick={openPack} disabled={loading || !productId}>
                      {loading ? "Opening…" : "Open 1 Pack"}
                    </button>
                    <div className="hint" style={{ alignItems: "center" }}>
                      <span>
                        Tip: later you can use <kbd>Space</kbd>, <kbd>←</kbd>/<kbd>→</kbd>, <kbd>F</kbd>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div ref={containerRef} tabIndex={-1} style={{ outline: "none" }}>
              <div className="controls-row">
                <div className="controls-left">
                  <div className="hint">
                    <span>
                      <kbd>Space</kbd> advance
                    </span>
                    <span>
                      <kbd>←</kbd>/<kbd>→</kbd> navigate
                    </span>
                    <span>
                      <kbd>F</kbd> flip
                    </span>
                    <span style={{ opacity: 0.85 }}>• click the card to flip</span>
                  </div>
                </div>
                <span className="pill">{progressText}</span>
              </div>

              {mismatch && (
                <div className={cx("alert", "warn")} style={{ marginBottom: 12 }}>
                  Heads up: server returned <b>{data?.cards.length}</b> cards but product says{" "}
                  <b>{data?.cardsPerPack}</b>.
                </div>
              )}

              <div className="open-grid">
                {/* Current card */}
                <div className="panel">
                  <div className="panel-title">Current card</div>

                  <div className="flip-wrap" onClick={() => setFlipped((x) => !x)} title="Click to flip (or press F)">
                    <div className="flip-scene">
                      <div className={cx("flip-card", flipped && "is-flipped")}>
                        <div className="face front">
                          {cardFront ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cardFront} alt="Card front" />
                          ) : (
                            <div className="img-missing">(No front image)</div>
                          )}
                        </div>

                        <div className="face back">
                          {cardBack ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cardBack} alt="Card back" />
                          ) : (
                            <div className="img-missing">(No back image)</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button className="btn" onClick={prev} disabled={!canPrev}>
                      ← Prev
                    </button>
                    <button className="btn" onClick={next} disabled={!canNext}>
                      Next →
                    </button>
                    <button className="btn" onClick={() => setFlipped((x) => !x)} disabled={!current}>
                      {flipped ? "Show Front" : "Flip"}
                    </button>
                  </div>
                </div>

                {/* Opened stack */}
                <div className="panel">
                  <div className="panel-title">Opened stack (top card back)</div>

                  <div className="stack-mini">
                    <div className="stack-top">
                      {prevCard?.backImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={prevCard.backImageUrl} alt="Top of stack (back)" />
                      ) : prevCard ? (
                        <div className="stack-placeholder">(No back image)</div>
                      ) : (
                        <div className="stack-placeholder">(No cards in stack yet)</div>
                      )}
                    </div>

                    {stack.length > 1 && (
                      <div className="stack-fan" aria-hidden="true">
                        {stack
                          .slice(0, -1)
                          .map((c, i) => {
                            const offset = (stack.length - 2 - i) * 10;
                            return (
                              <div
                                key={c.id}
                                className="stack-chip"
                                style={{ left: offset, top: offset }}
                                title={`#${c.cardNumber} — ${c.player}`}
                              >
                                Back
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="panel">
                  <div className="panel-title">Details</div>

                  <div className="stat-title">{cardTitle}</div>
                  <div className="stat-sub">{subline}</div>

                  <div className="kv">
                    <div>
                      <b>Type:</b> {current?.isInsert ? "Insert" : "Base"}
                    </div>
                    <div>
                      <b>Book:</b> {money(current?.bookValue)} &nbsp;•&nbsp; <b>You own:</b>{" "}
                      {current?.ownedAfter ?? "—"}
                    </div>
                  </div>

                  {packImageUrl ? (
                    <div className="pack-art">
                      <div className="panel-title">Pack art</div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="pack-img" src={packImageUrl} alt="Pack" />
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Completion summary */}
              {isDone && (
                <div className="summary">
                  <h3>Pack complete.</h3>
                  <div style={{ fontSize: 13, fontWeight: 800, color: colors.text }}>
                    You received <b>{cards.length}</b> cards (expected{" "}
                    <b>{data?.cardsPerPack ?? cards.length}</b>).
                  </div>

                  <ol>
                    {cards.map((c) => (
                      <li key={c.id}>
                        <div className="line1">
                          #{c.cardNumber} — {c.player} {c.isInsert ? "(Insert)" : ""}
                        </div>
                        <div className="line2">
                          Book: <b>{money(c.bookValue)}</b> • You own: <b>{c.ownedAfter}</b>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="footer-tip">
                Tip: If cards ever “skip,” something is firing twice. Space should advance exactly one card.
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
