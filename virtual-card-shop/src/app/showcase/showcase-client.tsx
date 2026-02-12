// src/app/showcase/showcase-client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type UserOption = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

type LeaderRow = {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  totalCards: number;
  totalValue: number;
  completedBaseSets: number;
};

type TopCardRow = {
  cardId: number;
  cardNumber: string;
  player: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  isInsert: boolean;
  bookValue: number;
  qty: number;
  ownedValue: number; // now == bookValue (single-card value)
  frontImageUrl: string | null;
  productSetId: string | null;
};

type TopCardsResponse = {
  ok: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rows: TopCardRow[];
  error?: string;
};

const colors = {
  bg: "#fbfaf7",
  card: "#ffffff",
  border: "#e7e3dc",
  text: "#1f1f1f",
  subtext: "#5a5a5a",
  accent: "#2f6fed",
  muted: "#f2efe9",
};

function money(n: any) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function safeInt(n: any) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.round(v);
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatUserLabel(u: UserOption) {
  const name = (u.name ?? "").trim();
  if (name) return name;
  const email = (u.email ?? "").trim();
  return email || "Unknown";
}

export default function ShowcaseClient() {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // "" === Me
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbErr, setLbErr] = useState<string | null>(null);

  const [topCards, setTopCards] = useState<TopCardRow[]>([]);
  const [topLoading, setTopLoading] = useState(false);
  const [topErr, setTopErr] = useState<string | null>(null);

  // Top cards pagination
  const [topPage, setTopPage] = useState(1);
  const [topTotalPages, setTopTotalPages] = useState(1);
  const [topTotal, setTopTotal] = useState(0);
  const topPageSize = 20; // 20 per page

  const [jumpTo, setJumpTo] = useState<string>("");

  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  // favorites (stub for now)
  const [favorites, setFavorites] = useState<TopCardRow[]>([]);
  const [favLoading, setFavLoading] = useState(false);

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/showcase/users", { cache: "no-store" });
      const raw = await res.text();
      const j = raw ? JSON.parse(raw) : null;
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      setUsers(Array.isArray(j?.users) ? j.users : []);
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadLeaderboard() {
    setLbLoading(true);
    setLbErr(null);
    try {
      const res = await fetch("/api/showcase/leaderboard", { cache: "no-store" });
      const raw = await res.text();
      const j = raw ? JSON.parse(raw) : null;
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      setLeaderboard(Array.isArray(j?.rows) ? j.rows : []);
    } catch (e: any) {
      setLeaderboard([]);
      setLbErr(e?.message ?? "Failed to load leaderboard");
    } finally {
      setLbLoading(false);
    }
  }

  async function loadTopCards(userId: string, page: number) {
    setTopLoading(true);
    setTopErr(null);
    try {
      const qs = new URLSearchParams();
      if (userId) qs.set("userId", userId);
      qs.set("page", String(page));
      qs.set("pageSize", String(topPageSize));

      const res = await fetch(`/api/showcase/top-cards?${qs.toString()}`, { cache: "no-store" });
      const raw = await res.text();
      const j = raw ? JSON.parse(raw) : null;
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      const data = j as TopCardsResponse;
      setTopCards(Array.isArray(data?.rows) ? data.rows : []);
      setTopPage(typeof data?.page === "number" ? data.page : page);
      setTopTotalPages(typeof data?.totalPages === "number" ? data.totalPages : 1);
      setTopTotal(typeof data?.total === "number" ? data.total : 0);
    } catch (e: any) {
      setTopCards([]);
      setTopErr(e?.message ?? "Failed to load top cards");
      setTopPage(page);
      setTopTotalPages(1);
      setTopTotal(0);
    } finally {
      setTopLoading(false);
    }
  }

  async function loadFavorites(userId: string) {
    setFavLoading(true);
    try {
      const qs = new URLSearchParams();
      if (userId) qs.set("userId", userId);
      qs.set("limit", "60");

      const res = await fetch(`/api/showcase/favorites?${qs.toString()}`, { cache: "no-store" });
      const raw = await res.text();
      const j = raw ? JSON.parse(raw) : null;
      setFavorites(Array.isArray(j?.rows) ? j.rows : []);
    } catch {
      setFavorites([]);
    } finally {
      setFavLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    loadLeaderboard();
  }, []);

  // When selected user changes, reset Top Cards pagination to page 1
  useEffect(() => {
    setTopPage(1);
    setJumpTo("");
    loadTopCards(selectedUserId, 1);
    loadFavorites(selectedUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  const selectedLabel = useMemo(() => {
    if (!selectedUserId) return "Me";
    const u = users.find((x) => x.id === selectedUserId);
    return u ? formatUserLabel(u) : "User";
  }, [selectedUserId, users]);

  const canPrevTop = topPage > 1;
  const canNextTop = topPage < topTotalPages;

  function goTopPrev() {
    if (!canPrevTop || topLoading) return;
    const next = topPage - 1;
    setTopPage(next);
    loadTopCards(selectedUserId, next);
  }

  function goTopNext() {
    if (!canNextTop || topLoading) return;
    const next = topPage + 1;
    setTopPage(next);
    loadTopCards(selectedUserId, next);
  }

  function doTopJump() {
    const n = clampInt(parseInt(jumpTo || "1", 10) || 1, 1, topTotalPages);
    setTopPage(n);
    loadTopCards(selectedUserId, n);
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
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header card */}
        <div
          style={{
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.4 }}>Showcase</div>
              <div style={{ marginTop: 6, color: colors.subtext, fontSize: 13, lineHeight: 1.5 }}>
                Leaderboards, top cards, and the stuff worth flexing.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900, color: colors.subtext }}>Viewing:</div>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{
                  padding: "8px 10px",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 10,
                  minWidth: 220,
                  fontWeight: 800,
                  background: "white",
                }}
              >
                <option value="">Me</option>
                {usersLoading
                  ? null
                  : users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {formatUserLabel(u)}
                      </option>
                    ))}
              </select>

              <button
                onClick={() => {
                  loadLeaderboard();
                  loadTopCards(selectedUserId, topPage);
                  loadFavorites(selectedUserId);
                }}
                style={{
                  border: `1px solid ${colors.border}`,
                  background: colors.muted,
                  borderRadius: 10,
                  padding: "8px 12px",
                  fontWeight: 900,
                  cursor: "pointer",
                  height: 38,
                }}
                title="Refresh Showcase"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Leaderboard */}
        <section
          style={{
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900 }}>Leaderboard</div>
              <div style={{ marginTop: 4, fontSize: 13, color: colors.subtext }}>
                Total cards, total value, and completed base sets.
              </div>
            </div>
            <div style={{ fontSize: 12, color: colors.subtext, fontWeight: 800 }}>
              {lbLoading ? "Loading…" : `${leaderboard.length} users`}
            </div>
          </div>

          {lbErr ? (
            <div style={{ marginTop: 12, padding: 10, background: "#fff1f1", border: "1px solid #f3b7b7", borderRadius: 12 }}>
              {lbErr}
            </div>
          ) : null}

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead style={{ background: "#f7f7f7" }}>
                <tr>
                  {["User", "Total Cards", "Collection Value", "Completed Base Sets"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: 12,
                        borderBottom: `1px solid ${colors.border}`,
                        whiteSpace: "nowrap",
                        fontWeight: 900,
                        fontSize: 12,
                        color: "#333",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lbLoading ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 12, color: colors.subtext, fontWeight: 800 }}>
                      Loading…
                    </td>
                  </tr>
                ) : leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 12, color: colors.subtext, fontWeight: 800 }}>
                      No users found.
                    </td>
                  </tr>
                ) : (
                  leaderboard.map((r, idx) => (
                    <tr key={r.userId} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                      <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 999,
                              border: `1px solid ${colors.border}`,
                              background: colors.muted,
                              overflow: "hidden",
                              display: "grid",
                              placeItems: "center",
                              fontWeight: 900,
                              color: "#666",
                              flex: "0 0 auto",
                            }}
                            title={r.email ?? ""}
                          >
                            {r.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              (r.name?.trim()?.[0] ?? r.email?.trim()?.[0] ?? "?").toUpperCase()
                            )}
                          </div>
                          <div>
                            <div style={{ fontWeight: 900 }}>{r.name?.trim() || r.email || "Unknown"}</div>
                            <div style={{ fontSize: 12, color: colors.subtext }}>{r.email ?? ""}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {safeInt(r.totalCards).toLocaleString()}
                      </td>
                      <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {money(r.totalValue)}
                      </td>
                      <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {safeInt(r.completedBaseSets).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Top cards */}
        <section
          style={{
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900 }}>Top Cards by Value</div>
              <div style={{ marginTop: 4, fontSize: 13, color: colors.subtext }}>
                Top 100 for <span style={{ fontWeight: 900 }}>{selectedLabel}</span> (ranked by <b>single-card</b> book value).
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {/* Pagination */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={goTopPrev}
                  disabled={!canPrevTop || topLoading}
                  style={{
                    border: `1px solid ${colors.border}`,
                    background: colors.muted,
                    borderRadius: 10,
                    padding: "8px 10px",
                    fontWeight: 900,
                    cursor: !canPrevTop || topLoading ? "not-allowed" : "pointer",
                    opacity: !canPrevTop || topLoading ? 0.6 : 1,
                  }}
                >
                  ← Prev
                </button>

                <div style={{ fontWeight: 900, color: colors.subtext, whiteSpace: "nowrap" }}>
                  Page {topPage} of {topTotalPages}{" "}
                  <span style={{ fontWeight: 800 }}>• {topTotal} cards</span>
                </div>

                <button
                  onClick={goTopNext}
                  disabled={!canNextTop || topLoading}
                  style={{
                    border: `1px solid ${colors.border}`,
                    background: colors.muted,
                    borderRadius: 10,
                    padding: "8px 10px",
                    fontWeight: 900,
                    cursor: !canNextTop || topLoading ? "not-allowed" : "pointer",
                    opacity: !canNextTop || topLoading ? 0.6 : 1,
                  }}
                >
                  Next →
                </button>

                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    value={jumpTo}
                    onChange={(e) => setJumpTo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") doTopJump();
                    }}
                    placeholder="Jump"
                    inputMode="numeric"
                    style={{
                      width: 80,
                      padding: "8px 10px",
                      border: `1px solid ${colors.border}`,
                      borderRadius: 10,
                      fontWeight: 900,
                      background: "white",
                    }}
                  />
                  <button
                    onClick={doTopJump}
                    disabled={topLoading}
                    style={{
                      border: `1px solid ${colors.border}`,
                      background: colors.muted,
                      borderRadius: 10,
                      padding: "8px 10px",
                      fontWeight: 900,
                      cursor: topLoading ? "not-allowed" : "pointer",
                      opacity: topLoading ? 0.6 : 1,
                    }}
                  >
                    Go
                  </button>
                </div>
              </div>

              {/* View toggle */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={() => setViewMode("cards")}
                  style={{
                    border: `1px solid ${colors.border}`,
                    background: viewMode === "cards" ? "#ffffff" : colors.muted,
                    borderRadius: 10,
                    padding: "8px 10px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Cards
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  style={{
                    border: `1px solid ${colors.border}`,
                    background: viewMode === "table" ? "#ffffff" : colors.muted,
                    borderRadius: 10,
                    padding: "8px 10px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Table
                </button>
              </div>
            </div>
          </div>

          {topErr ? (
            <div style={{ marginTop: 12, padding: 10, background: "#fff1f1", border: "1px solid #f3b7b7", borderRadius: 12 }}>
              {topErr}
            </div>
          ) : null}

          {topLoading ? (
            <div style={{ marginTop: 12, color: colors.subtext, fontWeight: 800 }}>Loading…</div>
          ) : topCards.length === 0 ? (
            <div style={{ marginTop: 12, color: colors.subtext, fontWeight: 800 }}>
              No owned cards yet (or no book values set).
            </div>
          ) : viewMode === "table" ? (
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                <thead style={{ background: "#f7f7f7" }}>
                  <tr>
                    {["Card", "Player", "Team", "Book Value", "Qty", "Card Value"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: 12,
                          borderBottom: `1px solid ${colors.border}`,
                          whiteSpace: "nowrap",
                          fontWeight: 900,
                          fontSize: 12,
                          color: "#333",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topCards.map((c, idx) => (
                    <tr key={c.cardId} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                      <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        #{c.cardNumber}
                      </td>
                      <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{c.player}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{c.team ?? "—"}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {money(c.bookValue)}
                      </td>
                      <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {safeInt(c.qty)}
                      </td>
                      <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {money(c.ownedValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                gap: 12,
              }}
            >
              {topCards.map((c) => (
                <div
                  key={c.cardId}
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: 16,
                    background: "#fff",
                    overflow: "hidden",
                    boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
                  }}
                >
                  <div style={{ padding: 12, borderBottom: `1px solid ${colors.border}` }}>
                    <div style={{ fontWeight: 900 }}>
                      #{c.cardNumber} — {c.player}
                      {c.isInsert ? <span style={{ marginLeft: 6, color: colors.subtext }}>(Insert)</span> : null}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: colors.subtext }}>
                      {c.team ?? "—"}
                      {c.subset ? ` • ${c.subset}` : ""}
                      {c.variant ? ` • ${c.variant}` : ""}
                    </div>
                  </div>

                  <div style={{ padding: 12 }}>
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "3 / 4",
                        borderRadius: 14,
                        border: `1px solid ${colors.border}`,
                        background: colors.muted,
                        overflow: "hidden",
                        display: "grid",
                        placeItems: "center",
                        color: "#777",
                        fontWeight: 900,
                      }}
                    >
                      {c.frontImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.frontImageUrl}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        "No image"
                      )}
                    </div>

                    <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 12, color: colors.subtext, fontWeight: 800 }}>
                        Book: <span style={{ fontWeight: 900, color: colors.text }}>{money(c.bookValue)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: colors.subtext, fontWeight: 800 }}>
                        Qty: <span style={{ fontWeight: 900, color: colors.text }}>{safeInt(c.qty)}</span>
                      </div>
                    </div>

                    <div style={{ marginTop: 6, fontSize: 13, fontWeight: 900 }}>
                      Card Value: {money(c.ownedValue)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Favorites (stub) */}
        <section
          style={{
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 900 }}>Favorites</div>
          <div style={{ marginTop: 4, fontSize: 13, color: colors.subtext }}>
            Starred cards for <span style={{ fontWeight: 900 }}>{selectedLabel}</span>. (We’ll wire up starring next.)
          </div>

          {favLoading ? (
            <div style={{ marginTop: 12, color: colors.subtext, fontWeight: 800 }}>Loading…</div>
          ) : favorites.length === 0 ? (
            <div style={{ marginTop: 12, color: colors.subtext, fontWeight: 800 }}>
              No favorites yet.
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              Favorites loaded: {favorites.length}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
