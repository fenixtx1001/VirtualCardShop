// src/app/open-pack/[productId]/open-pack-client.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Card = {
  id: number;
  productSetId: string | null;
  productSetName: string | null;
  productSetOddsPerPack: number | null;
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

  prestigeTargetLevel: number | null;
  isNeededForNextPrestige: boolean;
  hitNextPrestigeWithThisCard: boolean;
};

type OpenResult = {
  ok: boolean;
  productId: string;
  packImageUrl: string | null;
  packPriceCents: number;
  cardsPerPack: number;
  cards: Card[];
};

type PackMeta = {
  ok: boolean;
  productId: string;
  displayName: string;
  packImageUrl: string | null;
};

const RIP_MODE_EVENT = "vcs:rip-mode";

const colors = {
  bg: "#fbfaf7",
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
  posBg: "#eefbf1",
  posBorder: "#a7e7b6",
  negBg: "#fff1f1",
  negBorder: "#f3b7b7",
  neutralBg: "#f8f6f1",
  neutralBorder: "#e7e3dc",
};

function money(v: number | null | undefined) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return `$${n.toFixed(2)}`;
}

function centsToDollars(cents: number | null | undefined) {
  const n = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return n / 100;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getInsertLabel(card: Card | null) {
  if (!card?.isInsert) return null;
  return card.productSetName?.trim() || "Insert";
}

function getInsertOddsLabel(card: Card | null) {
  if (!card?.isInsert) return null;
  const odds = card.productSetOddsPerPack;
  if (!odds || odds <= 0) return null;
  return `1:${odds} packs`;
}

function getPrestigeProgressLabel(card: Card | null) {
  if (!card?.isNeededForNextPrestige || !card.prestigeTargetLevel) return null;
  return `Needed for Prestige x${card.prestigeTargetLevel}`;
}

function getPrestigeBannerLabel(card: Card | null) {
  if (!card?.hitNextPrestigeWithThisCard || !card.prestigeTargetLevel) return null;
  return `Prestige x${card.prestigeTargetLevel} reached!`;
}

export default function OpenPackClient({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [meta, setMeta] = useState<PackMeta | null>(null);
  const [data, setData] = useState<OpenResult | null>(null);

  const [opened, setOpened] = useState(false);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const cards = data?.cards ?? [];
  const current = cards[idx] ?? null;
  const prevCard = idx > 0 ? cards[idx - 1] : null;
  const currentInsertLabel = getInsertLabel(current);
  const currentInsertOddsLabel = getInsertOddsLabel(current);
  const currentPrestigeProgressLabel = getPrestigeProgressLabel(current);
  const currentPrestigeBannerLabel = getPrestigeBannerLabel(current);

  const canNext = opened && idx < cards.length - 1;
  const canPrev = opened && idx > 0;

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
        let j: unknown = {};
        try {
          j = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error(`Meta returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
        }

        const parsed = j as { error?: string };
        if (!res.ok) throw new Error(parsed?.error ?? `Failed to load pack meta (${res.status})`);
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
  const packPrice = centsToDollars(data?.packPriceCents);

  const progressText = useMemo(() => {
    if (!opened || !cards.length) return "";
    const expected = data?.cardsPerPack ?? cards.length;
    return `${idx + 1} / ${cards.length} (expected ${expected})`;
  }, [opened, cards.length, idx, data?.cardsPerPack]);

  const mobileProgressText = useMemo(() => {
    if (!opened || !cards.length) return "";
    return `${idx + 1}/${cards.length}`;
  }, [opened, cards.length, idx]);

  const mismatch = useMemo(() => {
    if (!opened || !data) return false;
    return data.cardsPerPack !== data.cards.length;
  }, [opened, data]);

  const stack = useMemo(() => {
    if (!opened) return [];
    const openedCards = cards.slice(0, idx);
    return openedCards.slice(-4);
  }, [opened, cards, idx]);

  const revealedCards = useMemo(() => {
    if (!opened || !cards.length) return [];
    return cards.slice(0, idx + 1);
  }, [opened, cards, idx]);

  const revealedValue = useMemo(() => {
    return revealedCards.reduce((sum, card) => sum + (card.bookValue ?? 0), 0);
  }, [revealedCards]);

  const packDelta = useMemo(() => {
    return revealedValue - packPrice;
  }, [revealedValue, packPrice]);

  const valueTone = useMemo(() => {
    if (!opened) return "neutral";
    if (packDelta > 0.0001) return "positive";
    if (packDelta < -0.0001) return "negative";
    return "neutral";
  }, [opened, packDelta]);

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
      let j: unknown = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Open returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      const parsed = j as { error?: string };
      if (!res.ok) throw new Error(parsed?.error ?? `Open failed (${res.status})`);

      const result = j as OpenResult;
      setData(result);
      setOpened(true);

      setTimeout(() => containerRef.current?.focus(), 0);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err?.message ?? "Open pack failed");
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
  }, [opened, cards.length, idx, canNext, canPrev]);

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
      current.isInsert && current.productSetName ? `• ${current.productSetName}` : "",
      current.subset ? `• ${current.subset}` : "",
      current.variant ? `• ${current.variant}` : "",
    ].filter(Boolean);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }, [current]);

  const isDone = opened && !canNext;

  useEffect(() => {
    const activeRip = opened && !isDone;

    window.dispatchEvent(
      new CustomEvent(RIP_MODE_EVENT, {
        detail: activeRip,
      })
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent(RIP_MODE_EVENT, {
          detail: false,
        })
      );
    };
  }, [opened, isDone]);
  const currentHasPrestigeProgress = Boolean(current?.isNeededForNextPrestige);
  const currentHitPrestige = Boolean(current?.hitNextPrestigeWithThisCard);

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

        .vcs-pack-root *,
        .vcs-pack-root *::before,
        .vcs-pack-root *::after {
          box-sizing: border-box;
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

        .value-box {
          border-radius: 16px;
          border: 1px solid ${colors.neutralBorder};
          background: ${colors.neutralBg};
          padding: 12px;
          margin-bottom: 12px;
        }

        .value-box.positive {
          background: ${colors.posBg};
          border-color: ${colors.posBorder};
        }

        .value-box.negative {
          background: ${colors.negBg};
          border-color: ${colors.negBorder};
        }

        .value-box.neutral {
          background: ${colors.neutralBg};
          border-color: ${colors.neutralBorder};
        }

        .value-grid {
          display: grid;
          gap: 6px;
        }

        .value-head {
          font-size: 12px;
          font-weight: 900;
          color: ${colors.subtext};
        }

        .value-main {
          font-size: 22px;
          font-weight: 950;
          letter-spacing: -0.3px;
        }

        .value-sub {
          font-size: 13px;
          font-weight: 800;
        }

        .value-positive {
          color: #1e7a35;
        }

        .value-negative {
          color: #b42318;
        }

        .value-neutral {
          color: ${colors.text};
        }

        .mobile-rip-hud {
          display: none;
        }

        .mobile-current-meta {
          display: none;
        }

        .mobile-summary-actions {
          display: none;
        }

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
          aspect-ratio: 2.5 / 3.5;
        }

        .flip-celebration {
          position: absolute;
          inset: -10px;
          border-radius: 24px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 180ms ease;
        }

        .flip-celebration.active {
          opacity: 1;
          background:
            radial-gradient(circle at 50% 50%, rgba(255, 219, 77, 0.28) 0%, rgba(255, 219, 77, 0.14) 35%, rgba(255, 219, 77, 0.05) 58%, rgba(255, 219, 77, 0) 74%),
            radial-gradient(circle at 50% 50%, rgba(255, 170, 0, 0.18) 0%, rgba(255, 170, 0, 0.06) 42%, rgba(255, 170, 0, 0) 70%);
          filter: blur(6px);
          animation: prestigePulse 1.8s ease-in-out infinite;
        }

        .flip-banner {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 3;
          background: linear-gradient(135deg, #ffe082 0%, #ffca28 45%, #f59e0b 100%);
          color: #3b2a00;
          border: 1px solid rgba(120, 81, 0, 0.2);
          border-radius: 999px;
          padding: 7px 14px;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.2px;
          box-shadow: 0 12px 28px rgba(245, 158, 11, 0.28);
          white-space: nowrap;
        }

        .flip-card {
          position: absolute;
          inset: 0;
          border-radius: 16px;
          border: 1px solid ${colors.border};
          background: ${colors.muted};
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.08);
          overflow: hidden;
        }

        .flip-card.prestige-hit {
          border-color: rgba(245, 158, 11, 0.55);
          box-shadow:
            0 0 0 2px rgba(255, 209, 102, 0.45),
            0 18px 40px rgba(245, 158, 11, 0.22);
        }

        .face {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          background: white;
          opacity: 0;
          transition: opacity 180ms ease, transform 180ms ease;
          transform: scale(0.995);
        }

        .flip-card .face.front {
          opacity: 1;
          transform: scale(1);
        }

        .flip-card.is-flipped .face.front {
          opacity: 0;
          transform: scale(0.995);
        }

        .flip-card.is-flipped .face.back {
          opacity: 1;
          transform: scale(1);
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

        .prestige-progress-box {
          margin-top: 12px;
          border-radius: 14px;
          border: 1px solid #a7e7b6;
          background: #eefbf1;
          padding: 12px;
        }

        .prestige-progress-box.hit {
          border-color: #f3c15f;
          background: linear-gradient(180deg, #fff8df 0%, #fff2c7 100%);
          box-shadow: 0 10px 24px rgba(245, 158, 11, 0.14);
        }

        .prestige-progress-title {
          font-size: 12px;
          font-weight: 950;
          color: #1f1f1f;
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.35px;
        }

        .prestige-progress-main {
          font-size: 15px;
          font-weight: 950;
          color: #1f1f1f;
          line-height: 1.35;
        }

        .prestige-progress-sub {
          margin-top: 4px;
          font-size: 12px;
          font-weight: 800;
          color: #4d4d4d;
          line-height: 1.4;
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

        .summary .line3 {
          margin-top: 3px;
          font-size: 12px;
          font-weight: 900;
          color: #1e7a35;
        }

        .summary .line3.hit {
          color: #a16207;
        }

        .footer-tip {
          margin-top: 10px;
          color: ${colors.subtext};
          font-size: 12px;
          font-weight: 750;
        }

        @keyframes prestigePulse {
          0% {
            transform: scale(0.985);
            opacity: 0.72;
          }
          50% {
            transform: scale(1.015);
            opacity: 1;
          }
          100% {
            transform: scale(0.985);
            opacity: 0.72;
          }
        }

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

        @media (max-width: 560px) {
          .vcs-pack-root {
            padding: 10px;
            overflow-x: hidden;
          }

          .vcs-pack-wrap {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            overflow-x: hidden;
          }

          .vcs-pack-hero {
            padding: 10px;
            border-radius: 16px;
            gap: 8px;
          }

          .vcs-pack-title {
            min-width: 0;
            width: 100%;
          }

          .vcs-pack-title > div:first-child {
            justify-content: space-between;
          }

          .vcs-pack-title h1 {
            font-size: 15px;
            line-height: 1.2;
          }

          .vcs-pack-title .sub {
            display: none;
          }

          .vcs-pack-actions {
            width: 100%;
            gap: 8px;
          }

          .vcs-pack-actions > .pill {
            display: none;
          }

          .vcs-pack-actions .btn {
            flex: 1 1 auto;
            justify-content: center;
          }

          .vcs-pack-stage {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            padding: 10px;
            margin-top: 10px;
            border-radius: 16px;
            overflow-x: hidden;
          }

          .mobile-rip-hud {
            position: sticky;
            top: 0;
            z-index: 20;
            display: grid;
            grid-template-columns: 1fr 1fr 68px;
            gap: 8px;
            align-items: center;
            margin: -2px -2px 10px;
            padding: 8px;
            border: 1px solid ${colors.border};
            border-radius: 14px;
            background: rgba(255, 255, 255, 0.96);
            backdrop-filter: blur(10px);
            box-shadow: 0 10px 22px rgba(0, 0, 0, 0.08);
          }

          .mobile-hud-item {
            display: grid;
            gap: 2px;
            min-width: 0;
          }

          .mobile-hud-label {
            font-size: 10px;
            line-height: 1;
            font-weight: 900;
            color: ${colors.subtext};
            text-transform: uppercase;
            letter-spacing: 0.25px;
          }

          .mobile-hud-value {
            font-size: 14px;
            line-height: 1.1;
            font-weight: 950;
            color: ${colors.text};
          }

          .mobile-hud-value.positive {
            color: #1e7a35;
          }

          .mobile-hud-value.negative {
            color: #b42318;
          }

          .mobile-hud-card {
            border-radius: 999px;
            padding: 7px 9px;
            background: ${colors.muted};
            text-align: center;
            font-weight: 950;
            font-size: 13px;
            color: ${colors.text};
            white-space: nowrap;
          }

          .controls-row {
            display: none;
          }

          .desktop-value {
            display: none;
          }

          .open-grid {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 10px;
            overflow-x: hidden;
          }

          .panel {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            border-radius: 16px;
            padding: 10px;
            overflow-wrap: anywhere;
          }

          .card-panel {
            order: 1;
            padding: 8px;
            overflow: hidden;
          }

          .details-panel {
            order: 2;
            overflow: hidden;
          }

          .stack-panel {
            order: 3;
            display: none;
          }

          .stack-panel.done {
            display: block;
          }

          .panel-title {
            font-size: 12px;
            margin-bottom: 8px;
          }

          .card-panel .panel-title {
            display: none;
          }

          .flip-wrap {
            width: 100%;
            max-width: min(440px, 100%);
            min-width: 0;
            margin-left: auto;
            margin-right: auto;
          }

          .flip-scene {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            aspect-ratio: 2.5 / 3.5;
          }

          .flip-card {
            border-radius: 18px;
          }

          .flip-banner {
            font-size: 11px;
            padding: 7px 12px;
          }

          .mobile-current-meta {
            display: block;
            width: 100%;
            max-width: 100%;
            min-width: 0;
            margin-top: 10px;
            padding: 10px;
            border-radius: 14px;
            background: linear-gradient(180deg, #fff, #fbfaf7);
            border: 1px solid ${colors.border};
            min-height: 128px;
            overflow: hidden;
          }

          .mobile-current-title {
            min-width: 0;
            font-size: 18px;
            font-weight: 950;
            line-height: 1.15;
            letter-spacing: -0.2px;
            overflow-wrap: anywhere;
            word-break: normal;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .mobile-current-sub {
            min-width: 0;
            margin-top: 4px;
            color: ${colors.subtext};
            font-size: 13px;
            font-weight: 800;
            line-height: 1.35;
            overflow-wrap: anywhere;
            word-break: normal;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .mobile-current-stats {
            min-width: 0;
            margin-top: 7px;
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            color: ${colors.text};
            font-size: 13px;
            font-weight: 900;
            overflow-wrap: anywhere;
          }

          .mobile-current-stats span {
            min-width: 0;
            max-width: 100%;
            overflow-wrap: anywhere;
          }

          .card-panel .nav-buttons,
          .card-panel > div:last-child {
            width: 100%;
            display: grid !important;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 8px !important;
          }

          .card-panel > div:last-child .btn {
            justify-content: center;
            padding: 10px 8px;
          }

          .details-panel .stat-title,
          .details-panel .stat-sub,
          .details-panel .kv {
            display: none;
          }

          .pack-art {
            display: none;
          }

          .value-main {
            font-size: 20px;
          }

          .btn {
            padding: 10px 12px;
            border-radius: 14px;
          }

          .summary {
            margin-top: 10px;
            padding: 14px;
            border-radius: 18px;
          }

          .summary h3 {
            font-size: 22px;
            margin-bottom: 6px;
          }

          .summary ol {
            list-style: none;
            padding: 0;
            margin-top: 12px;
            display: grid;
            gap: 8px;
          }

          .summary li {
            margin: 0;
            padding: 10px;
            border-radius: 14px;
            background: rgba(255, 255, 255, 0.68);
            border: 1px solid rgba(167, 231, 182, 0.75);
          }

          .summary .line1 {
            font-size: 15px;
            line-height: 1.2;
          }

          .summary .line2 {
            margin-top: 4px;
            font-size: 12px;
          }

          .mobile-summary-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 12px;
          }

          .mobile-summary-actions .btn {
            flex: 1 1 auto;
            justify-content: center;
          }

          .footer-tip {
            display: none;
          }
        }
      `}</style>

      <div className="vcs-pack-wrap">
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
              <Link href="/shop" className="btn">
                Shop →
              </Link>
            )}
          </div>
        </div>

        {error && (
          <div className={cx("alert", "err")} style={{ marginTop: 12 }}>
            {error}
          </div>
        )}

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
              <div className="mobile-rip-hud">
                <div className="mobile-hud-item">
                  <div className="mobile-hud-label">Value</div>
                  <div className="mobile-hud-value">{money(revealedValue)}</div>
                </div>
                <div className="mobile-hud-item">
                  <div className="mobile-hud-label">Net</div>
                  <div
                    className={cx(
                      "mobile-hud-value",
                      valueTone === "positive" && "positive",
                      valueTone === "negative" && "negative"
                    )}
                  >
                    {packDelta > 0 ? "+" : ""}
                    {money(packDelta)}
                  </div>
                </div>
                <div className="mobile-hud-card">{mobileProgressText}</div>
              </div>

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

              <div className={cx("value-box", "desktop-value", valueTone === "positive" && "positive", valueTone === "negative" && "negative", valueTone === "neutral" && "neutral")}>
                <div className="value-grid">
                  <div className="value-head">Running pack value</div>
                  <div className="value-main">{money(revealedValue)}</div>
                  <div className="value-sub">
                    Pack price: <b>{money(packPrice)}</b>
                    {" • "}
                    Difference:{" "}
                    <span
                      className={
                        valueTone === "positive"
                          ? "value-positive"
                          : valueTone === "negative"
                          ? "value-negative"
                          : "value-neutral"
                      }
                    >
                      {packDelta > 0 ? "+" : ""}
                      {money(packDelta)}
                    </span>
                  </div>
                </div>
              </div>

              {mismatch && (
                <div className={cx("alert", "warn")} style={{ marginBottom: 12 }}>
                  Heads up: server returned <b>{data?.cards.length}</b> cards but product says{" "}
                  <b>{data?.cardsPerPack}</b>.
                </div>
              )}

              <div className="open-grid">
                <div className="panel card-panel">
                  <div className="panel-title">Current card</div>

                  <div className="flip-wrap" onClick={() => setFlipped((x) => !x)} title="Click to flip (or press F)">
                    <div className="flip-scene">
                      {currentHitPrestige && currentPrestigeBannerLabel ? (
                        <div className="flip-banner">{currentPrestigeBannerLabel}</div>
                      ) : null}

                      <div className={cx("flip-celebration", currentHitPrestige && "active")} />

                      <div className={cx("flip-card", flipped && "is-flipped", currentHitPrestige && "prestige-hit")}>
                        <div className="face front">
                          {cardFront ? (
                            <img src={cardFront} alt="Card front" />
                          ) : (
                            <div className="img-missing">(No front image)</div>
                          )}
                        </div>

                        <div className="face back">
                          {cardBack ? (
                            <img src={cardBack} alt="Card back" />
                          ) : (
                            <div className="img-missing">(No back image)</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mobile-current-meta">
                    <div className="mobile-current-title">{cardTitle}</div>
                    <div className="mobile-current-sub">{subline}</div>
                    <div className="mobile-current-stats">
                      <span>{current?.isInsert ? `Insert${currentInsertLabel ? ` • ${currentInsertLabel}` : ""}` : "Base"}</span>
                      <span>Value: {money(current?.bookValue)}</span>
                      <span>You own: {current?.ownedAfter ?? "—"}</span>
                    </div>
                    {current?.isInsert && currentInsertOddsLabel ? (
                      <div style={{ marginTop: 5, color: colors.subtext, fontSize: 12, fontWeight: 800 }}>
                        Odds: {currentInsertOddsLabel}
                      </div>
                    ) : null}
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

                <div className={cx("panel", "stack-panel", isDone && "done")}>
                  <div className="panel-title">Opened stack (top card back)</div>

                  <div className="stack-mini">
                    <div className="stack-top">
                      {prevCard?.backImageUrl ? (
                        <img src={prevCard.backImageUrl} alt="Top of stack (back)" />
                      ) : prevCard ? (
                        <div className="stack-placeholder">(No back image)</div>
                      ) : (
                        <div className="stack-placeholder">(No cards in stack yet)</div>
                      )}
                    </div>

                    {stack.length > 1 && (
                      <div className="stack-fan" aria-hidden="true">
                        {stack.slice(0, -1).map((c, i) => {
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

                <div className="panel details-panel">
                  <div className="panel-title">Details</div>

                  <div className="stat-title">{cardTitle}</div>
                  <div className="stat-sub">{subline}</div>

                  <div className="kv">
                    <div>
                      <b>Type:</b>{" "}
                      {current?.isInsert
                        ? `Insert${currentInsertLabel ? ` • ${currentInsertLabel}` : ""}`
                        : "Base"}
                    </div>

                    {current?.isInsert && currentInsertOddsLabel ? (
                      <div>
                        <b>Odds:</b> {currentInsertOddsLabel}
                      </div>
                    ) : null}

                    <div>
                      <b>Value:</b> {money(current?.bookValue)} &nbsp;•&nbsp; <b>You own:</b>{" "}
                      {current?.ownedAfter ?? "—"}
                    </div>
                  </div>

                  {currentHasPrestigeProgress && currentPrestigeProgressLabel ? (
                    <div className={cx("prestige-progress-box", currentHitPrestige && "hit")}>
                      <div className="prestige-progress-title">
                        {currentHitPrestige ? "Prestige reached" : "Prestige progress"}
                      </div>
                      <div className="prestige-progress-main">{currentPrestigeProgressLabel}</div>
                      <div className="prestige-progress-sub">
                        {currentHitPrestige
                          ? `This was the final card needed to reach Prestige x${current?.prestigeTargetLevel}.`
                          : `This card was one of the copies you still needed for Prestige x${current?.prestigeTargetLevel}.`}
                      </div>
                    </div>
                  ) : null}

                  {packImageUrl ? (
                    <div className="pack-art">
                      <div className="panel-title">Pack art</div>
                      <img className="pack-img" src={packImageUrl} alt="Pack" />
                    </div>
                  ) : null}
                </div>
              </div>

              {isDone && (
                <div className="summary">
                  <h3>Pack complete.</h3>
                  <div style={{ fontSize: 13, fontWeight: 800, color: colors.text }}>
                    You received <b>{cards.length}</b> cards (expected <b>{data?.cardsPerPack ?? cards.length}</b>).
                  </div>

                  <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800 }}>
                    Final total: <b>{money(revealedValue)}</b>
                    {" • "}
                    Pack price: <b>{money(packPrice)}</b>
                    {" • "}
                    Net:{" "}
                    <b>
                      {packDelta > 0 ? "+" : ""}
                      {money(packDelta)}
                    </b>
                  </div>

                  <ol>
                    {cards.map((c) => {
                      const insertLabel = getInsertLabel(c);
                      const insertOddsLabel = getInsertOddsLabel(c);
                      const prestigeProgressLabel = getPrestigeProgressLabel(c);

                      return (
                        <li
                          key={c.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "56px 1fr",
                            gap: 10,
                            alignItems: "start",
                          }}
                        >
                          <div
                            style={{
                              width: 56,
                              height: 78,
                              borderRadius: 10,
                              overflow: "hidden",
                              border: `1px solid ${colors.border}`,
                              background: "white",
                              flexShrink: 0,
                            }}
                          >
                            {c.frontImageUrl ? (
                              <img
                                src={c.frontImageUrl}
                                alt={c.player}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                  display: "block",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  display: "grid",
                                  placeItems: "center",
                                  fontSize: 10,
                                  fontWeight: 900,
                                  color: colors.subtext,
                                  background: colors.soft,
                                  textAlign: "center",
                                  padding: 4,
                                }}
                              >
                                No Image
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="line1">
                              #{c.cardNumber} — {c.player} {insertLabel ? `(${insertLabel})` : ""}
                            </div>
                            <div className="line2">
                              Value: <b>{money(c.bookValue)}</b> • You own: <b>{c.ownedAfter}</b>
                              {insertOddsLabel ? ` • Odds: ${insertOddsLabel}` : ""}
                            </div>
                            {c.isNeededForNextPrestige && prestigeProgressLabel ? (
                              <div className={cx("line3", c.hitNextPrestigeWithThisCard && "hit")}>
                                {c.hitNextPrestigeWithThisCard
                                  ? `${prestigeProgressLabel} • This card hit it.`
                                  : prestigeProgressLabel}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  <div className="mobile-summary-actions">
                    <button className="btn primary" onClick={openPack} disabled={loading || !productId}>
                      {loading ? "Opening…" : "Open Another"}
                    </button>
                    <Link href="/inventory" className="btn">
                      Inventory
                    </Link>
                    <Link href={`/checklist/${encodeURIComponent(productId)}`} className="btn">
                      Checklist
                    </Link>
                  </div>
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
