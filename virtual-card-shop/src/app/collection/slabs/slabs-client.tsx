"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import VcsSlab, {
  type SlabRegistry,
} from "@/components/grading/VcsSlab";

type SortMode =
  | "grade_desc"
  | "value_desc"
  | "total_value_desc"
  | "player_asc"
  | "year_desc"
  | "newest"
  | "random";

type SlabRow = {
  key: string;
  cardId: number;
  player: string;
  cardNumber: string;
  team: string | null;
  subset: string | null;
  variant: string | null;

  productId: string;
  productYear: number | null;
  productBrand: string | null;
  productSport: string | null;

  productSetId: string | null;
  productSetName: string | null;
  productSetIsBase: boolean | null;

  frontImageUrl: string | null;
  backImageUrl: string | null;

  grade: number;
  gradeLabel: string;

  quantity: number;

  rawBookValueCents: number;
  valueCents: number;
  totalValueCents: number;

  gradedAt: string | null;
};

type ApiResponse = {
  ok: boolean;

  q: string;
  grade: string;
  sport: string;
  year: string;
  sort: SortMode;

  page: number;
  pageSize: number;
  total: number;
  totalPages: number;

  totalQuantity: number;
  totalValueCents: number;

  countsByGrade: {
    "6": number;
    "7": number;
    "8": number;
    "9": number;
    "10": number;
  };

  sports: string[];
  years: number[];

  rows: SlabRow[];
};

type PopulationBucket = {
  grade: number;
  label: string;
  quantity: number;
  percentage: number;
};

type PopulationResponse = {
  ok: boolean;
  population: {
    uniqueOwners: number;
    totalOwned: number;
    totalOwnedIncludingPending: number;
    raw: number;
    graded: number;
    pendingGrading: number;
    totalValueCents: number;
    gradeBreakdown: PopulationBucket[];
  };
};

const STORAGE_KEY = "vcs:slabs:view:v3";

const SORT_LABELS: Record<SortMode, string> = {
  grade_desc: "Highest grade",
  value_desc: "Highest card value",
  total_value_desc: "Largest position",
  newest: "Newest graded",
  player_asc: "Player A–Z",
  year_desc: "Newest year",
  random: "Shuffle",
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function number(value: number) {
  return value.toLocaleString("en-US");
}

function formatDate(value: string | null) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return "Date unavailable";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function setName(row: SlabRow) {
  const set = row.productSetName?.trim();

  const product = [row.productYear, row.productBrand]
    .filter((value) => value != null && String(value).trim())
    .join(" ");

  if (!set) return product || row.productId;

  const cleanSet = set.toLowerCase().replace(/\s+/g, " ").trim();

  if (
    cleanSet === "base" ||
    cleanSet === "base set" ||
    cleanSet === "base cards"
  ) {
    return product || set;
  }

  const productLower = product.toLowerCase();

  if (
    product &&
    !cleanSet.includes(String(row.productYear ?? "").toLowerCase()) &&
    row.productBrand &&
    !cleanSet.includes(row.productBrand.toLowerCase()) &&
    !productLower.includes(cleanSet)
  ) {
    return `${product} · ${set}`;
  }

  return set;
}

function Icon({
  kind,
}: {
  kind:
    | "search"
    | "filter"
    | "close"
    | "arrow"
    | "shuffle"
    | "refresh"
    | "population";
}) {
  const path = {
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    filter: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="2" />
        <circle cx="15" cy="17" r="2" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    shuffle: (
      <>
        <path d="M3 6h3c4 0 8 12 12 12h3" />
        <path d="m17 14 4 4-4 4" />
        <path d="M3 18h3c1.5 0 2.8-1 4-2.5" />
        <path d="M14 8c1.3-1.2 2.5-2 4-2h3" />
        <path d="m17 2 4 4-4 4" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 5v5h-5M4 19v-5h5" />
        <path d="M19 10a7 7 0 0 0-12-5M5 14a7 7 0 0 0 12 5" />
      </>
    ),
    population: (
      <>
        <circle cx="8" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M2.5 20c.8-4 3-6 5.5-6s4.7 2 5.5 6" />
        <path d="M14 15c2.8-.8 5.6.8 7 4.5" />
      </>
    ),
  }[kind];

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
      {path}
    </svg>
  );
}

function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const oldOverflow = document.body.style.overflow;

    dialog.showModal();
    document.body.style.overflow = "hidden";

    return () => {
      dialog.close();
      document.body.style.overflow = oldOverflow;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="slabs-sheet"
      aria-labelledby="slabs-sheet-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="slabs-sheet-inner">
        <header className="slabs-sheet-header">
          <h2 id="slabs-sheet-title">{title}</h2>

          <button
            className="slabs-icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon kind="close" />
          </button>
        </header>

        {children}
      </div>
    </dialog>
  );
}

function PopulationPanel({
  population,
  loading,
  error,
  grade,
  onRetry,
}: {
  population: PopulationResponse | null;
  loading: boolean;
  error: string;
  grade: number;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="slabs-pop-loading" role="status">
        Loading population report…
      </div>
    );
  }

  if (error) {
    return (
      <div className="slabs-notice" role="alert">
        {error}
        <button onClick={onRetry}>Retry</button>
      </div>
    );
  }

  if (!population) return null;

  const atGrade =
    population.population.gradeBreakdown.find(
      (bucket) => bucket.grade === grade
    )?.quantity ?? 0;

  const gradedBuckets = population.population.gradeBreakdown.filter(
    (bucket) => bucket.grade >= 6
  );

  return (
    <div className="slabs-population">
      <div className="slabs-pop-lead">
        <div>
          <span>POP AT VCS {grade}</span>
          <strong>{number(atGrade)}</strong>
        </div>

        <div>
          <span>TOTAL GRADED</span>
          <strong>{number(population.population.graded)}</strong>
        </div>

        <div>
          <span>OWNERS</span>
          <strong>{number(population.population.uniqueOwners)}</strong>
        </div>
      </div>

      <div className="slabs-pop-bars">
        {gradedBuckets.map((bucket) => {
          const max = Math.max(
            1,
            ...gradedBuckets.map((item) => item.quantity)
          );

          return (
            <div key={bucket.grade}>
              <span>VCS {bucket.grade}</span>

              <i>
                <b
                  style={{
                    width: `${(bucket.quantity / max) * 100}%`,
                  }}
                />
              </i>

              <strong>{number(bucket.quantity)}</strong>
            </div>
          );
        })}
      </div>

      <p>
        Population includes graded copies owned across the VCS universe.
        Raw cards and pending grading are not included in the graded total.
      </p>
    </div>
  );
}

function FocusViewer({
  rows,
  index,
  setIndex,
  page,
  totalPages,
  onClose,
  persist,
}: {
  rows: SlabRow[];
  index: number;
  setIndex: (index: number) => void;
  page: number;
  totalPages: number;
  onClose: () => void;
  persist: () => void;
}) {
  const row = rows[index];
  const [flipped, setFlipped] = useState(false);
  const [populationOpen, setPopulationOpen] = useState(false);
  const [population, setPopulation] =
    useState<PopulationResponse | null>(null);
  const [populationLoading, setPopulationLoading] = useState(false);
  const [populationError, setPopulationError] = useState("");

  const touchStart = useRef<number | null>(null);

  const loadPopulation = useCallback(async () => {
    if (!row) return;

    setPopulationLoading(true);
    setPopulationError("");

    try {
      const response = await fetch(
        `/api/cards/${encodeURIComponent(String(row.cardId))}/population`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error || "Population report is unavailable."
        );
      }

      setPopulation(data as PopulationResponse);
    } catch (error) {
      setPopulationError(
        error instanceof Error
          ? error.message
          : "Population report is unavailable."
      );
    } finally {
      setPopulationLoading(false);
    }
  }, [row]);

  useEffect(() => {
    setFlipped(false);
    setPopulationOpen(false);
    setPopulation(null);
    setPopulationError("");
    void loadPopulation();
  }, [row?.key, loadPopulation]);

  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();

      if (event.key === "ArrowLeft" && index > 0) {
        setIndex(index - 1);
      }

      if (event.key === "ArrowRight" && index < rows.length - 1) {
        setIndex(index + 1);
      }

      if (event.key.toLowerCase() === "f") {
        setFlipped((value) => !value);
      }
    }

    window.addEventListener("keydown", keydown);

    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", keydown);
    };
  }, [index, onClose, rows.length, setIndex]);

  if (!row) return null;

  const atGrade =
    population?.population.gradeBreakdown.find(
      (bucket) => bucket.grade === row.grade
    )?.quantity ?? null;

  const registry: SlabRegistry = {
    cardId: row.cardId,
    gradedAt: row.gradedAt,
    atGrade,
    totalGraded: population?.population.graded ?? null,
    totalOwned: population?.population.totalOwned ?? null,
  };

  function go(delta: number) {
    const next = Math.max(
      0,
      Math.min(rows.length - 1, index + delta)
    );

    if (next !== index) setIndex(next);
  }

  return (
    <div
      className="slabs-focus"
      role="dialog"
      aria-modal="true"
      aria-label={`${row.player} slab`}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchStart.current == null) return;

        const end =
          event.changedTouches[0]?.clientX ?? touchStart.current;

        const delta = end - touchStart.current;

        if (Math.abs(delta) > 55) {
          if (delta > 0) go(-1);
          else go(1);
        }

        touchStart.current = null;
      }}
    >
      <div className="slabs-focus-ambient" />

      <header className="slabs-focus-header">
        <button
          className="slabs-focus-close"
          onClick={onClose}
        >
          <Icon kind="close" />
          <span>Close</span>
        </button>

        <div>
          <span>VCS SLAB GALLERY</span>
          <strong>
            {index + 1} / {rows.length}
          </strong>
        </div>

        <span className="slabs-focus-page">
          Page {page}
          {totalPages > 1 ? ` / ${totalPages}` : ""}
        </span>
      </header>

      <div className="slabs-focus-stage">
        <div className="slabs-focus-object-area">
          <button
            className="slabs-focus-arrow slabs-focus-prev"
            disabled={index <= 0}
            onClick={() => go(-1)}
            aria-label="Previous slab"
          >
            ‹
          </button>

          <div className="slabs-focus-object">
            <VcsSlab
              player={row.player}
              cardNumber={row.cardNumber}
              setName={setName(row)}
              team={row.team}
              grade={row.grade}
              imageUrl={row.frontImageUrl}
              backImageUrl={row.backImageUrl}
              flipped={flipped}
              onFlip={() => setFlipped((value) => !value)}
              registry={registry}
            />

            <button
              className="slabs-flip-hint"
              onClick={() => setFlipped((value) => !value)}
            >
              <span>{flipped ? "Front" : "Back"}</span>
              <small>
                {flipped
                  ? "Return to card front"
                  : "Flip slab · card back + registry"}
              </small>
            </button>
          </div>

          <button
            className="slabs-focus-arrow slabs-focus-next"
            disabled={index >= rows.length - 1}
            onClick={() => go(1)}
            aria-label="Next slab"
          >
            ›
          </button>
        </div>

        <aside className="slabs-focus-info">
          <span className="slabs-eyebrow">
            VCS {row.grade} ·{" "}
            {row.productSport || "GRADED CARD"}
          </span>

          <h2>{row.player}</h2>

          <p className="slabs-focus-set">
            {setName(row)} · #{row.cardNumber}
          </p>

          {row.team && (
            <p className="slabs-focus-team">{row.team}</p>
          )}

          <div className="slabs-focus-value">
            <div>
              <span>EST. VALUE</span>
              <strong>{money(row.valueCents)}</strong>
            </div>

            {row.quantity > 1 && (
              <div>
                <span>YOU OWN</span>
                <strong>×{number(row.quantity)}</strong>
              </div>
            )}
          </div>

          <div className="slabs-focus-facts">
            <div>
              <span>Graded</span>
              <strong>{formatDate(row.gradedAt)}</strong>
            </div>

            <div>
              <span>Population</span>
              <strong>
                {atGrade == null
                  ? populationLoading
                    ? "Loading…"
                    : "View report"
                  : `${number(atGrade)} at VCS ${row.grade}`}
              </strong>
            </div>
          </div>

          <div className="slabs-focus-actions">
            <button
              className={
                populationOpen
                  ? "slabs-secondary slabs-secondary-active"
                  : "slabs-secondary"
              }
              onClick={() =>
                setPopulationOpen((value) => !value)
              }
            >
              <Icon kind="population" />
              Population
            </button>

            <Link
              href={`/cards/${row.cardId}`}
              className="slabs-primary"
              onClick={persist}
            >
              Card details
              <Icon kind="arrow" />
            </Link>
          </div>

          {populationOpen && (
            <PopulationPanel
              population={population}
              loading={populationLoading}
              error={populationError}
              grade={row.grade}
              onRetry={() => void loadPopulation()}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function FilterSheet({
  sort,
  setSort,
  sport,
  setSport,
  year,
  setYear,
  sports,
  years,
  activeCount,
  total,
  onReset,
  onClose,
}: {
  sort: SortMode;
  setSort: (sort: SortMode) => void;
  sport: string;
  setSport: (sport: string) => void;
  year: string;
  setYear: (year: string) => void;
  sports: string[];
  years: number[];
  activeCount: number;
  total: number;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Filter & sort" onClose={onClose}>
      <div className="slabs-filter-fields">
        <label>
          Sort gallery
          <select
            value={sort}
            onChange={(event) =>
              setSort(event.target.value as SortMode)
            }
          >
            {Object.entries(SORT_LABELS).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              )
            )}
          </select>
        </label>

        <label>
          Sport
          <select
            value={sport}
            onChange={(event) =>
              setSport(event.target.value)
            }
          >
            <option value="ALL">All sports</option>

            {sports.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label>
          Year
          <select
            value={year}
            onChange={(event) =>
              setYear(event.target.value)
            }
          >
            <option value="ALL">All years</option>

            {years.map((item) => (
              <option key={item} value={String(item)}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <footer className="slabs-sheet-actions">
        <button
          className="slabs-text-button"
          onClick={onReset}
          disabled={activeCount === 0 && sort === "grade_desc"}
        >
          Reset
        </button>

        <button
          className="slabs-primary"
          onClick={onClose}
        >
          Show {number(total)}{" "}
          {total === 1 ? "slab type" : "slab types"}
          <Icon kind="arrow" />
        </button>
      </footer>
    </Sheet>
  );
}

function GalleryTile({
  row,
  onOpen,
}: {
  row: SlabRow;
  onOpen: () => void;
}) {
  return (
    <article className="slabs-tile">
      <button
        className="slabs-display"
        onClick={onOpen}
        aria-label={`View ${row.player} VCS ${row.grade} slab`}
      >
        <span className="slabs-spotlight" />

        <span className="slabs-object">
          <VcsSlab
            player={row.player}
            cardNumber={row.cardNumber}
            setName={setName(row)}
            team={row.team}
            grade={row.grade}
            imageUrl={row.frontImageUrl}
            backImageUrl={row.backImageUrl}
            registry={{
              cardId: row.cardId,
              gradedAt: row.gradedAt,
            }}
          />
        </span>
      </button>

      <div className="slabs-tile-copy">
        <h3>{row.player}</h3>

        <p>
          {setName(row)} · #{row.cardNumber}
        </p>

        <div>
          <strong>{money(row.valueCents)}</strong>

          {row.quantity > 1 ? (
            <span>
              ×{number(row.quantity)} ·{" "}
              {money(row.totalValueCents)} total
            </span>
          ) : (
            <span>VCS {row.grade}</span>
          )}
        </div>
      </div>
    </article>
  );
}

export default function SlabsClient() {
  const [data, setData] = useState<ApiResponse | null>(null);

  const [queryInput, setQueryInput] = useState("");
  const [q, setQ] = useState("");

  const [grade, setGrade] = useState("ALL");
  const [sport, setSport] = useState("ALL");
  const [year, setYear] = useState("ALL");

  const [sort, setSort] =
    useState<SortMode>("grade_desc");

  const [seed, setSeed] = useState(() =>
    String(Date.now())
  );

  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] = useState("");

  const [filtersOpen, setFiltersOpen] =
    useState(false);

  const [focusIndex, setFocusIndex] =
    useState<number | null>(null);

  const [hydrated, setHydrated] = useState(false);

  const savedScroll = useRef<number | null>(null);
  const request = useRef(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);

      if (raw) {
        const saved = JSON.parse(raw);

        if (typeof saved.queryInput === "string") {
          setQueryInput(saved.queryInput);
        }

        if (typeof saved.q === "string") {
          setQ(saved.q);
        }

        if (
          saved.grade === "ALL" ||
          ["6", "7", "8", "9", "10"].includes(
            saved.grade
          )
        ) {
          setGrade(saved.grade);
        }

        if (typeof saved.sport === "string") {
          setSport(saved.sport);
        }

        if (typeof saved.year === "string") {
          setYear(saved.year);
        }

        if (saved.sort in SORT_LABELS) {
          setSort(saved.sort);
        }

        if (
          Number.isSafeInteger(saved.page) &&
          saved.page > 0
        ) {
          setPage(saved.page);
        }

        if (
          typeof saved.scroll === "number" &&
          Number.isFinite(saved.scroll)
        ) {
          savedScroll.current = Math.max(
            0,
            saved.scroll
          );
        }
      }
    } catch {
      // Saved UI state is optional.
    }

    setHydrated(true);
  }, []);

  const persist = useCallback(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          queryInput,
          q,
          grade,
          sport,
          year,
          sort,
          page,
          scroll: window.scrollY,
        })
      );
    } catch {
      // Storage can be disabled.
    }
  }, [
    grade,
    page,
    q,
    queryInput,
    sort,
    sport,
    year,
  ]);

  const load = useCallback(async () => {
    if (!hydrated) return;

    const id = ++request.current;

    abort.current?.abort();

    const controller = new AbortController();
    abort.current = controller;

    setRefreshing(true);

    try {
      const params = new URLSearchParams();

      if (q.trim()) params.set("q", q.trim());
      if (grade !== "ALL") params.set("grade", grade);
      if (sport !== "ALL") params.set("sport", sport);
      if (year !== "ALL") params.set("year", year);

      params.set("sort", sort);

      if (sort === "random") {
        params.set("seed", seed);
      }

      params.set("page", String(page));
      params.set("pageSize", "24");

      const response = await fetch(
        `/api/collection/slabs?${params.toString()}`,
        {
          cache: "no-store",
          signal: controller.signal,
        }
      );

      const json = await response.json();

      if (!response.ok || !json?.ok) {
        throw new Error(
          json?.error || "Couldn't load your slab gallery."
        );
      }

      if (id !== request.current) return;

      const next = json as ApiResponse;

      setData(next);
      setError("");

      if (next.page !== page) {
        setPage(next.page);
      }
    } catch (err) {
      if (!controller.signal.aborted && id === request.current) {
        setError(
          err instanceof Error
            ? err.message
            : "Couldn't load your slab gallery."
        );
      }
    } finally {
      if (
        id === request.current &&
        !controller.signal.aborted
      ) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [
    grade,
    hydrated,
    page,
    q,
    seed,
    sort,
    sport,
    year,
  ]);

  useEffect(() => {
    void load();

    return () => abort.current?.abort();
  }, [load]);

  useEffect(() => {
    if (
      loading ||
      savedScroll.current == null ||
      !data
    ) {
      return;
    }

    const top = savedScroll.current;

    const frame = requestAnimationFrame(() => {
      window.scrollTo({
        top,
        behavior: "instant",
      });

      savedScroll.current = null;
    });

    return () => cancelAnimationFrame(frame);
  }, [data, loading]);

  useEffect(() => {
    if (!hydrated) return;

    const save = () => persist();

    window.addEventListener("pagehide", save);

    return () => {
      window.removeEventListener("pagehide", save);
    };
  }, [hydrated, persist]);

  const rows = data?.rows ?? [];

  const total = data?.total ?? 0;
  const totalQuantity = data?.totalQuantity ?? 0;
  const totalValueCents = data?.totalValueCents ?? 0;

  const counts =
    data?.countsByGrade ?? {
      "6": 0,
      "7": 0,
      "8": 0,
      "9": 0,
      "10": 0,
    };

  const filterCount =
    Number(sport !== "ALL") +
    Number(year !== "ALL");

  const activeContextCount =
    filterCount + Number(grade !== "ALL");

  function submitSearch(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setQ(queryInput.trim());
    setPage(1);

    if (sort === "random") {
      setSeed(String(Date.now()));
    }
  }

  function setGradeFilter(next: string) {
    setGrade(next);
    setPage(1);
  }

  function reshuffle() {
    setSort("random");
    setSeed(String(Date.now()));
    setPage(1);
  }

  function resetFilters() {
    setGrade("ALL");
    setSport("ALL");
    setYear("ALL");
    setSort("grade_desc");
    setPage(1);
  }

  return (
    <main className="slabs-shell">
      <section className="slabs-masthead">
        <div>
          <span className="slabs-eyebrow">
            GRADED COLLECTION
          </span>

          <h1>Slab Gallery</h1>

          <button
            className="slabs-summary"
            disabled={loading}
            onClick={() => {
              window.scrollTo({
                top: 0,
                behavior: "smooth",
              });
            }}
          >
            {loading ? (
              "Your VCS vault"
            ) : (
              <>
                <strong>{number(totalQuantity)}</strong>{" "}
                slabs
                <span>·</span>
                <strong>{number(total)}</strong> types
                <span>·</span>
                <strong>{money(totalValueCents)}</strong>{" "}
                value
              </>
            )}
          </button>
        </div>

        <div className="slabs-masthead-actions">
          <Link
            href="/grading"
            className="slabs-text-button"
            onClick={persist}
          >
            Grading
            <Icon kind="arrow" />
          </Link>

          <Link
            href="/collection"
            className="slabs-text-button"
            onClick={persist}
          >
            Collection
            <Icon kind="arrow" />
          </Link>
        </div>
      </section>

      <section className="slabs-controls">
        <form
          className="slabs-search"
          onSubmit={submitSearch}
        >
          <Icon kind="search" />

          <input
            type="search"
            placeholder="Search player, set, team, card…"
            value={queryInput}
            onChange={(event) =>
              setQueryInput(event.target.value)
            }
          />

          {queryInput && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQueryInput("");
                setQ("");
                setPage(1);
              }}
            >
              <Icon kind="close" />
            </button>
          )}
        </form>

        <button
          className="slabs-secondary slabs-filter-button"
          onClick={() => setFiltersOpen(true)}
        >
          <Icon kind="filter" />
          <span>Filter / Sort</span>

          {filterCount > 0 && <b>{filterCount}</b>}
        </button>
      </section>

      <nav
        className="slabs-grade-strip"
        aria-label="Filter by VCS grade"
      >
        <button
          aria-current={
            grade === "ALL" ? "page" : undefined
          }
          onClick={() => setGradeFilter("ALL")}
        >
          <span>All</span>
          <strong>
            {number(
              counts["10"] +
                counts["9"] +
                counts["8"] +
                counts["7"] +
                counts["6"]
            )}
          </strong>
        </button>

        {(["10", "9", "8", "7", "6"] as const).map(
          (item) => (
            <button
              key={item}
              aria-current={
                grade === item ? "page" : undefined
              }
              onClick={() => setGradeFilter(item)}
            >
              <span>VCS {item}</span>
              <strong>{number(counts[item])}</strong>
            </button>
          )
        )}
      </nav>

      <div className="slabs-list-tools">
        <div>
          <span>
            {loading
              ? "Opening the vault…"
              : `${number(total)} ${
                  total === 1 ? "slab type" : "slab types"
                }`}
          </span>

          {!loading && (
            <span className="slabs-sort-caption">
              · {SORT_LABELS[sort]}
            </span>
          )}
        </div>

        <div>
          {activeContextCount > 0 && (
            <button
              className="slabs-chip"
              onClick={resetFilters}
            >
              Clear filters
              <Icon kind="close" />
            </button>
          )}

          <button
            className="slabs-text-button"
            onClick={reshuffle}
            disabled={loading || total === 0}
          >
            <Icon kind="shuffle" />
            Shuffle
          </button>

          <button
            className="slabs-icon-button"
            onClick={() => void load()}
            disabled={refreshing}
            aria-label={
              refreshing ? "Refreshing" : "Refresh gallery"
            }
          >
            <Icon kind="refresh" />
          </button>
        </div>
      </div>

      {error && (
        <div className="slabs-notice" role="alert">
          {error}

          <button onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div
          className="slabs-loading"
          aria-label="Loading slab gallery"
          aria-busy="true"
        >
          {[0, 1, 2, 3, 4, 5, 6, 7].map(
            (item) => (
              <div key={item}>
                <span />
                <i />
                <i />
              </div>
            )
          )}
        </div>
      ) : rows.length ? (
        <>
          <section className="slabs-gallery">
            {rows.map((row, index) => (
              <GalleryTile
                key={row.key}
                row={row}
                onOpen={() => {
                  persist();
                  setFocusIndex(index);
                }}
              />
            ))}
          </section>

          <nav
            className="slabs-pagination"
            aria-label="Slab gallery pages"
          >
            <button
              className="slabs-secondary"
              disabled={(data?.page ?? 1) <= 1}
              onClick={() => {
                setPage((value) =>
                  Math.max(1, value - 1)
                );

                window.scrollTo({
                  top: 0,
                  behavior: "smooth",
                });
              }}
            >
              ← Previous
            </button>

            <span>
              Page {number(data?.page ?? 1)} of{" "}
              {number(data?.totalPages ?? 1)}
            </span>

            <button
              className="slabs-secondary"
              disabled={
                (data?.page ?? 1) >=
                (data?.totalPages ?? 1)
              }
              onClick={() => {
                setPage((value) =>
                  Math.min(
                    data?.totalPages ?? value,
                    value + 1
                  )
                );

                window.scrollTo({
                  top: 0,
                  behavior: "smooth",
                });
              }}
            >
              Next →
            </button>
          </nav>
        </>
      ) : (
        <section className="slabs-empty">
          <span>VCS</span>

          <h2>
            {q || activeContextCount
              ? "No slabs match this view"
              : "Your display case is waiting"}
          </h2>

          <p>
            {q || activeContextCount
              ? "Try another search or clear the current filters."
              : "Grade a card and it will appear here as part of your VCS collection."}
          </p>

          {(q || activeContextCount > 0) && (
            <button
              className="slabs-secondary"
              onClick={() => {
                setQueryInput("");
                setQ("");
                resetFilters();
              }}
            >
              Reset gallery
            </button>
          )}

          <Link
            href="/grading"
            className="slabs-primary"
            onClick={persist}
          >
            Go to grading
            <Icon kind="arrow" />
          </Link>
        </section>
      )}

      <footer className="slabs-footer">
        <span>VCS · THE COLLECTOR&apos;S VAULT</span>
        <span>Graded. Registered. Displayed.</span>
      </footer>

      {filtersOpen && (
        <FilterSheet
          sort={sort}
          setSort={(next) => {
            setSort(next);
            setPage(1);

            if (next === "random") {
              setSeed(String(Date.now()));
            }
          }}
          sport={sport}
          setSport={(next) => {
            setSport(next);
            setPage(1);
          }}
          year={year}
          setYear={(next) => {
            setYear(next);
            setPage(1);
          }}
          sports={data?.sports ?? []}
          years={data?.years ?? []}
          activeCount={filterCount}
          total={total}
          onReset={() => {
            setSport("ALL");
            setYear("ALL");
            setSort("grade_desc");
            setPage(1);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {focusIndex != null && rows[focusIndex] && (
        <FocusViewer
          rows={rows}
          index={focusIndex}
          setIndex={setFocusIndex}
          page={data?.page ?? 1}
          totalPages={data?.totalPages ?? 1}
          onClose={() => setFocusIndex(null)}
          persist={persist}
        />
      )}
    </main>
  );
}
