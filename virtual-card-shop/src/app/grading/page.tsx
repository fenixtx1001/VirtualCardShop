// src/app/grading/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import VcsSlab from "@/components/grading/VcsSlab";

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
  orders: GradingOrderRow[];
};

type StatusFilter = "ALL" | "PENDING" | "READY" | "REVEALED" | "COMPLETED";

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

function formatDollarsFromCents(cents: number) {
  const safe = Number.isFinite(cents) ? cents : 0;

  return (safe / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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
      label: status === "COMPLETED" ? "Completed" : "Revealed",
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
  const product = card.productSet?.product;
  const set = card.set;

  const year = product?.year ?? set.year;
  const brand = product?.brand ?? set.brand;
  const setName = card.productSet?.name?.trim() || null;

  return [year, brand, setName].filter(Boolean).join(" ") || getSetNameFromCard(card);
}

function ImgThumb({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  const url = (src ?? "").trim();

  if (!url || broken) {
    return (
      <div
        style={{
          width: 54,
          height: 74,
          borderRadius: 8,
          border: `1px dashed ${colors.border}`,
          background: colors.muted,
          display: "grid",
          placeItems: "center",
          color: colors.mutedText,
          fontWeight: 900,
          fontSize: 12,
        }}
      >
        —
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      style={{
        width: 54,
        height: 74,
        objectFit: "cover",
        borderRadius: 8,
        border: `1px solid ${colors.border}`,
        background: "#fff",
        display: "block",
      }}
    />
  );
}

function StatusPill({ status }: { status: GradingOrderRow["status"] }) {
  const s = getStatusStyle(status);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        border: `1px solid ${s.border}`,
        background: s.background,
        color: s.color,
        borderRadius: 999,
        padding: "5px 8px",
        fontSize: 12,
        fontWeight: 950,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
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
            padding: "5px 8px",
            fontSize: 12,
            fontWeight: 950,
          }}
        >
          VCS {result.grade}
          <span style={{ color: "#445" }}>×{result.quantity}</span>
          <span style={{ color: "#445" }}>{formatDollarsFromCents(result.valueCents)}</span>
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
          animation: stage === "opening" ? "vcsRevealSpin 1.4s linear infinite" : "none",
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
            transition: "transform 550ms ease, background 550ms ease, box-shadow 550ms ease",
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
              boxShadow: stage === "opening" ? "0 0 28px rgba(255,255,255,0.9)" : "none",
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
                background: stage === "revealed" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.48)",
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
              {stage === "revealed" ? "Slab certified" : "Your VCS return is sealed"}
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        background:
          "radial-gradient(circle at 50% 16%, rgba(22,71,125,0.34), transparent 34%), rgba(5,7,12,0.84)",
        backdropFilter: "blur(12px)",
        overflowY: "auto",
        padding: 16,
      }}
    >
      <style>
        {`
          @keyframes vcsRevealSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes vcsSlabRise {
            0% { opacity: 0; transform: translateY(42px) scale(0.92) rotateX(12deg); filter: blur(10px); }
            55% { opacity: 1; transform: translateY(-8px) scale(1.02) rotateX(0deg); filter: blur(0); }
            100% { opacity: 1; transform: translateY(0) scale(1) rotateX(0deg); filter: blur(0); }
          }
          @keyframes vcsShimmer {
            0% { transform: translateX(-120%) rotate(18deg); }
            100% { transform: translateX(160%) rotate(18deg); }
          }
          @media (max-width: 720px) {
            .vcsRevealGrid {
              grid-template-columns: 1fr !important;
            }
            .vcsRevealTitle {
              font-size: 28px !important;
            }
          }
        `}
      </style>

      <div style={{ maxWidth: 1080, margin: "0 auto", minHeight: "100%", display: "grid", alignItems: "center" }}>
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
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
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
                  {stage === "revealed" ? "Your slab is back." : "Mail day is here."}
                </div>
                <div style={{ marginTop: 7, color: "#cbd5e1", fontWeight: 800, fontSize: 14 }}>
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
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: stage === "revealed" && primary && payload ? "minmax(300px, 0.9fr) minmax(320px, 1.1fr)" : "1fr",
                gap: 18,
                alignItems: "center",
                justifyItems: "center",
              }}
            >
              <VcsMailer stage={stage} payload={payload} onReveal={onOpenMailer} isOpening={isOpening} />

              {stage === "revealed" && primary && payload ? (
                <div
                  style={{
                    width: "100%",
                    display: "grid",
                    justifyItems: "center",
                    gap: 12,
                    animation: "vcsSlabRise 900ms cubic-bezier(.2,.9,.2,1) both",
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: 30,
                    padding: 8,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: -80,
                      bottom: -80,
                      width: 90,
                      background:
                        "linear-gradient(90deg, transparent, rgba(255,255,255,0.52), transparent)",
                      animation: "vcsShimmer 1.35s ease 420ms both",
                      pointerEvents: "none",
                    }}
                  />

                  <VcsSlab
                    player={payload.card.player}
                    cardNumber={payload.card.cardNumber}
                    setName={getSlabSetName(payload.card)}
                    team={payload.card.team}
                    grade={primary.grade}
                    gradeability={payload.gradeability}
                    gradeabilityLabel={payload.gradeabilityLabel}
                    valueCents={primary.valueCents}
                    quantity={primary.quantity}
                    imageUrl={payload.card.frontImageUrl}
                  />

                  <div
                    style={{
                      width: "100%",
                      maxWidth: 430,
                      borderRadius: 18,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.08)",
                      padding: 12,
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
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
                        <div style={{ color: "#f9d36b", fontWeight: 1000, fontSize: 13 }}>
                          Revealed value
                        </div>
                        <div style={{ color: "#fff", fontWeight: 1000, fontSize: 22 }}>
                          {formatDollarsFromCents(payload.totalRevealedValueCents)}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
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
                            background: "linear-gradient(135deg, #6f4700, #d89b1d)",
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
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [revealingId, setRevealingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const [revealOrderId, setRevealOrderId] = useState<number | null>(null);
  const [revealPayload, setRevealPayload] = useState<RevealPayload | null>(null);
  const [revealStage, setRevealStage] = useState<RevealStage>("closed");

  async function load(nextFilter = filter) {
    setLoading(true);
    setErr(null);

    try {
      const qs = new URLSearchParams();
      if (nextFilter !== "ALL") qs.set("status", nextFilter);

      const res = await fetch(`/api/grading/orders${qs.toString() ? `?${qs.toString()}` : ""}`, {
        cache: "no-store",
      });

      const raw = await res.text();

      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Grading orders returned non-JSON (${res.status}): ${raw.slice(0, 180)}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Failed to load grading orders (${res.status})`);
      }

      setData(json as ApiResponse);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load grading orders");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  function openRevealModal(orderId: number) {
    setRevealOrderId(orderId);
    setRevealPayload(null);
    setRevealStage("closed");
    setNotice(null);
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
    setNotice(null);
    setErr(null);

    try {
      const res = await fetch("/api/grading/reveal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({ orderId }),
      });

      const raw = await res.text();

      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Reveal returned non-JSON (${res.status}): ${raw.slice(0, 180)}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Failed to reveal order (${res.status})`);
      }

      setRevealPayload(json as RevealPayload);

      window.setTimeout(() => {
        setRevealStage("revealed");
      }, 850);

      await load(filter);
    } catch (e: any) {
      setRevealStage("closed");
      setErr(e?.message ?? "Failed to reveal order");
    } finally {
      setRevealingId(null);
    }
  }

  useEffect(() => {
    load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const orders = data?.orders ?? [];

  const pendingAndReadyCount = useMemo(() => {
    return orders.filter((order) => order.status === "PENDING" || order.status === "READY").length;
  }, [orders]);

  return (
    <main
      style={{
        background: colors.bg,
        minHeight: "calc(100vh - 80px)",
        padding: 20,
        color: colors.text,
        fontFamily: "system-ui",
      }}
    >
      {revealOrderId != null ? (
        <RevealModal
          payload={revealPayload}
          stage={revealStage}
          isOpening={revealingId === revealOrderId || revealStage === "opening"}
          onOpenMailer={() => reveal(revealOrderId)}
          onClose={closeRevealModal}
        />
      ) : null}

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 34, fontWeight: 950, marginTop: 0, marginBottom: 6 }}>
              VCS Grading
            </h1>
            <div style={{ color: colors.subtext, fontSize: 14, fontWeight: 750, lineHeight: 1.45 }}>
              Track pending grading submissions, open ready mailers, and review revealed VCS grades.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => load(filter)}
              disabled={loading}
              style={{
                border: `1px solid ${colors.border}`,
                background: colors.muted,
                borderRadius: 10,
                padding: "9px 12px",
                fontWeight: 950,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>

            <Link
              href="/collection/slabs"
              style={{
                border: `1px solid ${colors.border}`,
                background: colors.card,
                borderRadius: 10,
                padding: "9px 12px",
                fontWeight: 950,
                color: colors.text,
                textDecoration: "none",
              }}
            >
              Slab Gallery
            </Link>

            <Link
              href="/collection"
              style={{
                border: `1px solid ${colors.border}`,
                background: colors.card,
                borderRadius: 10,
                padding: "9px 12px",
                fontWeight: 950,
                color: colors.text,
                textDecoration: "none",
              }}
            >
              Collection
            </Link>
          </div>
        </div>

        <hr style={{ margin: "16px 0", borderColor: colors.border }} />

        <div
          style={{
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: 12,
            marginBottom: 14,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {(["ALL", "PENDING", "READY", "REVEALED", "COMPLETED"] as StatusFilter[]).map((status) => {
            const count = data?.counts?.[status] ?? 0;
            const active = filter === status;

            return (
              <button
                key={status}
                onClick={() => setFilter(status)}
                style={{
                  border: `1px solid ${active ? colors.blue : colors.border}`,
                  background: active ? colors.blueSoft : "#fff",
                  color: active ? colors.blue : colors.text,
                  borderRadius: 999,
                  padding: "7px 10px",
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                {status === "ALL" ? "All" : status[0] + status.slice(1).toLowerCase()}{" "}
                <span style={{ color: colors.mutedText }}>({count})</span>
              </button>
            );
          })}

          <div style={{ marginLeft: "auto", color: colors.mutedText, fontWeight: 850, fontSize: 13 }}>
            Active mailers: {pendingAndReadyCount}
          </div>
        </div>

        {notice ? (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              background: colors.greenSoft,
              border: "1px solid #b8d8bd",
              borderRadius: 12,
              color: colors.green,
              fontWeight: 900,
            }}
          >
            {notice}
          </div>
        ) : null}

        {err ? (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              background: colors.redSoft,
              border: "1px solid #f3b7b7",
              borderRadius: 12,
              color: colors.red,
              fontWeight: 900,
            }}
          >
            {err}
          </div>
        ) : null}

        {loading ? (
          <div style={{ color: colors.subtext, fontWeight: 900 }}>Loading grading orders…</div>
        ) : orders.length === 0 ? (
          <div
            style={{
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              padding: 18,
              color: colors.subtext,
              fontWeight: 850,
            }}
          >
            No grading orders yet. Go to a collection set, choose a raw card, and submit it for VCS grading.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {orders.map((order) => {
              const canReveal = order.status === "READY";
              const isRevealing = revealingId === order.id;
              const statusStyle = getStatusStyle(order.status);

              return (
                <div
                  key={`${order.id}-${tick}`}
                  style={{
                    background: colors.card,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 16,
                    padding: 14,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.03)",
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <ImgThumb src={order.card.frontImageUrl} alt={order.card.player} />

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <StatusPill status={order.status} />
                      <span
                        style={{
                          display: "inline-flex",
                          border: "1px solid #ddd",
                          background: "#f7f7f7",
                          color: "#333",
                          borderRadius: 999,
                          padding: "5px 8px",
                          fontSize: 12,
                          fontWeight: 950,
                        }}
                      >
                        {order.gradeabilityLabel}
                      </span>
                    </div>

                    <div style={{ marginTop: 8, fontWeight: 950, fontSize: 17 }}>
                      #{order.card.cardNumber} — {order.card.player}
                    </div>

                    <div style={{ marginTop: 3, color: colors.mutedText, fontWeight: 750, fontSize: 13 }}>
                      {getSetNameFromCard(order.card)}
                      {order.card.team ? ` • ${order.card.team}` : ""}
                      {order.card.subset ? ` • ${order.card.subset}` : ""}
                      {order.card.variant ? ` • ${order.card.variant}` : ""}
                    </div>

                    <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap", color: colors.subtext, fontSize: 13 }}>
                      <span>
                        <b>Qty:</b> {order.quantity}
                      </span>
                      <span>
                        <b>Fee paid:</b> {formatDollarsFromCents(order.feePaidCents)}
                      </span>
                      <span>
                        <b>Raw value:</b> {formatDollarsFromCents(order.rawBookValueCents)}
                      </span>
                      <span>
                        <b>Submitted:</b> {formatDateTime(order.createdAt)}
                      </span>
                      <span>
                        <b>Ready:</b> {formatDateTime(order.readyAt)}
                      </span>
                    </div>

                    {order.status === "PENDING" ? (
                      <div style={{ marginTop: 8, color: colors.blue, fontWeight: 900, fontSize: 13 }}>
                        Time remaining: {formatRemaining(order.millisecondsRemaining)}
                      </div>
                    ) : null}

                    {order.status === "READY" ? (
                      <div style={{ marginTop: 8, color: statusStyle.color, fontWeight: 950, fontSize: 13 }}>
                        Your VCS return mailer is ready to open.
                      </div>
                    ) : null}

                    {order.results.length > 0 ? (
                      <div style={{ marginTop: 10, display: "grid", gap: 7 }}>
                        <ResultPills results={order.results} />
                        <div style={{ color: colors.green, fontWeight: 950, fontSize: 13 }}>
                          Total revealed value: {formatDollarsFromCents(order.totalRevealedValueCents)}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                    {canReveal ? (
                      <button
                        onClick={() => openRevealModal(order.id)}
                        disabled={isRevealing}
                        style={{
                          border: "1px solid #7a5200",
                          background: isRevealing
                            ? "#f0d28a"
                            : "linear-gradient(135deg, #6f4700, #d89b1d 50%, #fff0a8)",
                          color: "#1b1202",
                          borderRadius: 999,
                          padding: "10px 13px",
                          fontWeight: 1000,
                          cursor: isRevealing ? "not-allowed" : "pointer",
                          whiteSpace: "nowrap",
                          boxShadow: canReveal ? "0 10px 24px rgba(122,82,0,0.18)" : "none",
                        }}
                      >
                        {isRevealing ? "Opening…" : "Open Mailer"}
                      </button>
                    ) : null}

                    <Link
                      href={`/cards/${order.card.id}`}
                      style={{
                        color: colors.blue,
                        fontWeight: 900,
                        fontSize: 13,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Card details
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}