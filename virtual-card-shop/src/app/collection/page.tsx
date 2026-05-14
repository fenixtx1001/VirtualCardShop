// src/app/collection/page.tsx
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

  // ✅ NEW
  totalValueCents: number;
};

type PrestigeLevelRow = {
  productSetId: string;
  totalCards: number;
  level: number;
  nextLevel: number;
  nextPct: number;
  cardsAtNextLevel?: number;
  cardsNeededForNext?: number;
  completedOnce: boolean;
};

type CompletionFilter = "all" | "inProgress" | "complete";
type SortMode = "completeDesc" | "nameAsc" | "valueDesc" | "qtyDesc";

const colors = {
  bg: "#fbfaf7",
  card: "#ffffff",
  border: "#e7e3dc",
  text: "#121212",
  subtext: "#333333",
  mutedText: "#5a5a5a",
  muted: "#f2efe9",
  accent: "#2f6fed",
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNum(v: any, fallback = 0) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function formatDollars(cents: number) {
  const c = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return (c / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

// ✅ Friendly name from productId (no DB changes)
function formatProductName(productId: string) {
  const s = String(productId || "").trim();
  if (!s) return "—";

  return s
    .replace(/_/g, " ")
    .replace(/\bBase\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForSearch(value: string) {
  return formatProductName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSearchQuery(row: SummaryRow, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = `${normalizeForSearch(row.productId)} ${String(row.productId ?? "")
    .toLowerCase()
    .replace(/_/g, " ")}`;

  const terms = q
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean);

  return terms.every((term) => haystack.includes(term));
}

function prestigeSummaryText(prestige: PrestigeLevelRow | undefined, totalCardsFallback: number) {
  if (!prestige) return "Prestige loading…";

  const level = safeNum(prestige.level);
  const nextLevel = safeNum(prestige.nextLevel, level + 1);
  const nextPct = clamp(safeNum(prestige.nextPct), 0, 100);
  const totalCards = safeNum(prestige.totalCards, totalCardsFallback);
  const needed =
    typeof prestige.cardsNeededForNext === "number"
      ? Math.max(0, prestige.cardsNeededForNext)
      : Math.max(0, totalCards - Math.round((nextPct / 100) * totalCards));

  return `${level}× prestige • ${nextPct.toFixed(nextPct >= 99.95 ? 0 : 1)}% to ${nextLevel}× • ${needed.toLocaleString()} needed`;
}

function PrestigePill({ prestige }: { prestige: PrestigeLevelRow | undefined }) {
  const level = prestige ? safeNum(prestige.level) : 0;

  return (
    <span
      title={prestige ? `Current prestige level: ${level}×` : "Prestige loading"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: `1px solid ${colors.border}`,
        background: level > 0 ? "#eef4ff" : colors.muted,
        color: level > 0 ? "#21447b" : colors.mutedText,
        borderRadius: 999,
        padding: "4px 8px",
        fontSize: 12,
        fontWeight: 950,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: level > 0 ? colors.accent : "#999",
          display: "inline-block",
        }}
      />
      {level}×
    </span>
  );
}

function ImgThumb({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  const url = (src ?? "").trim();

  if (!url || broken) {
    return (
      <div
        aria-label={`${alt} missing`}
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          border: `1px dashed ${colors.border}`,
          background: colors.muted,
          display: "grid",
          placeItems: "center",
          fontSize: 11,
          color: colors.mutedText,
          fontWeight: 800,
        }}
        title="No pack image"
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
        width: 44,
        height: 44,
        borderRadius: 10,
        objectFit: "cover",
        border: `1px solid ${colors.border}`,
        background: "#fff",
        display: "block",
      }}
    />
  );
}

export default function CollectionPage() {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [prestigeById, setPrestigeById] = useState<Record<string, PrestigeLevelRow>>({});

  const [searchText, setSearchText] = useState("");
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("completeDesc");

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

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/collection/summary", { cache: "no-store" });
      const raw = await res.text();

      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Collection summary returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed to load (${res.status})`);

      const arr = Array.isArray(j) ? (j as SummaryRow[]) : [];
      setRows(arr);
      await loadPrestigeLevels(arr.map((x) => x.productId));
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load collection");
      setRows([]);
      setPrestigeById({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredAndSorted = useMemo(() => {
    const q = searchText.trim();

    const copy = rows.filter((r) => {
      const pct = clamp(safeNum(r.percentComplete), 0, 100);

      const matchesSearch = matchesSearchQuery(r, q);
      const matchesCompletion =
        completionFilter === "all" ||
        (completionFilter === "complete" && pct >= 100) ||
        (completionFilter === "inProgress" && pct < 100);

      return matchesSearch && matchesCompletion;
    });

    copy.sort((a, b) => {
      const aName = formatProductName(a.productId);
      const bName = formatProductName(b.productId);
      const aPct = safeNum(a.percentComplete);
      const bPct = safeNum(b.percentComplete);
      const aValue = safeNum(a.totalValueCents);
      const bValue = safeNum(b.totalValueCents);
      const aQty = safeNum(a.totalQty);
      const bQty = safeNum(b.totalQty);

      if (sortMode === "nameAsc") return aName.localeCompare(bName);
      if (sortMode === "valueDesc") return bValue - aValue || aName.localeCompare(bName);
      if (sortMode === "qtyDesc") return bQty - aQty || aName.localeCompare(bName);

      return bPct - aPct || aName.localeCompare(bName);
    });

    return copy;
  }, [completionFilter, rows, searchText, sortMode]);

  const completeCount = useMemo(
    () => rows.filter((r) => clamp(safeNum(r.percentComplete), 0, 100) >= 100).length,
    [rows]
  );

  const inProgressCount = Math.max(0, rows.length - completeCount);
  const filtersActive = !!searchText.trim() || completionFilter !== "all" || sortMode !== "completeDesc";

  function clearFilters() {
    setSearchText("");
    setCompletionFilter("all");
    setSortMode("completeDesc");
  }

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
      <style jsx>{`
        .desktopOnly {
          display: block;
        }
        .mobileOnly {
          display: none;
        }

        @media (max-width: 780px) {
          .desktopOnly {
            display: none;
          }
          .mobileOnly {
            display: block;
          }
          .pageTitle {
            font-size: 28px !important;
          }
          .subText {
            font-size: 14px !important;
            color: #222 !important;
          }
          .filterGrid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 className="pageTitle" style={{ fontSize: 34, fontWeight: 900, marginTop: 0, marginBottom: 6 }}>
              Collection
            </h1>
            <div className="subText" style={{ color: colors.subtext, fontSize: 14, lineHeight: 1.45 }}>
              Click a set to view your owned cards + completion. Checklist shows every card with an owned checkbox.
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button
                onClick={load}
                style={{
                  border: `1px solid ${colors.border}`,
                  background: colors.muted,
                  borderRadius: 10,
                  padding: "8px 10px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Refresh
              </button>

              <Link href="/collection/search" style={{ textDecoration: "underline", fontWeight: 900, color: colors.text }}>
                Search Collection
              </Link>

              <Link href="/inventory" style={{ textDecoration: "underline", fontWeight: 900, color: colors.text }}>
                Inventory
              </Link>

              <Link href="/shop" style={{ textDecoration: "underline", fontWeight: 900, color: colors.text }}>
                Shop
              </Link>
            </div>
          </div>
        </div>

        <hr style={{ margin: "16px 0", borderColor: colors.border }} />

        {err ? (
          <div style={{ marginBottom: 12, padding: 12, background: "#fff1f1", border: "1px solid #f3b7b7", borderRadius: 12 }}>
            {err}
          </div>
        ) : null}

        {loading ? (
          <div style={{ color: colors.subtext, fontWeight: 800 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div
            style={{
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              padding: 16,
              color: colors.subtext,
            }}
          >
            No sets yet. Buy packs in the Shop and your collection will start showing up here.
          </div>
        ) : (
          <>
            <div
              style={{
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: 16,
                padding: 12,
                marginBottom: 14,
                boxShadow: "0 10px 30px rgba(0,0,0,0.03)",
              }}
            >
              <div
                className="filterGrid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px, 1fr) 170px 190px auto",
                  gap: 10,
                  alignItems: "end",
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: colors.mutedText, fontWeight: 900, marginBottom: 5 }}>
                    Find a set
                  </div>
                  <input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Search by set name, year, brand, sport..."
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      border: `1px solid ${colors.border}`,
                      background: "#fff",
                      borderRadius: 10,
                      padding: "9px 10px",
                      fontWeight: 800,
                      outline: "none",
                    }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, color: colors.mutedText, fontWeight: 900, marginBottom: 5 }}>
                    Completion
                  </div>
                  <select
                    value={completionFilter}
                    onChange={(e) => setCompletionFilter(e.target.value as CompletionFilter)}
                    style={{
                      width: "100%",
                      border: `1px solid ${colors.border}`,
                      background: "#fff",
                      borderRadius: 10,
                      padding: "9px 10px",
                      fontWeight: 800,
                    }}
                  >
                    <option value="all">All sets</option>
                    <option value="inProgress">In progress</option>
                    <option value="complete">Complete</option>
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: colors.mutedText, fontWeight: 900, marginBottom: 5 }}>
                    Sort
                  </div>
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    style={{
                      width: "100%",
                      border: `1px solid ${colors.border}`,
                      background: "#fff",
                      borderRadius: 10,
                      padding: "9px 10px",
                      fontWeight: 800,
                    }}
                  >
                    <option value="completeDesc">% complete</option>
                    <option value="nameAsc">Set name</option>
                    <option value="valueDesc">Total value</option>
                    <option value="qtyDesc">Total quantity</option>
                  </select>
                </div>

                <button
                  onClick={clearFilters}
                  disabled={!filtersActive}
                  style={{
                    border: `1px solid ${colors.border}`,
                    background: filtersActive ? colors.muted : "#f7f7f7",
                    borderRadius: 10,
                    padding: "9px 12px",
                    fontWeight: 900,
                    cursor: filtersActive ? "pointer" : "not-allowed",
                    opacity: filtersActive ? 1 : 0.55,
                    whiteSpace: "nowrap",
                  }}
                >
                  Clear
                </button>
              </div>

              <div style={{ marginTop: 10, color: colors.mutedText, fontWeight: 800, fontSize: 12 }}>
                Showing <b style={{ color: colors.text }}>{filteredAndSorted.length.toLocaleString()}</b> of{" "}
                <b style={{ color: colors.text }}>{rows.length.toLocaleString()}</b> sets •{" "}
                <b style={{ color: colors.text }}>{completeCount.toLocaleString()}</b> complete •{" "}
                <b style={{ color: colors.text }}>{inProgressCount.toLocaleString()}</b> in progress
              </div>
            </div>

            {filteredAndSorted.length === 0 ? (
              <div
                style={{
                  background: colors.card,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 16,
                  padding: 16,
                  color: colors.subtext,
                  fontWeight: 800,
                }}
              >
                No sets match those filters.
              </div>
            ) : (
              <>
                {/* ===================== DESKTOP TABLE ===================== */}
                <div className="desktopOnly">
                  <div style={{ overflowX: "auto", border: `1px solid ${colors.border}`, borderRadius: 14, background: colors.card }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1160 }}>
                      <thead style={{ background: "#f7f7f7" }}>
                        <tr>
                          {["Set", "Complete", "Prestige", "Unique Owned", "Total Cards", "Total Qty", "Total Value", "Pack", "Actions"].map((h) => (
                            <th
                              key={h}
                              style={{
                                textAlign: "left",
                                padding: 10,
                                fontSize: 12,
                                letterSpacing: 0.2,
                                color: "#222",
                                borderBottom: `1px solid ${colors.border}`,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAndSorted.map((r, idx) => {
                          const pct = clamp(safeNum(r.percentComplete), 0, 100);
                          const friendly = formatProductName(r.productId);

                          return (
                            <tr key={r.productId} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                              <td style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                                <Link
                                  href={`/collection/${encodeURIComponent(r.productId)}`}
                                  style={{ textDecoration: "underline", color: colors.text }}
                                >
                                  {friendly}
                                </Link>
                              </td>

                              <td style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                                {pct.toFixed(1)}%
                              </td>

                              <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>
                                <div style={{ display: "grid", gap: 5 }}>
                                  <PrestigePill prestige={prestigeById[r.productId]} />
                                  <div style={{ fontSize: 11, color: colors.mutedText, fontWeight: 800, lineHeight: 1.25 }}>
                                    {prestigeSummaryText(prestigeById[r.productId], safeNum(r.totalCards))}
                                  </div>
                                </div>
                              </td>

                              <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{safeNum(r.uniqueOwned)}</td>
                              <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{safeNum(r.totalCards)}</td>
                              <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{safeNum(r.totalQty)}</td>

                              {/* ✅ NEW */}
                              <td style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                                {formatDollars(safeNum(r.totalValueCents))}
                              </td>

                              <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>
                                <ImgThumb src={r.packImageUrl} alt={`${friendly} pack`} />
                              </td>

                              <td style={{ padding: 10, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                                <Link
                                  href={`/collection/${encodeURIComponent(r.productId)}`}
                                  style={{ textDecoration: "underline", fontWeight: 900, color: colors.text, marginRight: 12 }}
                                >
                                  View cards
                                </Link>
                                <Link
                                  href={`/checklist/${encodeURIComponent(r.productId)}`}
                                  style={{ textDecoration: "underline", fontWeight: 900, color: colors.text }}
                                >
                                  Checklist
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ===================== MOBILE CARDS ===================== */}
                <div className="mobileOnly">
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {filteredAndSorted.map((r) => {
                    const pct = clamp(safeNum(r.percentComplete), 0, 100);
                    const friendly = formatProductName(r.productId);

                    return (
                      <div
                        key={r.productId}
                        style={{
                          background: colors.card,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 16,
                          padding: 14,
                        }}
                      >
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                          <ImgThumb src={r.packImageUrl} alt={`${friendly} pack`} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 900, fontSize: 16, color: colors.text, lineHeight: 1.2 }}>
                              {friendly}
                            </div>
                            <div style={{ marginTop: 4, fontSize: 13, color: "#222", fontWeight: 800 }}>
                              {pct.toFixed(1)}% complete
                            </div>
                            <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                              <PrestigePill prestige={prestigeById[r.productId]} />
                              <span style={{ fontSize: 12, color: colors.mutedText, fontWeight: 800 }}>
                                {prestigeSummaryText(prestigeById[r.productId], safeNum(r.totalCards))}
                              </span>
                            </div>
                          </div>
                        </div>

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

                        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div style={{ fontSize: 13, color: "#222", fontWeight: 800 }}>
                            Unique: <span style={{ fontWeight: 900 }}>{safeNum(r.uniqueOwned)}</span> / {safeNum(r.totalCards)}
                          </div>
                          <div style={{ fontSize: 13, color: "#222", fontWeight: 800 }}>
                            Total cards: <span style={{ fontWeight: 900 }}>{safeNum(r.totalQty)}</span>
                          </div>

                          {/* ✅ NEW */}
                          <div style={{ fontSize: 13, color: "#222", fontWeight: 800 }}>
                            Total value: <span style={{ fontWeight: 900 }}>{formatDollars(safeNum(r.totalValueCents))}</span>
                          </div>
                        </div>

                        <div style={{ marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap" }}>
                          <Link
                            href={`/collection/${encodeURIComponent(r.productId)}`}
                            style={{ textDecoration: "underline", fontWeight: 900, color: colors.accent }}
                          >
                            View cards
                          </Link>
                          <Link
                            href={`/checklist/${encodeURIComponent(r.productId)}`}
                            style={{ textDecoration: "underline", fontWeight: 900, color: colors.text }}
                          >
                            Checklist
                          </Link>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
