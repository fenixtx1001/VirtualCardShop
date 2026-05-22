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

type InventoryRow = {
  productId: string;
  packsOwned: number;
  updatedAt: string;
  packPriceCents: number;
  cardsPerPack: number | null;
  packImageUrl: string | null;
};

type InventoryResponse = {
  ok: boolean;
  rows: InventoryRow[];
  error?: string;
};

type PrestigeLevelRow = {
  productSetId: string;
  totalCards: number;
  level: number; // min qty across all cards
  nextLevel: number; // level + 1
  nextPct: number; // 0..100
  cardsAtNextLevel: number;
  cardsNeededForNext: number;
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
  softBlue: "#eef4ff",
  softGold: "#fff7df",
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

  return s
    .replace(/_/g, " ")
    .replace(/\bBase\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDateShort(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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

function ProgressBar({ pct, height = 10 }: { pct: number; height?: number }) {
  const value = clamp(pct, 0, 100);

  return (
    <div
      style={{
        height,
        borderRadius: 999,
        background: colors.muted,
        overflow: "hidden",
        border: `1px solid ${colors.border}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
      }}
    >
      <div
        style={{
          width: `${value}%`,
          height: "100%",
          background: "linear-gradient(90deg, rgba(47,111,237,0.95), rgba(47,111,237,0.58))",
          borderRadius: 999,
          transition: "width 260ms ease",
          boxShadow: "0 6px 14px rgba(47,111,237,0.18)",
        }}
      />
    </div>
  );
}

function PackThumb({ src, alt, size = 58 }: { src: string | null | undefined; alt: string; size?: number }) {
  const resolved = resolveImageUrl(src);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        border: `1px solid ${colors.border}`,
        background: "#fff",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        flex: "0 0 auto",
      }}
      title={alt}
    >
      {resolved ? (
        <img
          src={resolved}
          alt={alt}
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
              parent.innerHTML = `<div style="font-size:11px;color:${colors.subtext};text-align:center">No image</div>`;
            }
          }}
        />
      ) : (
        <div style={{ fontSize: 11, color: colors.subtext, textAlign: "center", padding: 6 }}>No image</div>
      )}
    </div>
  );
}

function PrestigeBadge({ level }: { level: number }) {
  const label = level >= 1 ? labelForMilestoneBadge(level) : "";
  const tone = level >= 1 ? getBadgeTone(level) : null;

  if (!tone || !label) return null;

  return (
    <span
      title={`Prestige milestone reached: ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "4px 9px",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.text,
        fontWeight: 950,
        fontSize: 11,
        lineHeight: 1.15,
        boxShadow: tone.glow,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: tone.dot,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <span>{label}</span>
    </span>
  );
}

function SectionCard({
  title,
  subtitle,
  href,
  linkText,
  children,
}: {
  title: string;
  subtitle: string;
  href?: string;
  linkText?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: 18,
        padding: 14,
        boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 950, letterSpacing: -0.2 }}>{title}</div>
          <div style={{ marginTop: 3, color: colors.subtext, fontSize: 12, lineHeight: 1.4 }}>{subtitle}</div>
        </div>

        {href && linkText ? (
          <Link
            href={href}
            style={{
              textDecoration: "none",
              color: colors.accent,
              fontWeight: 900,
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            {linkText} →
          </Link>
        ) : null}
      </div>

      {children}
    </section>
  );
}

function EmptyMiniState({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 12,
        border: `1px dashed ${colors.border}`,
        borderRadius: 14,
        color: colors.subtext,
        background: "linear-gradient(180deg, #fff, #fbfaf7)",
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  );
}

function MiniSetCard({
  row,
  prestige,
  helper,
}: {
  row: SummaryRow;
  prestige?: PrestigeLevelRow;
  helper: React.ReactNode;
}) {
  const pct = clamp(safeNum(row.percentComplete), 0, 100);
  const displayName = formatProductId(row.productId);
  const totalCards = safeNum(row.totalCards);
  const uniqueOwned = safeNum(row.uniqueOwned);
  const remaining = Math.max(0, totalCards - uniqueOwned);
  const level = safeNum(prestige?.level, 0);

  return (
    <div className="homeMiniCard">
      <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
        <PackThumb src={row.packImageUrl} alt={`${displayName} pack`} size={56} />

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              gap: 7,
              alignItems: "center",
              flexWrap: "wrap",
              minWidth: 0,
            }}
          >
            <Link
              href={`/collection/${encodeURIComponent(row.productId)}`}
              style={{
                color: colors.text,
                textDecoration: "none",
                fontWeight: 950,
                fontSize: 14,
                lineHeight: 1.15,
              }}
            >
              {displayName}
            </Link>
            <PrestigeBadge level={level} />
          </div>

          <div style={{ marginTop: 5, color: colors.subtext, fontSize: 12, fontWeight: 850 }}>
            {pct.toFixed(pct >= 99.95 ? 0 : 1)}% • {remaining === 0 ? "Complete" : `${remaining} left`}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <ProgressBar pct={pct} />
      </div>

      <div style={{ marginTop: 8, color: colors.subtext, fontSize: 12, fontWeight: 800, lineHeight: 1.35 }}>{helper}</div>

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link className="homePillLink primary" href={`/collection/${encodeURIComponent(row.productId)}`}>
          View Set
        </Link>
        <Link className="homePillLink" href={`/checklist/${encodeURIComponent(row.productId)}`}>
          Checklist
        </Link>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [sets, setSets] = useState<SummaryRow[]>([]);
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
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
          cardsAtNextLevel: safeNum(v?.cardsAtNextLevel, 0),
          cardsNeededForNext: safeNum(v?.cardsNeededForNext, 0),
          completedOnce: !!v?.completedOnce,
        };
      }

      setPrestigeById(next);
    } catch {
      setPrestigeById({});
    }
  }

  async function loadInventoryActivity() {
    try {
      const res = await fetch("/api/inventory", { cache: "no-store" });
      const raw = await res.text();
      const j = raw ? JSON.parse(raw) : null;

      if (!res.ok || !j?.ok) {
        setInventoryRows([]);
        return;
      }

      const data = j as InventoryResponse;
      setInventoryRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch {
      setInventoryRows([]);
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

      await Promise.all([loadPrestigeLevels(arr.map((x) => x.productId)), loadInventoryActivity()]);
    } catch (e: any) {
      setProgressError(e?.message ?? "Failed to load set progress");
      setSets([]);
      setInventoryRows([]);
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
        subtitle: "Search, filter, and browse every set.",
        href: "/collection",
        icon: "📚",
      },
    ],
    []
  );

  const collectionByProductId = useMemo(() => {
    const map = new Map<string, SummaryRow>();
    for (const row of sets) map.set(row.productId, row);
    return map;
  }, [sets]);

  const closestToCompletion = useMemo(() => {
    return [...sets]
      .filter((s) => {
        const totalCards = safeNum(s.totalCards);
        const uniqueOwned = safeNum(s.uniqueOwned);
        return totalCards > 0 && uniqueOwned > 0 && uniqueOwned < totalCards;
      })
      .sort((a, b) => {
        const aLeft = safeNum(a.totalCards) - safeNum(a.uniqueOwned);
        const bLeft = safeNum(b.totalCards) - safeNum(b.uniqueOwned);
        if (aLeft !== bLeft) return aLeft - bLeft;
        return safeNum(b.percentComplete) - safeNum(a.percentComplete);
      })
      .slice(0, 5);
  }, [sets]);

  const recentlyActive = useMemo(() => {
    return [...inventoryRows]
      .filter((r) => collectionByProductId.has(r.productId))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((r) => {
        const collection = collectionByProductId.get(r.productId)!;
        return { ...collection, activityDate: r.updatedAt, packsOwned: r.packsOwned };
      })
      .slice(0, 5);
  }, [collectionByProductId, inventoryRows]);

  const prestigeTargets = useMemo(() => {
    return [...sets]
      .map((s) => ({ row: s, prestige: prestigeById[s.productId] }))
      .filter(({ row, prestige }) => {
        const totalCards = safeNum(row.totalCards);
        const uniqueOwned = safeNum(row.uniqueOwned);
        return totalCards > 0 && uniqueOwned >= totalCards && prestige && safeNum(prestige.totalCards) > 0;
      })
      .sort((a, b) => {
        const aPct = safeNum(a.prestige?.nextPct);
        const bPct = safeNum(b.prestige?.nextPct);
        if (bPct !== aPct) return bPct - aPct;
        return formatProductId(a.row.productId).localeCompare(formatProductId(b.row.productId));
      })
      .slice(0, 5);
  }, [prestigeById, sets]);

  const totalSets = sets.length;
  const completeSets = sets.filter((s) => safeNum(s.totalCards) > 0 && safeNum(s.uniqueOwned) >= safeNum(s.totalCards)).length;
  const incompleteSets = Math.max(0, totalSets - completeSets);

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
        .homeActionCard,
        .homeMiniCard {
          transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
        }
        .homeActionCard:hover,
        .homeMiniCard:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.07);
          border-color: rgba(47, 111, 237, 0.26);
        }
        .homeMiniCard {
          border: 1px solid ${colors.border};
          border-radius: 16px;
          padding: 12px;
          background: linear-gradient(180deg, #ffffff, #fbfaf7);
        }
        .homePillLink {
          text-decoration: none;
          font-weight: 900;
          font-size: 12px;
          line-height: 1;
          color: ${colors.subtext};
          background: ${colors.muted};
          border: 1px solid ${colors.border};
          padding: 7px 10px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 32px;
        }
        .homePillLink.primary {
          color: ${colors.text};
          background: #ffffff;
        }
        @media (max-width: 720px) {
          main {
            padding: 14px !important;
          }
          .homeHero {
            padding: 16px !important;
          }
          .homeDashboardGrid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div
          className="homeHero"
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
              Your collecting command center — what to finish next, what you touched recently, and which prestige chase is closest.
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div
                style={{
                  background: colors.softBlue,
                  border: "1px solid #cfe0ff",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 900,
                  color: "#21447b",
                }}
              >
                {totalSets.toLocaleString()} sets
              </div>
              <div
                style={{
                  background: colors.softGold,
                  border: "1px solid #ecd17e",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 900,
                  color: "#6c4d00",
                }}
              >
                {completeSets.toLocaleString()} complete
              </div>
              <div
                style={{
                  background: "#fff",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 900,
                  color: colors.subtext,
                }}
              >
                {incompleteSets.toLocaleString()} in progress
              </div>
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
                className="homeActionCard"
                style={{
                  background: "linear-gradient(180deg, #ffffff, #fbfaf7)",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 16,
                  padding: 16,
                  boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
                  cursor: "pointer",
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

        {progressError ? (
          <div
            style={{
              marginBottom: 14,
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

        <div
          className="homeDashboardGrid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
            alignItems: "start",
          }}
        >
          <SectionCard
            title="Closest to Completion"
            subtitle="The shortest path to finishing a set."
            href="/collection"
            linkText="All sets"
          >
            {closestToCompletion.length === 0 ? (
              <EmptyMiniState>
                No incomplete sets with progress right now. Rip some packs or check your finished sets in Collection.
              </EmptyMiniState>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {closestToCompletion.map((row) => {
                  const remaining = Math.max(0, safeNum(row.totalCards) - safeNum(row.uniqueOwned));

                  return (
                    <MiniSetCard
                      key={row.productId}
                      row={row}
                      prestige={prestigeById[row.productId]}
                      helper={
                        <>
                          <b style={{ color: colors.text }}>{remaining.toLocaleString()}</b> cards left to complete the base set.
                        </>
                      }
                    />
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Next Prestige Targets"
            subtitle="Completed sets closest to another prestige level."
            href="/showcase"
            linkText="Showcase"
          >
            {prestigeTargets.length === 0 ? (
              <EmptyMiniState>
                No prestige targets yet. Complete a base set once and your next chase will show here.
              </EmptyMiniState>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {prestigeTargets.map(({ row, prestige }) => {
                  const level = safeNum(prestige?.level);
                  const nextLevel = safeNum(prestige?.nextLevel, level + 1);
                  const nextPct = safeNum(prestige?.nextPct);
                  const cardsNeededForNext = safeNum(prestige?.cardsNeededForNext);

                  return (
                    <MiniSetCard
                      key={row.productId}
                      row={row}
                      prestige={prestige}
                      helper={
                        <>
                          <b style={{ color: colors.text }}>{cardsNeededForNext.toLocaleString()}</b>{" "}
                          cards needed to reach {nextLevel.toLocaleString()}× prestige. {" "}
                          <b style={{ color: colors.text }}>
                            {nextPct.toFixed(nextPct >= 99.95 ? 0 : 1)}%
                          </b>{" "}
                          there.
                        </>
                      }
                    />
                  );
                })}
              </div>
            )}
          </SectionCard>

          <div style={{ gridColumn: "1 / -1" }}>
            <SectionCard
              title="Recently Active"
              subtitle="Sets tied to your most recently changed pack inventory."
              href="/inventory"
              linkText="Inventory"
            >
              {recentlyActive.length === 0 ? (
                <EmptyMiniState>
                  No recent activity yet. Buy or open packs and this will become your quick “where was I?” list.
                </EmptyMiniState>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: 10,
                  }}
                >
                  {recentlyActive.map((row) => (
                    <MiniSetCard
                      key={row.productId}
                      row={row}
                      prestige={prestigeById[row.productId]}
                      helper={
                        <>
                          Updated <b style={{ color: colors.text }}>{formatDateShort(row.activityDate) || "recently"}</b>
                          {" • "}
                          <b style={{ color: colors.text }}>{safeNum(row.packsOwned).toLocaleString()}</b> packs unopened.
                        </>
                      }
                    />
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
          <button
            onClick={loadProgress}
            style={{
              border: `1px solid ${colors.border}`,
              background: colors.muted,
              borderRadius: 12,
              padding: "9px 12px",
              fontWeight: 900,
              cursor: "pointer",
              minHeight: 38,
            }}
            title="Refresh home dashboard"
          >
            Refresh Dashboard
          </button>
        </div>

        <div style={{ height: 26 }} />
      </div>
    </main>
  );
}
