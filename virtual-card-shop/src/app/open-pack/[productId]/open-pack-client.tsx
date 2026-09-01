// src/app/open-pack/[productId]/open-pack-client.tsx
"use client";

import Link from "next/link";
import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

type CardMotion = "next" | "prev" | null;
type SwipeCommit = "next" | "prev" | null;

type PointerGesture = {
  pointerId: number | null;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  axis: "horizontal" | "vertical" | null;
  moved: boolean;
};

const RIP_MODE_EVENT = "vcs:rip-mode";

const colors = {
  bg: "#fbfaf7",
  card: "#ffffff",
  border: "#e7e3dc",
  borderStrong: "#d8d0c4",
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
  const n =
    typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return n / 100;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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
  if (!card?.isNeededForNextPrestige || !card.prestigeTargetLevel) {
    return null;
  }

  return `Needed for Prestige x${card.prestigeTargetLevel}`;
}

function getPrestigeBannerLabel(card: Card | null) {
  if (!card?.hitNextPrestigeWithThisCard || !card.prestigeTargetLevel) {
    return null;
  }

  return `Prestige x${card.prestigeTargetLevel} reached!`;
}

function OrientedCardImage({
  src,
  alt,
  loading = "eager",
}: {
  src: string;
  alt: string;
  loading?: "eager" | "lazy";
}) {
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    setIsLandscape(false);
  }, [src]);

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      draggable={false}
      onLoad={(event) => {
        const image = event.currentTarget;
        setIsLandscape(image.naturalWidth > image.naturalHeight);
      }}
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: isLandscape ? "140%" : "100%",
        height: isLandscape ? "71.4286%" : "100%",
        objectFit: "contain",
        display: "block",
        background: "white",
        transform: isLandscape
          ? "translate(-50%, -50%) rotate(90deg)"
          : "translate(-50%, -50%)",
        transformOrigin: "center",
        pointerEvents: "none",
        userSelect: "none",
      }}
    />
  );
}

export default function OpenPackClient({
  productId,
}: {
  productId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [meta, setMeta] = useState<PackMeta | null>(null);
  const [data, setData] = useState<OpenResult | null>(null);

  const [opened, setOpened] = useState(false);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [cardMotion, setCardMotion] = useState<CardMotion>(null);
  const [swipeCommit, setSwipeCommit] = useState<SwipeCommit>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const gestureRef = useRef<PointerGesture>({
    pointerId: null,
    startX: 0,
    startY: 0,
    dx: 0,
    dy: 0,
    axis: null,
    moved: false,
  });

  const motionTimerRef = useRef<number | null>(null);
  const swipeTimerRef = useRef<number | null>(null);

  const cards = data?.cards ?? [];
  const current = cards[idx] ?? null;
  const prevCard = idx > 0 ? cards[idx - 1] : null;
  const nextCard = idx < cards.length - 1 ? cards[idx + 1] : null;

  const currentInsertLabel = getInsertLabel(current);
  const currentInsertOddsLabel = getInsertOddsLabel(current);
  const currentPrestigeProgressLabel =
    getPrestigeProgressLabel(current);
  const currentPrestigeBannerLabel = getPrestigeBannerLabel(current);

  const canNext = opened && idx < cards.length - 1;
  const canPrev = opened && idx > 0;

  useEffect(() => {
    let cancelled = false;

    async function loadMeta() {
      if (!productId) return;

      setMetaLoading(true);

      try {
        const res = await fetch(
          `/api/open-pack/meta/${encodeURIComponent(productId)}`,
          {
            cache: "no-store",
          }
        );

        const raw = await res.text();
        let j: unknown = {};

        try {
          j = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error(
            `Meta returned non-JSON (${res.status}): ${raw.slice(0, 140)}`
          );
        }

        const parsed = j as { error?: string };

        if (!res.ok) {
          throw new Error(
            parsed?.error ?? `Failed to load pack meta (${res.status})`
          );
        }

        if (!cancelled) {
          setMeta(j as PackMeta);
        }
      } catch {
        if (!cancelled) {
          setMeta(null);
        }
      } finally {
        if (!cancelled) {
          setMetaLoading(false);
        }
      }
    }

    loadMeta();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    return () => {
      if (motionTimerRef.current) {
        window.clearTimeout(motionTimerRef.current);
      }
      if (swipeTimerRef.current) {
        window.clearTimeout(swipeTimerRef.current);
      }
    };
  }, []);

  // The entire mobile open-pack route is an immersive rip experience,
  // including the sealed-pack screen before the user taps Open.
  useEffect(() => {
    const activate = () => {
      window.dispatchEvent(
        new CustomEvent(RIP_MODE_EVENT, {
          detail: true,
        })
      );
    };

    activate();
    const t = window.setTimeout(activate, 0);

    return () => {
      window.clearTimeout(t);
      window.dispatchEvent(
        new CustomEvent(RIP_MODE_EVENT, {
          detail: false,
        })
      );
    };
  }, []);

  const titleText = meta?.displayName ?? productId;
  const packImageUrl =
    meta?.packImageUrl ?? data?.packImageUrl ?? null;
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
    return revealedCards.reduce(
      (sum, card) => sum + (card.bookValue ?? 0),
      0
    );
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
    setDragX(0);
    setIsDragging(false);
    setCardMotion(null);
    setSwipeCommit(null);

    try {
      const res = await fetch("/api/rip/open", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ productId }),
      });

      const raw = await res.text();
      let j: unknown = {};

      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          `Open returned non-JSON (${res.status}): ${raw.slice(0, 140)}`
        );
      }

      const parsed = j as { error?: string };

      if (!res.ok) {
        throw new Error(
          parsed?.error ?? `Open failed (${res.status})`
        );
      }

      const result = j as OpenResult;

      setData(result);
      setOpened(true);
      setCardMotion("next");

      setTimeout(() => {
        containerRef.current?.focus();
        window.scrollTo({ top: 0, behavior: "auto" });
      }, 0);

      motionTimerRef.current = window.setTimeout(() => {
        setCardMotion(null);
      }, 320);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err?.message ?? "Open pack failed");
    } finally {
      setLoading(false);
    }
  }

  function triggerMotion(direction: Exclude<CardMotion, null>) {
    if (motionTimerRef.current) {
      window.clearTimeout(motionTimerRef.current);
    }

    setCardMotion(direction);

    motionTimerRef.current = window.setTimeout(() => {
      setCardMotion(null);
    }, 320);
  }

  function next() {
    if (!canNext || swipeCommit) return;

    setFlipped(false);
    setDragX(0);
    setIsDragging(false);
    triggerMotion("next");

    setIdx((v) => Math.min(v + 1, cards.length - 1));
  }

  function prev() {
    if (!canPrev || swipeCommit) return;

    setFlipped(false);
    setDragX(0);
    setIsDragging(false);
    triggerMotion("prev");

    setIdx((v) => Math.max(v - 1, 0));
  }

  function resetGesture() {
    gestureRef.current = {
      pointerId: null,
      startX: 0,
      startY: 0,
      dx: 0,
      dy: 0,
      axis: null,
      moved: false,
    };

    if (!swipeCommit) {
      setDragX(0);
      setIsDragging(false);
    }
  }

  function commitSwipe(direction: Exclude<SwipeCommit, null>) {
    if (swipeCommit) return;
    if (direction === "next" && !canNext) return;
    if (direction === "prev" && !canPrev) return;

    if (motionTimerRef.current) {
      window.clearTimeout(motionTimerRef.current);
    }
    if (swipeTimerRef.current) {
      window.clearTimeout(swipeTimerRef.current);
    }

    setFlipped(false);
    setCardMotion(null);
    setIsDragging(false);
    setSwipeCommit(direction);

    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 390;
    const exitX =
      direction === "next"
        ? -Math.max(viewportWidth * 1.08, 430)
        : Math.max(viewportWidth * 1.08, 430);

    setDragX(exitX);

    swipeTimerRef.current = window.setTimeout(() => {
      setIdx((v) =>
        direction === "next"
          ? Math.min(v + 1, cards.length - 1)
          : Math.max(v - 1, 0)
      );
      setDragX(0);
      setSwipeCommit(null);
      setIsDragging(false);
    }, 185);
  }

  function handleCardPointerDown(
    e: ReactPointerEvent<HTMLDivElement>
  ) {
    if (!opened || !current || swipeCommit) return;

    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      axis: null,
      moved: false,
    };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture is a convenience, not a requirement.
    }
  }

  function handleCardPointerMove(
    e: ReactPointerEvent<HTMLDivElement>
  ) {
    const gesture = gestureRef.current;

    if (gesture.pointerId !== e.pointerId || swipeCommit) return;

    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;

    gesture.dx = dx;
    gesture.dy = dy;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (!gesture.axis && (absX > 8 || absY > 8)) {
      if (absX > absY * 1.15) {
        gesture.axis = "horizontal";
        gesture.moved = true;
        setIsDragging(true);
      } else if (absY > absX) {
        gesture.axis = "vertical";
      }
    }

    if (gesture.axis !== "horizontal") return;

    e.preventDefault();

    let visualDx = dx;

    if (dx > 0 && !canPrev) {
      visualDx *= 0.2;
    }

    if (dx < 0 && !canNext) {
      visualDx *= 0.2;
    }

    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 390;
    const isMobileViewport = viewportWidth <= 560;
    const maxDrag = isMobileViewport
      ? Math.max(viewportWidth * 0.92, 330)
      : 105;

    setDragX(clamp(visualDx, -maxDrag, maxDrag));
  }

  function finishCardGesture(
    e: ReactPointerEvent<HTMLDivElement>,
    cancelled = false
  ) {
    const gesture = gestureRef.current;

    if (gesture.pointerId !== e.pointerId || swipeCommit) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture was already released.
    }

    const absX = Math.abs(gesture.dx);
    const absY = Math.abs(gesture.dy);

    if (
      !cancelled &&
      gesture.axis === "horizontal" &&
      absX >= 52 &&
      absX > absY
    ) {
      const isMobileViewport =
        typeof window !== "undefined" && window.innerWidth <= 560;

      if (gesture.dx < 0 && canNext) {
        if (isMobileViewport) {
          commitSwipe("next");
          gestureRef.current.pointerId = null;
        } else {
          next();
          resetGesture();
        }
        return;
      }

      if (gesture.dx > 0 && canPrev) {
        if (isMobileViewport) {
          commitSwipe("prev");
          gestureRef.current.pointerId = null;
        } else {
          prev();
          resetGesture();
        }
        return;
      }
    }

    const shouldFlip =
      !cancelled &&
      gesture.axis !== "vertical" &&
      absX < 10 &&
      absY < 10;

    resetGesture();

    if (shouldFlip) {
      setFlipped((x) => !x);
    }
  }

  function handleCardPointerUp(
    e: ReactPointerEvent<HTMLDivElement>
  ) {
    finishCardGesture(e, false);
  }

  function handleCardPointerCancel(
    e: ReactPointerEvent<HTMLDivElement>
  ) {
    finishCardGesture(e, true);
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

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [opened, cards.length, idx, canNext, canPrev, swipeCommit]);

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
      current.isInsert && current.productSetName
        ? `• ${current.productSetName}`
        : "",
      current.subset ? `• ${current.subset}` : "",
      current.variant ? `• ${current.variant}` : "",
    ].filter(Boolean);

    return parts.join(" ").replace(/\s+/g, " ").trim();
  }, [current]);

  const isDone = opened && !canNext;

  const currentHasPrestigeProgress = Boolean(
    current?.isNeededForNextPrestige
  );

  const currentHitPrestige = Boolean(
    current?.hitNextPrestigeWithThisCard
  );

  const currentIsSpecial = Boolean(
    current?.isInsert ||
      current?.isNeededForNextPrestige ||
      current?.hitNextPrestigeWithThisCard
  );

  const dragRotation = dragX * 0.018;

  const underCard = useMemo(() => {
    if (!opened) return null;

    if (swipeCommit === "prev") return prevCard;
    if (swipeCommit === "next") return nextCard;

    if (dragX > 8 && prevCard) return prevCard;
    if (dragX < -8 && nextCard) return nextCard;

    return nextCard ?? prevCard;
  }, [opened, swipeCommit, dragX, prevCard, nextCard]);

  const underProgress = useMemo(() => {
    if (swipeCommit) return 1;
    return clamp(Math.abs(dragX) / 180, 0, 1);
  }, [dragX, swipeCommit]);

  const underScale = 0.985 + underProgress * 0.015;
  const underTranslateY = 4 - underProgress * 4;

  return (
    <main
      className={cx(
        "vcs-pack-root",
        opened && "is-opened",
        isDone && "is-done"
      )}
    >
      <style jsx global>{`
        .vcs-pack-root {
          background:
            radial-gradient(
              circle at 50% 12%,
              rgba(184, 146, 59, 0.055),
              transparent 34%
            ),
            ${colors.bg};
          min-height: calc(100vh - 80px);
          padding: 18px;
          color: ${colors.text};
          font-family:
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
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
          background: rgba(255, 255, 255, 0.94);
          border: 1px solid ${colors.border};
          border-radius: 18px;
          padding: 14px 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.035);
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
          transition:
            transform 120ms ease,
            box-shadow 120ms ease,
            opacity 120ms ease,
            background 120ms ease;
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        .btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.06);
        }

        .btn:active {
          transform: translateY(0);
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
          opacity: 0.42;
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
          background: rgba(255, 255, 255, 0.86);
          border: 1px solid ${colors.border};
          border-radius: 20px;
          padding: 14px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.035);
        }

        .preopen-shell {
          display: grid;
          gap: 12px;
        }

        .preopen-body {
          display: flex;
          gap: 14px;
          align-items: center;
          flex-wrap: wrap;
        }

        .preopen-pack-panel {
          width: 300px;
        }

        .preopen-ready-panel {
          flex: 1 1 260px;
        }

        .preopen-copy {
          color: ${colors.subtext};
          font-size: 13px;
          font-weight: 750;
          line-height: 1.45;
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

        .mobile-swipe-hint {
          display: none;
        }

        .card-presentation {
          position: relative;
          isolation: isolate;
        }

        .card-presentation::before {
          content: "";
          position: absolute;
          z-index: -2;
          left: 8%;
          right: 8%;
          bottom: -14px;
          height: 46px;
          border-radius: 50%;
          background: rgba(36, 31, 24, 0.17);
          filter: blur(20px);
          opacity: 0.55;
          transform: scaleX(0.92);
          pointer-events: none;
        }

        .card-presentation::after {
          content: "";
          position: absolute;
          z-index: -3;
          inset: 5% 7% 0;
          border-radius: 40%;
          background:
            radial-gradient(
              circle at 50% 42%,
              rgba(255, 255, 255, 0.95),
              rgba(255, 255, 255, 0.42) 46%,
              transparent 74%
            );
          pointer-events: none;
        }

        .flip-wrap {
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
          touch-action: pan-y;
          -webkit-tap-highlight-color: transparent;
          position: relative;
        }

        .flip-scene {
          position: relative;
          width: 100%;
          aspect-ratio: 2.5 / 3.5;
        }

        .under-card-shell {
          display: none;
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          will-change: transform;
          transform-origin: 50% 78%;
          transition:
            transform 130ms ease,
            opacity 130ms ease;
        }

        .under-card {
          position: absolute;
          inset: 0;
          overflow: hidden;
          border-radius: 17px;
          background: white;
          box-shadow:
            0 18px 34px rgba(38, 31, 22, 0.12),
            0 4px 10px rgba(38, 31, 22, 0.08);
        }

        .under-card img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: contain;
          background: white;
        }

        .under-card::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          box-shadow: inset 0 0 0 1px rgba(39, 33, 24, 0.12);
          pointer-events: none;
        }

        .card-drag-shell {
          position: absolute;
          inset: 0;
          z-index: 2;
          will-change: transform;
          transform-origin: 50% 82%;
        }

        .card-drag-shell.dragging {
          transition: none;
        }

        .card-drag-shell.committing {
          transition:
            transform 185ms cubic-bezier(0.35, 0.72, 0.22, 1),
            opacity 185ms ease;
          opacity: 0.94;
        }

        .card-drag-shell:not(.dragging):not(.committing) {
          transition:
            transform 220ms cubic-bezier(0.22, 0.8, 0.28, 1),
            opacity 180ms ease;
        }

        .card-drag-shell.motion-next {
          animation: cardArriveNext 280ms
            cubic-bezier(0.19, 0.75, 0.24, 1);
        }

        .card-drag-shell.motion-prev {
          animation: cardArrivePrev 280ms
            cubic-bezier(0.19, 0.75, 0.24, 1);
        }

        .flip-celebration {
          position: absolute;
          inset: -14px;
          border-radius: 26px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 180ms ease;
        }

        .flip-celebration.active {
          opacity: 1;
          background:
            radial-gradient(
              circle at 50% 50%,
              rgba(255, 219, 77, 0.28) 0%,
              rgba(255, 219, 77, 0.14) 35%,
              rgba(255, 219, 77, 0.05) 58%,
              rgba(255, 219, 77, 0) 74%
            ),
            radial-gradient(
              circle at 50% 50%,
              rgba(255, 170, 0, 0.18) 0%,
              rgba(255, 170, 0, 0.06) 42%,
              rgba(255, 170, 0, 0) 70%
            );
          filter: blur(6px);
          animation: prestigePulse 1.8s ease-in-out infinite;
        }

        .insert-aura {
          position: absolute;
          inset: -9px;
          border-radius: 24px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 180ms ease;
          z-index: -1;
        }

        .insert-aura.active {
          opacity: 1;
          background:
            radial-gradient(
              circle at 28% 18%,
              rgba(71, 119, 210, 0.12),
              transparent 45%
            ),
            radial-gradient(
              circle at 75% 82%,
              rgba(184, 146, 59, 0.12),
              transparent 48%
            );
          filter: blur(8px);
        }

        .flip-banner {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 5;
          background: linear-gradient(
            135deg,
            #ffe082 0%,
            #ffca28 45%,
            #f59e0b 100%
          );
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
          border-radius: 17px;
          background: ${colors.muted};
          box-shadow:
            0 28px 52px rgba(38, 31, 22, 0.17),
            0 8px 16px rgba(38, 31, 22, 0.12),
            0 2px 4px rgba(38, 31, 22, 0.08);
          overflow: hidden;
          transform: translateZ(0);
        }

        .flip-card::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          box-shadow: inset 0 0 0 1px rgba(39, 33, 24, 0.12);
          pointer-events: none;
          z-index: 4;
        }

        .flip-card.prestige-hit {
          box-shadow:
            0 0 0 2px rgba(255, 209, 102, 0.52),
            0 30px 58px rgba(116, 77, 11, 0.22),
            0 10px 20px rgba(245, 158, 11, 0.17);
        }

        .face {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          background: white;
          opacity: 0;
          transition:
            opacity 185ms ease,
            transform 185ms ease;
          transform: scale(0.995);
        }

        .flip-card .face.front {
          opacity: 1;
          transform: scale(1);
        }

        .flip-card.is-flipped .face.front {
          opacity: 0;
          transform: scale(0.992);
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
          pointer-events: none;
          user-select: none;
          -webkit-user-drag: none;
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
          background: linear-gradient(
            180deg,
            #fff8df 0%,
            #fff2c7 100%
          );
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
          margin-top: 16px;
          border-radius: 20px;
          border: 1px solid #d9e8dc;
          background:
            linear-gradient(
              180deg,
              rgba(249, 255, 250, 0.98),
              rgba(242, 250, 244, 0.98)
            );
          padding: 18px;
          box-shadow: 0 14px 34px rgba(40, 72, 49, 0.065);
        }

        .summary-heading-row {
          display: flex;
          align-items: start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .summary-eyebrow {
          font-size: 10px;
          line-height: 1;
          font-weight: 950;
          color: #39714a;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .summary h3 {
          margin: 5px 0 0;
          font-size: 22px;
          line-height: 1.05;
          font-weight: 1000;
          letter-spacing: -0.025em;
        }

        .summary-count {
          margin-top: 5px;
          color: ${colors.subtext};
          font-size: 12px;
          line-height: 1.35;
          font-weight: 800;
        }

        .summary-totals {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          padding: 8px 11px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(190, 213, 196, 0.8);
          font-size: 12px;
          font-weight: 850;
        }

        .summary-total-item {
          display: flex;
          gap: 4px;
          align-items: baseline;
          white-space: nowrap;
        }

        .summary-total-label {
          color: ${colors.subtext};
          font-size: 10px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .summary-total-value {
          font-weight: 1000;
          color: ${colors.text};
        }

        .summary-total-value.positive {
          color: #1e7a35;
        }

        .summary-total-value.negative {
          color: #a73b2f;
        }

        .summary-list {
          list-style: none;
          padding: 0;
          margin: 14px 0 0;
          display: grid;
          gap: 8px;
        }

        .summary-card-link {
          text-decoration: none;
          color: inherit;
          display: block;
          border-radius: 15px;
          outline: none;
        }

        .summary-card-row {
          display: grid;
          grid-template-columns: 58px minmax(0, 1fr) auto;
          gap: 11px;
          align-items: center;
          padding: 9px 10px;
          border-radius: 15px;
          background: rgba(255, 255, 255, 0.78);
          border: 1px solid rgba(201, 219, 205, 0.85);
          box-shadow: 0 3px 10px rgba(37, 66, 45, 0.025);
          transition:
            transform 140ms ease,
            box-shadow 140ms ease,
            border-color 140ms ease,
            background 140ms ease;
        }

        .summary-card-link:hover .summary-card-row {
          transform: translateY(-1px);
          box-shadow: 0 9px 24px rgba(37, 66, 45, 0.075);
          border-color: rgba(153, 191, 164, 0.95);
          background: rgba(255, 255, 255, 0.96);
        }

        .summary-card-thumb {
          position: relative;
          width: 58px;
          height: 80px;
          border-radius: 9px;
          overflow: hidden;
          border: 1px solid ${colors.border};
          background: white;
          box-shadow: 0 5px 13px rgba(31, 29, 25, 0.07);
          flex-shrink: 0;
        }

        .summary-card-thumb img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
          background: white;
        }

        .summary-card-main {
          min-width: 0;
        }

        .summary-card-title {
          font-size: 14px;
          line-height: 1.18;
          font-weight: 950;
          letter-spacing: -0.01em;
          color: ${colors.text};
        }

        .summary-card-sub {
          margin-top: 3px;
          min-width: 0;
          font-size: 11px;
          line-height: 1.3;
          font-weight: 750;
          color: ${colors.subtext};
        }

        .summary-card-note {
          margin-top: 4px;
          font-size: 11px;
          line-height: 1.25;
          font-weight: 900;
          color: #24713d;
        }

        .summary-card-note.hit {
          color: #986707;
        }

        .summary-card-value {
          display: grid;
          justify-items: end;
          align-content: center;
          gap: 2px;
          padding-left: 8px;
        }

        .summary-card-value-main {
          font-size: 15px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: -0.02em;
        }

        .summary-card-value-sub {
          font-size: 10px;
          line-height: 1.15;
          font-weight: 800;
          color: ${colors.subtext};
          white-space: nowrap;
        }

        .summary-card-chevron {
          margin-top: 3px;
          font-size: 11px;
          font-weight: 950;
          color: #597463;
        }

        .summary-actions {
          margin-top: 14px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
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

        @keyframes cardArriveNext {
          0% {
            opacity: 0.35;
            transform: translateX(24px) rotate(0.7deg) scale(0.988);
          }
          100% {
            opacity: 1;
            transform: translateX(0) rotate(0) scale(1);
          }
        }

        @keyframes cardArrivePrev {
          0% {
            opacity: 0.35;
            transform: translateX(-24px) rotate(-0.7deg) scale(0.988);
          }
          100% {
            opacity: 1;
            transform: translateX(0) rotate(0) scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .card-drag-shell.motion-next,
          .card-drag-shell.motion-prev,
          .flip-celebration.active {
            animation: none;
          }

          .btn,
          .summary-card-row,
          .face,
          .card-drag-shell,
          .under-card-shell {
            transition: none;
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
            padding: 0 8px 12px;
            margin-top: -52px;
            min-height: calc(100svh - 52px);
            overflow-x: hidden;
            background:
              radial-gradient(
                circle at 50% 18%,
                rgba(255, 255, 255, 0.96),
                transparent 31%
              ),
              radial-gradient(
                circle at 50% 27%,
                rgba(184, 146, 59, 0.055),
                transparent 48%
              ),
              ${colors.bg};
          }

          .vcs-pack-root.is-opened:not(.is-done) {
            height: calc(100svh - 52px);
            min-height: 0;
            overflow: hidden;
          }

          .vcs-pack-wrap {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            height: 100%;
            overflow-x: hidden;
          }

          .vcs-pack-root.is-opened:not(.is-done) .vcs-pack-wrap {
            display: grid;
            grid-template-rows: 1fr;
          }

          .vcs-pack-hero {
            padding: 6px 8px;
            border-radius: 0 0 14px 14px;
            gap: 4px;
            box-shadow: none;
            background: rgba(255, 255, 255, 0.62);
            border-top: 0;
          }

          .vcs-pack-root.is-opened .vcs-pack-hero {
            display: none;
          }

          .vcs-pack-title {
            min-width: 0;
            width: 100%;
            gap: 1px;
          }

          .vcs-pack-title > div:first-child {
            justify-content: space-between;
            gap: 6px !important;
          }

          .vcs-pack-title > div:first-child .btn {
            padding: 5px 8px;
            min-height: 30px;
            font-size: 10.5px;
            border-radius: 10px;
          }

          .vcs-pack-title > div:first-child .pill {
            padding: 4px 8px;
            font-size: 9px;
          }

          .vcs-pack-title h1 {
            font-size: 14px;
            line-height: 1.1;
            margin-top: 1px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .vcs-pack-title .sub {
            display: none;
          }

          .vcs-pack-actions {
            display: none;
          }

          .vcs-pack-stage {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            padding: 4px 2px 8px;
            margin-top: 4px;
            border-radius: 18px;
            overflow-x: hidden;
            background: transparent;
            border-color: transparent;
            box-shadow: none;
          }

          .vcs-pack-root.is-opened:not(.is-done) .vcs-pack-stage {
            height: 100%;
            min-height: 0;
            margin-top: 0;
            padding-top: 4px;
            overflow: hidden;
          }

          .preopen-shell {
            gap: 6px;
            height: calc(100svh - 112px);
            min-height: 0;
          }

          .preopen-copy {
            display: none;
          }

          .preopen-body {
            min-height: 0;
            height: 100%;
            display: grid;
            grid-template-rows: minmax(0, 1fr) auto;
            gap: 8px;
            align-items: stretch;
          }

          .preopen-pack-panel {
            width: 100% !important;
            min-height: 0;
            padding: 6px !important;
            border: 0 !important;
            background: transparent !important;
            display: grid;
            grid-template-rows: auto minmax(0, 1fr);
            justify-items: center;
          }

          .preopen-pack-panel .panel-title {
            width: 100%;
            margin-bottom: 3px;
            font-size: 10px;
            opacity: 0.72;
          }

          .preopen-pack-panel .pack-img {
            width: auto;
            height: 100%;
            max-height: min(61svh, 520px);
            max-width: min(88vw, 440px);
            object-fit: contain;
            border: 0;
            border-radius: 16px;
            box-shadow: 0 18px 36px rgba(38, 31, 22, 0.12);
          }

          .preopen-ready-panel {
            width: 100%;
            flex: none;
            padding: 7px !important;
            border-radius: 14px !important;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
          }

          .preopen-ready-panel > .panel-title,
          .preopen-ready-copy,
          .preopen-ready-panel .hint {
            display: none;
          }

          .preopen-ready-panel > div:last-child {
            margin-top: 0 !important;
            width: 100%;
          }

          .preopen-ready-panel .btn.primary {
            width: 100%;
            min-height: 46px;
            justify-content: center;
            border-radius: 14px;
            font-size: 15px;
          }

          .mobile-rip-hud {
            position: relative;
            z-index: 20;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0;
            width: fit-content;
            max-width: 100%;
            margin: 0 auto 4px;
            min-height: 29px;
            padding: 2px 4px;
            border: 1px solid rgba(218, 211, 201, 0.92);
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.86);
            backdrop-filter: blur(10px);
            box-shadow: 0 5px 15px rgba(40, 33, 24, 0.045);
          }

          .mobile-hud-item {
            display: flex;
            align-items: baseline;
            gap: 4px;
            min-width: 0;
            padding: 0 7px;
          }

          .mobile-hud-item + .mobile-hud-item {
            border-left: 1px solid rgba(219, 212, 202, 0.82);
          }

          .mobile-hud-label {
            font-size: 7.5px;
            line-height: 1;
            font-weight: 900;
            color: #827b70;
            text-transform: uppercase;
            letter-spacing: 0.045em;
          }

          .mobile-hud-value {
            font-size: 11.5px;
            line-height: 1;
            font-weight: 1000;
            color: ${colors.text};
          }

          .mobile-hud-value.positive {
            color: #1e7a35;
          }

          .mobile-hud-value.negative {
            color: #b42318;
          }

          .mobile-hud-card {
            margin-left: 3px;
            border-radius: 999px;
            padding: 5px 8px;
            background: #efede8;
            text-align: center;
            font-weight: 1000;
            font-size: 10.5px;
            line-height: 1;
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
            gap: 3px;
            overflow-x: hidden;
          }

          .vcs-pack-root.is-opened:not(.is-done) .open-grid {
            height: calc(100svh - 91px);
            min-height: 0;
            overflow: hidden;
          }

          .panel {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            border-radius: 16px;
            padding: 8px;
            overflow-wrap: anywhere;
          }

          .card-panel {
            order: 1;
            padding: 0 2px 2px;
            overflow: visible;
            background: transparent;
            border: 0;
            border-radius: 0;
          }

          .vcs-pack-root.is-opened:not(.is-done) .card-panel {
            height: 100%;
            min-height: 0;
            display: grid;
            grid-template-rows: minmax(0, 1fr) auto auto;
            align-content: stretch;
          }

          .details-panel {
            order: 2;
            overflow: hidden;
            padding: 0;
            border: 0;
            background: transparent;
          }

          .stack-panel {
            order: 3;
            display: none;
          }

          .stack-panel.done {
            display: none;
          }

          .panel-title {
            font-size: 12px;
            margin-bottom: 8px;
          }

          .card-panel .panel-title {
            display: none;
          }

          .card-presentation {
            width: 100%;
            min-height: 0;
            padding: 0 7px 3px;
            display: grid;
            align-items: center;
          }

          .card-presentation::before {
            left: 12%;
            right: 12%;
            bottom: -3px;
            height: 30px;
            filter: blur(15px);
            opacity: 0.58;
          }

          .card-presentation::after {
            inset: 3% 3% -2%;
          }

          .flip-wrap {
            width: min(
              calc((100svh - 220px) * 0.7142857),
              calc(100vw - 28px),
              440px
            );
            max-width: 100%;
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

          .flip-card,
          .under-card {
            border-radius: 16px;
          }

          .flip-card {
            box-shadow:
              0 25px 42px rgba(40, 32, 21, 0.17),
              0 8px 16px rgba(40, 32, 21, 0.1),
              0 2px 5px rgba(40, 32, 21, 0.07);
          }

          .under-card-shell {
            display: block;
            opacity: 0.98;
          }

          .flip-banner {
            top: -7px;
            font-size: 9px;
            padding: 5px 9px;
          }

          .insert-aura {
            inset: -6px;
          }

          .mobile-swipe-hint {
            display: block;
            position: absolute;
            left: 50%;
            bottom: 7px;
            transform: translateX(-50%);
            z-index: 8;
            margin: 0;
            padding: 4px 8px;
            border-radius: 999px;
            text-align: center;
            color: rgba(255, 255, 255, 0.92);
            background: rgba(24, 21, 17, 0.42);
            backdrop-filter: blur(5px);
            font-size: 8px;
            line-height: 1;
            font-weight: 850;
            letter-spacing: 0.02em;
            white-space: nowrap;
            pointer-events: none;
            opacity: 0.8;
          }

          .mobile-current-meta {
            display: grid;
            width: calc(100% - 14px);
            max-width: 440px;
            min-width: 0;
            margin: 3px auto 0;
            padding: 6px 8px 5px;
            border-radius: 11px;
            background: rgba(255, 255, 255, 0.72);
            border: 1px solid rgba(225, 220, 212, 0.82);
            box-shadow: 0 3px 10px rgba(40, 32, 21, 0.025);
            overflow: hidden;
          }

          .mobile-current-title {
            min-width: 0;
            font-size: 14px;
            font-weight: 1000;
            line-height: 1.08;
            letter-spacing: -0.025em;
            overflow-wrap: anywhere;
            display: -webkit-box;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .mobile-current-sub {
            min-width: 0;
            margin-top: 1px;
            color: ${colors.subtext};
            font-size: 10px;
            font-weight: 780;
            line-height: 1.15;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .mobile-current-bottom {
            min-width: 0;
            margin-top: 4px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
          }

          .mobile-current-tags {
            min-width: 0;
            display: flex;
            gap: 5px;
            align-items: center;
            overflow: hidden;
          }

          .mobile-current-type {
            display: inline-flex;
            align-items: center;
            min-width: 0;
            max-width: 160px;
            padding: 3px 6px;
            border-radius: 999px;
            background: #f2f0eb;
            color: #605a52;
            font-size: 8.5px;
            line-height: 1;
            font-weight: 900;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .mobile-current-type.special {
            background: #f3f6fc;
            color: #365a93;
          }

          .mobile-current-stats {
            display: flex;
            gap: 7px;
            align-items: baseline;
            flex-shrink: 0;
            color: ${colors.text};
            font-size: 9.5px;
            line-height: 1;
            font-weight: 820;
          }

          .mobile-current-stats b {
            font-size: 11.5px;
            font-weight: 1000;
          }

          .mobile-prestige-note {
            margin-top: 4px;
            padding-top: 4px;
            border-top: 1px solid rgba(226, 219, 207, 0.8);
            color: #6d531c;
            font-size: 8.5px;
            line-height: 1.15;
            font-weight: 900;
          }

          .mobile-card-controls {
            width: calc(100% - 14px);
            max-width: 440px;
            margin: 4px auto 0;
            display: grid !important;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 5px !important;
          }

          .mobile-card-controls .btn {
            min-height: 36px;
            justify-content: center;
            padding: 5px 7px;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.72);
            border-color: rgba(218, 212, 203, 0.92);
            box-shadow: none;
            font-size: 11px;
          }

          .mobile-card-controls .btn.flip-control {
            background: #f1eee8;
          }

          .details-panel .stat-title,
          .details-panel .stat-sub,
          .details-panel .kv,
          .details-panel .prestige-progress-box,
          .details-panel .pack-art,
          .details-panel > .panel-title {
            display: none;
          }

          .pack-art {
            display: none;
          }

          .value-main {
            font-size: 20px;
          }

          .btn {
            padding: 9px 11px;
            border-radius: 13px;
          }

          .summary {
            margin: 10px 2px 0;
            padding: 13px 10px 11px;
            border-radius: 18px;
          }

          .summary-heading-row {
            display: grid;
            gap: 9px;
          }

          .summary h3 {
            font-size: 20px;
            margin-top: 4px;
          }

          .summary-count {
            margin-top: 4px;
          }

          .summary-totals {
            width: 100%;
            justify-content: space-between;
            gap: 5px;
            padding: 7px 9px;
          }

          .summary-total-item {
            gap: 3px;
          }

          .summary-total-label {
            font-size: 8px;
          }

          .summary-total-value {
            font-size: 11px;
          }

          .summary-list {
            margin-top: 10px;
            gap: 6px;
          }

          .summary-card-row {
            grid-template-columns: 48px minmax(0, 1fr) auto;
            gap: 8px;
            padding: 7px 8px;
            border-radius: 13px;
          }

          .summary-card-thumb {
            width: 48px;
            height: 67px;
            border-radius: 8px;
          }

          .summary-card-title {
            font-size: 12px;
            line-height: 1.15;
          }

          .summary-card-sub {
            margin-top: 2px;
            font-size: 9px;
            line-height: 1.2;
          }

          .summary-card-note {
            margin-top: 3px;
            font-size: 9px;
          }

          .summary-card-value {
            padding-left: 3px;
          }

          .summary-card-value-main {
            font-size: 13px;
          }

          .summary-card-value-sub {
            font-size: 8px;
          }

          .summary-card-chevron {
            font-size: 9px;
          }

          .summary-actions {
            margin-top: 10px;
          }

          .summary-actions .btn {
            flex: 1 1 auto;
            justify-content: center;
            min-height: 40px;
            font-size: 11px;
          }

          .mobile-summary-actions {
            display: contents;
          }

          .footer-tip {
            display: none;
          }
        }

        @media (max-width: 560px) and (max-height: 720px) {
          .flip-wrap {
            width: min(
              calc((100svh - 205px) * 0.7142857),
              calc(100vw - 34px),
              410px
            );
          }

          .mobile-current-meta {
            padding-top: 5px;
            padding-bottom: 4px;
          }

          .mobile-card-controls .btn {
            min-height: 34px;
          }
        }
      `}</style>

      <div className="vcs-pack-wrap">
        <div className="vcs-pack-hero">
          <div className="vcs-pack-title">
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <Link
                href="/inventory"
                className="btn ghost"
                style={{ fontWeight: 950 }}
              >
                ← Inventory
              </Link>

              <span className="pill">Open Pack</span>
            </div>

            <h1>{titleText}</h1>

            <div className="sub">
              Take your time. Flip through the pack and enjoy the rip.
            </div>
          </div>

          <div className="vcs-pack-actions">
            {opened ? (
              <>
                <span className="pill">{progressText}</span>

                <button
                  className="btn"
                  onClick={() => setFlipped((x) => !x)}
                  disabled={!current}
                >
                  {flipped ? "Show Front" : "Flip (F)"}
                </button>

                <div className="nav-buttons">
                  <button
                    className="btn"
                    onClick={prev}
                    disabled={!canPrev}
                  >
                    ← Prev
                  </button>

                  <button
                    className="btn"
                    onClick={next}
                    disabled={!canNext}
                  >
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
          <div
            className={cx("alert", "err")}
            style={{ marginTop: 12 }}
          >
            {error}
          </div>
        )}

        <div className="vcs-pack-stage">
          {!opened ? (
            <div className="preopen-shell">
              <div className="preopen-copy">
                This will open <b>1 pack</b> from your sealed inventory
                and add the cards to your collection.
              </div>

              <div className="preopen-body">
                {metaLoading ? (
                  <div
                    className="panel preopen-pack-panel"
                    style={{ width: 280 }}
                  >
                    <div className="panel-title">Pack art</div>
                    <div
                      style={{
                        color: colors.subtext,
                        fontWeight: 850,
                      }}
                    >
                      (Loading…)
                    </div>
                  </div>
                ) : packImageUrl ? (
                  <div className="panel preopen-pack-panel">
                    <div className="panel-title">Pack art</div>
                    <img
                      className="pack-img"
                      src={packImageUrl}
                      alt="Pack"
                    />
                  </div>
                ) : (
                  <div
                    className="panel preopen-pack-panel"
                    style={{ width: 280 }}
                  >
                    <div className="panel-title">Pack art</div>
                    <div
                      style={{
                        color: colors.subtext,
                        fontWeight: 850,
                      }}
                    >
                      (No pack image set)
                    </div>
                  </div>
                )}

                <div className="panel preopen-ready-panel">
                  <div className="panel-title">Ready?</div>

                  <div
                    className="preopen-ready-copy"
                    style={{
                      color: colors.text,
                      fontWeight: 900,
                      fontSize: 14,
                      lineHeight: 1.4,
                    }}
                  >
                    Tap <b>Open 1 Pack</b> to rip.
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      className="btn primary"
                      onClick={openPack}
                      disabled={loading || !productId}
                    >
                      {loading ? "Opening…" : "Open 1 Pack"}
                    </button>

                    <div
                      className="hint"
                      style={{ alignItems: "center" }}
                    >
                      <span>
                        Tip: <kbd>Space</kbd>, <kbd>←</kbd>/
                        <kbd>→</kbd>, <kbd>F</kbd>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              ref={containerRef}
              tabIndex={-1}
              style={{ outline: "none", height: "100%" }}
            >
              <div className="mobile-rip-hud">
                <div className="mobile-hud-item">
                  <div className="mobile-hud-label">Value</div>
                  <div className="mobile-hud-value">
                    {money(revealedValue)}
                  </div>
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

                <div className="mobile-hud-card">
                  {mobileProgressText}
                </div>
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

                    <span style={{ opacity: 0.85 }}>
                      • click the card to flip
                    </span>
                  </div>
                </div>

                <span className="pill">{progressText}</span>
              </div>

              <div
                className={cx(
                  "value-box",
                  "desktop-value",
                  valueTone === "positive" && "positive",
                  valueTone === "negative" && "negative",
                  valueTone === "neutral" && "neutral"
                )}
              >
                <div className="value-grid">
                  <div className="value-head">
                    Running pack value
                  </div>

                  <div className="value-main">
                    {money(revealedValue)}
                  </div>

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
                <div
                  className={cx("alert", "warn")}
                  style={{ marginBottom: 12 }}
                >
                  Heads up: server returned{" "}
                  <b>{data?.cards.length}</b> cards but product says{" "}
                  <b>{data?.cardsPerPack}</b>.
                </div>
              )}

              <div className="open-grid">
                <div className="panel card-panel">
                  <div className="panel-title">Current card</div>

                  <div className="card-presentation">
                    <div
                      className="flip-wrap"
                      onPointerDown={handleCardPointerDown}
                      onPointerMove={handleCardPointerMove}
                      onPointerUp={handleCardPointerUp}
                      onPointerCancel={handleCardPointerCancel}
                      title="Tap to flip. Swipe left/right to move through the pack."
                    >
                      <div className="flip-scene">
                        {currentHitPrestige &&
                        currentPrestigeBannerLabel ? (
                          <div className="flip-banner">
                            {currentPrestigeBannerLabel}
                          </div>
                        ) : null}

                        <div
                          className={cx(
                            "flip-celebration",
                            currentHitPrestige && "active"
                          )}
                        />

                        <div
                          className={cx(
                            "insert-aura",
                            currentIsSpecial &&
                              !currentHitPrestige &&
                              "active"
                          )}
                        />

                        {underCard ? (
                          <div
                            className="under-card-shell"
                            style={{
                              transform: `translate3d(0, ${underTranslateY}px, 0) scale(${underScale})`,
                              opacity: 0.94 + underProgress * 0.06,
                            }}
                            aria-hidden="true"
                          >
                            <div className="under-card">
                              {underCard.frontImageUrl ? (
                                <OrientedCardImage
                                  src={underCard.frontImageUrl}
                                  alt=""
                                />
                              ) : (
                                <div className="img-missing">
                                  (No front image)
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}

                        <div
                          key={`${current?.id ?? "none"}-${idx}`}
                          className={cx(
                            "card-drag-shell",
                            isDragging && "dragging",
                            swipeCommit && "committing",
                            cardMotion === "next" && "motion-next",
                            cardMotion === "prev" && "motion-prev"
                          )}
                          style={{
                            transform: `translate3d(${dragX}px, 0, 0) rotate(${dragRotation}deg)`,
                          }}
                        >
                          <div
                            className={cx(
                              "flip-card",
                              flipped && "is-flipped",
                              currentHitPrestige && "prestige-hit"
                            )}
                          >
                            <div className="face front">
                              {cardFront ? (
                                <OrientedCardImage
                                  src={cardFront}
                                  alt="Card front"
                                />
                              ) : (
                                <div className="img-missing">
                                  (No front image)
                                </div>
                              )}
                            </div>

                            <div className="face back">
                              {cardBack ? (
                                <OrientedCardImage
                                  src={cardBack}
                                  alt="Card back"
                                />
                              ) : (
                                <div className="img-missing">
                                  (No back image)
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mobile-swipe-hint">
                      Swipe • tap to flip
                    </div>
                  </div>

                  <div className="mobile-current-meta">
                    <div className="mobile-current-title">
                      {cardTitle}
                    </div>

                    <div className="mobile-current-sub">
                      {subline}
                    </div>

                    <div className="mobile-current-bottom">
                      <div className="mobile-current-tags">
                        <span
                          className={cx(
                            "mobile-current-type",
                            current?.isInsert && "special"
                          )}
                        >
                          {current?.isInsert
                            ? currentInsertLabel || "Insert"
                            : "Base"}
                        </span>

                        {current?.isInsert &&
                        currentInsertOddsLabel ? (
                          <span className="mobile-current-type special">
                            {currentInsertOddsLabel}
                          </span>
                        ) : null}
                      </div>

                      <div className="mobile-current-stats">
                        <span>
                          <b>{money(current?.bookValue)}</b>
                        </span>

                        <span>
                          Own <b>{current?.ownedAfter ?? "—"}</b>
                        </span>
                      </div>
                    </div>

                    {currentHasPrestigeProgress &&
                    currentPrestigeProgressLabel ? (
                      <div className="mobile-prestige-note">
                        {currentHitPrestige
                          ? `★ ${currentPrestigeProgressLabel} — this card completed it.`
                          : `★ ${currentPrestigeProgressLabel}`}
                      </div>
                    ) : null}
                  </div>

                  <div className="mobile-card-controls">
                    <button
                      className="btn"
                      onClick={prev}
                      disabled={!canPrev || Boolean(swipeCommit)}
                    >
                      ← Prev
                    </button>

                    <button
                      className="btn flip-control"
                      onClick={() => setFlipped((x) => !x)}
                      disabled={!current || Boolean(swipeCommit)}
                    >
                      {flipped ? "Front" : "Flip"}
                    </button>

                    <button
                      className="btn"
                      onClick={next}
                      disabled={!canNext || Boolean(swipeCommit)}
                    >
                      Next →
                    </button>
                  </div>
                </div>

                <div
                  className={cx(
                    "panel",
                    "stack-panel",
                    isDone && "done"
                  )}
                >
                  <div className="panel-title">
                    Opened stack (top card back)
                  </div>

                  <div className="stack-mini">
                    <div className="stack-top">
                      {prevCard?.backImageUrl ? (
                        <img
                          src={prevCard.backImageUrl}
                          alt="Top of stack (back)"
                        />
                      ) : prevCard ? (
                        <div className="stack-placeholder">
                          (No back image)
                        </div>
                      ) : (
                        <div className="stack-placeholder">
                          (No cards in stack yet)
                        </div>
                      )}
                    </div>

                    {stack.length > 1 && (
                      <div
                        className="stack-fan"
                        aria-hidden="true"
                      >
                        {stack.slice(0, -1).map((c, i) => {
                          const offset =
                            (stack.length - 2 - i) * 10;

                          return (
                            <div
                              key={c.id}
                              className="stack-chip"
                              style={{
                                left: offset,
                                top: offset,
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
                </div>

                <div className="panel details-panel">
                  <div className="panel-title">Details</div>

                  <div className="stat-title">{cardTitle}</div>

                  <div className="stat-sub">{subline}</div>

                  <div className="kv">
                    <div>
                      <b>Type:</b>{" "}
                      {current?.isInsert
                        ? `Insert${
                            currentInsertLabel
                              ? ` • ${currentInsertLabel}`
                              : ""
                          }`
                        : "Base"}
                    </div>

                    {current?.isInsert &&
                    currentInsertOddsLabel ? (
                      <div>
                        <b>Odds:</b> {currentInsertOddsLabel}
                      </div>
                    ) : null}

                    <div>
                      <b>Value:</b> {money(current?.bookValue)}
                      &nbsp;•&nbsp;
                      <b>You own:</b>{" "}
                      {current?.ownedAfter ?? "—"}
                    </div>
                  </div>

                  {currentHasPrestigeProgress &&
                  currentPrestigeProgressLabel ? (
                    <div
                      className={cx(
                        "prestige-progress-box",
                        currentHitPrestige && "hit"
                      )}
                    >
                      <div className="prestige-progress-title">
                        {currentHitPrestige
                          ? "Prestige reached"
                          : "Prestige progress"}
                      </div>

                      <div className="prestige-progress-main">
                        {currentPrestigeProgressLabel}
                      </div>

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

                      <img
                        className="pack-img"
                        src={packImageUrl}
                        alt="Pack"
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {isDone && (
                <div className="summary">
                  <div className="summary-heading-row">
                    <div>
                      <div className="summary-eyebrow">
                        Rip complete
                      </div>

                      <h3>Pack complete</h3>

                      <div className="summary-count">
                        {cards.length}{" "}
                        {cards.length === 1 ? "card" : "cards"} added
                        to your collection.
                      </div>
                    </div>

                    <div className="summary-totals">
                      <div className="summary-total-item">
                        <span className="summary-total-label">
                          Value
                        </span>

                        <span className="summary-total-value">
                          {money(revealedValue)}
                        </span>
                      </div>

                      <div className="summary-total-item">
                        <span className="summary-total-label">
                          Cost
                        </span>

                        <span className="summary-total-value">
                          {money(packPrice)}
                        </span>
                      </div>

                      <div className="summary-total-item">
                        <span className="summary-total-label">
                          Net
                        </span>

                        <span
                          className={cx(
                            "summary-total-value",
                            packDelta > 0 && "positive",
                            packDelta < 0 && "negative"
                          )}
                        >
                          {packDelta > 0 ? "+" : ""}
                          {money(packDelta)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <ol className="summary-list">
                    {cards.map((c) => {
                      const insertLabel = getInsertLabel(c);
                      const insertOddsLabel =
                        getInsertOddsLabel(c);
                      const prestigeProgressLabel =
                        getPrestigeProgressLabel(c);

                      const contextParts = [
                        c.team,
                        insertLabel,
                        insertOddsLabel
                          ? `Odds ${insertOddsLabel}`
                          : null,
                      ].filter(Boolean);

                      return (
                        <li key={c.id}>
                          <Link
                            href={`/cards/${c.id}`}
                            className="summary-card-link"
                          >
                            <div className="summary-card-row">
                              <div className="summary-card-thumb">
                                {c.frontImageUrl ? (
                                  <OrientedCardImage
                                    src={c.frontImageUrl}
                                    alt={c.player}
                                    loading="lazy"
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      display: "grid",
                                      placeItems: "center",
                                      fontSize: 9,
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

                              <div className="summary-card-main">
                                <div className="summary-card-title">
                                  #{c.cardNumber} — {c.player}
                                </div>

                                {contextParts.length > 0 ? (
                                  <div className="summary-card-sub">
                                    {contextParts.join(" • ")}
                                  </div>
                                ) : null}

                                {c.isNeededForNextPrestige &&
                                prestigeProgressLabel ? (
                                  <div
                                    className={cx(
                                      "summary-card-note",
                                      c.hitNextPrestigeWithThisCard &&
                                        "hit"
                                    )}
                                  >
                                    {c.hitNextPrestigeWithThisCard
                                      ? `${prestigeProgressLabel} • Reached`
                                      : prestigeProgressLabel}
                                  </div>
                                ) : null}
                              </div>

                              <div className="summary-card-value">
                                <div className="summary-card-value-main">
                                  {money(c.bookValue)}
                                </div>

                                <div className="summary-card-value-sub">
                                  Own {c.ownedAfter}
                                </div>

                                <div className="summary-card-chevron">
                                  Details →
                                </div>
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ol>

                  <div className="summary-actions">
                    <button
                      className="btn primary"
                      onClick={openPack}
                      disabled={loading || !productId}
                    >
                      {loading ? "Opening…" : "Open Another"}
                    </button>

                    <Link href="/inventory" className="btn">
                      Inventory
                    </Link>

                    <Link
                      href={`/checklist/${encodeURIComponent(
                        productId
                      )}`}
                      className="btn"
                    >
                      Checklist
                    </Link>
                  </div>
                </div>
              )}

              <div className="footer-tip">
                Tip: tap the card to flip. Swipe or use the arrow
                controls to move through the pack.
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
