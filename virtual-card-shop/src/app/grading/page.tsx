// src/app/grading/page.tsx
"use client";

import Link from "next/link";
import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import VcsSlab from "@/components/grading/VcsSlab";
import "./grading.css";

type GradingResultRow = {
  id: number;
  grade: number;
  quantity: number;
  valueCents: number;
};

type GradingOrderRow = {
  id: number;
  status: "PENDING" | "READY" | "REVEALED" | "CANCELLED" | "COMPLETED";
  dbStatus: string;
  quantity: number;
  feePaidCents: number;
  resultGrade: number | null;
  createdAt: string;
  readyAt: string | null;
  revealedAt: string | null;
  completedAt: string | null;
  millisecondsRemaining: number;
  card: {
    id: number;
    cardNumber: string;
    player: string;
    team: string | null;
    position: string | null;
    subset: string | null;
    variant: string | null;
    frontImageUrl: string | null;
    set: {
      id: string;
      year: number | null;
      brand: string | null;
      sport: string | null;
    };
    productSet: {
      id: string;
      name: string | null;
      defaultGradeability: string;
      product: {
        id: string;
        year: number | null;
        brand: string | null;
        sport: string | null;
      };
    } | null;
  };
  gradeability: "COMMON" | "GREAT" | "ICONIC";
  gradeabilityLabel: string;
  rawBookValueCents: number;
  results: GradingResultRow[];
  totalRevealedValueCents: number;
};

type RevealPayload = {
  ok: boolean;
  alreadyRevealed: boolean;
  order: {
    id: number;
    status: string;
    quantity: number;
    feePaidCents: number;
    resultGrade: number | null;
    createdAt: string;
    readyAt: string | null;
    revealedAt: string | null;
    completedAt: string | null;
  };
  card: GradingOrderRow["card"];
  gradeability: "COMMON" | "GREAT" | "ICONIC";
  gradeabilityLabel: string;
  rawBookValueCents: number;
  results: GradingResultRow[];
  totalRevealedValueCents: number;
  balanceCents: number | null;
};

type RevealStage = "closed" | "opening" | "revealed";

type ApiResponse = {
  ok: boolean;
  now: string;
  statusFilter: string;
  counts: {
    ALL: number;
    PENDING: number;
    READY: number;
    REVEALED: number;
    CANCELLED: number;
    COMPLETED: number;
  };
  page: number;
  pageSize: number;
  totalPages: number;
  totalOrders: number;
  orders: GradingOrderRow[];
};

type StatusFilter = "ALL" | "PENDING" | "READY" | "REVEALED";

type SlabInteraction = {
  pointerId: number | null;
  pointerType: string;
  startX: number;
  startY: number;
  axis: "horizontal" | "vertical" | null;
};

const colors = {
  bg: "#fbfaf7",
  card: "#ffffff",
  border: "#e7e3dc",
  text: "#121212",
  subtext: "#333333",
  mutedText: "#666666",
  muted: "#f2efe9",
  blue: "#16477d",
  blueSoft: "#eef6ff",
  green: "#185c24",
  greenSoft: "#f0fff3",
  gold: "#7a5200",
  goldSoft: "#fff8e8",
  red: "#7a1f1f",
  redSoft: "#fff1f1",
};

function safeNum(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatDollarsFromCents(cents: number) {
  const safe = Number.isFinite(cents) ? cents : 0;

  return (safe / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatRemaining(ms: number) {
  const safeMs = Math.max(0, safeNum(ms));
  const totalSeconds = Math.ceil(safeMs / 1000);

  if (totalSeconds <= 0) return "Ready now";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getStatusStyle(status: GradingOrderRow["status"]) {
  if (status === "READY") {
    return {
      background: colors.goldSoft,
      color: colors.gold,
      border: "#f0d28a",
      label: "Ready for Reveal",
    };
  }

  if (status === "REVEALED" || status === "COMPLETED") {
    return {
      background: colors.greenSoft,
      color: colors.green,
      border: "#b8d8bd",
      label: "Revealed",
    };
  }

  if (status === "CANCELLED") {
    return {
      background: colors.redSoft,
      color: colors.red,
      border: "#f3b7b7",
      label: "Cancelled",
    };
  }

  return {
    background: colors.blueSoft,
    color: colors.blue,
    border: "#b9cbe8",
    label: "Pending",
  };
}

function getSetNameFromCard(card: GradingOrderRow["card"]) {
  const product = card.productSet?.product;
  const set = card.set;

  const year = product?.year ?? set.year;
  const brand = product?.brand ?? set.brand;
  const sport = product?.sport ?? set.sport;

  return [year, brand, sport].filter(Boolean).join(" ") || card.set.id;
}

function getSlabSetName(card: GradingOrderRow["card"]) {
  const setName = card.productSet?.name?.trim();
  return setName || getSetNameFromCard(card);
}

function getRevealTone(grade: number) {
  if (grade >= 10) {
    return {
      key: "ten",
      aura:
        "radial-gradient(circle at 50% 45%, rgba(255,224,125,0.44), rgba(218,155,29,0.19) 38%, transparent 70%)",
      sweep:
        "linear-gradient(100deg, transparent 8%, rgba(255,250,226,0.15) 30%, rgba(255,225,126,0.88) 48%, rgba(255,255,255,0.92) 53%, rgba(255,215,91,0.45) 62%, transparent 82%)",
      edge: "rgba(249, 211, 107, 0.55)",
      glow: "rgba(225, 168, 39, 0.31)",
      label: "Gem Mint",
    };
  }

  if (grade >= 9) {
    return {
      key: "nine",
      aura:
        "radial-gradient(circle at 50% 45%, rgba(120,227,153,0.28), rgba(42,145,72,0.14) 40%, transparent 70%)",
      sweep:
        "linear-gradient(100deg, transparent 8%, rgba(233,255,240,0.12) 30%, rgba(143,236,171,0.64) 48%, rgba(255,255,255,0.82) 53%, rgba(91,199,126,0.34) 62%, transparent 82%)",
      edge: "rgba(101, 206, 132, 0.42)",
      glow: "rgba(42, 145, 72, 0.24)",
      label: "Mint",
    };
  }

  if (grade >= 8) {
    return {
      key: "eight",
      aura:
        "radial-gradient(circle at 50% 45%, rgba(150,205,255,0.24), rgba(46,108,178,0.12) 40%, transparent 70%)",
      sweep:
        "linear-gradient(100deg, transparent 8%, rgba(234,246,255,0.11) 30%, rgba(166,215,255,0.55) 48%, rgba(255,255,255,0.76) 53%, rgba(105,169,227,0.3) 62%, transparent 82%)",
      edge: "rgba(118, 180, 234, 0.34)",
      glow: "rgba(58, 121, 181, 0.2)",
      label: "Near Mint",
    };
  }

  return {
    key: "standard",
    aura:
      "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.13), rgba(255,255,255,0.04) 42%, transparent 70%)",
    sweep:
      "linear-gradient(100deg, transparent 8%, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.48) 50%, rgba(255,255,255,0.14) 62%, transparent 82%)",
    edge: "rgba(255,255,255,0.2)",
    glow: "rgba(255,255,255,0.11)",
    label: "Certified",
  };
}

function ImgThumb({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  const url = (src ?? "").trim();
  if (!url || broken) return <span className="grading-image-missing" aria-label="No card scan">VCS</span>;
  return <img src={url} alt={alt} loading="lazy" decoding="async"
    onError={() => setBroken(true)} />;
}

function StatusPill({ status }: { status: GradingOrderRow["status"] }) {
  return <span className={"grading-status-pill grading-status-" + status.toLowerCase()}>
    {getStatusStyle(status).label}
  </span>;
}

function ResultPills({ results }: { results: GradingResultRow[] }) {
  if (results.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {results.map((result) => (
        <span
          key={result.id}
          style={{
            display: "inline-flex",
            gap: 6,
            alignItems: "center",
            border: "1px solid #b9cbe8",
            background: colors.blueSoft,
            color: colors.blue,
            borderRadius: 999,
            padding: "4px 7px",
            fontSize: 11,
            fontWeight: 950,
          }}
        >
          VCS {result.grade}
          <span style={{ color: "#445" }}>×{result.quantity}</span>
          <span style={{ color: "#445" }}>
            {formatDollarsFromCents(result.valueCents)}
          </span>
        </span>
      ))}
    </div>
  );
}

function getPrimaryResult(results: GradingResultRow[]) {
  if (!Array.isArray(results) || results.length === 0) return null;

  return [...results].sort((a, b) => {
    if (b.quantity !== a.quantity) return b.quantity - a.quantity;
    if (b.grade !== a.grade) return b.grade - a.grade;
    return b.valueCents - a.valueCents;
  })[0];
}

function VcsMailer({
  stage,
  payload,
  onReveal,
  isOpening,
}: {
  stage: RevealStage;
  payload: RevealPayload | null;
  onReveal: () => void;
  isOpening: boolean;
}) {
  const card = payload?.card ?? null;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 520,
        minHeight: 330,
        borderRadius: 28,
        border: "1px solid rgba(255,255,255,0.28)",
        background:
          "radial-gradient(circle at 50% 10%, rgba(255,255,255,0.25), transparent 34%), linear-gradient(145deg, #191d25, #0b0d12)",
        boxShadow:
          "0 35px 90px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12)",
        padding: 18,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -120,
          background:
            stage === "opening"
              ? "conic-gradient(from 0deg, transparent, rgba(255,255,255,0.28), transparent, rgba(249,211,107,0.28), transparent)"
              : "radial-gradient(circle, rgba(255,255,255,0.09), transparent 56%)",
          animation:
            stage === "opening" ? "vcsRevealSpin 1.4s linear infinite" : "none",
          opacity: stage === "revealed" ? 0.32 : 1,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: 294,
          display: "grid",
          alignItems: "center",
          justifyItems: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 430,
            borderRadius: 20,
            border: "1px solid rgba(203,213,225,0.55)",
            background:
              stage === "revealed"
                ? "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06))"
                : "linear-gradient(180deg, #f4efe4, #c9b98d)",
            boxShadow:
              stage === "revealed"
                ? "0 14px 35px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.18)"
                : "0 22px 55px rgba(0,0,0,0.45), inset 0 2px 0 rgba(255,255,255,0.5)",
            padding: 18,
            transform:
              stage === "opening"
                ? "translateY(-4px) rotateX(10deg) scale(1.02)"
                : stage === "revealed"
                  ? "translateY(0) scale(0.98)"
                  : "translateY(0)",
            transition:
              "transform 550ms ease, background 550ms ease, box-shadow 550ms ease",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "45%",
              height: 2,
              background:
                stage === "opening"
                  ? "linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)"
                  : "rgba(122,82,0,0.32)",
              boxShadow:
                stage === "opening"
                  ? "0 0 28px rgba(255,255,255,0.9)"
                  : "none",
            }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "flex-start",
              position: "relative",
              zIndex: 2,
            }}
          >
            <div>
              <div
                style={{
                  color: stage === "revealed" ? "#f8fafc" : "#2a1c08",
                  fontSize: 13,
                  fontWeight: 1000,
                  letterSpacing: 1.8,
                  textTransform: "uppercase",
                }}
              >
                VCS Grading
              </div>
              <div
                style={{
                  marginTop: 5,
                  color: stage === "revealed" ? "#cbd5e1" : "#4a3210",
                  fontSize: 12,
                  fontWeight: 850,
                }}
              >
                Certified return mailer
              </div>
            </div>

            <div
              style={{
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.4)",
                background:
                  stage === "revealed"
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(255,255,255,0.48)",
                padding: "6px 9px",
                color: stage === "revealed" ? "#fff" : "#2a1c08",
                fontSize: 11,
                fontWeight: 1000,
                whiteSpace: "nowrap",
              }}
            >
              {card ? `Order #${payload?.order.id}` : "Ready"}
            </div>
          </div>

          <div
            style={{
              marginTop: 48,
              display: "grid",
              gap: 10,
              position: "relative",
              zIndex: 2,
            }}
          >
            <div
              style={{
                color: stage === "revealed" ? "#fff" : "#201506",
                fontSize: 22,
                fontWeight: 1000,
                letterSpacing: -0.5,
                textAlign: "center",
              }}
            >
              {stage === "revealed"
                ? "Slab certified"
                : "Your VCS return is sealed"}
            </div>

            <div
              style={{
                color: stage === "revealed" ? "#cbd5e1" : "#5b4219",
                fontSize: 13,
                fontWeight: 850,
                lineHeight: 1.45,
                textAlign: "center",
              }}
            >
              {card
                ? `#${card.cardNumber} — ${card.player}`
                : "Open the mailer to reveal the slabbed card inside."}
            </div>

            {stage !== "revealed" ? (
              <button
                onClick={onReveal}
                disabled={isOpening}
                style={{
                  margin: "12px auto 0",
                  border: "1px solid rgba(255,255,255,0.62)",
                  background: isOpening
                    ? "linear-gradient(135deg, #8d6a24, #f0d28a)"
                    : "linear-gradient(135deg, #6f4700, #d89b1d 45%, #fff0a8)",
                  color: "#201506",
                  borderRadius: 999,
                  padding: "12px 18px",
                  fontWeight: 1000,
                  cursor: isOpening ? "not-allowed" : "pointer",
                  boxShadow: "0 14px 35px rgba(122,82,0,0.38)",
                }}
              >
                {isOpening ? "Opening mailer…" : "Open Mailer"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function InteractiveRevealSlab({
  payload,
  result,
}: {
  payload: RevealPayload;
  result: GradingResultRow;
}) {
  const tone = getRevealTone(result.grade);

  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);
  const [shineX, setShineX] = useState(50);
  const [shineY, setShineY] = useState(35);
  const [isHolding, setIsHolding] = useState(false);

  const gestureRef = useRef<SlabInteraction>({
    pointerId: null,
    pointerType: "",
    startX: 0,
    startY: 0,
    axis: null,
  });

  function centerSlab() {
    setTiltX(0);
    setTiltY(0);
    setShineX(50);
    setShineY(35);
    setIsHolding(false);

    gestureRef.current = {
      pointerId: null,
      pointerType: "",
      startX: 0,
      startY: 0,
      axis: null,
    };
  }

  function applyPosition(
    e: ReactPointerEvent<HTMLDivElement>,
    allowTouch: boolean
  ) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const px = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const py = clamp((e.clientY - rect.top) / rect.height, 0, 1);

    const horizontal = (px - 0.5) * 2;
    const vertical = (py - 0.5) * 2;

    if (e.pointerType === "touch" && !allowTouch) return;

    setTiltY(horizontal * 3.2);
    setTiltX(vertical * -2.7);
    setShineX(px * 100);
    setShineY(py * 100);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    gestureRef.current = {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      axis: null,
    };

    if (e.pointerType !== "mouse") {
      setIsHolding(true);

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is helpful but not required.
      }
    } else {
      applyPosition(e, true);
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") {
      applyPosition(e, true);
      return;
    }

    const gesture = gestureRef.current;
    if (gesture.pointerId !== e.pointerId) return;

    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (!gesture.axis && (absX > 8 || absY > 8)) {
      gesture.axis = absX > absY * 1.15 ? "horizontal" : "vertical";
    }

    if (gesture.axis !== "horizontal") return;

    e.preventDefault();
    applyPosition(e, true);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if capture has already been released.
      }
    }

    centerSlab();
  }

  return (
    <div
      className={`vcsInteractiveSlab vcsInteractiveSlab-${tone.key}`}
      style={{
        width: "100%",
        maxWidth: 430,
        position: "relative",
        perspective: 1100,
        touchAction: "pan-y",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={centerSlab}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") centerSlab();
      }}
      title="Move across the slab to catch the light"
    >
      <div
        className="vcsRevealAura"
        style={{
          position: "absolute",
          inset: "-8% -10% -10%",
          background: tone.aura,
          filter: "blur(13px)",
          pointerEvents: "none",
          borderRadius: 40,
          opacity: result.grade >= 10 ? 1 : result.grade >= 9 ? 0.82 : 0.65,
        }}
      />

      <div
        className="vcsSlabShadow"
        style={{
          position: "absolute",
          left: "11%",
          right: "11%",
          bottom: -18,
          height: 45,
          borderRadius: "50%",
          background: "rgba(0,0,0,0.44)",
          filter: "blur(18px)",
          transform: `translate3d(${-tiltY * 2.2}px, ${3 + tiltX * 1.1}px, 0) scaleX(${
            0.94 - Math.abs(tiltY) * 0.007
          })`,
          opacity: 0.72,
          transition: isHolding
            ? "none"
            : "transform 280ms cubic-bezier(.2,.8,.2,1)",
          pointerEvents: "none",
        }}
      />

      <div
        className="vcsSlabPhysical"
        style={{
          position: "relative",
          zIndex: 2,
          transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(2px)`,
          transformStyle: "preserve-3d",
          transformOrigin: "50% 52%",
          transition: isHolding
            ? "none"
            : "transform 280ms cubic-bezier(.2,.85,.2,1), filter 280ms ease",
          filter:
            Math.abs(tiltX) + Math.abs(tiltY) > 0.4
              ? "brightness(1.02)"
              : "brightness(1)",
          cursor: "grab",
        }}
      >
        <VcsSlab
          player={payload.card.player}
          cardNumber={payload.card.cardNumber}
          setName={getSlabSetName(payload.card)}
          team={payload.card.team}
          grade={result.grade}
          gradeability={payload.gradeability}
          gradeabilityLabel={payload.gradeabilityLabel}
          valueCents={result.valueCents}
          quantity={result.quantity}
          imageUrl={payload.card.frontImageUrl}
          registry={{
            cardId: payload.card.id,
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 1,
            zIndex: 20,
            borderRadius: 34,
            pointerEvents: "none",
            overflow: "hidden",
            boxShadow: `inset 0 0 0 1px ${tone.edge}`,
          }}
        >
          <div
            className="vcsInteractiveReflection"
            style={{
              position: "absolute",
              inset: "-26%",
              background: `radial-gradient(circle at ${shineX}% ${shineY}%, rgba(255,255,255,0.34), rgba(255,255,255,0.09) 18%, transparent 38%)`,
              transform: `translate3d(${tiltY * 2}px, ${-tiltX * 2}px, 0)`,
              opacity:
                Math.abs(tiltX) + Math.abs(tiltY) > 0.25 ? 0.9 : 0.52,
              transition: isHolding ? "none" : "all 280ms ease",
              mixBlendMode: "screen",
            }}
          />

          <div
            className="vcsPlasticSheen"
            style={{
              position: "absolute",
              top: "-10%",
              bottom: "-10%",
              left: `${shineX - 26}%`,
              width: "34%",
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.05), rgba(255,255,255,0.24), rgba(255,255,255,0.04), transparent)",
              transform: `skewX(-14deg) translateX(${tiltY * 1.5}px)`,
              filter: "blur(1px)",
              opacity: 0.72,
              transition: isHolding ? "none" : "all 280ms ease",
            }}
          />
        </div>
      </div>

      <div
        className="vcsRevealGradeSweep"
        style={{
          position: "absolute",
          zIndex: 5,
          top: "-16%",
          bottom: "-16%",
          left: "-55%",
          width: "48%",
          background: tone.sweep,
          filter: result.grade >= 10 ? "blur(0.2px)" : "blur(0.7px)",
          transform: "skewX(-12deg)",
          pointerEvents: "none",
          mixBlendMode: "screen",
          animation:
            result.grade >= 10
              ? "vcsGradeSweep 1.35s cubic-bezier(.15,.72,.3,1) 400ms both"
              : result.grade >= 9
                ? "vcsGradeSweep 1.15s cubic-bezier(.15,.72,.3,1) 470ms both"
                : result.grade >= 8
                  ? "vcsGradeSweep 1.05s cubic-bezier(.15,.72,.3,1) 500ms both"
                  : "vcsGradeSweep 900ms ease 520ms both",
        }}
      />

      {result.grade >= 10 ? (
        <>
          <div className="vcsGemSpark vcsGemSpark1" />
          <div className="vcsGemSpark vcsGemSpark2" />
          <div className="vcsGemSpark vcsGemSpark3" />
        </>
      ) : null}

      <div
        className="vcsSlabTouchHint"
        style={{
          marginTop: 12,
          textAlign: "center",
          color: "#94a3b8",
          fontSize: 10.5,
          lineHeight: 1.25,
          fontWeight: 800,
          letterSpacing: 0.1,
        }}
      >
        Drag gently to catch the light
      </div>
    </div>
  );
}

function RevealModal({
  payload,
  stage,
  isOpening,
  onOpenMailer,
  onClose,
}: {
  payload: RevealPayload | null;
  stage: RevealStage;
  isOpening: boolean;
  onOpenMailer: () => void;
  onClose: () => void;
}) {
  const primary = getPrimaryResult(payload?.results ?? []);
  const revealTone = primary ? getRevealTone(primary.grade) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        background:
          stage === "revealed" && revealTone
            ? `radial-gradient(circle at 72% 40%, ${revealTone.glow}, transparent 29%), radial-gradient(circle at 50% 16%, rgba(22,71,125,0.34), transparent 34%), rgba(5,7,12,0.84)`
            : "radial-gradient(circle at 50% 16%, rgba(22,71,125,0.34), transparent 34%), rgba(5,7,12,0.84)",
        backdropFilter: "blur(12px)",
        overflowY: "auto",
        padding: 16,
        transition: "background 650ms ease",
      }}
    >
      <style>
        {`
          @keyframes vcsRevealSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }

          @keyframes vcsSlabRise {
            0% {
              opacity: 0;
              transform: translateY(42px) scale(0.92) rotateX(12deg);
              filter: blur(10px);
            }
            55% {
              opacity: 1;
              transform: translateY(-8px) scale(1.02) rotateX(0deg);
              filter: blur(0);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1) rotateX(0deg);
              filter: blur(0);
            }
          }

          @keyframes vcsGradeSweep {
            0% {
              opacity: 0;
              transform: translateX(0) skewX(-12deg);
            }
            14% {
              opacity: 1;
            }
            100% {
              opacity: 0;
              transform: translateX(390%) skewX(-12deg);
            }
          }

          @keyframes vcsGradeAura {
            0% { opacity: 0; transform: scale(0.87); }
            45% { opacity: 1; transform: scale(1.04); }
            100% { opacity: 0.68; transform: scale(1); }
          }

          @keyframes vcsGemSpark {
            0%, 22% { opacity: 0; transform: scale(0.2) rotate(0deg); }
            45% { opacity: 1; transform: scale(1.15) rotate(42deg); }
            72%, 100% { opacity: 0; transform: scale(0.35) rotate(90deg); }
          }

          .vcsRevealAura {
            animation: vcsGradeAura 1.45s cubic-bezier(.2,.8,.2,1) 220ms both;
          }

          .vcsGemSpark {
            position: absolute;
            z-index: 8;
            width: 18px;
            height: 18px;
            pointer-events: none;
            opacity: 0;
          }

          .vcsGemSpark::before,
          .vcsGemSpark::after {
            content: "";
            position: absolute;
            left: 50%;
            top: 50%;
            background: rgba(255, 243, 187, 0.96);
            border-radius: 999px;
            box-shadow: 0 0 12px rgba(255, 211, 86, 0.9);
            transform: translate(-50%, -50%);
          }

          .vcsGemSpark::before {
            width: 2px;
            height: 18px;
          }

          .vcsGemSpark::after {
            width: 18px;
            height: 2px;
          }

          .vcsGemSpark1 {
            top: 11%;
            right: 7%;
            animation: vcsGemSpark 1.2s ease 520ms both;
          }

          .vcsGemSpark2 {
            top: 43%;
            left: 2%;
            animation: vcsGemSpark 1.15s ease 720ms both;
          }

          .vcsGemSpark3 {
            bottom: 15%;
            right: 10%;
            animation: vcsGemSpark 1.1s ease 860ms both;
          }

          .vcsSlabPhysical:active {
            cursor: grabbing !important;
          }

          @media (hover: hover) and (pointer: fine) {
            .vcsInteractiveSlab:hover .vcsSlabTouchHint {
              color: #d5dde8 !important;
            }
          }

          @media (max-width: 720px) {
            .vcsRevealGrid {
              grid-template-columns: 1fr !important;
            }

            .vcsRevealTitle {
              font-size: 25px !important;
              line-height: 1.04 !important;
            }

            .vcsInteractiveSlab {
              max-width: 390px !important;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .vcsRevealAura,
            .vcsRevealGradeSweep,
            .vcsGemSpark {
              animation: none !important;
            }

            .vcsSlabPhysical,
            .vcsSlabShadow,
            .vcsInteractiveReflection,
            .vcsPlasticSheen {
              transition: none !important;
            }
          }
        `}
      </style>

      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          minHeight: "100%",
          display: "grid",
          alignItems: "center",
        }}
      >
        <div
          style={{
            borderRadius: 30,
            border: "1px solid rgba(255,255,255,0.16)",
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06)), #0b0f18",
            boxShadow: "0 35px 100px rgba(0,0,0,0.58)",
            padding: 18,
            color: "#fff",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "radial-gradient(circle at 18% 8%, rgba(255,255,255,0.2), transparent 26%), radial-gradient(circle at 90% 20%, rgba(249,211,107,0.16), transparent 24%)",
            }}
          />

          <div style={{ position: "relative", zIndex: 2 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#f9d36b",
                    fontSize: 12,
                    fontWeight: 1000,
                    letterSpacing: 2.4,
                    textTransform: "uppercase",
                  }}
                >
                  VCS Grading Return
                </div>

                <div
                  className="vcsRevealTitle"
                  style={{
                    marginTop: 5,
                    fontSize: 38,
                    lineHeight: 1.05,
                    fontWeight: 1000,
                    letterSpacing: -1.2,
                  }}
                >
                  {stage === "revealed"
                    ? "Your slab is back."
                    : "Mail day is here."}
                </div>

                <div
                  style={{
                    marginTop: 7,
                    color: "#cbd5e1",
                    fontWeight: 800,
                    fontSize: 14,
                  }}
                >
                  {payload?.card
                    ? `#${payload.card.cardNumber} — ${payload.card.player}`
                    : "Open the sealed VCS mailer to reveal the graded card."}
                </div>
              </div>

              <button
                onClick={onClose}
                style={{
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.08)",
                  color: "#fff",
                  borderRadius: 999,
                  width: 38,
                  height: 38,
                  fontWeight: 1000,
                  cursor: "pointer",
                }}
                title="Close reveal"
              >
                ×
              </button>
            </div>

            <div
              className="vcsRevealGrid"
              style={{
                marginTop: stage === "revealed" ? 10 : 18,
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 18,
                alignItems: "center",
                justifyItems: "center",
              }}
            >
              {stage !== "revealed" ? (
                <VcsMailer
                  stage={stage}
                  payload={payload}
                  onReveal={onOpenMailer}
                  isOpening={isOpening}
                />
              ) : null}

              {stage === "revealed" && primary && payload ? (
                <div
                  style={{
                    width: "100%",
                    display: "grid",
                    justifyItems: "center",
                    gap: 12,
                    animation:
                      "vcsSlabRise 900ms cubic-bezier(.2,.9,.2,1) both",
                    position: "relative",
                    overflow: "visible",
                    borderRadius: 30,
                    padding: 8,
                  }}
                >
                  <InteractiveRevealSlab
                    payload={payload}
                    result={primary}
                  />

                  <div
                    style={{
                      width: "100%",
                      maxWidth: 430,
                      borderRadius: 18,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.08)",
                      padding: 12,
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,0.12)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            color: "#f9d36b",
                            fontWeight: 1000,
                            fontSize: 13,
                          }}
                        >
                          Revealed value
                        </div>
                        <div
                          style={{
                            color: "#fff",
                            fontWeight: 1000,
                            fontSize: 22,
                          }}
                        >
                          {formatDollarsFromCents(
                            payload.totalRevealedValueCents
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        <Link
                          href={`/cards/${payload.card.id}`}
                          onClick={onClose}
                          style={{
                            border: "1px solid rgba(255,255,255,0.22)",
                            background: "rgba(255,255,255,0.1)",
                            color: "#fff",
                            borderRadius: 999,
                            padding: "9px 11px",
                            fontWeight: 1000,
                            textDecoration: "none",
                            fontSize: 13,
                          }}
                        >
                          Card Details
                        </Link>

                        <Link
                          href="/collection/slabs"
                          onClick={onClose}
                          style={{
                            border: "1px solid rgba(249,211,107,0.7)",
                            background:
                              "linear-gradient(135deg, #6f4700, #d89b1d)",
                            color: "#1b1202",
                            borderRadius: 999,
                            padding: "9px 11px",
                            fontWeight: 1000,
                            textDecoration: "none",
                            fontSize: 13,
                          }}
                        >
                          Slab Gallery
                        </Link>
                      </div>
                    </div>

                    {payload.results.length > 1 ? (
                      <div style={{ marginTop: 10 }}>
                        <ResultPills results={payload.results} />
                      </div>
                    ) : null}

                    <button
                      onClick={onClose}
                      style={{
                        marginTop: 12,
                        width: "100%",
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.08)",
                        color: "#fff",
                        borderRadius: 12,
                        padding: "10px 12px",
                        fontWeight: 1000,
                        cursor: "pointer",
                      }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GradingPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("READY");
  const [page, setPage] = useState(1);
  const [pageJump, setPageJump] = useState("1");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [revealingId, setRevealingId] = useState<number | null>(null);
  const requestId = useRef(0);
  const [revealOrderId, setRevealOrderId] = useState<number | null>(null);
  const [revealPayload, setRevealPayload] = useState<RevealPayload | null>(null);
  const [revealStage, setRevealStage] = useState<RevealStage>("closed");

  async function load(nextFilter = filter, nextPage = page, nextQuery = query) {
    const id = ++requestId.current;
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ page: String(nextPage), pageSize: "25" });
      if (nextFilter !== "ALL") qs.set("status", nextFilter);
      if (nextQuery) qs.set("q", nextQuery);
      const response = await fetch("/api/grading/orders?" + qs.toString(), { cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Couldn't load grading orders.");
      }
      if (id !== requestId.current) return;
      const next = json as ApiResponse;
      setData(next);
      if (next.page !== nextPage) setPage(next.page);
      setPageJump(String(next.page));
    } catch (error) {
      if (id !== requestId.current) return;
      setErr(error instanceof Error ? error.message : "Couldn't load grading orders.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  // Search is debounced; readiness is NEVER auto-refreshed or revealed.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setPage(1);
      setQuery(queryInput.trim());
    }, 320);
    return () => window.clearTimeout(handle);
  }, [queryInput]);

  useEffect(() => {
    void load(filter, page, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page, query]);

  function selectFilter(value: StatusFilter) {
    if (filter === value) return;
    setFilter(value);
    setPage(1);
    setPageJump("1");
  }

  function goToPage(value: number) {
    const last = Math.max(1, data?.totalPages ?? 1);
    const next = Math.min(last, Math.max(1, Math.floor(value)));
    if (!Number.isFinite(next) || next === page) return;
    setPage(next);
    setPageJump(String(next));
    document.getElementById("grading-results")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function submitPageJump() {
    const target = Number(pageJump);
    if (Number.isSafeInteger(target)) goToPage(target);
    else setPageJump(String(page));
  }

  function openRevealModal(orderId: number) {
    setRevealOrderId(orderId);
    setRevealPayload(null);
    setRevealStage("closed");
    setErr(null);
  }

  function closeRevealModal() {
    setRevealOrderId(null);
    setRevealPayload(null);
    setRevealStage("closed");
  }

  async function reveal(orderId: number) {
    setRevealingId(orderId);
    setRevealStage("opening");
    setErr(null);
    try {
      const response = await fetch("/api/grading/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ orderId }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error(json?.error || "Failed to reveal grading order.");
      setRevealPayload(json as RevealPayload);
      window.setTimeout(() => setRevealStage("revealed"), 850);
      // Refresh this list only after the collector deliberately opens a mailer.
      await load(filter, page, query);
    } catch (error) {
      setRevealStage("closed");
      setErr(error instanceof Error ? error.message : "Failed to reveal grading order.");
    } finally {
      setRevealingId(null);
    }
  }

  const orders = data?.orders ?? [];
  const totalOrders = data?.totalOrders ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const first = totalOrders > 0 ? (page - 1) * (data?.pageSize ?? 25) + 1 : 0;
  const last = Math.min(totalOrders, page * (data?.pageSize ?? 25));
  const statusLabels: Record<StatusFilter, string> = {
    READY: "Ready", PENDING: "Pending", REVEALED: "Revealed", ALL: "All",
  };

  return (
    <main className="grading-desk">
      {revealOrderId != null ? (
        <RevealModal
          payload={revealPayload}
          stage={revealStage}
          isOpening={revealingId === revealOrderId || revealStage === "opening"}
          onOpenMailer={() => void reveal(revealOrderId)}
          onClose={closeRevealModal}
        />
      ) : null}
      <div className="grading-desk-inner">
        <header className="grading-desk-header">
          <div>
            <span className="grading-eyebrow">THE GRADING DESK</span>
            <h1>VCS Grading</h1>
            <p className="grading-desk-subtitle">
              Your sealed returns, ready when you are. Reveal each grade on your schedule.
            </p>
          </div>
          <div className="grading-desk-actions">
            <Link href="/collection/slabs" className="grading-desk-link">
              Slab Gallery <span aria-hidden="true">↗</span>
            </Link>
            <button type="button" className="grading-refresh" onClick={() => void load()}
              disabled={loading} aria-label="Refresh grading orders" title="Refresh grading orders">
              <span aria-hidden="true">↻</span>
              <span className="grading-refresh-label">Refresh</span>
            </button>
          </div>
        </header>

        <nav className="grading-desk-filters" aria-label="Grading order status">
          {(["READY", "PENDING", "REVEALED", "ALL"] as StatusFilter[]).map(status => (
            <button key={status} type="button" className="grading-filter"
              aria-current={filter === status ? "page" : undefined}
              onClick={() => selectFilter(status)}>
              <span>{statusLabels[status]}</span>
              <strong>{(data?.counts?.[status] ?? 0).toLocaleString()}</strong>
            </button>
          ))}
        </nav>

        <div className="grading-desk-tools">
          <label className="grading-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="10.8" cy="10.8" r="7.4" />
              <path d="m16.2 16.2 5 5" />
            </svg>
            <input type="search" aria-label="Search grading orders"
              placeholder="Search player, team, set, or card number…"
              value={queryInput} onChange={event => setQueryInput(event.target.value)} />
            {queryInput ? <button className="grading-search-clear" type="button"
              aria-label="Clear grading search"
              onClick={() => { setQueryInput(""); setQuery(""); setPage(1); }}>×</button> : null}
          </label>
          <span className="grading-search-note">Search all orders in this status</span>
        </div>

        <section id="grading-results" aria-label="Grading orders">
          <div className="grading-list-heading">
            <h2>{statusLabels[filter]} mailers</h2>
            <span>{query ? "Search results" : "Grading orders"} · {totalOrders.toLocaleString()}</span>
          </div>

          {err ? <div className="grading-notice error" role="alert">
            {err} <button type="button" onClick={() => void load()}>Retry</button>
          </div> : null}
          {loading && orders.length === 0 ? <div className="grading-loading" aria-label="Loading grading orders">
            {Array.from({ length: 6 }, (_, i) => <div key={i} />)}
          </div> : !loading && orders.length === 0 ? (
            <div className="grading-empty">
              <h3>{query ? "No matching mailers" : filter === "READY" ? "No mailers ready to open" : "No orders in this view"}</h3>
              <p>{query ? "Try a different player, set, team, or card number." :
                filter === "READY" ? "You can return whenever you want to open your next batch." :
                "Other grading statuses may still have cards."}</p>
              {query ? <button type="button" onClick={() => { setQueryInput(""); setQuery(""); setPage(1); }}>
                Clear search</button> : null}
            </div>
          ) : (
            <div className="grading-list" aria-busy={loading}>
              {orders.map(order => {
                const ready = order.status === "READY";
                const revealed = order.status === "REVEALED" || order.status === "COMPLETED";
                const details = [order.card.team, order.card.subset, order.card.variant].filter(Boolean).join(" · ");
                const remaining = order.readyAt ?
                  Math.max(0, new Date(order.readyAt).getTime() - Date.now()) :
                  order.millisecondsRemaining;
                return <article key={order.id} className="grading-order">
                  <div className="grading-order-art">
                    <ImgThumb src={order.card.frontImageUrl} alt={order.card.player + " card front"} />
                  </div>
                  <div className="grading-order-content">
                    <div className="grading-order-top">
                      <StatusPill status={order.status} />
                      {order.quantity > 1 ? <span className="grading-order-qty">Qty {order.quantity}</span> : null}
                    </div>
                    <h3 className="grading-order-title">{order.card.player}
                      <small> #{order.card.cardNumber}</small>
                    </h3>
                    <div className="grading-order-set">{getSetNameFromCard(order.card)}</div>
                    {details && <div className="grading-order-team">{details}</div>}
                    {revealed && order.results.length ? (
                      <div className="grading-result-pills" aria-label="Revealed grades">
                        {order.results.map(result => <span key={result.id} className="grading-result-pill">
                          VCS {result.grade} <small>×{result.quantity}</small>
                        </span>)}
                      </div>
                    ) : null}
                    <div className="grading-order-facts">
                      {revealed ? <span>Graded value <strong>
                        {formatDollarsFromCents(order.totalRevealedValueCents)}</strong></span> :
                        <span>Raw <strong>{formatDollarsFromCents(order.rawBookValueCents)}</strong></span>}
                      {order.status === "PENDING" && <span>
                        Estimated: <strong>{order.readyAt ? formatRemaining(remaining) : "Pending"}</strong></span>}
                    </div>
                  </div>
                  <div className="grading-order-actions">
                    {ready ? <button type="button" className="grading-mailer-action"
                      disabled={revealingId === order.id}
                      onClick={() => openRevealModal(order.id)}>
                      {revealingId === order.id ? "Opening…" : "Open Mailer"} <span aria-hidden="true">↗</span>
                    </button> : <span className="grading-quiet-status">
                      {order.status === "PENDING" ? "Sealed · awaiting return" : "Grading record"}
                    </span>}
                    <Link href={"/cards/" + order.card.id} className="grading-details-link">
                      Card details <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </article>;
              })}
            </div>
          )}

          {!loading && totalOrders > 0 && <div className="grading-pagination">
            <span className="grading-pagination-summary">
              Showing {first.toLocaleString()}–{last.toLocaleString()} of {totalOrders.toLocaleString()} orders
            </span>
            {totalPages > 1 && <>
              <div className="grading-pages">
                <button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>← Previous</button>
                <b>{page} / {totalPages}</b>
                <button type="button" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>Next →</button>
              </div>
              <label className="grading-jump">
                Page <input type="number" min={1} max={totalPages} inputMode="numeric"
                  value={pageJump} onChange={event => setPageJump(event.target.value)}
                  onKeyDown={event => { if (event.key === "Enter") submitPageJump(); }} />
                <button type="button" onClick={submitPageJump}>Go</button>
              </label>
            </>}
          </div>}
        </section>
      </div>
    </main>
  );
}
