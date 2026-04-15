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

      if (!metaRes.ok) throw new Error(metaJson?.error ?? `Failed to load analytics metadata (${metaRes.status})`);
      if (!usersRes.ok) throw new Error(usersJson?.error ?? `Failed to load analytics users (${usersRes.status})`);

      setMeta(metaJson as MetaResponse);
      const fetchedUsers = Array.isArray(usersJson?.users) ? usersJson.users : [];
      setUsers(fetchedUsers);

      if (!compareUserAId && fetchedUsers.length > 0) {
        setCompareUserAId(fetchedUsers[0]?.id ?? "");
      }
    } catch (e: any) {
      setMetaError(e?.message ?? "Failed to load analytics metadata");
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
      } else {
        if (scope === "single_user" && selectedUserId) params.set("selectedUserId", selectedUserId);
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
      const j = await res.json().catch(() => null);

      if (!res.ok) throw new Error(j?.error ?? `Failed to load analytics cards (${res.status})`);

      setCardRows(Array.isArray(j?.rows) ? j.rows : []);
      setPage(typeof j?.page === "number" ? j.page : nextPage);
      setTotalPages(typeof j?.totalPages === "number" ? j.totalPages : 1);
      setTotal(typeof j?.total === "number" ? j.total : 0);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load analytics cards");
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

      if (scope === "single_user" && selectedUserId) params.set("selectedUserId", selectedUserId);
      if (search.trim()) params.set("search", search.trim());
      if (sport !== "all") params.set("sport", sport);
      if (year !== "all") params.set("year", year);
      if (brand !== "all") params.set("brand", brand);
      if (productId !== "all") params.set("productId", productId);
      if (productSetId !== "all") params.set("productSetId", productSetId);
      if (team.trim()) params.set("team", team.trim());
      if (player.trim()) params.set("player", player.trim());

      const res = await fetch(`/api/analytics/summary?${params.toString()}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);

      if (!res.ok) throw new Error(j?.error ?? `Failed to load analytics summary (${res.status})`);

      setSummaryRows(Array.isArray(j?.rows) ? j.rows : []);
      setPage(typeof j?.page === "number" ? j.page : nextPage);
      setTotalPages(typeof j?.totalPages === "number" ? j.totalPages : 1);
      setTotal(typeof j?.total === "number" ? j.total : 0);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load analytics summary");
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
  }

  const compareModeActive = view === "cards" && compareMode;

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 6 }}>
        Analytics
      </h1>

      <div style={{ color: "#555", marginBottom: 16 }}>
        Explore your collection, compare ownership scope, and browse the full card universe like a built-in price guide.
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          padding: 12,
          border: "1px solid #ddd",
          background: "#fafafa",
          borderRadius: 12,
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <select value={view} onChange={(e) => setView(e.target.value as ViewMode)} style={{ padding: 8 }}>
          <option value="summary">Summary</option>
          <option value="cards">Cards</option>
        </select>

        {view === "cards" && (
          <select
            value={compareMode ? "compare" : "standard"}
            onChange={(e) => setCompareMode(e.target.value === "compare")}
            style={{ padding: 8 }}
          >
            <option value="standard">Standard Mode</option>
            <option value="compare">Compare Mode</option>
          </select>
        )}

        {compareModeActive ? (
          <>
            <select
              value={compareUserAId}
              onChange={(e) => {
                const nextA = e.target.value;
                setCompareUserAId(nextA);
                if (compareUserBId === nextA) setCompareUserBId("");
              }}
              style={{ padding: 8, minWidth: 220 }}
            >
              <option value="">User A…</option>
              {compareUserAOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>

            <select
              value={compareUserBId}
              onChange={(e) => setCompareUserBId(e.target.value)}
              style={{ padding: 8, minWidth: 220 }}
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
            <select value={scope} onChange={(e) => setScope(e.target.value as ScopeMode)} style={{ padding: 8 }}>
              <option value="me">My Collection</option>
              <option value="all_users">All Users</option>
              <option value="single_user">Specific User</option>
            </select>

            {scope === "single_user" && (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{ padding: 8, minWidth: 220 }}
              >
                <option value="">Select a user…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            )}
          </>
        )}

        <select value={universe} onChange={(e) => setUniverse(e.target.value as UniverseMode)} style={{ padding: 8 }}>
          <option value="owned">Owned Only</option>
          <option value="all">All Known Cards</option>
        </select>

        {view === "summary" && (
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupByMode)} style={{ padding: 8 }}>
            <option value="player">Group: Player</option>
            <option value="team">Group: Team</option>
            <option value="product">Group: Product</option>
            <option value="product_set">Group: Product Set</option>
            <option value="brand">Group: Brand</option>
            <option value="year">Group: Year</option>
            <option value="sport">Group: Sport</option>
          </select>
        )}

        {view === "cards" ? (
          <select value={cardsSortBy} onChange={(e) => setCardsSortBy(e.target.value as CardsSortMode)} style={{ padding: 8 }}>
            {!compareModeActive ? (
              <>
                <option value="owned_value_desc">Sort: Owned Value</option>
                <option value="book_value_desc">Sort: Book Value (high → low)</option>
                <option value="book_value_asc">Sort: Book Value (low → high)</option>
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
                <option value="book_value_desc">Sort: Book Value (high → low)</option>
                <option value="book_value_asc">Sort: Book Value (low → high)</option>
                <option value="player_asc">Sort: Player</option>
                <option value="card_number_asc">Sort: Card Number</option>
                <option value="year_desc">Sort: Year</option>
                <option value="brand_asc">Sort: Brand</option>
              </>
            )}
          </select>
        ) : (
          <select value={summarySortBy} onChange={(e) => setSummarySortBy(e.target.value as SummarySortMode)} style={{ padding: 8 }}>
            <option value="owned_value_desc">Sort: Owned Value</option>
            <option value="owned_qty_desc">Sort: Owned Qty</option>
            <option value="unique_cards_desc">Sort: Unique Cards</option>
            <option value="avg_book_value_desc">Sort: Avg Book Value</option>
            <option value="max_book_value_desc">Sort: Max Book Value</option>
            <option value="name_asc">Sort: Name</option>
          </select>
        )}

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search card/player/team/set…"
          style={{ padding: 8, minWidth: 220 }}
        />

        <select value={sport} onChange={(e) => setSport(e.target.value)} style={{ padding: 8 }}>
          <option value="all">All sports</option>
          {(meta?.sports ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select value={year} onChange={(e) => setYear(e.target.value)} style={{ padding: 8 }}>
          <option value="all">All years</option>
          {(meta?.years ?? []).map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>

        <select value={brand} onChange={(e) => setBrand(e.target.value)} style={{ padding: 8 }}>
          <option value="all">All brands</option>
          {(meta?.brands ?? []).map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <select
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            setProductSetId("all");
          }}
          style={{ padding: 8, minWidth: 220 }}
        >
          <option value="all">All products</option>
          {(meta?.products ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        <select
          value={productSetId}
          onChange={(e) => setProductSetId(e.target.value)}
          style={{ padding: 8, minWidth: 220 }}
        >
          <option value="all">All product sets</option>
          {filteredProductSets.map((ps) => (
            <option key={ps.id} value={ps.id}>
              {ps.label}
            </option>
          ))}
        </select>

        <input
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
          placeholder="Player filter"
          style={{ padding: 8, minWidth: 180 }}
        />

        <input
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          placeholder="Team filter"
          style={{ padding: 8, minWidth: 180 }}
        />

        <button
          onClick={() => (view === "cards" ? loadCards(1) : loadSummary(1))}
          disabled={
            loading ||
            metaLoading ||
            (!compareModeActive && scope === "single_user" && !selectedUserId) ||
            (compareModeActive && !compareUserAId)
          }
          style={{ padding: "8px 12px", fontWeight: 800 }}
        >
          {loading ? "Loading..." : "Apply"}
        </button>

        <button onClick={resetFilters} style={{ padding: "8px 12px", fontWeight: 800 }}>
          Reset
        </button>
      </div>

      {metaError && (
        <div style={{ marginBottom: 12, padding: 12, background: "#fee", border: "1px solid #f99", borderRadius: 12 }}>
          {metaError}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 12, padding: 12, background: "#fee", border: "1px solid #f99", borderRadius: 12 }}>
          {error}
        </div>
      )}

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          background: "white",
        }}
      >
        {metaLoading ? (
          <div>Loading analytics metadata…</div>
        ) : !compareModeActive && scope === "single_user" && !selectedUserId ? (
          <div>Select a user to load analytics.</div>
        ) : compareModeActive && !compareUserAId ? (
          <div>Select User A to load compare analytics.</div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12,
                color: "#555",
                fontSize: 13,
              }}
            >
              <div>
                {view === "cards"
                  ? `Showing ${cardRows.length} of ${total} cards`
                  : `Showing ${summaryRows.length} of ${total} groups`}
              </div>
              <div>
                {compareModeActive ? (
                  <>
                    Mode: <b>Compare</b> • Universe: <b>{universe === "owned" ? "Owned Only" : "All Known Cards"}</b>
                  </>
                ) : (
                  <>
                    Scope: <b>{scope === "me" ? "My Collection" : scope === "all_users" ? "All Users" : "Specific User"}</b> • Universe:{" "}
                    <b>{universe === "owned" ? "Owned Only" : "All Known Cards"}</b>
                    {view === "summary" ? (
                      <>
                        {" "}• Grouped by <b>{groupBy.replace("_", " ")}</b>
                      </>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {loading ? (
              <div>Loading…</div>
            ) : view === "cards" ? (
              cardRows.length === 0 ? (
                <div>No cards found for this filter set.</div>
              ) : (
                <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 12 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: compareModeActive ? 1420 : 1180 }}>
                    <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
                      <tr>
                        {(
                          compareModeActive
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
                        ).map((h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: "left",
                              padding: 8,
                              borderBottom: "1px solid #ddd",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cardRows.map((r, idx) => {
                        const zebra = idx % 2 === 0 ? "#fff" : "#fcfcfc";
                        const img = safeImgSrc(r.frontImageUrl);

                        return (
                          <tr key={r.cardId} style={{ background: zebra }}>
                            <td style={{ padding: 8, borderBottom: "1px solid #eee", width: 64 }}>
                              <div
                                style={{
                                  width: 44,
                                  height: 44,
                                  borderRadius: 8,
                                  overflow: "hidden",
                                  border: "1px solid #ddd",
                                  background: "white",
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
                                  <div style={{ fontSize: 10, color: "#777" }}>No img</div>
                                )}
                              </div>
                            </td>

                            <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 800 }}>
                              {r.player}
                            </td>

                            <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                              {r.cardNumber || "—"}
                            </td>

                            <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                              {r.team || "—"}
                            </td>

                            <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                              {r.year ?? "—"}
                            </td>

                            <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                              {r.brand || "—"}
                            </td>

                            <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                              {r.productLabel || "—"}
                            </td>

                            <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                              {r.productSetLabel || "—"}
                            </td>

                            <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap", fontWeight: 700 }}>
                              {fmtMoney(r.bookValue)}
                            </td>

                            {compareModeActive ? (
                              <>
                                <td
                                  style={{
                                    padding: 8,
                                    borderBottom: "1px solid #eee",
                                    whiteSpace: "nowrap",
                                    fontWeight: 800,
                                    color: (r.compare?.aQty ?? 0) > 0 ? "#1f5133" : "#666",
                                  }}
                                >
                                  {r.compare?.aQty ?? 0}
                                </td>
                                <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap", fontWeight: 800 }}>
                                  {fmtMoney(r.compare?.aValue ?? 0)}
                                </td>
                                <td
                                  style={{
                                    padding: 8,
                                    borderBottom: "1px solid #eee",
                                    whiteSpace: "nowrap",
                                    fontWeight: 800,
                                    color: (r.compare?.bQty ?? 0) > 0 ? "#1f5133" : "#666",
                                  }}
                                >
                                  {r.compare?.bQty ?? 0}
                                </td>
                                <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap", fontWeight: 800 }}>
                                  {fmtMoney(r.compare?.bValue ?? 0)}
                                </td>
                                <td
                                  style={{
                                    padding: 8,
                                    borderBottom: "1px solid #eee",
                                    whiteSpace: "nowrap",
                                    fontWeight: 800,
                                    color:
                                      (r.compare?.diffQty ?? 0) > 0
                                        ? "#1f5133"
                                        : (r.compare?.diffQty ?? 0) < 0
                                        ? "#8a1c1c"
                                        : "#666",
                                  }}
                                >
                                  {r.compare?.diffQty ?? 0}
                                </td>
                                <td
                                  style={{
                                    padding: 8,
                                    borderBottom: "1px solid #eee",
                                    whiteSpace: "nowrap",
                                    fontWeight: 800,
                                    color:
                                      (r.compare?.diffValue ?? 0) > 0
                                        ? "#1f5133"
                                        : (r.compare?.diffValue ?? 0) < 0
                                        ? "#8a1c1c"
                                        : "#666",
                                  }}
                                >
                                  {fmtMoney(r.compare?.diffValue ?? 0)}
                                </td>
                              </>
                            ) : (
                              <>
                                <td
                                  style={{
                                    padding: 8,
                                    borderBottom: "1px solid #eee",
                                    whiteSpace: "nowrap",
                                    fontWeight: 800,
                                    color: (r.ownedQty ?? 0) > 0 ? "#1f5133" : "#666",
                                  }}
                                >
                                  {r.ownedQty ?? 0}
                                </td>

                                <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap", fontWeight: 800 }}>
                                  {fmtMoney(r.ownedValue ?? 0)}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : summaryRows.length === 0 ? (
              <div>No summary rows found for this filter set.</div>
            ) : (
              <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                  <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
                    <tr>
                      {[
                        "Group",
                        "Unique Cards",
                        "Owned Qty",
                        "Owned Value",
                        "Avg Book Value",
                        "Max Book Value",
                        "Top Card",
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: 8,
                            borderBottom: "1px solid #ddd",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((r, idx) => {
                      const zebra = idx % 2 === 0 ? "#fff" : "#fcfcfc";

                      return (
                        <tr key={r.key} style={{ background: zebra }}>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 800 }}>
                            {r.label}
                          </td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                            {r.uniqueCards.toLocaleString()}
                          </td>
                          <td
                            style={{
                              padding: 8,
                              borderBottom: "1px solid #eee",
                              whiteSpace: "nowrap",
                              fontWeight: 800,
                              color: r.ownedQty > 0 ? "#1f5133" : "#666",
                            }}
                          >
                            {r.ownedQty.toLocaleString()}
                          </td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap", fontWeight: 800 }}>
                            {fmtMoney(r.ownedValue)}
                          </td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                            {fmtMoney(r.avgBookValue)}
                          </td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                            {fmtMoney(r.maxBookValue)}
                          </td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                            {r.topCardLabel || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button
                onClick={() => (view === "cards" ? loadCards(Math.max(1, page - 1)) : loadSummary(Math.max(1, page - 1)))}
                disabled={loading || page <= 1}
                style={{ padding: "8px 12px", fontWeight: 800 }}
              >
                Prev
              </button>
              <div style={{ alignSelf: "center", fontSize: 13, color: "#555" }}>
                Page <b>{page}</b> / {totalPages}
              </div>
              <button
                onClick={() =>
                  view === "cards"
                    ? loadCards(Math.min(totalPages, page + 1))
                    : loadSummary(Math.min(totalPages, page + 1))
                }
                disabled={loading || page >= totalPages}
                style={{ padding: "8px 12px", fontWeight: 800 }}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}