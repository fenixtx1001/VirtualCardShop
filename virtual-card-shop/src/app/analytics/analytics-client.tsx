"use client";

import { useEffect, useMemo, useState } from "react";

type ViewMode = "summary" | "cards";
type ScopeMode = "me" | "all_users" | "single_user";
type UniverseMode = "owned" | "all";
type CardsSortMode =
  | "owned_value_desc"
  | "book_value_desc"
  | "book_value_asc"
  | "owned_qty_desc"
  | "player_asc"
  | "year_desc"
  | "brand_asc";

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

type AnalyticsCardRow = {
  cardId: number;
  player: string;
  cardNumber: string;
  team: string | null;
  bookValue: number;
  ownedQty: number;
  ownedValue: number;
  frontImageUrl: string | null;
  year: number | null;
  brand: string | null;
  sport: string | null;
  productId: string | null;
  productLabel: string | null;
  productSetId: string | null;
  productSetLabel: string | null;
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
  const [groupBy, setGroupBy] = useState("player");

  const [sortBy, setSortBy] = useState<CardsSortMode>("owned_value_desc");

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

  const [rows, setRows] = useState<AnalyticsCardRow[]>([]);
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
      setUsers(Array.isArray(usersJson?.users) ? usersJson.users : []);
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
      params.set("sort", sortBy);
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

      const res = await fetch(`/api/analytics/cards?${params.toString()}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);

      if (!res.ok) throw new Error(j?.error ?? `Failed to load analytics cards (${res.status})`);

      setRows(Array.isArray(j?.rows) ? j.rows : []);
      setPage(typeof j?.page === "number" ? j.page : nextPage);
      setTotalPages(typeof j?.totalPages === "number" ? j.totalPages : 1);
      setTotal(typeof j?.total === "number" ? j.total : 0);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load analytics cards");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    if (view !== "cards") return;
    if (scope === "single_user" && !selectedUserId) {
      setRows([]);
      setTotal(0);
      setPage(1);
      setTotalPages(1);
      return;
    }
    loadCards(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, scope, universe, sortBy, selectedUserId]);

  const filteredProductSets = useMemo(() => {
    const sets = meta?.productSets ?? [];
    if (productId === "all") return sets;
    return sets.filter((ps) => ps.productId === productId);
  }, [meta, productId]);

  function resetFilters() {
    setSearch("");
    setSport("all");
    setYear("all");
    setBrand("all");
    setProductId("all");
    setProductSetId("all");
    setTeam("");
    setPlayer("");
    setSortBy("owned_value_desc");
    setScope("me");
    setUniverse("owned");
    setSelectedUserId("");
    setPage(1);
  }

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

        <select value={universe} onChange={(e) => setUniverse(e.target.value as UniverseMode)} style={{ padding: 8 }}>
          <option value="owned">Owned Only</option>
          <option value="all">All Known Cards</option>
        </select>

        {view === "summary" && (
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={{ padding: 8 }}>
            <option value="player">Player</option>
            <option value="team">Team</option>
            <option value="product">Product</option>
            <option value="product_set">Product Set</option>
            <option value="brand">Brand</option>
            <option value="year">Year</option>
            <option value="sport">Sport</option>
          </select>
        )}

        {view === "cards" && (
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as CardsSortMode)} style={{ padding: 8 }}>
            <option value="owned_value_desc">Sort: Owned Value</option>
            <option value="book_value_desc">Sort: Book Value (high → low)</option>
            <option value="book_value_asc">Sort: Book Value (low → high)</option>
            <option value="owned_qty_desc">Sort: Owned Qty</option>
            <option value="player_asc">Sort: Player</option>
            <option value="year_desc">Sort: Year</option>
            <option value="brand_asc">Sort: Brand</option>
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
          onClick={() => loadCards(1)}
          disabled={view !== "cards" || loading || metaLoading || (scope === "single_user" && !selectedUserId)}
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
        {view === "summary" ? (
          <div style={{ fontWeight: 700 }}>Summary table coming next phase…</div>
        ) : metaLoading ? (
          <div>Loading analytics metadata…</div>
        ) : scope === "single_user" && !selectedUserId ? (
          <div>Select a user to load card analytics.</div>
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
                Showing <b>{rows.length}</b> of <b>{total}</b> cards
              </div>
              <div>
                Scope: <b>{scope === "me" ? "My Collection" : scope === "all_users" ? "All Users" : "Specific User"}</b> • Universe:{" "}
                <b>{universe === "owned" ? "Owned Only" : "All Known Cards"}</b>
              </div>
            </div>

            {loading ? (
              <div>Loading cards…</div>
            ) : rows.length === 0 ? (
              <div>No cards found for this filter set.</div>
            ) : (
              <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
                  <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
                    <tr>
                      {[
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
                    {rows.map((r, idx) => {
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

                          <td
                            style={{
                              padding: 8,
                              borderBottom: "1px solid #eee",
                              whiteSpace: "nowrap",
                              fontWeight: 800,
                              color: r.ownedQty > 0 ? "#1f5133" : "#666",
                            }}
                          >
                            {r.ownedQty}
                          </td>

                          <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap", fontWeight: 800 }}>
                            {fmtMoney(r.ownedValue)}
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
                onClick={() => loadCards(Math.max(1, page - 1))}
                disabled={loading || page <= 1}
                style={{ padding: "8px 12px", fontWeight: 800 }}
              >
                Prev
              </button>
              <div style={{ alignSelf: "center", fontSize: 13, color: "#555" }}>
                Page <b>{page}</b> / {totalPages}
              </div>
              <button
                onClick={() => loadCards(Math.min(totalPages, page + 1))}
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