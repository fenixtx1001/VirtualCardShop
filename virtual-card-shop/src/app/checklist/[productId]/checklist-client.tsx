"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  restoreScroll,
  returnState,
  useCardBrowseSource,
} from "@/lib/card-details/browsing";

type ProductSetOption = {
  id: string;
  isBase: boolean;
  name: string | null;
};

type UserOption = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

type OfferStatus =
  | { state: "AVAILABLE" }
  | {
      state: "ACTIVE";
      offerId: number;
      expiresAt: string;
    }
  | {
      state: "LOCKED";
      lockedUntil: string;
    };

type ChecklistFilter = "all" | "need";

type SortKey =
  | "cardNumber"
  | "owned"
  | "qty"
  | "rawQty"
  | "player"
  | "team"
  | "subset"
  | "variant"
  | "bookValue";

type SortDir = "asc" | "desc";

type ChecklistRow = {
  cardId: number;
  cardNumber: string;
  player: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  isInsert: boolean;

  bookValue: number | null;
  frontImageUrl: string | null;

  ownedQty: number;
  rawQty: number;
  needQty: number;

  revealedOwnedQty?: number;
  auctionLockedQty?: number;
  pendingGradingQty?: number;

  myOwnedQty?: number;
  myRawQty?: number;

  offerStatus?: OfferStatus;
};

type ChecklistResponse = {
  ok: boolean;

  currentUserId: string;
  selectedUserId: string;
  isCompareMode: boolean;

  productId: string;

  productSetId: string;
  productSetIsBase: boolean;
  productSets: ProductSetOption[];

  totalCards: number;
  uniqueOwned: number;
  percentComplete: number;

  prestigeLevel: number;
  nextPrestigeLevel: number;
  cardsAtNextPrestige: number;
  cardsNeededForNextPrestige: number;
  nextPrestigePct: number;

  setTotalBookValue: number;
  setOwnedBookValue: number;
  setMissingBookValue: number;
  setOwnedValuePercent: number;
  holdingsBookValue: number;
  mySetOwnedBookValue?: number | null;

  searchText: string;
  filterMode: ChecklistFilter;
  resultCount: number;

  page: number;
  pageSize: number;
  totalPages: number;

  sortKey: SortKey;
  sortDir: SortDir;

  rows: ChecklistRow[];
};

type LoadOpts = {
  productSetId?: string;
  selectedUserId?: string;
  page?: number;
  sortKey?: SortKey;
  sortDir?: SortDir;
  searchText?: string;
  filterMode?: ChecklistFilter;
};

type IconKind =
  | "refresh"
  | "search"
  | "arrow"
  | "chevron";

const PAGE_SIZE = 100;
const ECONOMY_CHANGED_EVENT = "vcs:economy-changed";

const SORT_OPTIONS: Array<{
  value: SortKey;
  label: string;
}> = [
  { value: "cardNumber", label: "Card #" },
  { value: "bookValue", label: "Value" },
  { value: "qty", label: "Qty Owned" },
  { value: "rawQty", label: "Raw Qty" },
  { value: "owned", label: "Owned" },
  { value: "player", label: "Player" },
  { value: "team", label: "Team" },
  { value: "subset", label: "Subset" },
  { value: "variant", label: "Variant" },
];

function Icon({ kind }: { kind: IconKind }) {
  const paths: Record<IconKind, ReactNode> = {
    refresh: (
      <>
        <path d="M20 5v5h-5M4 19v-5h5" />
        <path d="M19 10a7 7 0 0 0-12-5M5 14a7 7 0 0 0 12 5" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
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

function formatSetLabel(ps: ProductSetOption) {
  const base = ps.name?.trim() ? ps.name.trim() : ps.id;
  return ps.isBase ? `Base — ${base}` : `Insert — ${base}`;
}

function formatUserLabel(user: UserOption) {
  const name = (user.name ?? "").trim();
  if (name) return name;

  const email = (user.email ?? "").trim();
  if (email) return email.split("@")[0]?.trim() || "Collector";

  return "Collector";
}

function friendlyTitle(raw: string | null | undefined) {
  const decoded = decodeURIComponent(String(raw ?? "").trim());

  return decoded
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(value: unknown) {
  const n =
    typeof value === "number"
      ? value
      : Number(value ?? 0);

  const safe = Number.isFinite(n) ? n : 0;

  return safe.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function number(value: unknown) {
  const n =
    typeof value === "number"
      ? value
      : Number(value ?? 0);

  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US");
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function sortIcon(active: boolean, dir: SortDir) {
  if (!active) return "";
  return dir === "asc" ? " ▲" : " ▼";
}

function defaultSortDir(key: SortKey): SortDir {
  if (
    key === "owned" ||
    key === "qty" ||
    key === "rawQty" ||
    key === "bookValue"
  ) {
    return "desc";
  }

  return "asc";
}

function compactTimeUntil(iso: string | null | undefined) {
  if (!iso) return "soon";

  const ms = new Date(iso).getTime() - Date.now();

  if (!Number.isFinite(ms) || ms <= 0) {
    return "soon";
  }

  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= 24) return `${Math.ceil(hours / 24)}d`;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${minutes}m`;
}

function rowMeta(row: ChecklistRow) {
  return [row.team, row.subset, row.variant]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

function CardThumb({
  src,
  alt,
}: {
  src: string | null;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span className="checklist-thumb">
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="checklist-thumb-fallback" aria-hidden="true">
          VCS
        </span>
      )}
    </span>
  );
}

export default function ChecklistClient({
  productId,
}: {
  productId: string;
}) {
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedProductSetId, setSelectedProductSetId] =
    useState("");
  const [selectedUserId, setSelectedUserId] = useState("");

  const [page, setPage] = useState(1);
  const [jumpTo, setJumpTo] = useState("");

  const [sortKey, setSortKey] =
    useState<SortKey>("cardNumber");
  const [sortDir, setSortDir] =
    useState<SortDir>("asc");

  const [filterMode, setFilterMode] =
    useState<ChecklistFilter>("all");

  const [searchInput, setSearchInput] = useState("");
  const [searchApplied, setSearchApplied] = useState("");

  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [actionMsg, setActionMsg] =
    useState<string | null>(null);
  const [actionErr, setActionErr] =
    useState<string | null>(null);

  const [auctioningCardId, setAuctioningCardId] =
    useState<number | null>(null);
  const [offeringCardId, setOfferingCardId] =
    useState<number | null>(null);

  const requestSequence = useRef(0);

  async function loadUsers() {
    setUsersLoading(true);

    try {
      const response = await fetch("/api/users", {
        cache: "no-store",
      });

      const raw = await response.text();

      let json: any = null;

      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(
          `Users returned invalid data (${response.status}).`
        );
      }

      if (!response.ok) {
        throw new Error(
          json?.error || `Failed (${response.status})`
        );
      }

      setUsers(Array.isArray(json?.users) ? json.users : []);
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }

  async function load(
    opts: LoadOpts = {},
    background = false
  ) {
    const sequence = ++requestSequence.current;

    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErr(null);

    try {
      const qs = new URLSearchParams();

      const productSetId = (
        opts.productSetId ?? selectedProductSetId
      ).trim();

      if (productSetId) {
        qs.set("productSetId", productSetId);
      }

      const userId = (
        opts.selectedUserId ?? selectedUserId
      ).trim();

      if (userId) {
        qs.set("selectedUserId", userId);
      }

      const nextPage = opts.page ?? page;
      const nextSortKey = opts.sortKey ?? sortKey;
      const nextSortDir = opts.sortDir ?? sortDir;
      const nextSearch = (
        opts.searchText ?? searchApplied
      ).trim();
      const nextFilter = opts.filterMode ?? filterMode;

      qs.set("page", String(nextPage));
      qs.set("pageSize", String(PAGE_SIZE));
      qs.set("sortKey", nextSortKey);
      qs.set("sortDir", nextSortDir);
      qs.set("filter", nextFilter);

      if (nextSearch) {
        qs.set("q", nextSearch);
      }

      const response = await fetch(
        `/api/checklist/${encodeURIComponent(
          productId
        )}?${qs.toString()}`,
        { cache: "no-store" }
      );

      const raw = await response.text();

      let json: any = null;

      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(
          `Checklist returned invalid data (${response.status}).`
        );
      }

      if (!response.ok) {
        throw new Error(
          json?.error || `Failed (${response.status})`
        );
      }

      if (sequence !== requestSequence.current) {
        return;
      }

      const next = json as ChecklistResponse;

      setData(next);

      if (!selectedProductSetId && next.productSetId) {
        setSelectedProductSetId(next.productSetId);
      }

      setPage(next.page);
      setSortKey(next.sortKey);
      setSortDir(next.sortDir);
      setFilterMode(next.filterMode ?? "all");
    } catch (error) {
      if (sequence !== requestSequence.current) {
        return;
      }

      setErr(
        error instanceof Error
          ? error.message
          : "Failed to load checklist."
      );
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    void loadUsers();

    const source =
      location.pathname + location.search;

    const saved = returnState(source);

    const productSetId =
      typeof saved?.selectedProductSetId === "string"
        ? saved.selectedProductSetId
        : "";

    const userId =
      typeof saved?.selectedUserId === "string"
        ? saved.selectedUserId
        : "";

    const restoredPage =
      typeof saved?.page === "number" ? saved.page : 1;

    const restoredSort =
      typeof saved?.sortKey === "string"
        ? (saved.sortKey as SortKey)
        : "cardNumber";

    const restoredDir: SortDir =
      saved?.sortDir === "desc" ? "desc" : "asc";

    const restoredSearch =
      typeof saved?.searchText === "string"
        ? saved.searchText
        : "";

    const restoredFilter: ChecklistFilter =
      saved?.filterMode === "need" ? "need" : "all";

    setSelectedProductSetId(productSetId);
    setSelectedUserId(userId);
    setPage(restoredPage);
    setSortKey(restoredSort);
    setSortDir(restoredDir);
    setFilterMode(restoredFilter);
    setSearchInput(restoredSearch);
    setSearchApplied(restoredSearch);
    setJumpTo("");

    void load({
      productSetId,
      selectedUserId: userId,
      page: restoredPage,
      sortKey: restoredSort,
      sortDir: restoredDir,
      searchText: restoredSearch,
      filterMode: restoredFilter,
    }).then(() => restoreScroll(source));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  useEffect(() => {
    if (searchInput === searchApplied) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSearchApplied(searchInput);
      setPage(1);

      void load({
        searchText: searchInput,
        page: 1,
      });
    }, 260);

    return () => window.clearTimeout(timer);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const productSetsSorted = useMemo(() => {
    return [...(data?.productSets ?? [])].sort(
      (a, b) => Number(b.isBase) - Number(a.isBase)
    );
  }, [data]);

  const compareMode = Boolean(data?.isCompareMode);

  const totalPages = data?.totalPages ?? 1;
  const canPrev = (data?.page ?? 1) > 1;
  const canNext = (data?.page ?? 1) < totalPages;

  const rows = data?.rows ?? [];

  useCardBrowseSource(
    rows.map((row) => ({
      cardId: row.cardId,
    })),
    "Checklist",
    {
      selectedProductSetId,
      selectedUserId,
      page,
      sortKey,
      sortDir,
      searchText: searchApplied,
      filterMode,
    }
  );

  function onChangeProductSet(nextId: string) {
    setSelectedProductSetId(nextId);
    setPage(1);
    setJumpTo("");
    setActionErr(null);
    setActionMsg(null);

    void load({
      productSetId: nextId,
      page: 1,
    });
  }

  function onChangeSelectedUser(nextId: string) {
    setSelectedUserId(nextId);
    setPage(1);
    setJumpTo("");
    setActionErr(null);
    setActionMsg(null);

    void load({
      selectedUserId: nextId,
      page: 1,
    });
  }

  function onFilter(next: ChecklistFilter) {
    if (next === filterMode) return;

    setFilterMode(next);
    setPage(1);
    setJumpTo("");

    void load({
      filterMode: next,
      page: 1,
    });
  }

  function onSort(nextKey: SortKey) {
    const nextDir: SortDir =
      nextKey === sortKey
        ? sortDir === "asc"
          ? "desc"
          : "asc"
        : defaultSortDir(nextKey);

    setSortKey(nextKey);
    setSortDir(nextDir);
    setPage(1);
    setJumpTo("");

    void load({
      sortKey: nextKey,
      sortDir: nextDir,
      page: 1,
    });
  }

  function setSortFromSelect(nextKey: SortKey) {
    const nextDir = defaultSortDir(nextKey);

    setSortKey(nextKey);
    setSortDir(nextDir);
    setPage(1);
    setJumpTo("");

    void load({
      sortKey: nextKey,
      sortDir: nextDir,
      page: 1,
    });
  }

  function toggleSortDir() {
    const nextDir: SortDir =
      sortDir === "asc" ? "desc" : "asc";

    setSortDir(nextDir);
    setPage(1);

    void load({
      sortDir: nextDir,
      page: 1,
    });
  }

  function goPrev() {
    if (!canPrev) return;

    const next = (data?.page ?? 1) - 1;

    setPage(next);
    void load({ page: next });
  }

  function goNext() {
    if (!canNext) return;

    const next = (data?.page ?? 1) + 1;

    setPage(next);
    void load({ page: next });
  }

  function doJump() {
    const next = clampInt(
      parseInt(jumpTo || "1", 10) || 1,
      1,
      totalPages
    );

    setPage(next);
    void load({ page: next });
  }

  function clearSearch() {
    setSearchInput("");
    setSearchApplied("");
    setPage(1);

    void load({
      searchText: "",
      page: 1,
    });
  }

  async function requestOfferForCard(cardId: number) {
    if (compareMode) {
      setActionErr(
        "Switch Viewing to Me to request shop offers."
      );
      setActionMsg(null);
      return;
    }

    setOfferingCardId(cardId);
    setActionErr(null);
    setActionMsg(null);

    try {
      const response = await fetch("/api/shop/singles/offers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cardId }),
      });

      const raw = await response.text();
      const json = raw ? JSON.parse(raw) : {};

      if (!response.ok) {
        throw new Error(
          json?.error || "Offer request failed."
        );
      }

      setActionMsg(
        json?.reused
          ? "Shop offer already active."
          : "Shop offer created."
      );

      window.dispatchEvent(
        new CustomEvent(ECONOMY_CHANGED_EVENT)
      );

      await load({}, true);
    } catch (error) {
      setActionErr(
        error instanceof Error
          ? error.message
          : "Offer request failed."
      );
    } finally {
      setOfferingCardId(null);
    }
  }

  async function createAuctionForCard(cardId: number) {
    if (compareMode) {
      setActionErr(
        "Switch Viewing to Me to create auctions."
      );
      setActionMsg(null);
      return;
    }

    setAuctioningCardId(cardId);
    setActionErr(null);
    setActionMsg(null);

    try {
      const response = await fetch("/api/auctions/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cardId,
          grade: 0,
        }),
      });

      const raw = await response.text();
      const json = raw ? JSON.parse(raw) : {};

      if (!response.ok) {
        throw new Error(
          json?.error || "Auction create failed."
        );
      }

      setActionMsg(
        "Auction created. One raw copy is reserved for the auction."
      );

      await load({}, true);
    } catch (error) {
      setActionErr(
        error instanceof Error
          ? error.message
          : "Auction create failed."
      );
    } finally {
      setAuctioningCardId(null);
    }
  }

  const currentUser = users.find(
    (user) => user.id === data?.currentUserId
  );

  const selectedUser = selectedUserId
    ? users.find((user) => user.id === selectedUserId)
    : currentUser;

  const resultCount = data?.resultCount ?? 0;

  const pageStart =
    resultCount > 0 && data
      ? (data.page - 1) * data.pageSize + 1
      : 0;

  const pageEnd = data
    ? Math.min(data.page * data.pageSize, resultCount)
    : 0;

  return (
    <main
      className={`checklist-shell ${
        loading && data ? "is-updating" : ""
      }`}
    >
      <header className="checklist-masthead">
        <div>
          <span className="checklist-eyebrow">CHECKLIST</span>

          <h1>{friendlyTitle(productId)}</h1>

          {data ? (
            <div className="checklist-title-meta">
              <span>
                {data.productSetIsBase ? "Base Set" : "Insert Set"}
              </span>

              <i>·</i>

              <span>
                <strong>{number(data.uniqueOwned)}</strong>/
                {number(data.totalCards)} unique
              </span>

              <i>·</i>

              <span>
                {data.percentComplete.toFixed(1)}% complete
              </span>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className={`checklist-refresh ${
            refreshing ? "is-refreshing" : ""
          }`}
          onClick={() => void load({}, true)}
          disabled={refreshing}
          aria-label="Refresh checklist"
          title="Refresh checklist"
        >
          <Icon kind="refresh" />
        </button>
      </header>

      <nav className="checklist-nav">
        <Link
          href={`/collection/${encodeURIComponent(productId)}`}
        >
          ← Back to Set
        </Link>

        <Link href="/collection">
          Collection
          <Icon kind="arrow" />
        </Link>
      </nav>

      {err ? (
        <div className="checklist-notice is-error" role="alert">
          {err}
        </div>
      ) : null}

      {actionErr ? (
        <div
          className="checklist-action-toast is-error"
          role="alert"
        >
          <span>{actionErr}</span>

          <button
            type="button"
            onClick={() => setActionErr(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ) : null}

      {actionMsg ? (
        <div className="checklist-action-toast" role="status">
          <span>{actionMsg}</span>

          <Link href="/shop">Shop →</Link>

          <button
            type="button"
            onClick={() => setActionMsg(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="checklist-loading">
          Loading checklist…
        </div>
      ) : !data ? (
        <div className="checklist-empty">
          Checklist data unavailable.
        </div>
      ) : (
        <>
          <section className="checklist-progress">
            <div className="checklist-progress-main">
              <div>
                <span className="checklist-progress-kicker">
                  {data.prestigeLevel > 0
                    ? "NEXT PRESTIGE"
                    : "SET PROGRESS"}
                </span>

                <strong>
                  {data.prestigeLevel > 0
                    ? `Prestige ${data.prestigeLevel}× → ${data.nextPrestigeLevel}×`
                    : `${data.percentComplete.toFixed(
                        1
                      )}% Complete`}
                </strong>

                <p>
                  <b>{number(data.cardsAtNextPrestige)}</b>/
                  {number(data.totalCards)} ready
                  <span>·</span>
                  <b>
                    {number(data.cardsNeededForNextPrestige)}
                  </b>{" "}
                  {data.cardsNeededForNextPrestige === 1
                    ? "card"
                    : "cards"}{" "}
                  needed
                </p>
              </div>

              <div className="checklist-set-value">
                <span>SET BOOK VALUE</span>
                <strong>
                  {money(data.setTotalBookValue)}
                </strong>
              </div>
            </div>

            <div
              className="checklist-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(data.nextPrestigePct)}
              aria-label={`Progress to Prestige ${data.nextPrestigeLevel}`}
            >
              <span
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, data.nextPrestigePct)
                  )}%`,
                }}
              />
            </div>

            <div className="checklist-progress-foot">
              <span>Prestige {data.prestigeLevel}×</span>
              <span>
                {data.nextPrestigePct.toFixed(1)}% toward{" "}
                {data.nextPrestigeLevel}×
              </span>
            </div>
          </section>

          <section className="checklist-controls">
            <label className="checklist-control">
              <span>Set</span>

              <select
                value={selectedProductSetId}
                onChange={(event) =>
                  onChangeProductSet(event.target.value)
                }
              >
                {productSetsSorted.map((ps) => (
                  <option key={ps.id} value={ps.id}>
                    {formatSetLabel(ps)}
                  </option>
                ))}
              </select>
            </label>

            <label className="checklist-control">
              <span>Viewing</span>

              <select
                value={selectedUserId}
                onChange={(event) =>
                  onChangeSelectedUser(event.target.value)
                }
                disabled={usersLoading}
              >
                <option value="">
                  {currentUser
                    ? `${formatUserLabel(currentUser)} (Me)`
                    : "Me"}
                </option>

                {users
                  .filter(
                    (user) => user.id !== data.currentUserId
                  )
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {formatUserLabel(user)}
                    </option>
                  ))}
              </select>
            </label>

            <label className="checklist-search">
              <Icon kind="search" />

              <span className="checklist-sr-only">
                Search checklist
              </span>

              <input
                type="search"
                value={searchInput}
                onChange={(event) =>
                  setSearchInput(event.target.value)
                }
                placeholder="Search #, player, team..."
                autoComplete="off"
              />

              {searchInput ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                >
                  ×
                </button>
              ) : null}
            </label>
          </section>

          {compareMode ? (
            <div className="checklist-compare">
              <strong>
                Viewing{" "}
                {selectedUser
                  ? formatUserLabel(selectedUser)
                  : "collector"}
              </strong>

              <span>
                Their quantities drive Checklist and Prestige
                progress. Your quantity remains visible for
                reference.
              </span>
            </div>
          ) : null}

          <section className="checklist-list-tools">
            <div className="checklist-filters">
              <button
                type="button"
                className={
                  filterMode === "all" ? "is-active" : ""
                }
                onClick={() => onFilter("all")}
              >
                All
              </button>

              <button
                type="button"
                className={
                  filterMode === "need" ? "is-active" : ""
                }
                onClick={() => onFilter("need")}
              >
                Need for Prestige
                <span>
                  {number(data.cardsNeededForNextPrestige)}
                </span>
              </button>
            </div>

            <div className="checklist-result-tools">
              <span className="checklist-result-count">
                <strong>{number(resultCount)}</strong>{" "}
                {resultCount === 1 ? "card" : "cards"}
              </span>

              <label className="checklist-sort">
                <span className="checklist-sr-only">
                  Sort checklist
                </span>

                <select
                  value={sortKey}
                  onChange={(event) =>
                    setSortFromSelect(
                      event.target.value as SortKey
                    )
                  }
                >
                  {SORT_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={toggleSortDir}
                  aria-label={`Sort ${
                    sortDir === "asc"
                      ? "descending"
                      : "ascending"
                  }`}
                >
                  {sortDir === "asc" ? "↑" : "↓"}
                </button>
              </label>
            </div>
          </section>

          {rows.length === 0 ? (
            <div className="checklist-empty">
              <strong>No cards match this view.</strong>
              <span>
                Try clearing the search or switching back to All.
              </span>
            </div>
          ) : (
            <>
              <div className="checklist-desktop-table">
                <table>
                  <thead>
                    <tr>
                      <th
                        className="is-sortable checklist-number-col"
                        onClick={() => onSort("cardNumber")}
                      >
                        #
                        {sortIcon(
                          sortKey === "cardNumber",
                          sortDir
                        )}
                      </th>

                      <th
                        className="is-sortable"
                        onClick={() => onSort("player")}
                      >
                        Card
                        {sortIcon(
                          sortKey === "player",
                          sortDir
                        )}
                      </th>

                      <th
                        className="is-sortable checklist-money-col"
                        onClick={() => onSort("bookValue")}
                      >
                        Value
                        {sortIcon(
                          sortKey === "bookValue",
                          sortDir
                        )}
                      </th>

                      <th
                        className="is-sortable checklist-small-col"
                        onClick={() => onSort("qty")}
                      >
                        Qty
                        {sortIcon(sortKey === "qty", sortDir)}
                      </th>

                      <th
                        className="is-sortable checklist-small-col"
                        onClick={() => onSort("rawQty")}
                      >
                        Raw
                        {sortIcon(
                          sortKey === "rawQty",
                          sortDir
                        )}
                      </th>

                      {compareMode ? (
                        <th className="checklist-small-col">
                          You
                        </th>
                      ) : null}

                      <th className="checklist-need-col">
                        Need
                      </th>

                      <th className="checklist-actions-col">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((row) => {
                      const owned = row.ownedQty > 0;
                      const need = row.needQty > 0;

                      const status =
                        row.offerStatus ?? {
                          state: "AVAILABLE" as const,
                        };

                      const isActive =
                        status.state === "ACTIVE";
                      const isLocked =
                        status.state === "LOCKED";

                      const offerDisabled =
                        offeringCardId === row.cardId ||
                        isActive ||
                        isLocked;

                      const offerLabel =
                        offeringCardId === row.cardId
                          ? "Offering…"
                          : isActive
                            ? "Offer Active"
                            : isLocked
                              ? `Offer ${compactTimeUntil(
                                  status.lockedUntil
                                )}`
                              : "Offer";

                      return (
                        <tr
                          key={row.cardId}
                          className={
                            need ? "needs-prestige" : ""
                          }
                        >
                          <td className="checklist-number-cell">
                            {row.cardNumber}
                          </td>

                          <td>
                            <Link
                              href={`/cards/${encodeURIComponent(
                                String(row.cardId)
                              )}`}
                              className="checklist-card-cell"
                            >
                              <CardThumb
                                src={row.frontImageUrl}
                                alt={`${row.player} #${row.cardNumber}`}
                              />

                              <span>
                                <strong>{row.player}</strong>

                                <small>
                                  {rowMeta(row) ||
                                    (row.isInsert
                                      ? "Insert"
                                      : "Base")}
                                </small>
                              </span>
                            </Link>
                          </td>

                          <td className="checklist-value-cell">
                            {money(row.bookValue)}
                          </td>

                          <td className="checklist-stat-cell">
                            {number(row.ownedQty)}
                          </td>

                          <td
                            className={`checklist-stat-cell ${
                              row.rawQty > 0 ? "has-raw" : ""
                            }`}
                          >
                            {row.rawQty > 0
                              ? number(row.rawQty)
                              : "—"}
                          </td>

                          {compareMode ? (
                            <td className="checklist-stat-cell">
                              {number(row.myOwnedQty ?? 0)}
                            </td>
                          ) : null}

                          <td className="checklist-need-cell">
                            {need ? (
                              <strong>
                                +{number(row.needQty)}
                              </strong>
                            ) : (
                              <span>—</span>
                            )}
                          </td>

                          <td className="checklist-actions-cell">
                            <div>
                              <Link
                                href={`/cards/${encodeURIComponent(
                                  String(row.cardId)
                                )}`}
                              >
                                Details
                              </Link>

                              {!compareMode && owned ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void requestOfferForCard(
                                      row.cardId
                                    )
                                  }
                                  disabled={offerDisabled}
                                >
                                  {offerLabel}
                                </button>
                              ) : null}

                              {!compareMode && row.rawQty > 0 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void createAuctionForCard(
                                      row.cardId
                                    )
                                  }
                                  disabled={
                                    auctioningCardId === row.cardId
                                  }
                                >
                                  {auctioningCardId === row.cardId
                                    ? "Creating…"
                                    : "Auction"}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="checklist-mobile-list">
                {rows.map((row) => {
                  const need = row.needQty > 0;
                  const owned = row.ownedQty > 0;

                  const status =
                    row.offerStatus ?? {
                      state: "AVAILABLE" as const,
                    };

                  const isActive = status.state === "ACTIVE";
                  const isLocked = status.state === "LOCKED";

                  const offerDisabled =
                    offeringCardId === row.cardId ||
                    isActive ||
                    isLocked;

                  const offerLabel =
                    offeringCardId === row.cardId
                      ? "Offering…"
                      : isActive
                        ? "Offer Active"
                        : isLocked
                          ? `Offer in ${compactTimeUntil(
                              status.lockedUntil
                            )}`
                          : "Request Offer";

                  return (
                    <article
                      className={`checklist-mobile-card ${
                        need ? "needs-prestige" : ""
                      }`}
                      key={row.cardId}
                    >
                      <Link
                        href={`/cards/${encodeURIComponent(
                          String(row.cardId)
                        )}`}
                        className="checklist-mobile-main"
                      >
                        <CardThumb
                          src={row.frontImageUrl}
                          alt={`${row.player} #${row.cardNumber}`}
                        />

                        <span className="checklist-mobile-copy">
                          <span className="checklist-mobile-title">
                            <strong>
                              #{row.cardNumber} {row.player}
                            </strong>

                            <b>{money(row.bookValue)}</b>
                          </span>

                          <small>
                            {rowMeta(row) ||
                              (row.isInsert ? "Insert" : "Base")}
                          </small>

                          <span className="checklist-mobile-stats">
                            <span>
                              Qty <b>{number(row.ownedQty)}</b>
                            </span>

                            <span>
                              Raw{" "}
                              <b
                                className={
                                  row.rawQty > 0
                                    ? "has-raw"
                                    : ""
                                }
                              >
                                {number(row.rawQty)}
                              </b>
                            </span>

                            {compareMode ? (
                              <span>
                                You{" "}
                                <b>
                                  {number(row.myOwnedQty ?? 0)}
                                </b>
                              </span>
                            ) : null}

                            {need ? (
                              <span className="checklist-mobile-need">
                                Need{" "}
                                <b>
                                  +{number(row.needQty)}
                                </b>
                              </span>
                            ) : null}
                          </span>
                        </span>

                        <span className="checklist-mobile-chevron">
                          <Icon kind="chevron" />
                        </span>
                      </Link>

                      {!compareMode && owned ? (
                        <details className="checklist-mobile-actions">
                          <summary aria-label="Card actions">
                            •••
                          </summary>

                          <div>
                            <Link
                              href={`/cards/${encodeURIComponent(
                                String(row.cardId)
                              )}`}
                            >
                              Card Details
                            </Link>

                            <button
                              type="button"
                              onClick={() =>
                                void requestOfferForCard(
                                  row.cardId
                                )
                              }
                              disabled={offerDisabled}
                            >
                              {offerLabel}
                            </button>

                            {row.rawQty > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void createAuctionForCard(
                                    row.cardId
                                  )
                                }
                                disabled={
                                  auctioningCardId === row.cardId
                                }
                              >
                                {auctioningCardId === row.cardId
                                  ? "Creating Auction…"
                                  : "Create Auction"}
                              </button>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </>
          )}

          <footer className="checklist-pagination">
            <div className="checklist-range">
              {resultCount > 0
                ? `${number(pageStart)}–${number(
                    pageEnd
                  )} of ${number(resultCount)}`
                : "0 cards"}

              {searchApplied ? (
                <span>for “{searchApplied}”</span>
              ) : null}
            </div>

            <div className="checklist-page-buttons">
              <button
                type="button"
                onClick={goPrev}
                disabled={!canPrev || loading}
                aria-label="Previous page"
              >
                ← <span>Prev</span>
              </button>

              <strong>
                {data.page} / {totalPages}
              </strong>

              <button
                type="button"
                onClick={goNext}
                disabled={!canNext || loading}
                aria-label="Next page"
              >
                <span>Next</span> →
              </button>
            </div>

            <div className="checklist-jump">
              <label>
                <span>Page</span>

                <input
                  value={jumpTo}
                  onChange={(event) =>
                    setJumpTo(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      doJump();
                    }
                  }}
                  inputMode="numeric"
                  placeholder={String(data.page)}
                  aria-label="Jump to page"
                />
              </label>

              <button
                type="button"
                onClick={doJump}
                disabled={loading}
              >
                Go
              </button>
            </div>
          </footer>
        </>
      )}
    </main>
  );
}
