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

type PrestigeLevelRow = {
  productSetId: string;
  totalCards: number;
  level: number; // min qty across all cards
  nextLevel: number; // level + 1
  nextPct: number; // 0..100
  completedOnce: boolean; // level >= 1
};

const colors = {
  paper: "#fbfaf7",
  card: "#ffffff",
  border: "#e7e3dc",
  text: "#1f1f1f",
  subtext: "#4b4b4b",
  accent: "#2f6fed",
  muted: "#f2efe9",
};

const PRESTIGE_BADGES = [1, 2, 3, 4, 5, 10, 25, 50, 75, 100];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNum(v: any, fallback = 0) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function safeImgSrc(url: string | null | undefined) {
  const u = (url ?? "").trim();
  return u.length ? u : null;
}

function formatProductId(productId: string) {
  const s = String(productId || "").trim();
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * If packImageUrl is absolute -> use as-is
 * If relative -> make absolute with window.location.origin
 */
function resolveImageUrl(maybeUrl: string | null | undefined) {
  const u = safeImgSrc(maybeUrl);
  if (!u) return null;

  if (/^https?:\/\//i.test(u)) return u;
  if (/^data:/i.test(u)) return u;

  const path = u.startsWith("/") ? u : `/${u}`;
  if (typeof window !== "undefined") return `${window.location.origin}${path}`;
  return path;
}

function getCurrentPrestigeMilestone(level: number) {
  const v = Math.max(0, Math.floor(level));
  let current = 0;
  for (const milestone of PRESTIGE_BADGES) {
    if (v >= milestone) current = milestone;
  }
  return current;
}

function labelForMilestoneBadge(level: number) {
  const currentMilestone = getCurrentPrestigeMilestone(level);
  if (currentMilestone <= 0) return "";
  return `${currentMilestone}×`;
}

function getBadgeTone(level: number) {
  const milestone = getCurrentPrestigeMilestone(level);

  if (milestone >= 100) {
    return {
      bg: "linear-gradient(135deg, #fff1bf 0%, #ffd66b 55%, #f4b840 100%)",
      border: "#d7a737",
      text: "#4d3200",
      glow: "0 12px 28px rgba(212, 157, 47, 0.22)",
      dot: "#7a5200",
    };
  }

  if (milestone >= 75) {
    return {
      bg: "linear-gradient(135deg, #ffe9f1 0%, #ffd3e2 100%)",
      border: "#efb3c9",
      text: "#7c2048",
      glow: "0 10px 24px rgba(205, 75, 128, 0.16)",
      dot: "#a52f5f",
    };
  }

  if (milestone >= 50) {
    return {
      bg: "linear-gradient(135deg, #f2eaff 0%, #e5d6ff 100%)",
      border: "#ccb6ff",
      text: "#56308f",
      glow: "0 10px 24px rgba(115, 79, 191, 0.14)",
      dot: "#6d43bf",
    };
  }

  if (milestone >= 25) {
    return {
      bg: "linear-gradient(135deg, #eef6ff 0%, #dcebff 100%)",
      border: "#bfd8ff",
      text: "#184b8b",
      glow: "0 10px 24px rgba(47, 111, 237, 0.12)",
      dot: "#2f6fed",
    };
  }

  if (milestone >= 10) {
    return {
      bg: "linear-gradient(135deg, #fff4e5 0%, #ffe9cc 100%)",
      border: "#f0d1a4",
      text: "#845100",
      glow: "0 8px 20px rgba(214, 141, 27, 0.12)",
      dot: "#b56d10",
    };
  }

  if (milestone >= 5) {
    return {
      bg: "linear-gradient(135deg, #f7f1ea 0%, #f1e4d4 100%)",
      border: "#dec6aa",
      text: "#6d4620",
      glow: "0 8px 18px rgba(120, 83, 36, 0.10)",
      dot: "#9a6530",
    };
  }

  if (milestone >= 4) {
    return {
      bg: "linear-gradient(135deg, #fff6dc 0%, #ffecb0 100%)",
      border: "#ecd17e",
      text: "#6c4d00",
      glow: "0 8px 18px rgba(196, 154, 37, 0.10)",
      dot: "#9b7300",
    };
  }

  if (milestone >= 3) {
    return {
      bg: "linear-gradient(135deg, #f6f7f8 0%, #e9edf1 100%)",
      border: "#cfd7df",
      text: "#39424d",
      glow: "0 8px 18px rgba(102, 117, 133, 0.10)",
      dot: "#677585",
    };
  }

  if (milestone >= 2) {
    return {
      bg: "linear-gradient(135deg, #fff1ea 0%, #ffe0d0 100%)",
      border: "#efc1a8",
      text: "#6b2f12",
      glow: "0 8px 18px rgba(173, 87, 46, 0.10)",
      dot: "#a5532b",
    };
  }

  if (milestone >= 1) {
    return {
      bg: "linear-gradient(135deg, #eef4ff 0%, #dbe8ff 100%)",
      border: "#bfd2ff",
      text: "#21447b",
      glow: "0 8px 18px rgba(47, 111, 237, 0.10)",
      dot: "#2f6fed",
    };
  }

  return null;
}

export default function HomePage() {
  const [sets, setSets] = useState<SummaryRow[]>([]);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [prestigeById, setPrestigeById] = useState<Record<string, PrestigeLevelRow>>({});

  async function loadPrestigeLevels(productSetIds: string[]) {
    const uniq = Array.from(new Set(productSetIds.map((s) => (s ?? "").trim()).filter(Boolean)));
    if (uniq.length === 0) {
      setPrestigeById({});
      return;
    }

    try {
      const res = await fetch(`/api/prestige/levels?ids=${encodeURIComponent(uniq.join(","))}`, {
        cache: "no-store",
      });
      const raw = await res.text();
      const j = raw ? JSON.parse(raw) : null;

      if (!res.ok || !j?.ok || !j?.levels) {
        setPrestigeById({});
        return;
      }

      const next: Record<string, PrestigeLevelRow> = {};
      for (const [k, v] of Object.entries<any>(j.levels)) {
        next[k] = {
          productSetId: String(v?.productSetId ?? k),
          totalCards: safeNum(v?.totalCards, 0),
          level: safeNum(v?.level, 0),
          nextLevel: safeNum(v?.nextLevel, safeNum(v?.level, 0) + 1),
          nextPct: safeNum(v?.nextPct, 0),
          completedOnce: !!v?.completedOnce,
        };
      }

      setPrestigeById(next);
    } catch {
      setPrestigeById({});
    }
  }

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

      const arr = Array.isArray(j) ? (j as SummaryRow[]) : [];
      setSets(arr);

      await loadPrestigeLevels(arr.map((x) => x.productId));
    } catch (e: any) {
      setProgressError(e?.message ?? "Failed to load set progress");
      setSets([]);
      setPrestigeById({});
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
        icon: "📦",
      },
      {
        title: "Go to Shop",
        subtitle: "Grab packs and boxes from the era you love.",
        href: "/shop",
        icon: "🛒",
      },
      {
        title: "View Collection",
        subtitle: "Browse your cards, sets, and progress.",
        href: "/collection",
        icon: "📚",
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
        minHeight: "calc(100vh - 80px)",
        padding: 20,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
        color: colors.text,
        background: `
          radial-gradient(1200px 700px at 15% 10%, rgba(47,111,237,0.08), transparent 60%),
          radial-gradient(900px 600px at 85% 20%, rgba(255,200,80,0.08), transparent 55%),
          radial-gradient(1000px 800px at 55% 95%, rgba(0,0,0,0.04), transparent 60%),
          ${colors.paper}
        `,
      }}
    >
      <style jsx global>{`
        a {
          -webkit-tap-highlight-color: transparent;
        }
        button,
        a,
        input,
        select {
          outline: none;
        }
        button:focus-visible,
        a:focus-visible,
        input:focus-visible,
        select:focus-visible {
          box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.22);
          border-radius: 12px;
        }
      `}</style>

      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div
          style={{
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: 18,
            padding: 18,
            boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
            position: "relative",
            overflow: "hidden",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: -2,
              background:
                "linear-gradient(110deg, rgba(47,111,237,0.10), rgba(255,200,80,0.08), rgba(47,111,237,0.06))",
              filter: "blur(18px)",
              opacity: 0.65,
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative" }}>
            <div
              style={{
                fontSize: "clamp(26px, 4vw, 36px)",
                fontWeight: 950,
                letterSpacing: -0.7,
                lineHeight: 1.08,
              }}
            >
              Virtual Card Shop
            </div>

            <div
              style={{
                marginTop: 8,
                color: colors.subtext,
                fontSize: "clamp(13px, 1.8vw, 15px)",
                lineHeight: 1.6,
                maxWidth: 760,
              }}
            >
              A modern collector’s desk — with that 90s feeling of ripping packs, organizing sets, and chasing the next big pull.
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
            marginBottom: 18,
          }}
        >
          {actionCards.map((c) => (
            <Link key={c.title} href={c.href} style={{ textDecoration: "none", color: "inherit" }}>
              <div
                style={{
                  background: "linear-gradient(180deg, #ffffff, #fbfaf7)",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 16,
                  padding: 16,
                  boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
                  cursor: "pointer",
                  transition: "transform 120ms ease, box-shadow 120ms ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 16px 36px rgba(0,0,0,0.07)";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 0 rgba(0,0,0,0.03)";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 20 }}>{c.icon}</div>
                    <div style={{ fontSize: 17, fontWeight: 950 }}>{c.title}</div>
                  </div>
                  <div style={{ fontWeight: 950, color: colors.accent, fontSize: 18 }}>→</div>
                </div>

                <div style={{ marginTop: 8, color: colors.subtext, fontSize: 13, lineHeight: 1.45 }}>{c.subtitle}</div>
              </div>
            </Link>
          ))}
        </div>

        <div
          style={{
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: 18,
            padding: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 950 }}>Sets in Progress</div>
              <div style={{ marginTop: 4, color: colors.subtext, fontSize: 13, lineHeight: 1.45 }}>
                Closest-to-complete first — like your binder checklist, but cleaner.
              </div>
            </div>

            <button
              onClick={loadProgress}
              style={{
                border: `1px solid ${colors.border}`,
                background: colors.muted,
                borderRadius: 12,
                padding: "9px 12px",
                fontWeight: 900,
                cursor: "pointer",
                height: 38,
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
                fontWeight: 800,
              }}
            >
              {progressError}
            </div>
          ) : null}

          {sortedSets.length === 0 ? (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                border: `1px dashed ${colors.border}`,
                borderRadius: 14,
                color: colors.subtext,
                background: "linear-gradient(180deg, #fff, #fbfaf7)",
              }}
            >
              <div style={{ fontWeight: 950, color: colors.text, marginBottom: 6 }}>No progress to show yet.</div>
              <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                Rip some packs and your progress bars will start showing up here.
              </div>
              <div style={{ marginTop: 10 }}>
                <Link href="/shop" style={{ textDecoration: "underline", fontWeight: 900, color: colors.accent }}>
                  Go to Shop →
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              {sortedSets.map((s) => {
                const pct = clamp(safeNum(s.percentComplete), 0, 100);
                const displayName = formatProductId(s.productId);
                const resolvedPackSrc = resolveImageUrl(s.packImageUrl);

                const totalCards = safeNum(s.totalCards);
                const uniqueOwned = safeNum(s.uniqueOwned);
                const baseComplete = totalCards > 0 && uniqueOwned >= totalCards;

                const prestige = prestigeById[s.productId];
                const level = safeNum(prestige?.level, 0);
                const badgeLabel = level >= 1 ? labelForMilestoneBadge(level) : "";
                const badgeTone = level >= 1 ? getBadgeTone(level) : null;

                return (
                  <div
                    key={s.productId}
                    style={{
                      border: `1px solid ${colors.border}`,
                      borderRadius: 16,
                      padding: 12,
                      background: "linear-gradient(180deg, #ffffff, #fbfaf7)",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "78px 1fr",
                        gap: 12,
                        alignItems: "start",
                      }}
                    >
                      <div
                        style={{
                          width: 78,
                          height: 78,
                          borderRadius: 16,
                          border: `1px solid ${colors.border}`,
                          background: "#fff",
                          display: "grid",
                          placeItems: "center",
                          overflow: "hidden",
                        }}
                        title="Pack art"
                      >
                        {resolvedPackSrc ? (
                          <img
                            src={resolvedPackSrc}
                            alt="Pack"
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                              background: "#fff",
                            }}
                            onError={(e) => {
                              const img = e.currentTarget as HTMLImageElement;
                              img.style.display = "none";
                              const parent = img.parentElement as HTMLElement | null;
                              if (parent) {
                                parent.style.display = "grid";
                                parent.style.placeItems = "center";
                                parent.style.padding = "6px";
                                parent.innerHTML = `<div style="font-size:11px;color:${colors.subtext};text-align:center">Pack image<br/>failed</div>`;
                              }
                            }}
                          />
                        ) : (
                          <div style={{ fontSize: 11, color: colors.subtext, textAlign: "center", padding: 6 }}>
                            No pack
                            <br />
                            image
                          </div>
                        )}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            flexWrap: "wrap",
                            alignItems: "baseline",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 950,
                              fontSize: 15,
                              lineHeight: 1.2,
                              minWidth: 200,
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <span>{displayName}</span>

                            {badgeTone && badgeLabel ? (
                              <span
                                title={`Prestige milestone reached: ${badgeLabel}`}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 7,
                                  padding: "4px 9px",
                                  borderRadius: 999,
                                  border: `1px solid ${badgeTone.border}`,
                                  background: badgeTone.bg,
                                  color: badgeTone.text,
                                  fontWeight: 950,
                                  fontSize: 11,
                                  lineHeight: 1.15,
                                  boxShadow: badgeTone.glow,
                                }}
                              >
                                <span
                                  aria-hidden
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: 999,
                                    background: badgeTone.dot,
                                    display: "inline-block",
                                    flexShrink: 0,
                                  }}
                                />
                                <span>{badgeLabel}</span>
                              </span>
                            ) : null}
                          </div>

                          <div
                            style={{
                              color: colors.subtext,
                              fontWeight: 850,
                              fontSize: 13,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {pct.toFixed(1)}% • {safeNum(s.uniqueOwned)}/{safeNum(s.totalCards)} unique • {safeNum(s.totalQty)} owned
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: 10,
                            height: 12,
                            borderRadius: 999,
                            background: colors.muted,
                            overflow: "hidden",
                            border: `1px solid ${colors.border}`,
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              background: "linear-gradient(90deg, rgba(47,111,237,0.92), rgba(47,111,237,0.62))",
                              borderRadius: 999,
                              transition: "width 220ms ease",
                              boxShadow: "0 6px 14px rgba(47,111,237,0.18)",
                            }}
                          />
                        </div>

                        {baseComplete ? (
                          <div style={{ marginTop: 8, fontSize: 12, color: colors.subtext, fontWeight: 850 }}>
                            <span style={{ color: colors.text, fontWeight: 950 }}>
                              Completed {Math.max(1, Math.floor(level || 1))}×
                            </span>
                            {prestige ? (
                              <>
                                <span> • </span>
                                <span>
                                  {safeNum(prestige.nextPct, 0).toFixed(1)}% to {Math.max(2, safeNum(prestige.nextLevel, level + 1))}×
                                </span>
                              </>
                            ) : null}
                          </div>
                        ) : null}

                        <div
                          style={{
                            marginTop: 8,
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          <Link
                            href={`/collection/${encodeURIComponent(s.productId)}`}
                            style={{
                              textDecoration: "none",
                              fontWeight: 900,
                              fontSize: 13,
                              lineHeight: 1,
                              color: colors.text,
                              background: "#fff",
                              border: `1px solid ${colors.border}`,
                              padding: "6px 10px",
                              borderRadius: 999,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              minHeight: 34,
                            }}
                          >
                            View Set <span style={{ color: colors.accent }}>→</span>
                          </Link>

                          <Link
                            href={`/checklist/${encodeURIComponent(s.productId)}`}
                            style={{
                              textDecoration: "none",
                              fontWeight: 900,
                              fontSize: 13,
                              lineHeight: 1,
                              color: colors.subtext,
                              background: colors.muted,
                              border: `1px solid ${colors.border}`,
                              padding: "6px 10px",
                              borderRadius: 999,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              minHeight: 34,
                            }}
                          >
                            Checklist
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ height: 26 }} />
      </div>
    </main>
  );
}