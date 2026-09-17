"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type SummaryRow = {
  productId: string;
  uniqueOwned: number;
  totalQty: number;
  totalCards: number;
  percentComplete: number;
  packImageUrl: string | null;
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

type CompletionFilter =
  | "all"
  | "inProgress"
  | "complete"
  | "closePrestige";

type SortMode =
  | "completeDesc"
  | "prestigeClose"
  | "nameAsc"
  | "valueDesc"
  | "qtyDesc";

type IconKind = "search" | "refresh" | "arrow" | "chevron";

function safeNum(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value: number) {
  return safeNum(value).toLocaleString("en-US");
}

function formatMoney(cents: number) {
  return (safeNum(cents) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number) {
  const pct = clamp(safeNum(value), 0, 100);
  if (pct >= 100) return "100%";
  return `${pct.toFixed(1)}%`;
}

function formatProductName(productId: string) {
  const value = String(productId || "").trim();

  if (!value) return "Unknown set";

  return value
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

function matchesSearch(row: SummaryRow, query: string) {
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((term) => term.trim())
    .filter(Boolean);

  if (!terms.length) return true;

  const haystack = `${normalizeForSearch(row.productId)} ${String(
    row.productId || ""
  )
    .toLowerCase()
    .replace(/_/g, " ")}`;

  return terms.every((term) => haystack.includes(term));
}

function prestigeFacts(
  prestige: PrestigeLevelRow | undefined,
  fallbackTotalCards: number
) {
  if (!prestige) return null;

  const level = Math.max(0, safeNum(prestige.level));
  const nextLevel = Math.max(
    level + 1,
    safeNum(prestige.nextLevel, level + 1)
  );

  const totalCards = Math.max(
    0,
    safeNum(prestige.totalCards, fallbackTotalCards)
  );

  const nextPct = clamp(safeNum(prestige.nextPct), 0, 100);

  const cardsAtNextLevel =
    typeof prestige.cardsAtNextLevel === "number"
      ? clamp(safeNum(prestige.cardsAtNextLevel), 0, totalCards)
      : Math.round((nextPct / 100) * totalCards);

  const cardsNeededForNext =
    typeof prestige.cardsNeededForNext === "number"
      ? Math.max(0, safeNum(prestige.cardsNeededForNext))
      : Math.max(0, totalCards - cardsAtNextLevel);

  return {
    level,
    nextLevel,
    totalCards,
    nextPct,
    cardsAtNextLevel,
    cardsNeededForNext,
  };
}

function prestigeGoalText(
  prestige: PrestigeLevelRow | undefined,
  fallbackTotalCards: number
) {
  const facts = prestigeFacts(prestige, fallbackTotalCards);

  if (!facts) return "Prestige progress unavailable";

  if (facts.cardsNeededForNext <= 0) {
    return `Ready for Prestige ${facts.nextLevel}×`;
  }

  return `${formatNumber(facts.cardsNeededForNext)} ${
    facts.cardsNeededForNext === 1 ? "card" : "cards"
  } to Prestige ${facts.nextLevel}×`;
}

function Icon({ kind }: { kind: IconKind }) {
  const paths: Record<IconKind, React.ReactNode> = {
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 5v5h-5M4 19v-5h5" />
        <path d="M19 10a7 7 0 0 0-12-5M5 14a7 7 0 0 0 12 5" />
      </>
    ),
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    chevron: <path d="m9 6 6 6-6 6" />,
  };

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}

function PackArt({
  src,
  alt,
  eager = false,
}: {
  src: string | null;
  alt: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const url = (src || "").trim();

  return (
    <span className="collection-art">
      {url && !failed ? (
        <img
          src={url}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="collection-art-fallback" aria-label="Pack image unavailable">
          <strong>VCS</strong>
          <span>SET</span>
        </span>
      )}
    </span>
  );
}

function LoadingCards() {
  return (
    <div className="collection-grid collection-loading" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="collection-loading-card" key={index}>
          <span className="collection-loading-art" />
          <div>
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CollectionView() {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [prestigeById, setPrestigeById] = useState<
    Record<string, PrestigeLevelRow>
  >({});

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [searchText, setSearchText] = useState("");
  const [completionFilter, setCompletionFilter] =
    useState<CompletionFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("completeDesc");

  const loadPrestigeLevels = useCallback(async (ids: string[]) => {
    const uniqueIds = Array.from(
      new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))
    );

    if (!uniqueIds.length) return {};

    try {
      const response = await fetch(
        `/api/prestige/levels?ids=${encodeURIComponent(uniqueIds.join(","))}`,
        { cache: "no-store" }
      );

      const raw = await response.text();
      const data = raw ? JSON.parse(raw) : null;

      if (!response.ok || !data?.ok || !data?.levels) return {};

      const next: Record<string, PrestigeLevelRow> = {};

      for (const [key, value] of Object.entries(
        data.levels as Record<string, any>
      )) {
        next[key] = {
          productSetId: String(value?.productSetId ?? key),
          totalCards: safeNum(value?.totalCards),
          level: safeNum(value?.level),
          nextLevel: safeNum(
            value?.nextLevel,
            safeNum(value?.level) + 1
          ),
          nextPct: safeNum(value?.nextPct),
          cardsAtNextLevel: safeNum(value?.cardsAtNextLevel),
          cardsNeededForNext: safeNum(value?.cardsNeededForNext),
          completedOnce: Boolean(value?.completedOnce),
        };
      }

      return next;
    } catch {
      return {};
    }
  }, []);

  const load = useCallback(
    async (background = false) => {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const response = await fetch("/api/collection/summary", {
          cache: "no-store",
        });

        const raw = await response.text();

        let data: unknown = null;

        try {
          data = raw ? JSON.parse(raw) : null;
        } catch {
          throw new Error(
            `Collection summary returned invalid data (${response.status}).`
          );
        }

        if (!response.ok) {
          const apiError =
            data && typeof data === "object" && "error" in data
              ? String((data as { error?: unknown }).error || "")
              : "";

          throw new Error(
            apiError || `Couldn't load your collection (${response.status}).`
          );
        }

        const nextRows = Array.isArray(data)
          ? (data as SummaryRow[])
          : [];

        const nextPrestige = await loadPrestigeLevels(
          nextRows.map((row) => row.productId)
        );

        setRows(nextRows);
        setPrestigeById(nextPrestige);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Couldn't load your collection.";

        setError(message);

        if (!background) {
          setRows([]);
          setPrestigeById({});
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadPrestigeLevels]
  );

  useEffect(() => {
    void load(false);

    const refresh = () => {
      if (document.visibilityState === "visible") {
        void load(true);
      }
    };

    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("vcs:collection-changed", refresh);
    window.addEventListener("vcs:economy-changed", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("vcs:collection-changed", refresh);
      window.removeEventListener("vcs:economy-changed", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const completeCount = useMemo(
    () =>
      rows.filter(
        (row) =>
          clamp(safeNum(row.percentComplete), 0, 100) >= 100
      ).length,
    [rows]
  );

  const inProgressCount = Math.max(0, rows.length - completeCount);

  const totalValueCents = useMemo(
    () =>
      rows.reduce(
        (sum, row) => sum + safeNum(row.totalValueCents),
        0
      ),
    [rows]
  );

  const closePrestigeCount = useMemo(
    () =>
      rows.filter((row) => {
        const facts = prestigeFacts(
          prestigeById[row.productId],
          safeNum(row.totalCards)
        );

        return (
          facts !== null &&
          facts.cardsNeededForNext > 0 &&
          facts.cardsNeededForNext <= 10
        );
      }).length,
    [prestigeById, rows]
  );

  const filteredAndSorted = useMemo(() => {
    const filtered = rows.filter((row) => {
      const pct = clamp(safeNum(row.percentComplete), 0, 100);

      if (!matchesSearch(row, searchText)) return false;

      if (completionFilter === "complete" && pct < 100) {
        return false;
      }

      if (completionFilter === "inProgress" && pct >= 100) {
        return false;
      }

      if (completionFilter === "closePrestige") {
        const facts = prestigeFacts(
          prestigeById[row.productId],
          safeNum(row.totalCards)
        );

        return Boolean(
          facts &&
            facts.cardsNeededForNext > 0 &&
            facts.cardsNeededForNext <= 10
        );
      }

      return true;
    });

    filtered.sort((a, b) => {
      const aName = formatProductName(a.productId);
      const bName = formatProductName(b.productId);

      const aPct = clamp(safeNum(a.percentComplete), 0, 100);
      const bPct = clamp(safeNum(b.percentComplete), 0, 100);

      if (sortMode === "nameAsc") {
        return aName.localeCompare(bName);
      }

      if (sortMode === "valueDesc") {
        return (
          safeNum(b.totalValueCents) -
            safeNum(a.totalValueCents) ||
          aName.localeCompare(bName)
        );
      }

      if (sortMode === "qtyDesc") {
        return (
          safeNum(b.totalQty) - safeNum(a.totalQty) ||
          aName.localeCompare(bName)
        );
      }

      if (sortMode === "prestigeClose") {
        const aFacts = prestigeFacts(
          prestigeById[a.productId],
          safeNum(a.totalCards)
        );

        const bFacts = prestigeFacts(
          prestigeById[b.productId],
          safeNum(b.totalCards)
        );

        const aNeeded =
          aFacts && aFacts.cardsNeededForNext > 0
            ? aFacts.cardsNeededForNext
            : Number.POSITIVE_INFINITY;

        const bNeeded =
          bFacts && bFacts.cardsNeededForNext > 0
            ? bFacts.cardsNeededForNext
            : Number.POSITIVE_INFINITY;

        return (
          aNeeded - bNeeded ||
          bPct - aPct ||
          aName.localeCompare(bName)
        );
      }

      return bPct - aPct || aName.localeCompare(bName);
    });

    return filtered;
  }, [
    completionFilter,
    prestigeById,
    rows,
    searchText,
    sortMode,
  ]);

  const filtersActive =
    Boolean(searchText.trim()) ||
    completionFilter !== "all" ||
    sortMode !== "completeDesc";

  function clearFilters() {
    setSearchText("");
    setCompletionFilter("all");
    setSortMode("completeDesc");
  }

  const sortCaption =
    sortMode === "prestigeClose"
      ? "closest to prestige"
      : sortMode === "nameAsc"
      ? "set name"
      : sortMode === "valueDesc"
      ? "total value"
      : sortMode === "qtyDesc"
      ? "total quantity"
      : "% complete";

  return (
    <main className="collection-shell">
      <header className="collection-masthead">
        <div className="collection-masthead-copy">
          <span className="collection-eyebrow">
            MY COLLECTION
          </span>

          <h1>Collection</h1>

          {!loading && (
            <div className="collection-summary">
              <span>
                <strong>{formatNumber(rows.length)}</strong> sets
              </span>

              <i>·</i>

              <span>
                <strong>{formatNumber(completeCount)}</strong>{" "}
                complete
              </span>

              <i>·</i>

              <span>
                <strong>{formatNumber(inProgressCount)}</strong>{" "}
                in progress
              </span>

              <i>·</i>

              <span>
                <strong>{formatMoney(totalValueCents)}</strong>{" "}
                value
              </span>
            </div>
          )}
        </div>

        <div className="collection-masthead-actions">
          <Link
            href="/collection/search"
            className="collection-text-link"
          >
            Search cards
            <Icon kind="arrow" />
          </Link>

          <button
            type="button"
            className={`collection-icon-button ${
              refreshing ? "is-refreshing" : ""
            }`}
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label={
              refreshing
                ? "Refreshing collection"
                : "Refresh collection"
            }
            title="Refresh collection"
          >
            <Icon kind="refresh" />
          </button>
        </div>
      </header>

      <nav
        className="collection-tabs"
        aria-label="Collection navigation"
      >
        <Link
          href="/collection"
          className="is-active"
          aria-current="page"
        >
          Sets
        </Link>

        <Link href="/collection/slabs">Slabs</Link>
        <Link href="/inventory">Inventory</Link>
        <Link href="/shop">Shop</Link>
      </nav>

      {!loading && rows.length > 0 && (
        <>
          <section
            className="collection-toolbar"
            aria-label="Collection filters"
          >
            <label className="collection-search">
              <Icon kind="search" />

              <span className="collection-sr-only">
                Search sets
              </span>

              <input
                type="search"
                value={searchText}
                onChange={(event) =>
                  setSearchText(event.target.value)
                }
                placeholder="Search sets, years, brands..."
                autoComplete="off"
              />
            </label>

            <label className="collection-select">
              <span className="collection-sr-only">
                Completion filter
              </span>

              <select
                value={completionFilter}
                onChange={(event) =>
                  setCompletionFilter(
                    event.target.value as CompletionFilter
                  )
                }
                aria-label="Filter collection"
              >
                <option value="all">All sets</option>
                <option value="inProgress">In progress</option>
                <option value="complete">Complete</option>
                <option value="closePrestige">
                  ≤10 to prestige
                </option>
              </select>
            </label>

            <label className="collection-select">
              <span className="collection-sr-only">
                Sort collection
              </span>

              <select
                value={sortMode}
                onChange={(event) =>
                  setSortMode(event.target.value as SortMode)
                }
                aria-label="Sort collection"
              >
                <option value="completeDesc">% complete</option>
                <option value="prestigeClose">
                  Closest to prestige
                </option>
                <option value="valueDesc">Total value</option>
                <option value="qtyDesc">Total quantity</option>
                <option value="nameAsc">Set name</option>
              </select>
            </label>

            {filtersActive && (
              <button
                type="button"
                className="collection-clear"
                onClick={clearFilters}
              >
                Clear
              </button>
            )}
          </section>

          <div className="collection-list-tools">
            <span role="status">
              <strong>
                {formatNumber(filteredAndSorted.length)}
              </strong>{" "}
              {filteredAndSorted.length === 1 ? "set" : "sets"}

              <span className="collection-sort-caption">
                {" "}
                · {sortCaption}
              </span>
            </span>

            {closePrestigeCount > 0 && (
              <button
                type="button"
                className="collection-close-shortcut"
                onClick={() =>
                  setCompletionFilter("closePrestige")
                }
              >
                <strong>
                  {formatNumber(closePrestigeCount)}
                </strong>{" "}
                close to prestige
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <div className="collection-notice" role="alert">
          <div>
            <strong>Collection couldn&apos;t refresh.</strong>
            <span>{error}</span>
          </div>

          <button
            type="button"
            onClick={() => void load(rows.length > 0)}
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <LoadingCards />
      ) : rows.length === 0 ? (
        <section className="collection-empty">
          <div className="collection-empty-mark">VCS</div>
          <h2>Your collection is waiting.</h2>
          <p>
            Open some packs and your sets will begin appearing
            here.
          </p>

          <Link href="/shop" className="collection-primary">
            Visit the Shop
            <Icon kind="arrow" />
          </Link>
        </section>
      ) : filteredAndSorted.length === 0 ? (
        <section className="collection-empty">
          <div className="collection-empty-mark">—</div>
          <h2>No sets match those filters.</h2>
          <p>
            Try another search or return to your full collection.
          </p>

          <button
            type="button"
            className="collection-secondary"
            onClick={clearFilters}
          >
            Show all sets
          </button>
        </section>
      ) : (
        <section
          className="collection-grid"
          aria-label="Your card sets"
        >
          {filteredAndSorted.map((row, index) => {
            const pct = clamp(
              safeNum(row.percentComplete),
              0,
              100
            );

            const friendlyName = formatProductName(
              row.productId
            );

            const facts = prestigeFacts(
              prestigeById[row.productId],
              safeNum(row.totalCards)
            );

            const isComplete = pct >= 100;

            const progressPercent =
              isComplete && facts ? facts.nextPct : pct;

            const isClose =
              facts !== null &&
              facts.cardsNeededForNext > 0 &&
              facts.cardsNeededForNext <= 10;

            const isVeryClose =
              facts !== null &&
              facts.cardsNeededForNext > 0 &&
              facts.cardsNeededForNext <= 3;

            const progressLabel =
              isComplete && facts
                ? `To Prestige ${facts.nextLevel}×`
                : "Set completion";

            return (
              <article
                className={[
                  "collection-set",
                  isClose ? "is-close" : "",
                  isVeryClose ? "is-very-close" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={row.productId}
              >
                <Link
                  href={`/collection/${encodeURIComponent(
                    row.productId
                  )}`}
                  className="collection-set-main"
                  aria-label={`Open ${friendlyName}`}
                >
                  <PackArt
                    src={row.packImageUrl}
                    alt={`${friendlyName} pack`}
                    eager={index < 4}
                  />

                  <div className="collection-set-body">
                    <div className="collection-set-title-row">
                      <h2>{friendlyName}</h2>

                      <span
                        className={`collection-completion ${
                          isComplete ? "is-complete" : ""
                        }`}
                      >
                        {formatPercent(pct)}
                      </span>
                    </div>

                    <div className="collection-prestige-row">
                      <span className="collection-prestige-badge">
                        {facts
                          ? `Prestige ${facts.level}×`
                          : "Prestige —"}
                      </span>

                      <strong
                        className={
                          isClose ? "is-close-text" : ""
                        }
                      >
                        {prestigeGoalText(
                          prestigeById[row.productId],
                          safeNum(row.totalCards)
                        )}
                      </strong>
                    </div>

                    <div className="collection-progress-heading">
                      <span>{progressLabel}</span>

                      <span>
                        {formatPercent(progressPercent)}
                      </span>
                    </div>

                    <div
                      className="collection-track"
                      role="progressbar"
                      aria-label={`${friendlyName}: ${progressLabel}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progressPercent)}
                    >
                      <span
                        style={{
                          width: `${clamp(
                            progressPercent,
                            0,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <span className="collection-chevron">
                    <Icon kind="chevron" />
                  </span>
                </Link>

                <footer className="collection-set-footer">
                  <div className="collection-facts">
                    <span>
                      <strong>
                        {formatNumber(
                          safeNum(row.uniqueOwned)
                        )}
                      </strong>
                      /{formatNumber(safeNum(row.totalCards))}{" "}
                      unique
                    </span>

                    <span>
                      <strong>
                        {formatNumber(safeNum(row.totalQty))}
                      </strong>{" "}
                      cards
                    </span>

                    <span>
                      <strong>
                        {formatMoney(
                          safeNum(row.totalValueCents)
                        )}
                      </strong>{" "}
                      value
                    </span>
                  </div>

                  <Link
                    href={`/checklist/${encodeURIComponent(
                      row.productId
                    )}`}
                    className="collection-checklist-link"
                    aria-label={`Open ${friendlyName} checklist`}
                  >
                    Checklist
                    <Icon kind="arrow" />
                  </Link>
                </footer>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
