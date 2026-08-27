"use client";

import { useEffect, useMemo, useState } from "react";

type ViewMode = "summary" | "cards";
type ScopeMode = "me" | "all_users" | "single_user";
type UniverseMode = "owned" | "all";
type GroupByMode =
  | "player"
  | "team"
  | "product"
  | "product_set"
  | "brand"
  | "year"
  | "sport";

type CardsSortMode =
  | "owned_value_desc"
  | "book_value_desc"
  | "book_value_asc"
  | "owned_qty_desc"
  | "player_asc"
  | "year_desc"
  | "brand_asc"
  | "card_number_asc"
  | "a_value_desc"
  | "b_value_desc"
  | "diff_value_desc"
  | "a_qty_desc"
  | "b_qty_desc"
  | "diff_qty_desc";

type SummarySortMode =
  | "owned_value_desc"
  | "owned_qty_desc"
  | "unique_cards_desc"
  | "avg_book_value_desc"
  | "max_book_value_desc"
  | "name_asc";

type UserOption = {
  id: string;
  label: string;
};

type ProductOption = {
  id: string;
  label: string;
};

type ProductSetOption = {
  id: string;
  productId: string;
  label: string;
};

type MetaResponse = {
  ok: boolean;
  sports: string[];
  years: number[];
  brands: string[];
  products: ProductOption[];
  productSets: ProductSetOption[];
};

type CompareStats = {
  aQty: number;
  aValue: number;
  bQty: number;
  bValue: number;
  diffQty: number;
  diffValue: number;
};

type AnalyticsCardRow = {
  cardId: number;
  player: string;
  cardNumber: string;
  team: string | null;
  bookValue: number;
  ownedQty?: number;
  ownedValue?: number;
  frontImageUrl: string | null;
  year: number | null;
  brand: string | null;
  sport: string | null;
  productId: string | null;
  productLabel: string | null;
  productSetId: string | null;
  productSetLabel: string | null;
  compare?: CompareStats;
};

type AnalyticsSummaryRow = {
  key: string;
  label: string;
  uniqueCards: number;
  ownedQty: number;
  ownedValue: number;
  totalBookValue: number;
  maxBookValue: number;
  topCardLabel: string;
  avgBookValue: number;
};

const colors = {
  text: "#151515",
  muted: "#68717f",
  border: "#e5ded3",
  borderStrong: "#d5ccbe",
  card: "#ffffff",
  blue: "#16477d",
  blueSoft: "#eef5fb",
  green: "#166534",
  greenSoft: "#eef9f1",
  gold: "#8a6200",
  goldSoft: "#fff8e8",
  red: "#991b1b",
  redSoft: "#fff1f2",
};

function fmtMoney(n: number | null | undefined) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function safeImgSrc(url: string | null | undefined) {
  const u = (url ?? "").trim();
  return u.length ? u : null;
}

export default function AnalyticsClient() {
  const [view, setView] = useState<ViewMode>("summary");
  const [scope, setScope] = useState<ScopeMode>("me");
  const [universe, setUniverse] = useState<UniverseMode>("owned");
  const [groupBy, setGroupBy] = useState<GroupByMode>("player");

  const [compareMode, setCompareMode] = useState(false);
  const [compareUserAId, setCompareUserAId] = useState("");
  const [compareUserBId, setCompareUserBId] = useState("");

  const [cardsSortBy, setCardsSortBy] = useState<CardsSortMode>("owned_value_desc");
  const [summarySortBy, setSummarySortBy] = useState<SummarySortMode>("owned_value_desc");

  const [search, setSearch] = useState("");
  const [sport, setSport] = useState("all");
  const [year, setYear] = useState("all");
  const [brand, setBrand] = useState("all");
  const [productId, setProductId] = useState("all");
  const [productSetId, setProductSetId] = useState("all");
  const [team, setTeam] = useState("");
  const [player, setPlayer] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");

  const [users, setUsers] = useState<UserOption[]>([]);
  const [meta, setMeta] = useState<MetaResponse | null>(null);

  const [cardRows, setCardRows] = useState<AnalyticsCardRow[]>([]);
  const [summaryRows, setSummaryRows] = useState<AnalyticsSummaryRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  async function loadMeta() {
    setMetaLoading(true);
    setMetaError(null);

    try {
      const [metaRes, usersRes] = await Promise.all([
        fetch("/api/analytics/meta", { cache: "no-store" }),
        fetch("/api/analytics/users", { cache: "no-store" }),
      ]);

      const metaJson = await metaRes.json().catch(() => null);
      const usersJson = await usersRes.json().catch(() => null);

      if (!metaRes.ok) {
        throw new Error(metaJson?.error ?? `Failed to load analytics metadata (${metaRes.status})`);
      }

      if (!usersRes.ok) {
        throw new Error(usersJson?.error ?? `Failed to load analytics users (${usersRes.status})`);
      }

      setMeta(metaJson as MetaResponse);

      const fetchedUsers = Array.isArray(usersJson?.users) ? usersJson.users : [];
      setUsers(fetchedUsers);

      if (!compareUserAId && fetchedUsers.length > 0) {
        setCompareUserAId(fetchedUsers[0]?.id ?? "");
      }
    } catch (e: unknown) {
      setMetaError(e instanceof Error ? e.message : "Failed to load analytics metadata");
    } finally {
      setMetaLoading(false);
    }
  }

  async function loadCards(nextPage = page) {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("scope", scope);
      params.set("universe", universe);
      params.set("sort", cardsSortBy);
      params.set("page", String(nextPage));
      params.set("pageSize", "50");

      if (compareMode && view === "cards") {
        params.set("compareMode", "1");
        if (compareUserAId) params.set("compareUserAId", compareUserAId);
        if (compareUserBId) params.set("compareUserBId", compareUserBId);
      } else if (scope === "single_user" && selectedUserId) {
        params.set("selectedUserId", selectedUserId);
      }

      if (search.trim()) params.set("search", search.trim());
      if (sport !== "all") params.set("sport", sport);
      if (year !== "all") params.set("year", year);
      if (brand !== "all") params.set("brand", brand);
      if (productId !== "all") params.set("productId", productId);
      if (productSetId !== "all") params.set("productSetId", productSetId);
      if (team.trim()) params.set("team", team.trim());
      if (player.trim()) params.set("player", player.trim());

      const res = await fetch(`/api/analytics/cards?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error ?? `Failed to load analytics cards (${res.status})`);
      }

      setCardRows(Array.isArray(json?.rows) ? json.rows : []);
      setPage(typeof json?.page === "number" ? json.page : nextPage);
      setTotalPages(typeof json?.totalPages === "number" ? json.totalPages : 1);
      setTotal(typeof json?.total === "number" ? json.total : 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load analytics cards");
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary(nextPage = page) {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("scope", scope);
      params.set("universe", universe);
      params.set("groupBy", groupBy);
      params.set("sort", summarySortBy);
      params.set("page", String(nextPage));
      params.set("pageSize", "50");

      if (scope === "single_user" && selectedUserId) {
        params.set("selectedUserId", selectedUserId);
      }

      if (search.trim()) params.set("search", search.trim());
      if (sport !== "all") params.set("sport", sport);
      if (year !== "all") params.set("year", year);
      if (brand !== "all") params.set("brand", brand);
      if (productId !== "all") params.set("productId", productId);
      if (productSetId !== "all") params.set("productSetId", productSetId);
      if (team.trim()) params.set("team", team.trim());
      if (player.trim()) params.set("player", player.trim());

      const res = await fetch(`/api/analytics/summary?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error ?? `Failed to load analytics summary (${res.status})`);
      }

      setSummaryRows(Array.isArray(json?.rows) ? json.rows : []);
      setPage(typeof json?.page === "number" ? json.page : nextPage);
      setTotalPages(typeof json?.totalPages === "number" ? json.totalPages : 1);
      setTotal(typeof json?.total === "number" ? json.total : 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load analytics summary");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!compareUserAId && users.length > 0) {
      setCompareUserAId(users[0].id);
    }
  }, [users, compareUserAId]);

  useEffect(() => {
    if (view === "cards" && compareMode) {
      if (!compareUserAId) {
        setCardRows([]);
        setTotal(0);
        setPage(1);
        setTotalPages(1);
        return;
      }

      loadCards(1);
      return;
    }

    if (scope === "single_user" && !selectedUserId) {
      setCardRows([]);
      setSummaryRows([]);
      setTotal(0);
      setPage(1);
      setTotalPages(1);
      return;
    }

    if (view === "cards") {
      loadCards(1);
    } else {
      loadSummary(1);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    view,
    scope,
    universe,
    cardsSortBy,
    summarySortBy,
    groupBy,
    selectedUserId,
    compareMode,
    compareUserAId,
    compareUserBId,
  ]);

  const filteredProductSets = useMemo(() => {
    const sets = meta?.productSets ?? [];
    if (productId === "all") return sets;
    return sets.filter((ps) => ps.productId === productId);
  }, [meta, productId]);

  const compareUserAOptions = users;
  const compareUserBOptions = users.filter((u) => u.id !== compareUserAId);

  const advancedFilterCount = useMemo(() => {
    let count = 0;
    if (sport !== "all") count += 1;
    if (year !== "all") count += 1;
    if (brand !== "all") count += 1;
    if (productId !== "all") count += 1;
    if (productSetId !== "all") count += 1;
    if (player.trim()) count += 1;
    if (team.trim()) count += 1;
    return count;
  }, [sport, year, brand, productId, productSetId, player, team]);

  function resetFilters() {
    setSearch("");
    setSport("all");
    setYear("all");
    setBrand("all");
    setProductId("all");
    setProductSetId("all");
    setTeam("");
    setPlayer("");
    setCardsSortBy("owned_value_desc");
    setSummarySortBy("owned_value_desc");
    setScope("me");
    setUniverse("owned");
    setGroupBy("player");
    setSelectedUserId("");
    setCompareMode(false);
    setCompareUserBId("");
    setPage(1);
    setAdvancedOpen(false);
  }

  const compareModeActive = view === "cards" && compareMode;

  const scopeLabel =
    scope === "me" ? "My Collection" : scope === "all_users" ? "All Users" : "Specific User";

  const universeLabel = universe === "owned" ? "Owned Only" : "All Known Cards";

  return (
    <div className="analyticsPage">
      <style>{`
        .analyticsPage {
          padding: 14px 12px 28px;
          color: ${colors.text};
        }

        .analyticsShell {
          max-width: 1240px;
          margin: 0 auto;
        }

        .analyticsHeader {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-end;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }

        .analyticsTitle {
          margin: 0;
          font-size: clamp(30px, 6vw, 42px);
          line-height: 1;
          letter-spacing: -0.045em;
          font-weight: 1000;
        }

        .analyticsSubtitle {
          margin-top: 6px;
          max-width: 720px;
          color: ${colors.muted};
          font-size: 13px;
          line-height: 1.45;
          font-weight: 700;
        }

        .analyticsControlCard {
          border: 1px solid ${colors.border};
          border-radius: 16px;
          background: rgba(255,255,255,0.9);
          box-shadow: 0 8px 24px rgba(25,20,14,0.035);
          padding: 10px;
          display: grid;
          gap: 9px;
          margin-bottom: 12px;
        }

        .analyticsPrimaryGrid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 7px;
        }

        .analyticsControl,
        .analyticsSearch {
          width: 100%;
          min-width: 0;
          border: 1px solid ${colors.borderStrong};
          background: #fff;
          color: ${colors.text};
          border-radius: 11px;
          min-height: 38px;
          padding: 8px 9px;
          font-size: 12.5px;
          font-weight: 850;
          outline: none;
        }

        .analyticsSearchRow {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 7px;
          align-items: center;
        }

        .analyticsButton {
          min-height: 38px;
          border-radius: 11px;
          padding: 8px 11px;
          border: 1px solid ${colors.borderStrong};
          background: #fff;
          color: ${colors.text};
          font-size: 12px;
          font-weight: 950;
          cursor: pointer;
        }

        .analyticsButtonPrimary {
          background: ${colors.blue};
          color: #fff;
          border-color: ${colors.blue};
        }

        .analyticsFilterToggle {
          background: ${colors.blueSoft};
          color: ${colors.blue};
          border-color: #c9d9ea;
        }

        .analyticsAdvanced {
          border-top: 1px solid ${colors.border};
          padding-top: 9px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 7px;
        }

        .analyticsAdvancedActions {
          grid-column: 1 / -1;
          display: flex;
          gap: 7px;
          justify-content: flex-end;
        }

        .analyticsStatus {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          padding: 0 2px 9px;
          color: ${colors.muted};
          font-size: 11.5px;
          font-weight: 800;
        }

        .analyticsResultsCard {
          border: 1px solid ${colors.border};
          border-radius: 16px;
          background: ${colors.card};
          overflow: hidden;
        }

        .analyticsMobileSummary {
          display: none;
        }

        .analyticsDesktopTable {
          overflow-x: auto;
        }

        .analyticsDesktopTable table {
          width: 100%;
          border-collapse: collapse;
        }

        .analyticsDesktopTable th {
          text-align: left;
          padding: 8px;
          border-bottom: 1px solid ${colors.border};
          white-space: nowrap;
          color: ${colors.muted};
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: .03em;
        }

        .analyticsDesktopTable td {
          padding: 8px;
          border-bottom: 1px solid #eee;
          font-size: 12.5px;
        }

        .analyticsPagination {
          display: flex;
          justify-content: flex-end;
          gap: 7px;
          align-items: center;
          padding: 10px;
          border-top: 1px solid ${colors.border};
        }

        @media (max-width: 760px) {
          .analyticsPage {
            padding: 10px 8px 22px;
          }

          .analyticsHeader {
            margin-bottom: 9px;
          }

          .analyticsTitle {
            font-size: 30px;
          }

          .analyticsSubtitle {
            font-size: 12px;
            margin-top: 4px;
          }

          .analyticsControlCard {
            padding: 8px;
            border-radius: 14px;
            gap: 7px;
          }

          .analyticsPrimaryGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 6px;
          }

          .analyticsPrimaryGrid .analyticsWide {
            grid-column: 1 / -1;
          }

          .analyticsControl,
          .analyticsSearch {
            min-height: 36px;
            padding: 7px 8px;
            font-size: 12px;
          }

          .analyticsSearchRow {
            grid-template-columns: minmax(0, 1fr) auto;
          }

          .analyticsSearchRow .analyticsReset {
            display: none;
          }

          .analyticsButton {
            min-height: 36px;
            padding: 7px 9px;
          }

          .analyticsAdvanced {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 6px;
          }

          .analyticsAdvanced .analyticsWide {
            grid-column: 1 / -1;
          }

          .analyticsAdvancedActions {
            justify-content: stretch;
          }

          .analyticsAdvancedActions .analyticsButton {
            flex: 1;
          }

          .analyticsStatus {
            font-size: 10.5px;
            padding-bottom: 7px;
          }

          .analyticsDesktopSummaryTable {
            display: none;
          }

          .analyticsMobileSummary {
            display: grid;
          }

          .analyticsMobileSummaryRow {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 54px 58px 82px;
            gap: 6px;
            align-items: center;
            padding: 9px 10px;
            border-bottom: 1px solid #eee;
          }

          .analyticsMobileSummaryHeader {
            color: ${colors.muted};
            font-size: 9px;
            font-weight: 950;
            text-transform: uppercase;
            letter-spacing: .03em;
            background: #faf9f7;
          }

          .analyticsMobileSummaryMain {
            min-width: 0;
          }

          .analyticsMobileSummaryLabel {
            font-size: 13.5px;
            line-height: 1.15;
            font-weight: 1000;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .analyticsMobileSummarySub {
            margin-top: 3px;
            color: ${colors.muted};
            font-size: 9.5px;
            line-height: 1.25;
            font-weight: 750;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .analyticsMobileSummaryValue {
            text-align: right;
            font-size: 12px;
            font-weight: 900;
            white-space: nowrap;
          }

          .analyticsCardsTable table {
            min-width: 980px !important;
          }

          .analyticsPagination {
            justify-content: space-between;
            padding: 8px;
          }
        }
      `}</style>

      <div className="analyticsShell">
        <header className="analyticsHeader">
          <div>
            <h1 className="analyticsTitle">Analytics</h1>
            <div className="analyticsSubtitle">
              Understand your collection, compare ownership, and explore the VCS card universe.
            </div>
          </div>
        </header>

        <section className="analyticsControlCard">
          <div className="analyticsPrimaryGrid">
            <select
              className="analyticsControl"
              value={view}
              onChange={(e) => setView(e.target.value as ViewMode)}
            >
              <option value="summary">Summary</option>
              <option value="cards">Cards</option>
            </select>

            {view === "cards" ? (
              <select
                className="analyticsControl"
                value={compareMode ? "compare" : "standard"}
                onChange={(e) => setCompareMode(e.target.value === "compare")}
              >
                <option value="standard">Standard</option>
                <option value="compare">Compare</option>
              </select>
            ) : (
              <select
                className="analyticsControl"
                value={scope}
                onChange={(e) => setScope(e.target.value as ScopeMode)}
              >
                <option value="me">My Collection</option>
                <option value="all_users">All Users</option>
                <option value="single_user">Specific User</option>
              </select>
            )}

            {compareModeActive ? (
              <>
                <select
                  className="analyticsControl"
                  value={compareUserAId}
                  onChange={(e) => {
                    const nextA = e.target.value;
                    setCompareUserAId(nextA);
                    if (compareUserBId === nextA) setCompareUserBId("");
                  }}
                >
                  <option value="">User A…</option>
                  {compareUserAOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>

                <select
                  className="analyticsControl"
                  value={compareUserBId}
                  onChange={(e) => setCompareUserBId(e.target.value)}
                >
                  <option value="">User B…</option>
                  {compareUserBOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                {view === "cards" ? (
                  <select
                    className="analyticsControl"
                    value={scope}
                    onChange={(e) => setScope(e.target.value as ScopeMode)}
                  >
                    <option value="me">My Collection</option>
                    <option value="all_users">All Users</option>
                    <option value="single_user">Specific User</option>
                  </select>
                ) : null}

                {scope === "single_user" ? (
                  <select
                    className="analyticsControl"
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                  >
                    <option value="">Select user…</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                ) : null}
              </>
            )}

            <select
              className="analyticsControl"
              value={universe}
              onChange={(e) => setUniverse(e.target.value as UniverseMode)}
            >
              <option value="owned">Owned Only</option>
              <option value="all">All Known Cards</option>
            </select>

            {view === "summary" ? (
              <select
                className="analyticsControl"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupByMode)}
              >
                <option value="player">Group: Player</option>
                <option value="team">Group: Team</option>
                <option value="product">Group: Product</option>
                <option value="product_set">Group: Product Set</option>
                <option value="brand">Group: Brand</option>
                <option value="year">Group: Year</option>
                <option value="sport">Group: Sport</option>
              </select>
            ) : null}

            {view === "cards" ? (
              <select
                className="analyticsControl analyticsWide"
                value={cardsSortBy}
                onChange={(e) => setCardsSortBy(e.target.value as CardsSortMode)}
              >
                {!compareModeActive ? (
                  <>
                    <option value="owned_value_desc">Sort: Owned Value</option>
                    <option value="book_value_desc">Sort: Book Value ↓</option>
                    <option value="book_value_asc">Sort: Book Value ↑</option>
                    <option value="owned_qty_desc">Sort: Owned Qty</option>
                    <option value="player_asc">Sort: Player</option>
                    <option value="card_number_asc">Sort: Card Number</option>
                    <option value="year_desc">Sort: Year</option>
                    <option value="brand_asc">Sort: Brand</option>
                  </>
                ) : (
                  <>
                    <option value="a_value_desc">Sort: User A Value</option>
                    <option value="b_value_desc">Sort: User B Value</option>
                    <option value="diff_value_desc">Sort: Diff Value</option>
                    <option value="a_qty_desc">Sort: User A Qty</option>
                    <option value="b_qty_desc">Sort: User B Qty</option>
                    <option value="diff_qty_desc">Sort: Diff Qty</option>
                    <option value="book_value_desc">Sort: Book Value ↓</option>
                    <option value="book_value_asc">Sort: Book Value ↑</option>
                    <option value="player_asc">Sort: Player</option>
                    <option value="card_number_asc">Sort: Card Number</option>
                    <option value="year_desc">Sort: Year</option>
                    <option value="brand_asc">Sort: Brand</option>
                  </>
                )}
              </select>
            ) : (
              <select
                className="analyticsControl analyticsWide"
                value={summarySortBy}
                onChange={(e) => setSummarySortBy(e.target.value as SummarySortMode)}
              >
                <option value="owned_value_desc">Sort: Owned Value</option>
                <option value="owned_qty_desc">Sort: Owned Qty</option>
                <option value="unique_cards_desc">Sort: Unique Cards</option>
                <option value="avg_book_value_desc">Sort: Avg Book Value</option>
                <option value="max_book_value_desc">Sort: Max Book Value</option>
                <option value="name_asc">Sort: Name</option>
              </select>
            )}
          </div>

          <div className="analyticsSearchRow">
            <input
              className="analyticsSearch"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  view === "cards" ? loadCards(1) : loadSummary(1);
                }
              }}
              placeholder="Search player, team, card, set…"
            />

            <button
              className="analyticsButton analyticsFilterToggle"
              type="button"
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              Filters{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""} {advancedOpen ? "▴" : "▾"}
            </button>

            <button
              className="analyticsButton analyticsReset"
              type="button"
              onClick={resetFilters}
            >
              Reset
            </button>
          </div>

          {advancedOpen ? (
            <div className="analyticsAdvanced">
              <select className="analyticsControl" value={sport} onChange={(e) => setSport(e.target.value)}>
                <option value="all">All sports</option>
                {(meta?.sports ?? []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select className="analyticsControl" value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="all">All years</option>
                {(meta?.years ?? []).map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>

              <select className="analyticsControl" value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="all">All brands</option>
                {(meta?.brands ?? []).map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              <select
                className="analyticsControl"
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setProductSetId("all");
                }}
              >
                <option value="all">All products</option>
                {(meta?.products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>

              <select
                className="analyticsControl analyticsWide"
                value={productSetId}
                onChange={(e) => setProductSetId(e.target.value)}
              >
                <option value="all">All product sets</option>
                {filteredProductSets.map((ps) => (
                  <option key={ps.id} value={ps.id}>
                    {ps.label}
                  </option>
                ))}
              </select>

              <input
                className="analyticsSearch"
                value={player}
                onChange={(e) => setPlayer(e.target.value)}
                placeholder="Player filter"
              />

              <input
                className="analyticsSearch"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder="Team filter"
              />

              <div className="analyticsAdvancedActions">
                <button className="analyticsButton" type="button" onClick={resetFilters}>
                  Reset
                </button>
                <button
                  className="analyticsButton analyticsButtonPrimary"
                  type="button"
                  onClick={() => (view === "cards" ? loadCards(1) : loadSummary(1))}
                  disabled={
                    loading ||
                    metaLoading ||
                    (!compareModeActive && scope === "single_user" && !selectedUserId) ||
                    (compareModeActive && !compareUserAId)
                  }
                >
                  {loading ? "Loading…" : "Apply filters"}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {metaError ? (
          <div
            style={{
              marginBottom: 10,
              padding: 10,
              background: colors.redSoft,
              border: "1px solid #fecaca",
              color: colors.red,
              borderRadius: 12,
              fontWeight: 850,
              fontSize: 12,
            }}
          >
            {metaError}
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              marginBottom: 10,
              padding: 10,
              background: colors.redSoft,
              border: "1px solid #fecaca",
              color: colors.red,
              borderRadius: 12,
              fontWeight: 850,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        ) : null}

        <div className="analyticsStatus">
          <div>
            {view === "cards"
              ? `Showing ${cardRows.length.toLocaleString()} of ${total.toLocaleString()} cards`
              : `Showing ${summaryRows.length.toLocaleString()} of ${total.toLocaleString()} groups`}
          </div>

          <div>
            {compareModeActive
              ? `Compare • ${universeLabel}`
              : `${scopeLabel} • ${universeLabel}${view === "summary" ? ` • ${groupBy.replace("_", " ")}` : ""}`}
          </div>
        </div>

        <section className="analyticsResultsCard">
          {metaLoading ? (
            <div style={{ padding: 14, color: colors.muted, fontWeight: 850 }}>
              Loading analytics metadata…
            </div>
          ) : !compareModeActive && scope === "single_user" && !selectedUserId ? (
            <div style={{ padding: 14, color: colors.muted, fontWeight: 850 }}>
              Select a user to load analytics.
            </div>
          ) : compareModeActive && !compareUserAId ? (
            <div style={{ padding: 14, color: colors.muted, fontWeight: 850 }}>
              Select User A to load compare analytics.
            </div>
          ) : loading ? (
            <div style={{ padding: 14, color: colors.muted, fontWeight: 850 }}>Loading…</div>
          ) : view === "summary" ? (
            summaryRows.length === 0 ? (
              <div style={{ padding: 14, color: colors.muted, fontWeight: 850 }}>
                No summary rows found for this filter set.
              </div>
            ) : (
              <>
                <div className="analyticsMobileSummary">
                  <div className="analyticsMobileSummaryRow analyticsMobileSummaryHeader">
                    <div>Group</div>
                    <div style={{ textAlign: "right" }}>Cards</div>
                    <div style={{ textAlign: "right" }}>Qty</div>
                    <div style={{ textAlign: "right" }}>Value</div>
                  </div>

                  {summaryRows.map((row) => (
                    <div key={row.key} className="analyticsMobileSummaryRow">
                      <div className="analyticsMobileSummaryMain">
                        <div className="analyticsMobileSummaryLabel">{row.label}</div>
                        <div className="analyticsMobileSummarySub">
                          Avg {fmtMoney(row.avgBookValue)} · Max {fmtMoney(row.maxBookValue)}
                          {row.topCardLabel ? ` · Top ${row.topCardLabel}` : ""}
                        </div>
                      </div>

                      <div className="analyticsMobileSummaryValue">
                        {row.uniqueCards.toLocaleString()}
                      </div>

                      <div
                        className="analyticsMobileSummaryValue"
                        style={{ color: row.ownedQty > 0 ? colors.green : colors.muted }}
                      >
                        {row.ownedQty.toLocaleString()}
                      </div>

                      <div className="analyticsMobileSummaryValue">
                        {fmtMoney(row.ownedValue)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="analyticsDesktopTable analyticsDesktopSummaryTable">
                  <table style={{ minWidth: 980 }}>
                    <thead>
                      <tr>
                        {[
                          "Group",
                          "Unique Cards",
                          "Owned Qty",
                          "Owned Value",
                          "Avg Book Value",
                          "Max Book Value",
                          "Top Card",
                        ].map((heading) => (
                          <th key={heading}>{heading}</th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {summaryRows.map((row) => (
                        <tr key={row.key}>
                          <td style={{ fontWeight: 900 }}>{row.label}</td>
                          <td>{row.uniqueCards.toLocaleString()}</td>
                          <td style={{ fontWeight: 900, color: row.ownedQty > 0 ? colors.green : colors.muted }}>
                            {row.ownedQty.toLocaleString()}
                          </td>
                          <td style={{ fontWeight: 900 }}>{fmtMoney(row.ownedValue)}</td>
                          <td>{fmtMoney(row.avgBookValue)}</td>
                          <td>{fmtMoney(row.maxBookValue)}</td>
                          <td>{row.topCardLabel || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          ) : cardRows.length === 0 ? (
            <div style={{ padding: 14, color: colors.muted, fontWeight: 850 }}>
              No cards found for this filter set.
            </div>
          ) : (
            <div className="analyticsDesktopTable analyticsCardsTable">
              <table style={{ minWidth: compareModeActive ? 1420 : 1180 }}>
                <thead>
                  <tr>
                    {(compareModeActive
                      ? [
                          "Img",
                          "Player",
                          "Card #",
                          "Team",
                          "Year",
                          "Brand",
                          "Product",
                          "Product Set",
                          "Book Value",
                          "A Qty",
                          "A Value",
                          "B Qty",
                          "B Value",
                          "Diff Qty",
                          "Diff Value",
                        ]
                      : [
                          "Img",
                          "Player",
                          "Card #",
                          "Team",
                          "Year",
                          "Brand",
                          "Product",
                          "Product Set",
                          "Book Value",
                          "Owned Qty",
                          "Owned Value",
                        ]
                    ).map((heading) => (
                      <th key={heading}>{heading}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {cardRows.map((row) => {
                    const img = safeImgSrc(row.frontImageUrl);

                    return (
                      <tr key={row.cardId}>
                        <td style={{ width: 58 }}>
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 7,
                              overflow: "hidden",
                              border: `1px solid ${colors.border}`,
                              background: "#fff",
                              display: "grid",
                              placeItems: "center",
                            }}
                          >
                            {img ? (
                              <img
                                src={img}
                                alt="Card"
                                loading="lazy"
                                decoding="async"
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : (
                              <div style={{ fontSize: 9, color: colors.muted }}>No img</div>
                            )}
                          </div>
                        </td>

                        <td style={{ fontWeight: 900 }}>{row.player}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{row.cardNumber || "—"}</td>
                        <td>{row.team || "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{row.year ?? "—"}</td>
                        <td>{row.brand || "—"}</td>
                        <td>{row.productLabel || "—"}</td>
                        <td>{row.productSetLabel || "—"}</td>
                        <td style={{ whiteSpace: "nowrap", fontWeight: 800 }}>
                          {fmtMoney(row.bookValue)}
                        </td>

                        {compareModeActive ? (
                          <>
                            <td style={{ color: (row.compare?.aQty ?? 0) > 0 ? colors.green : colors.muted, fontWeight: 900 }}>
                              {row.compare?.aQty ?? 0}
                            </td>
                            <td style={{ fontWeight: 900 }}>{fmtMoney(row.compare?.aValue ?? 0)}</td>
                            <td style={{ color: (row.compare?.bQty ?? 0) > 0 ? colors.green : colors.muted, fontWeight: 900 }}>
                              {row.compare?.bQty ?? 0}
                            </td>
                            <td style={{ fontWeight: 900 }}>{fmtMoney(row.compare?.bValue ?? 0)}</td>
                            <td
                              style={{
                                fontWeight: 900,
                                color:
                                  (row.compare?.diffQty ?? 0) > 0
                                    ? colors.green
                                    : (row.compare?.diffQty ?? 0) < 0
                                    ? colors.red
                                    : colors.muted,
                              }}
                            >
                              {row.compare?.diffQty ?? 0}
                            </td>
                            <td
                              style={{
                                fontWeight: 900,
                                color:
                                  (row.compare?.diffValue ?? 0) > 0
                                    ? colors.green
                                    : (row.compare?.diffValue ?? 0) < 0
                                    ? colors.red
                                    : colors.muted,
                              }}
                            >
                              {fmtMoney(row.compare?.diffValue ?? 0)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ color: (row.ownedQty ?? 0) > 0 ? colors.green : colors.muted, fontWeight: 900 }}>
                              {row.ownedQty ?? 0}
                            </td>
                            <td style={{ fontWeight: 900 }}>{fmtMoney(row.ownedValue ?? 0)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="analyticsPagination">
            <button
              className="analyticsButton"
              type="button"
              onClick={() =>
                view === "cards"
                  ? loadCards(Math.max(1, page - 1))
                  : loadSummary(Math.max(1, page - 1))
              }
              disabled={loading || page <= 1}
            >
              ‹ Prev
            </button>

            <div style={{ color: colors.muted, fontSize: 11.5, fontWeight: 850 }}>
              {page} / {totalPages}
            </div>

            <button
              className="analyticsButton"
              type="button"
              onClick={() =>
                view === "cards"
                  ? loadCards(Math.min(totalPages, page + 1))
                  : loadSummary(Math.min(totalPages, page + 1))
              }
              disabled={loading || page >= totalPages}
            >
              Next ›
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
