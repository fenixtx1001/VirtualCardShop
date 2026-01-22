// src/app/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SummaryRow = {
  productId: string;
  uniqueOwned: number;
  totalQty: number;
  totalCards: number;
  percentComplete: number;
  packImageUrl: string | null;
};

// Soft, cozy palette (no loud colors)
const colors = {
  bg: "#fbfaf7", // warm off-white
  card: "#ffffff",
  border: "#e7e3dc",
  text: "#1f1f1f",
  subtext: "#5a5a5a",
  accent: "#2f6fed", // modern accent (used sparingly)
  muted: "#f2efe9",
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNum(v: any, fallback = 0) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

// ✅ Friendly name from productId (no DB changes)
function formatProductId(productId: string) {
  const s = String(productId || "").trim();
  if (!s) return "—";

  // Turn underscores into spaces, collapse whitespace
  const spaced = s.replace(/_/g, " ").replace(/\s+/g, " ").trim();

  // Optional tiny polish: "MLB" stays "MLB", etc. (keep simple for now)
  return spaced;
}

export default function HomePage() {
  const [sets, setSets] = useState<SummaryRow[]>([]);
  const [progressError, setProgressError] = useState<string | null>(null);

  async function loadProgress() {
    setProgressError(null);

    try {
      const res = await fetch("/api/collection/summary", { cache: "no-store" });
      const raw = await res.text();

      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Collection summary returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) {
        throw new Error(j?.error ?? `Failed to load collection summary (${res.status})`);
      }

      // Your endpoint returns an ARRAY, not { ok, sets }
      const arr = Array.isArray(j) ? (j as SummaryRow[]) : [];
      setSets(arr);
    } catch (e: any) {
      setProgressError(e?.message ?? "Failed to load set progress");
      setSets([]);
    }
  }

  useEffect(() => {
    loadProgress();
  }, []);

  const actionCards = useMemo(
    () => [
      {
        title: "Open Packs",
        subtitle: "Turn unopened packs into cards and momentum.",
        href: "/inventory",
      },
      {
        title: "Go to Shop",
        subtitle: "Grab packs and boxes from the era you love.",
        href: "/shop",
      },
      {
        title: "View Collection",
        subtitle: "Browse your cards, sets, and progress.",
        href: "/collection",
      },
    ],
    []
  );

  const sortedSets = useMemo(() => {
    const copy = [...sets];
    copy.sort((a, b) => safeNum(b.percentComplete) - safeNum(a.percentComplete));
    return copy;
  }, [sets]);

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
      {/* Cozy container */}
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Hero */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -0.5 }}>
            Virtual Card Shop
          </div>
          <div style={{ color: colors.subtext, fontSize: 15, lineHeight: 1.5, maxWidth: 760 }}>
            A clean, modern collector’s space — with that 90s feeling of ripping packs, organizing sets,
            and chasing the next big pull.
          </div>
        </div>

        {/* Centerpiece actions */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
            marginBottom: 18,
          }}
        >
          {actionCards.map((c) => (
            <Link
              key={c.title}
              href={c.href}
              style={{
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div
                style={{
                  background: colors.card,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 16,
                  padding: 16,
                  boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
                  transition: "transform 120ms ease, box-shadow 120ms ease",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 18px rgba(0,0,0,0.06)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(0px)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 0 rgba(0,0,0,0.03)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{c.title}</div>
                  <div style={{ fontWeight: 900, color: colors.accent, fontSize: 18 }}>→</div>
                </div>
                <div style={{ marginTop: 8, color: colors.subtext, fontSize: 13, lineHeight: 1.4 }}>
                  {c.subtitle}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Secondary actions (subtle, not competing) */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 22 }}>
          <Link href="/rip-log" style={{ color: colors.subtext, textDecoration: "underline", fontWeight: 700 }}>
            Rip Log
          </Link>
          <Link href="/admin" style={{ color: colors.subtext, textDecoration: "underline", fontWeight: 700 }}>
            Admin
          </Link>
        </div>

        {/* Sets in progress (cozy dashboard — not “work”) */}
        <div
          style={{
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900 }}>Sets in Progress</div>
              <div style={{ marginTop: 4, color: colors.subtext, fontSize: 13 }}>
                Closest-to-complete first — like your binder checklist, but calmer.
              </div>
            </div>

            <button
              onClick={loadProgress}
              style={{
                border: `1px solid ${colors.border}`,
                background: colors.muted,
                borderRadius: 10,
                padding: "8px 10px",
                fontWeight: 800,
                cursor: "pointer",
              }}
              title="Refresh progress"
            >
              Refresh
            </button>
          </div>

          {progressError ? (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                background: "#fff1f1",
                border: "1px solid #f3b7b7",
                borderRadius: 12,
              }}
            >
              {progressError}
            </div>
          ) : null}

          {sortedSets.length === 0 ? (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                border: `1px dashed ${colors.border}`,
                borderRadius: 12,
                color: colors.subtext,
              }}
            >
              <div style={{ fontWeight: 900, color: colors.text, marginBottom: 6 }}>No progress to show yet.</div>
              <div style={{ fontSize: 13, lineHeight: 1.45 }}>
                Rip some packs and your progress bars will start showing up here.
              </div>
              <div style={{ marginTop: 10 }}>
                <Link href="/shop" style={{ textDecoration: "underline", fontWeight: 800, color: colors.accent }}>
                  Go to Shop →
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              {sortedSets.map((s) => {
                const pct = clamp(safeNum(s.percentComplete), 0, 100);
                const displayName = formatProductId(s.productId);

                return (
                  <div
                    key={s.productId}
                    style={{
                      border: `1px solid ${colors.border}`,
                      borderRadius: 12,
                      padding: 12,
                      background: "#fff",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 900 }}>{displayName}</div>
                      <div style={{ color: colors.subtext, fontWeight: 800, fontSize: 13 }}>
                        {pct.toFixed(1)}% • {safeNum(s.uniqueOwned)}/{safeNum(s.totalCards)} unique • {safeNum(s.totalQty)} cards owned
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div
                      style={{
                        marginTop: 10,
                        height: 10,
                        borderRadius: 999,
                        background: colors.muted,
                        overflow: "hidden",
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: colors.accent,
                          borderRadius: 999,
                          transition: "width 200ms ease",
                        }}
                      />
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <Link
                        href={`/collection/${encodeURIComponent(s.productId)}`}
                        style={{ textDecoration: "underline", fontWeight: 800, color: colors.accent }}
                      >
                        View Set
                      </Link>
                      <Link
                        href={`/checklist/${encodeURIComponent(s.productId)}`}
                        style={{ textDecoration: "underline", fontWeight: 800, color: colors.subtext }}
                      >
                        Checklist
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
