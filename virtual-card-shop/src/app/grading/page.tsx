// src/app/grading/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  page: number;
  pageSize: number;
  totalPages: number;
  totalOrders: number;
  orders: GradingOrderRow[];
};

type StatusFilter = "ALL" | "PENDING" | "READY" | "REVEALED";

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

function ImgThumb({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  const url = (src ?? "").trim();

  if (!url || broken) {
    return (
      <div
        style={{
          width: 72,
          height: 98,
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
        width: 72,
        height: 98,
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
        padding: "4px 7px",
        fontSize: 11,
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
            padding: "4px 7px",
            fontSize: 11,
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
  const [filter, setFilter] = useState<StatusFilter>("READY");
  const [page, setPage] = useState(1);
  const [pageJump, setPageJump] = useState("1");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [revealingId, setRevealingId] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  const [revealOrderId, setRevealOrderId] = useState<number | null>(null);
  const [revealPayload, setRevealPayload] = useState<RevealPayload | null>(null);
  const [revealStage, setRevealStage] = useState<RevealStage>("closed");

  async function load(nextFilter = filter, nextPage = page) {
    setLoading(true);
    setErr(null);

    try {
      const qs = new URLSearchParams();
      if (nextFilter !== "ALL") qs.set("status", nextFilter);
      qs.set("page", String(nextPage));
      qs.set("pageSize", "25");

      const res = await fetch(`/api/grading/orders?${qs.toString()}`, {
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

      const nextData = json as ApiResponse;
      setData(nextData);

      if (nextData.page !== nextPage) {
        setPage(nextData.page);
      }
      setPageJump(String(nextData.page));

      if (
        nextFilter === "READY" &&
        nextData.counts.READY === 0 &&
        nextData.counts.PENDING > 0
      ) {
        setFilter("PENDING");
        setPage(1);
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load grading orders");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  function chooseFilter(nextFilter: StatusFilter) {
    if (nextFilter === filter) return;
    setFilter(nextFilter);
    setPage(1);
    setPageJump("1");
  }

  function goToPage(nextPage: number) {
    const totalPages = data?.totalPages ?? 1;
    const safePage = Math.max(1, Math.min(totalPages, Math.floor(nextPage)));
    if (safePage === page) return;
    setPage(safePage);
    setPageJump(String(safePage));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submitPageJump() {
    const parsed = Number.parseInt(pageJump, 10);
    if (!Number.isInteger(parsed)) {
      setPageJump(String(page));
      return;
    }
    goToPage(parsed);
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

      await load(filter, page);
    } catch (e: any) {
      setRevealStage("closed");
      setErr(e?.message ?? "Failed to reveal order");
    } finally {
      setRevealingId(null);
    }
  }

  useEffect(() => {
    load(filter, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const orders = data?.orders ?? [];
  const totalOrders = data?.totalOrders ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const pageSize = data?.pageSize ?? 25;
  const firstOrderNumber = totalOrders === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastOrderNumber = Math.min(totalOrders, page * pageSize);

  return (
    <main
      className="gradingPage"
      style={{
        background: colors.bg,
        minHeight: "calc(100vh - 80px)",
        padding: 20,
        color: colors.text,
      }}
    >
      <style>
        {`
          .gradingHeaderActions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }

          .gradingStatusFilters {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 6px;
          }

          .gradingStatusButton {
            min-width: 0;
            border-radius: 11px;
            padding: 8px 8px;
            font-size: 12px;
            line-height: 1.1;
            font-weight: 950;
            cursor: pointer;
            white-space: nowrap;
          }

          .gradingPagination {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
          }

          .gradingPaginationActions {
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .gradingOrderCard {
            background: ${colors.card};
            border: 1px solid ${colors.border};
            border-radius: 15px;
            padding: 11px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.025);
            display: grid;
            grid-template-columns: auto minmax(0, 1fr) auto;
            gap: 12px;
            align-items: center;
          }

          .gradingOrderActions {
            display: grid;
            gap: 7px;
            justify-items: end;
            align-self: stretch;
            align-content: center;
          }

          .gradingOpenMailer {
            border: 1px solid #7a5200;
            color: #1b1202;
            border-radius: 999px;
            padding: 9px 12px;
            font-weight: 1000;
            white-space: nowrap;
          }

          @media (max-width: 720px) {
            .gradingPage {
              padding: 12px 10px 18px !important;
            }

            .gradingPageHeader {
              gap: 10px !important;
            }

            .gradingPageTitle {
              font-size: 27px !important;
              margin-bottom: 3px !important;
            }

            .gradingPageSubtitle {
              font-size: 12.5px !important;
              line-height: 1.35 !important;
            }

            .gradingHeaderActions {
              width: 100%;
              gap: 6px;
            }

            .gradingHeaderActions > * {
              flex: 1 1 0;
              text-align: center;
              justify-content: center;
              min-height: 36px;
              padding: 8px 8px !important;
              font-size: 12px;
            }

            .gradingStatusPanel {
              padding: 8px !important;
              border-radius: 13px !important;
              margin-bottom: 10px !important;
            }

            .gradingStatusButton {
              padding: 7px 4px;
              font-size: 11px;
            }

            .gradingStatusButtonCount {
              display: block;
              margin-top: 2px;
              font-size: 10px;
              font-weight: 850;
            }

            .gradingPagination {
              gap: 7px;
              margin-bottom: 9px !important;
            }

            .gradingPaginationSummary {
              width: 100%;
              font-size: 11px !important;
            }

            .gradingPaginationActions {
              flex: 1;
            }

            .gradingPaginationActions button {
              min-height: 32px;
              padding: 6px 9px !important;
              font-size: 11px;
            }

            .gradingJump {
              margin-left: auto;
            }

            .gradingOrderList {
              gap: 8px !important;
            }

            .gradingOrderCard {
              grid-template-columns: 72px minmax(0, 1fr);
              gap: 10px;
              padding: 9px;
              align-items: start;
            }

            .gradingOrderActions {
              grid-column: 2;
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 8px;
              align-self: auto;
              margin-top: 2px;
            }

            .gradingOpenMailer {
              padding: 8px 10px !important;
              font-size: 11px;
            }

            .gradingCardTitle {
              font-size: 15px !important;
              line-height: 1.18 !important;
              margin-top: 5px !important;
            }

            .gradingCardMeta {
              margin-top: 2px !important;
              font-size: 11.5px !important;
              line-height: 1.3 !important;
            }

            .gradingCardValueLine {
              margin-top: 6px !important;
              font-size: 11.5px !important;
            }

            .gradingCardDetails {
              font-size: 11.5px !important;
            }
          }
        `}
      </style>

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
        <div
          className="gradingPageHeader"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              className="gradingPageTitle"
              style={{ fontSize: 34, fontWeight: 950, marginTop: 0, marginBottom: 6 }}
            >
              VCS Grading
            </h1>
            <div
              className="gradingPageSubtitle"
              style={{ color: colors.subtext, fontSize: 14, fontWeight: 750, lineHeight: 1.45 }}
            >
              Open ready mailers, track pending cards, and review your revealed grades.
            </div>
          </div>

          <div className="gradingHeaderActions">
            <button
              onClick={() => load(filter, page)}
              disabled={loading}
              className="vcs-button vcs-button-secondary vcs-button-compact"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>

            <Link
              href="/collection/slabs"
              className="vcs-button vcs-button-secondary vcs-button-compact"
              style={{ textDecoration: "none" }}
            >
              Slab Gallery
            </Link>

            <Link
              href="/collection"
              className="vcs-button vcs-button-secondary vcs-button-compact"
              style={{ textDecoration: "none" }}
            >
              Collection
            </Link>
          </div>
        </div>

        <hr style={{ margin: "13px 0", borderColor: colors.border }} />

        <div
          className="gradingStatusPanel"
          style={{
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: 15,
            padding: 10,
            marginBottom: 11,
          }}
        >
          <div className="gradingStatusFilters">
            {(["ALL", "PENDING", "READY", "REVEALED"] as StatusFilter[]).map((status) => {
              const count = data?.counts?.[status] ?? 0;
              const active = filter === status;
              const label = status === "ALL" ? "All" : status[0] + status.slice(1).toLowerCase();

              return (
                <button
                  key={status}
                  className="gradingStatusButton"
                  onClick={() => chooseFilter(status)}
                  style={{
                    border: `1px solid ${
                      active
                        ? status === "READY"
                          ? "#d7ad49"
                          : colors.blue
                        : colors.border
                    }`,
                    background: active
                      ? status === "READY"
                        ? colors.goldSoft
                        : colors.blueSoft
                      : "#fff",
                    color: active
                      ? status === "READY"
                        ? colors.gold
                        : colors.blue
                      : colors.text,
                  }}
                >
                  {label}
                  <span
                    className="gradingStatusButtonCount"
                    style={{ color: active ? "inherit" : colors.mutedText, marginLeft: 4 }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {err ? (
          <div
            style={{
              marginBottom: 10,
              padding: 10,
              background: colors.redSoft,
              border: "1px solid #f3b7b7",
              borderRadius: 11,
              color: colors.red,
              fontWeight: 900,
              fontSize: 12,
            }}
          >
            {err}
          </div>
        ) : null}

        {!loading && totalOrders > 0 ? (
          <div className="gradingPagination" style={{ marginBottom: 10 }}>
            <div
              className="gradingPaginationSummary"
              style={{ color: colors.mutedText, fontWeight: 800, fontSize: 12 }}
            >
              Showing {firstOrderNumber}–{lastOrderNumber} of {totalOrders}
            </div>

            <div className="gradingPaginationActions">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1 || loading}
                className="vcs-button vcs-button-secondary vcs-button-compact"
              >
                ‹ Prev
              </button>
              <span style={{ fontSize: 11.5, fontWeight: 900, whiteSpace: "nowrap" }}>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages || loading}
                className="vcs-button vcs-button-secondary vcs-button-compact"
              >
                Next ›
              </button>
            </div>

            {totalPages > 1 ? (
              <div className="gradingJump" style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageJump}
                  onChange={(e) => setPageJump(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitPageJump();
                  }}
                  aria-label="Jump to grading page"
                  style={{
                    width: 48,
                    minHeight: 32,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 9,
                    padding: "5px 6px",
                    fontWeight: 850,
                    fontSize: 11,
                  }}
                />
                <button
                  type="button"
                  onClick={submitPageJump}
                  className="vcs-button vcs-button-secondary vcs-button-compact"
                >
                  Go
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <div style={{ color: colors.subtext, fontWeight: 900, fontSize: 13 }}>
            Loading grading orders…
          </div>
        ) : orders.length === 0 ? (
          <div
            style={{
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 15,
              padding: 16,
              color: colors.subtext,
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            {filter === "READY"
              ? "No mailers are ready to reveal."
              : filter === "PENDING"
                ? "No grading orders are currently pending."
                : filter === "REVEALED"
                  ? "No revealed grading orders yet."
                  : "No grading orders yet. Go to a collection set, choose a raw card, and submit it for VCS grading."}
          </div>
        ) : (
          <div className="gradingOrderList" style={{ display: "grid", gap: 10 }}>
            {orders.map((order) => {
              const canReveal = order.status === "READY";
              const isRevealing = revealingId === order.id;
              const isRevealed = order.status === "REVEALED" || order.status === "COMPLETED";
              const remainingMs =
                order.status === "PENDING" && order.readyAt
                  ? Math.max(0, new Date(order.readyAt).getTime() - Date.now())
                  : order.millisecondsRemaining;

              return (
                <div key={order.id} className="gradingOrderCard">
                  <ImgThumb src={order.card.frontImageUrl} alt={order.card.player} />

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <StatusPill status={order.status} />
                      {order.quantity > 1 ? (
                        <span
                          style={{
                            color: colors.mutedText,
                            fontSize: 10.5,
                            fontWeight: 900,
                          }}
                        >
                          Qty {order.quantity}
                        </span>
                      ) : null}
                    </div>

                    <div
                      className="gradingCardTitle"
                      style={{ marginTop: 6, fontWeight: 950, fontSize: 16.5, lineHeight: 1.2 }}
                    >
                      #{order.card.cardNumber} — {order.card.player}
                    </div>

                    <div
                      className="gradingCardMeta"
                      style={{
                        marginTop: 3,
                        color: colors.mutedText,
                        fontWeight: 750,
                        fontSize: 12.5,
                        lineHeight: 1.35,
                      }}
                    >
                      {getSetNameFromCard(order.card)}
                      {order.card.team ? ` • ${order.card.team}` : ""}
                      {order.card.subset ? ` • ${order.card.subset}` : ""}
                      {order.card.variant ? ` • ${order.card.variant}` : ""}
                    </div>

                    <div
                      className="gradingCardValueLine"
                      style={{
                        marginTop: 7,
                        color: colors.subtext,
                        fontWeight: 800,
                        fontSize: 12.5,
                      }}
                    >
                      {order.status === "PENDING" ? (
                        <>
                          Raw {formatDollarsFromCents(order.rawBookValueCents)}
                          <span style={{ color: colors.mutedText }}>
                            {" "}• Ready in {formatRemaining(remainingMs + tick * 0)}
                          </span>
                        </>
                      ) : canReveal ? (
                        <>Raw {formatDollarsFromCents(order.rawBookValueCents)}</>
                      ) : isRevealed && order.results.length > 0 ? (
                        <ResultPills results={order.results} />
                      ) : null}
                    </div>

                    {isRevealed && order.results.length > 0 ? (
                      <div
                        style={{
                          marginTop: 5,
                          color: colors.green,
                          fontWeight: 900,
                          fontSize: 11.5,
                        }}
                      >
                        Value {formatDollarsFromCents(order.totalRevealedValueCents)}
                      </div>
                    ) : null}
                  </div>

                  <div className="gradingOrderActions">
                    {canReveal ? (
                      <button
                        onClick={() => openRevealModal(order.id)}
                        disabled={isRevealing}
                        className="gradingOpenMailer"
                        style={{
                          background: isRevealing
                            ? "#f0d28a"
                            : "linear-gradient(135deg, #6f4700, #d89b1d 50%, #fff0a8)",
                          cursor: isRevealing ? "not-allowed" : "pointer",
                          boxShadow: "0 8px 20px rgba(122,82,0,0.14)",
                        }}
                      >
                        {isRevealing ? "Opening…" : "Open Mailer"}
                      </button>
                    ) : null}

                    <Link
                      href={`/cards/${order.card.id}`}
                      className="gradingCardDetails"
                      style={{
                        color: colors.blue,
                        fontWeight: 900,
                        fontSize: 12.5,
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

        {!loading && totalPages > 1 && orders.length > 0 ? (
          <div
            style={{
              marginTop: 11,
              display: "flex",
              justifyContent: "center",
              gap: 8,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="vcs-button vcs-button-secondary vcs-button-compact"
            >
              ‹ Prev
            </button>
            <span style={{ color: colors.mutedText, fontWeight: 850, fontSize: 11.5 }}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="vcs-button vcs-button-secondary vcs-button-compact"
            >
              Next ›
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
