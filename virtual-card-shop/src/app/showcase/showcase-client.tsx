// src/app/showcase/showcase-client.tsx
"use client";

import Link from "next/link";
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
  productSetId: string | null;
  productSetName: string | null;

  bookValue: number;
  qty: number;
  ownedValue: number; // single-card value
  frontImageUrl: string | null;
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

type FavoriteCard = {
  id: number;
  productSetId: string | null;
  cardNumber: string;
  player: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  isInsert: boolean;
  bookValue: number;
  frontImageUrl: string | null;
  backImageUrl: string | null;
  productSet?: { id: string; name: string | null; productId: string; isInsert?: boolean } | null;
};

type FavoritesRandomResponse = {
  ok: boolean;
  limit: number;
  cards: FavoriteCard[];
  error?: string;
};

type FavoriteIdsResponse = {
  ok: boolean;
  ids: number[];
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

const starGold = "#f2c94c";

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

/**
 * Show ProductSet name for ALL cards (base or insert).
 * We intentionally prefer name over id, and if name is missing, we show nothing.
 */
function productSetParen(c: TopCardRow) {
  const name = (c.productSetName ?? "").trim();
  if (name) return `(${name})`;
  return "";
}

function productSetParenFav(c: FavoriteCard) {
  const name = (c.productSet?.name ?? "").trim();
  if (name) return `(${name})`;
  return "";
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
  const topPageSize = 20;

  const [jumpTo, setJumpTo] = useState<string>("");

  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  // ⭐ Favorites (Shoebox)
  const [favCards, setFavCards] = useState<FavoriteCard[]>([]);
  const [favLoading, setFavLoading] = useState(false);
  const [favErr, setFavErr] = useState<string | null>(null);
  const [favIdx, setFavIdx] = useState(0);
  const [favFlipped, setFavFlipped] = useState(false);

  // ⭐ Favorite ID set (drives star UI and optimistic behavior)
  // IMPORTANT: This should NOT depend on Shoebox loading.
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [favIdsLoading, setFavIdsLoading] = useState(false);
  const [favIdsErr, setFavIdsErr] = useState<string | null>(null);

  const isViewingMe = selectedUserId === "";

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

  // ✅ Load favorite ids (drives the star UI)
  async function loadFavoriteIds() {
    if (!isViewingMe) {
      setFavoriteIds(new Set());
      setFavIdsErr(null);
      setFavIdsLoading(false);
      return;
    }

    setFavIdsLoading(true);
    setFavIdsErr(null);
    try {
      const res = await fetch(`/api/favorites/ids?limit=50000`, { cache: "no-store" });
      const raw = await res.text();
      const j = raw ? JSON.parse(raw) : null;

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      const data = j as FavoriteIdsResponse;
      const ids = Array.isArray(data?.ids) ? data.ids : [];
      setFavoriteIds(new Set(ids));
    } catch (e: any) {
      // IMPORTANT: do NOT clear favorites on failure (prevents “stars revert”)
      setFavIdsErr(e?.message ?? "Failed to load favorites");
    } finally {
      setFavIdsLoading(false);
    }
  }

  async function loadFavoritesRandom() {
    // Favorites are personal (no cross-user viewing right now)
    if (!isViewingMe) {
      setFavCards([]);
      setFavErr(null);
      setFavLoading(false);
      setFavIdx(0);
      setFavFlipped(false);
      return;
    }

    setFavLoading(true);
    setFavErr(null);
    try {
      const res = await fetch(`/api/favorites/random?limit=60`, { cache: "no-store" });
      const raw = await res.text();
      const j = raw ? JSON.parse(raw) : null;

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      const data = j as FavoritesRandomResponse;
      const cards = Array.isArray(data?.cards) ? data.cards : [];

      setFavCards(cards);
      setFavIdx(0);
      setFavFlipped(false);
    } catch (e: any) {
      setFavCards([]);
      setFavErr(e?.message ?? "Failed to load Favorites Shoebox.");
      setFavIdx(0);
      setFavFlipped(false);
      // NOTE: we do NOT touch favoriteIds here.
    } finally {
      setFavLoading(false);
    }
  }

  async function toggleFavorite(cardId: number) {
    if (!isViewingMe) return;

    const wasFav = favoriteIds.has(cardId);

    // optimistic: immediately update the star visuals
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (wasFav) next.delete(cardId);
      else next.add(cardId);
      return next;
    });

    // If we unstarred and that card is in the shoebox list, remove it locally
    if (wasFav) {
      setFavCards((prev) => {
        const next = prev.filter((c) => c.id !== cardId);
        setFavIdx((i) => (next.length ? Math.min(i, next.length - 1) : 0));
        setFavFlipped(false);
        return next;
      });
    }

    try {
      const res = await fetch("/api/favorites/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });

      const raw = await res.text();
      const j = raw ? JSON.parse(raw) : null;

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      const favorited = !!j?.favorited;

      // reconcile if server disagrees
      if (favorited !== !wasFav) {
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (favorited) next.add(cardId);
          else next.delete(cardId);
          return next;
        });
      }

      // keep ids authoritative
      await loadFavoriteIds();

      // if we just favorited, try to refresh shoebox (but failures won't nuke stars anymore)
      if (favorited && !wasFav) {
        await loadFavoritesRandom();
      }
    } catch {
      // rollback optimistic on error
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFav) next.add(cardId);
        else next.delete(cardId);
        return next;
      });

      // keep things in sync
      await loadFavoriteIds();
    }
  }

  useEffect(() => {
    loadUsers();
    loadLeaderboard();
  }, []);

  useEffect(() => {
    setTopPage(1);
    setJumpTo("");
    loadTopCards(selectedUserId, 1);

    // favorites
    loadFavoriteIds();
    loadFavoritesRandom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  // Keyboard controls for shoebox (only when viewing Me)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!isViewingMe) return;
      if (favCards.length === 0) return;

      if (e.code === "Space") {
        e.preventDefault();
        setFavFlipped(false);
        setFavIdx((v) => (v + 1) % favCards.length);
      } else if (e.key === "ArrowRight") {
        setFavFlipped(false);
        setFavIdx((v) => (v + 1) % favCards.length);
      } else if (e.key === "ArrowLeft") {
        setFavFlipped(false);
        setFavIdx((v) => (v - 1 + favCards.length) % favCards.length);
      } else if (e.key.toLowerCase() === "f") {
        setFavFlipped((x) => !x);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [favCards.length, isViewingMe]);

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

  const favCurrent = favCards[favIdx] ?? null;

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
      <style jsx global>{`
        .vcs-btn {
          border: 1px solid ${colors.border};
          background: ${colors.muted};
          border-radius: 10px;
          padding: 8px 12px;
          font-weight: 900;
          cursor: pointer;
          height: 38px;
        }
        .vcs-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Shoebox flip: simple crossfade (no mirrored front bug) */
        .vcs-flip-wrap {
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
          cursor: pointer;
          user-select: none;
        }
        .vcs-flip-scene {
          position: relative;
          width: 100%;
          aspect-ratio: 2.5 / 3.5;
        }
        .vcs-flip-card {
          position: absolute;
          inset: 0;
          border-radius: 16px;
          border: 1px solid ${colors.border};
          background: ${colors.muted};
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.08);
          overflow: hidden;
        }
        .vcs-face {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          background: white;
          opacity: 0;
          transition: opacity 160ms ease, transform 160ms ease;
          transform: scale(0.996);
        }
        .vcs-flip-card .vcs-face.front {
          opacity: 1;
          transform: scale(1);
        }
        .vcs-flip-card.is-flipped .vcs-face.front {
          opacity: 0;
          transform: scale(0.996);
        }
        .vcs-flip-card.is-flipped .vcs-face.back {
          opacity: 1;
          transform: scale(1);
        }
        .vcs-face img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: white;
        }
        .vcs-img-missing {
          height: 100%;
          width: 100%;
          display: grid;
          place-items: center;
          color: ${colors.subtext};
          font-weight: 900;
          font-size: 12px;
          text-align: center;
          padding: 14px;
          background: #f8f6f1;
        }
        @media (max-width: 560px) {
          .vcs-btn {
            padding: 10px 12px;
            border-radius: 14px;
            height: auto;
          }
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
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

              {isViewingMe && (favIdsLoading || favIdsErr) ? (
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: colors.subtext }}>
                  {favIdsLoading ? "Loading favorites…" : favIdsErr ? "Favorites may be out of sync." : null}
                </div>
              ) : null}
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
                  loadFavoriteIds();
                  loadFavoritesRandom();
                }}
                className="vcs-btn"
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
            <div
              style={{
                marginTop: 12,
                padding: 10,
                background: "#fff1f1",
                border: "1px solid #f3b7b7",
                borderRadius: 12,
              }}
            >
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
                      <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>{money(r.totalValue)}</td>
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
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={goTopPrev} disabled={!canPrevTop || topLoading} className="vcs-btn">
                  ← Prev
                </button>

                <div style={{ fontWeight: 900, color: colors.subtext, whiteSpace: "nowrap" }}>
                  Page {topPage} of {topTotalPages} <span style={{ fontWeight: 800 }}>• {topTotal} cards</span>
                </div>

                <button onClick={goTopNext} disabled={!canNextTop || topLoading} className="vcs-btn">
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
                  <button onClick={doTopJump} disabled={topLoading} className="vcs-btn">
                    Go
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={() => setViewMode("cards")}
                  className="vcs-btn"
                  style={{ background: viewMode === "cards" ? "#ffffff" : colors.muted }}
                >
                  Cards
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  className="vcs-btn"
                  style={{ background: viewMode === "table" ? "#ffffff" : colors.muted }}
                >
                  Table
                </button>
              </div>
            </div>
          </div>

          {topErr ? (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                background: "#fff1f1",
                border: "1px solid #f3b7b7",
                borderRadius: 12,
              }}
            >
              {topErr}
            </div>
          ) : null}

          {topLoading ? (
            <div style={{ marginTop: 12, color: colors.subtext, fontWeight: 800 }}>Loading…</div>
          ) : topCards.length === 0 ? (
            <div style={{ marginTop: 12, color: colors.subtext, fontWeight: 800 }}>No owned cards yet (or no book values set).</div>
          ) : viewMode === "table" ? (
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                <thead style={{ background: "#f7f7f7" }}>
                  <tr>
                    {["Card", "Player", "Team", "Book Value", "Qty", "Card Value", "Details", "★"].map((h) => (
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
                  {topCards.map((c, idx) => {
                    const ps = productSetParen(c);
                    const isFav = isViewingMe && favoriteIds.has(c.cardId);

                    return (
                      <tr key={c.cardId} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                          #{c.cardNumber} {ps ? <span style={{ color: colors.subtext, fontWeight: 800 }}>{ps}</span> : null}
                        </td>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{c.player}</td>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{c.team ?? "—"}</td>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>{money(c.bookValue)}</td>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>{safeInt(c.qty)}</td>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>{money(c.ownedValue)}</td>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                          <Link
                            href={`/cards/${encodeURIComponent(String(c.cardId))}`}
                            style={{ textDecoration: "underline", fontWeight: 900, color: colors.accent }}
                          >
                            Details
                          </Link>
                        </td>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                          {isViewingMe ? (
                            <button
                              onClick={() => toggleFavorite(c.cardId)}
                              title={isFav ? "Unfavorite" : "Favorite"}
                              style={{
                                border: `1px solid ${colors.border}`,
                                background: isFav ? "#fff9dd" : colors.muted,
                                borderRadius: 10,
                                padding: "6px 10px",
                                fontWeight: 950,
                                cursor: "pointer",
                                color: isFav ? starGold : "#444",
                              }}
                            >
                              {isFav ? "★" : "☆"}
                            </button>
                          ) : (
                            <span style={{ color: colors.subtext, fontWeight: 800 }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
              {topCards.map((c) => {
                const ps = productSetParen(c);
                const isFav = isViewingMe && favoriteIds.has(c.cardId);

                return (
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
                      <div style={{ fontWeight: 900, display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          #{c.cardNumber} — {c.player}{" "}
                          {ps ? <span style={{ marginLeft: 6, color: colors.subtext, fontWeight: 800 }}>{ps}</span> : null}
                        </div>

                        {isViewingMe ? (
                          <button
                            onClick={() => toggleFavorite(c.cardId)}
                            title={isFav ? "Unfavorite" : "Favorite"}
                            style={{
                              border: `1px solid ${colors.border}`,
                              background: isFav ? "#fff9dd" : colors.muted,
                              borderRadius: 10,
                              padding: "6px 10px",
                              fontWeight: 950,
                              cursor: "pointer",
                              flex: "0 0 auto",
                              lineHeight: 1,
                              color: isFav ? starGold : "#444",
                              boxShadow: isFav ? "0 6px 14px rgba(242,201,76,0.22)" : "none",
                            }}
                          >
                            {isFav ? "★" : "☆"}
                          </button>
                        ) : null}
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

                      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 900 }}>Card Value: {money(c.ownedValue)}</div>

                      <div style={{ marginTop: 10 }}>
                        <Link
                          href={`/cards/${encodeURIComponent(String(c.cardId))}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            textDecoration: "none",
                            fontWeight: 900,
                            color: colors.accent,
                          }}
                        >
                          Details <span aria-hidden>→</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ⭐ Favorites Shoebox (BELOW Top Cards) */}
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
              <div style={{ fontSize: 16, fontWeight: 900 }}>Favorites Shoebox</div>
              <div style={{ marginTop: 4, fontSize: 13, color: colors.subtext }}>
                Flip through your starred cards in a fresh random order each time.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="vcs-btn" onClick={loadFavoritesRandom} disabled={!isViewingMe || favLoading} title="Shuffle favorites">
                Shuffle
              </button>
              <div style={{ fontSize: 12, color: colors.subtext, fontWeight: 800, whiteSpace: "nowrap" }}>
                {isViewingMe ? (favLoading ? "Loading…" : `${favCards.length} cards`) : "Personal"}
              </div>
            </div>
          </div>

          {!isViewingMe ? (
            <div style={{ marginTop: 12, color: colors.subtext, fontWeight: 800 }}>
              Favorites are personal. Switch “Viewing” to <b>Me</b> to use the shoebox.
            </div>
          ) : favErr ? (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                background: "#fff1f1",
                border: "1px solid #f3b7b7",
                borderRadius: 12,
                fontWeight: 900,
              }}
            >
              {favErr}
            </div>
          ) : favLoading ? (
            <div style={{ marginTop: 12, color: colors.subtext, fontWeight: 800 }}>Loading…</div>
          ) : favCards.length === 0 ? (
            <div style={{ marginTop: 12, color: colors.subtext, fontWeight: 800 }}>
              No favorites yet. Star cards above and they’ll appear here.
            </div>
          ) : (
            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "minmax(260px, 420px) 1fr",
                gap: 14,
                alignItems: "start",
              }}
            >
              <div>
                <div
                  className="vcs-flip-wrap"
                  onClick={() => setFavFlipped((x) => !x)}
                  title="Click to flip (or press F). Space/→ for next, ← for prev."
                >
                  <div className="vcs-flip-scene">
                    <div className={`vcs-flip-card ${favFlipped ? "is-flipped" : ""}`}>
                      <div className="vcs-face front">
                        {favCurrent?.frontImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={favCurrent.frontImageUrl} alt="Card front" />
                        ) : (
                          <div className="vcs-img-missing">(No front image)</div>
                        )}
                      </div>

                      <div className="vcs-face back">
                        {favCurrent?.backImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={favCurrent.backImageUrl} alt="Card back" />
                        ) : (
                          <div className="vcs-img-missing">(No back image)</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    className="vcs-btn"
                    onClick={() => {
                      setFavFlipped(false);
                      setFavIdx((v) => (v - 1 + favCards.length) % favCards.length);
                    }}
                  >
                    ← Prev
                  </button>
                  <button
                    className="vcs-btn"
                    onClick={() => {
                      setFavFlipped(false);
                      setFavIdx((v) => (v + 1) % favCards.length);
                    }}
                  >
                    Next →
                  </button>
                  <button className="vcs-btn" onClick={() => setFavFlipped((x) => !x)}>
                    {favFlipped ? "Show Front" : "Flip (F)"}
                  </button>
                  <button
                    className="vcs-btn"
                    onClick={() => favCurrent && toggleFavorite(favCurrent.id)}
                    title="Unfavorite this card"
                    style={{ background: "#fff9dd", color: starGold }}
                  >
                    ★ Starred
                  </button>
                </div>

                <div style={{ marginTop: 8, fontSize: 12, color: colors.subtext, fontWeight: 800 }}>
                  Tip: <b>Space</b>/<b>→</b> next • <b>←</b> prev • <b>F</b> flip
                </div>
              </div>

              <div
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: 16,
                  background: "#fff",
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 900, color: colors.subtext }}>Now viewing</div>
                <div style={{ marginTop: 6, fontSize: 20, fontWeight: 950, letterSpacing: -0.3 }}>
                  #{favCurrent?.cardNumber} — {favCurrent?.player}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: colors.subtext, fontWeight: 800, lineHeight: 1.4 }}>
                  {favCurrent?.team ?? "—"}
                  {favCurrent?.subset ? ` • ${favCurrent.subset}` : ""}
                  {favCurrent?.variant ? ` • ${favCurrent.variant}` : ""}{" "}
                  {productSetParenFav(favCurrent) ? ` ${productSetParenFav(favCurrent)}` : ""}
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 8, fontSize: 13, fontWeight: 900 }}>
                  <div>
                    Type:{" "}
                    <span style={{ color: colors.subtext, fontWeight: 800 }}>{favCurrent?.isInsert ? "Insert" : "Base"}</span>
                  </div>
                  <div>
                    Book: <span style={{ color: colors.subtext, fontWeight: 800 }}>{money(favCurrent?.bookValue)}</span>
                  </div>
                  <div>
                    Position:{" "}
                    <span style={{ color: colors.subtext, fontWeight: 800 }}>
                      {favIdx + 1} / {favCards.length}
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  {favCurrent ? (
                    <Link
                      href={`/cards/${encodeURIComponent(String(favCurrent.id))}`}
                      style={{ textDecoration: "none", fontWeight: 900, color: colors.accent }}
                    >
                      Open details →
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
