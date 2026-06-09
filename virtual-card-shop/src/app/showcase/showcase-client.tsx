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

  grade: number;
  gradeLabel: string;
  bookValue: number;
  qty: number;
  ownedValue: number;
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

type PrestigeBucketKey =
  | "lvl1"
  | "lvl2"
  | "lvl3"
  | "lvl4"
  | "lvl5"
  | "lvl10"
  | "lvl25"
  | "lvl50"
  | "lvl75"
  | "lvl100";

type PrestigeBucketSet = {
  productSetId: string;
  productId: string | null;
  productSetName: string | null;
  isBase: boolean;
  isInsert: boolean;
  timesCompleted: number;
  claimedCompletions: number;
  claimable: number;
  sampleImageUrl?: string | null;
};

type PrestigeSummary = {
  ok: boolean;
  summary: {
    setsWithAnyCompletion: number;
    totalTimesCompleted: number;
    totalClaimableCompletions: number;
    bonusAwardedCents: number;
    buckets: Record<PrestigeBucketKey, number>;
    bucketSets: Record<PrestigeBucketKey, PrestigeBucketSet[]>;
  };
  claimable: Array<{
    productSetId: string;
    productId: string | null;
    productSetName: string | null;
    isBase: boolean;
    isInsert: boolean;
    timesCompleted: number;
    claimedCompletions: number;
    claimable: number;
    setValue: number;
    rewardReadyCents: number;
    nextMilestoneLevel: number | null;
    bonusAwardedCents: number;
  }>;
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

const PRESTIGE_BUCKET_ORDER: Array<{ key: PrestigeBucketKey; label: string; level: number }> = [
  { key: "lvl1", label: "1×", level: 1 },
  { key: "lvl2", label: "2×", level: 2 },
  { key: "lvl3", label: "3×", level: 3 },
  { key: "lvl4", label: "4×", level: 4 },
  { key: "lvl5", label: "5×", level: 5 },
  { key: "lvl10", label: "10×", level: 10 },
  { key: "lvl25", label: "25×", level: 25 },
  { key: "lvl50", label: "50×", level: 50 },
  { key: "lvl75", label: "75×", level: 75 },
  { key: "lvl100", label: "100×", level: 100 },
];

function money(n: any) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function centsToMoney(cents: any) {
  const v = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return money(v / 100);
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

function currentMilestoneForLevel(level: number) {
  let current = 0;
  for (const item of PRESTIGE_BUCKET_ORDER) {
    if (level >= item.level) current = item.level;
  }
  return current;
}

function labelForCurrentMilestone(level: number) {
  const current = currentMilestoneForLevel(level);
  return current > 0 ? `${current}×` : "—";
}

function prestigeToneForLevel(level: number) {
  const milestone = currentMilestoneForLevel(level);

  if (milestone >= 100) {
    return {
      bg: "linear-gradient(135deg, #fff1bf 0%, #ffd66b 55%, #f4b840 100%)",
      border: "#d7a737",
      text: "#4d3200",
      ring: "rgba(212, 157, 47, 0.22)",
      dot: "#7a5200",
    };
  }
  if (milestone >= 75) {
    return {
      bg: "linear-gradient(135deg, #ffe9f1 0%, #ffd3e2 100%)",
      border: "#efb3c9",
      text: "#7c2048",
      ring: "rgba(205, 75, 128, 0.18)",
      dot: "#a52f5f",
    };
  }
  if (milestone >= 50) {
    return {
      bg: "linear-gradient(135deg, #f2eaff 0%, #e5d6ff 100%)",
      border: "#ccb6ff",
      text: "#56308f",
      ring: "rgba(115, 79, 191, 0.16)",
      dot: "#6d43bf",
    };
  }
  if (milestone >= 25) {
    return {
      bg: "linear-gradient(135deg, #eef6ff 0%, #dcebff 100%)",
      border: "#bfd8ff",
      text: "#184b8b",
      ring: "rgba(47, 111, 237, 0.14)",
      dot: "#2f6fed",
    };
  }
  if (milestone >= 10) {
    return {
      bg: "linear-gradient(135deg, #fff4e5 0%, #ffe9cc 100%)",
      border: "#f0d1a4",
      text: "#845100",
      ring: "rgba(214, 141, 27, 0.14)",
      dot: "#b56d10",
    };
  }
  if (milestone >= 5) {
    return {
      bg: "linear-gradient(135deg, #f7f1ea 0%, #f1e4d4 100%)",
      border: "#dec6aa",
      text: "#6d4620",
      ring: "rgba(120, 83, 36, 0.12)",
      dot: "#9a6530",
    };
  }
  if (milestone >= 4) {
    return {
      bg: "linear-gradient(135deg, #fff6dc 0%, #ffecb0 100%)",
      border: "#ecd17e",
      text: "#6c4d00",
      ring: "rgba(196, 154, 37, 0.12)",
      dot: "#9b7300",
    };
  }
  if (milestone >= 3) {
    return {
      bg: "linear-gradient(135deg, #f6f7f8 0%, #e9edf1 100%)",
      border: "#cfd7df",
      text: "#39424d",
      ring: "rgba(102, 117, 133, 0.12)",
      dot: "#677585",
    };
  }
  if (milestone >= 2) {
    return {
      bg: "linear-gradient(135deg, #fff1ea 0%, #ffe0d0 100%)",
      border: "#efc1a8",
      text: "#6b2f12",
      ring: "rgba(173, 87, 46, 0.12)",
      dot: "#a5532b",
    };
  }
  return {
    bg: "linear-gradient(135deg, #eef4ff 0%, #dbe8ff 100%)",
    border: "#bfd2ff",
    text: "#21447b",
    ring: "rgba(47, 111, 237, 0.12)",
    dot: "#2f6fed",
  };
}

function GradeBadge({ grade, label }: { grade: number; label?: string | null }) {
  if (!grade || grade <= 0) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          border: `1px solid ${colors.border}`,
          borderRadius: 999,
          padding: "5px 9px",
          background: colors.muted,
          color: colors.subtext,
          fontWeight: 950,
          whiteSpace: "nowrap",
        }}
      >
        Raw
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: "1px solid rgba(47,111,237,0.28)",
        borderRadius: 999,
        padding: "5px 9px",
        background: "linear-gradient(135deg, #eef4ff 0%, #ffffff 100%)",
        color: colors.accent,
        fontWeight: 950,
        whiteSpace: "nowrap",
        boxShadow: "0 8px 18px rgba(47,111,237,0.10)",
      }}
    >
      <span aria-hidden>◆</span>
      {label || `VCS ${grade}`}
    </span>
  );
}

function ShowcaseMiniSlab({ card }: { card: TopCardRow }) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 330,
        margin: "0 auto",
        borderRadius: 22,
        border: "1px solid rgba(32,40,54,0.22)",
        background:
          "linear-gradient(145deg, #f7f8fb 0%, #ffffff 42%, #e8edf5 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.9), 0 18px 38px rgba(19,31,52,0.16)",
        padding: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          borderRadius: 16,
          border: "1px solid rgba(35,45,65,0.16)",
          background: "linear-gradient(180deg, #ffffff 0%, #f1f4f8 100%)",
          padding: 9,
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 1000,
                color: colors.subtext,
                letterSpacing: 0.55,
                textTransform: "uppercase",
              }}
            >
              Virtual Card Shop
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: 13,
                lineHeight: 1.1,
                fontWeight: 1000,
                color: colors.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {card.player}
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: 10,
                color: colors.subtext,
                fontWeight: 850,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              #{card.cardNumber} {card.team ? `• ${card.team}` : ""}
            </div>
          </div>

          <div
            style={{
              flex: "0 0 auto",
              minWidth: 58,
              borderRadius: 13,
              border: "1px solid rgba(47,111,237,0.30)",
              background: "linear-gradient(180deg, #eef4ff 0%, #ffffff 100%)",
              padding: "7px 8px",
              textAlign: "center",
              boxShadow: "0 10px 20px rgba(47,111,237,0.10)",
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 1000, color: colors.accent, letterSpacing: 0.4 }}>VCS</div>
            <div style={{ fontSize: 22, fontWeight: 1000, color: colors.text, lineHeight: 1 }}>{card.grade}</div>
          </div>
        </div>
      </div>

      <div
        style={{
          width: "100%",
          aspectRatio: "2.5 / 3.5",
          borderRadius: 15,
          border: "1px solid rgba(20,28,42,0.18)",
          background: "#ffffff",
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
          color: "#777",
          fontWeight: 900,
        }}
      >
        {card.frontImageUrl ? (
          <img
            src={card.frontImageUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "contain", background: "white" }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          "No image"
        )}
      </div>
    </div>
  );
}

function RawCardImage({ imageUrl }: { imageUrl: string | null }) {
  return (
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
      {imageUrl ? (
        <img
          src={imageUrl}
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
  );
}

export default function ShowcaseClient() {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbErr, setLbErr] = useState<string | null>(null);

  const [topCards, setTopCards] = useState<TopCardRow[]>([]);
  const [topLoading, setTopLoading] = useState(false);
  const [topErr, setTopErr] = useState<string | null>(null);

  const [topPage, setTopPage] = useState(1);
  const [topTotalPages, setTopTotalPages] = useState(1);
  const [topTotal, setTopTotal] = useState(0);
  const topPageSize = 20;

  const [jumpTo, setJumpTo] = useState<string>("");

  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const [favCards, setFavCards] = useState<FavoriteCard[]>([]);
  const [favLoading, setFavLoading] = useState(false);
  const [favErr, setFavErr] = useState<string | null>(null);
  const [favIdx, setFavIdx] = useState(0);
  const [favFlipped, setFavFlipped] = useState(false);

  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());

  const [prestige, setPrestige] = useState<PrestigeSummary | null>(null);
  const [prestigeLoading, setPrestigeLoading] = useState(false);
  const [prestigeErr, setPrestigeErr] = useState<string | null>(null);
  const [selectedPrestigeBucket, setSelectedPrestigeBucket] = useState<PrestigeBucketKey | null>(null);

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

  async function loadFavoritesRandom() {
    if (!isViewingMe) {
      setFavCards([]);
      setFavErr(null);
      setFavLoading(false);
      setFavoriteIds(new Set());
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
      setFavoriteIds(new Set(cards.map((c) => c.id)));
      setFavIdx(0);
      setFavFlipped(false);
    } catch (e: any) {
      setFavCards([]);
      setFavoriteIds(new Set());
      setFavErr(e?.message ?? "Failed to load favorites");
      setFavIdx(0);
      setFavFlipped(false);
    } finally {
      setFavLoading(false);
    }
  }

  async function loadPrestige() {
    setPrestigeLoading(true);
    setPrestigeErr(null);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "60");
      if (selectedUserId) qs.set("userId", selectedUserId);

      const res = await fetch(`/api/prestige/summary?${qs.toString()}`, { cache: "no-store" });
      const raw = await res.text();
      const j = raw ? JSON.parse(raw) : null;
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      setPrestige(j as PrestigeSummary);
    } catch (e: any) {
      setPrestige(null);
      setPrestigeErr(e?.message ?? "Failed to load prestige");
    } finally {
      setPrestigeLoading(false);
    }
  }

  async function redeemPrestige(productSetId: string) {
    if (!isViewingMe) return;
    try {
      const res = await fetch(`/api/prestige/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productSetId }),
      });
      const raw = await res.text();
      const j = raw ? JSON.parse(raw) : null;
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      await loadPrestige();
    } catch {
      await loadPrestige();
    }
  }

  async function redeemAllPrestige() {
    if (!isViewingMe) return;
    try {
      const res = await fetch(`/api/prestige/redeem-all`, { method: "POST" });
      const raw = await res.text();
      const j = raw ? JSON.parse(raw) : null;
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      await loadPrestige();
    } catch {
      await loadPrestige();
    }
  }

  async function toggleFavorite(cardId: number) {
    if (!isViewingMe) return;

    const wasFav = favoriteIds.has(cardId);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (wasFav) next.delete(cardId);
      else next.add(cardId);
      return next;
    });

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

      if (favorited !== !wasFav) {
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (favorited) next.add(cardId);
          else next.delete(cardId);
          return next;
        });
      }

      if (favorited && !wasFav) {
        await loadFavoritesRandom();
      }
    } catch {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFav) next.add(cardId);
        else next.delete(cardId);
        return next;
      });
      await loadFavoritesRandom();
    }
  }

  useEffect(() => {
    loadUsers();
    loadLeaderboard();
  }, []);

  useEffect(() => {
    setTopPage(1);
    setJumpTo("");
    setSelectedPrestigeBucket(null);
    loadTopCards(selectedUserId, 1);
    loadFavoritesRandom();
    loadPrestige();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  useEffect(() => {
    function onCollectionChanged() {
      loadLeaderboard();
      loadTopCards(selectedUserId, topPage);
      loadPrestige();
    }

    window.addEventListener("vcs:collection-changed", onCollectionChanged);
    return () => window.removeEventListener("vcs:collection-changed", onCollectionChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId, topPage]);

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
  const selectedBucketMeta = PRESTIGE_BUCKET_ORDER.find((x) => x.key === selectedPrestigeBucket) ?? null;
  const selectedBucketRows =
    selectedPrestigeBucket && prestige ? prestige.summary.bucketSets[selectedPrestigeBucket] ?? [] : [];

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
          main {
            padding: 12px !important;
          }
          .vcs-btn {
            padding: 10px 12px;
            border-radius: 14px;
            height: auto;
          }
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
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
                  loadFavoritesRandom();
                  loadPrestige();
                }}
                className="vcs-btn"
                title="Refresh Showcase"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

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
              <div style={{ fontSize: 16, fontWeight: 900 }}>Set Prestige</div>
              <div style={{ marginTop: 4, fontSize: 13, color: colors.subtext }}>
                Earn bonus rewards by completing ProductSets multiple times. Rewards are <b>redeemable</b> (not automatic).
              </div>
              {!isViewingMe ? (
                <div style={{ marginTop: 6, fontSize: 12, color: colors.subtext, fontWeight: 900 }}>
                  Viewing <b>{selectedLabel}</b> • Prestige is public • Claiming is disabled for other users.
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="vcs-btn" onClick={loadPrestige} disabled={prestigeLoading}>
                Refresh
              </button>
              <button
                className="vcs-btn"
                onClick={redeemAllPrestige}
                disabled={!isViewingMe || prestigeLoading || !(prestige?.summary?.totalClaimableCompletions ?? 0)}
                title={!isViewingMe ? "You can’t claim rewards for another user." : "Redeem all available prestige rewards"}
                style={{ background: "#eef4ff" }}
              >
                Claim All
              </button>
            </div>
          </div>

          {prestigeErr ? (
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
              {prestigeErr}
            </div>
          ) : prestigeLoading ? (
            <div style={{ marginTop: 12, color: colors.subtext, fontWeight: 800 }}>Loading…</div>
          ) : !prestige ? (
            <div style={{ marginTop: 12, color: colors.subtext, fontWeight: 800 }}>No prestige data yet.</div>
          ) : (
            <>
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: 10,
                }}
              >
                {PRESTIGE_BUCKET_ORDER.map((x) => {
                  const count = prestige.summary.buckets[x.key] ?? 0;
                  const tone = prestigeToneForLevel(x.level);
                  const active = selectedPrestigeBucket === x.key;

                  return (
                    <button
                      key={x.key}
                      onClick={() => setSelectedPrestigeBucket((prev) => (prev === x.key ? null : x.key))}
                      style={{
                        border: `1px solid ${tone.border}`,
                        borderRadius: 14,
                        padding: 12,
                        background: tone.bg,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                        boxShadow: active ? `0 14px 30px ${tone.ring}` : `0 10px 24px ${tone.ring}`,
                        cursor: "pointer",
                        transform: active ? "translateY(-1px)" : "translateY(0)",
                        transition: "transform 120ms ease, box-shadow 120ms ease",
                      }}
                      title={`Show sets in the ${x.label} prestige bucket`}
                    >
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 999,
                            display: "grid",
                            placeItems: "center",
                            background: "#ffffff",
                            border: `1px solid ${tone.border}`,
                            boxShadow: "0 10px 18px rgba(0,0,0,0.06)",
                          }}
                          aria-hidden
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 999,
                              background: tone.dot,
                              display: "inline-block",
                            }}
                          />
                        </div>
                        <div style={{ textAlign: "left" }}>
                          <div style={{ fontSize: 12, color: colors.subtext, fontWeight: 900 }}>{x.label}</div>
                          <div style={{ fontSize: 16, fontWeight: 950, color: tone.text }}>
                            {safeInt(count).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div style={{ fontSize: 12, color: colors.subtext, fontWeight: 900 }}>
                        {active ? "Hide" : "View"}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  gap: 14,
                  flexWrap: "wrap",
                  color: colors.subtext,
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                <div>
                  Claimable completions: <b style={{ color: colors.text }}>{safeInt(prestige.summary.totalClaimableCompletions)}</b>
                </div>
                <div>
                  Lifetime claimed: <b style={{ color: colors.text }}>{centsToMoney(prestige.summary.bonusAwardedCents)}</b>
                </div>
              </div>

              {selectedBucketMeta ? (
                <div
                  style={{
                    marginTop: 12,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 14,
                    background: "#fff",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: 12,
                      borderBottom: `1px solid ${colors.border}`,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 950 }}>
                        {selectedBucketMeta.label} bucket — {safeInt(selectedBucketRows.length).toLocaleString()} sets
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: colors.subtext, fontWeight: 800 }}>
                        Showing the sets currently counted in this prestige bucket for <b>{selectedLabel}</b>.
                      </div>
                    </div>

                    <button className="vcs-btn" onClick={() => setSelectedPrestigeBucket(null)}>
                      Close
                    </button>
                  </div>

                  {selectedBucketRows.length === 0 ? (
                    <div style={{ padding: 12, color: colors.subtext, fontWeight: 800 }}>No sets in this bucket right now.</div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
                        <thead style={{ background: "#f7f7f7" }}>
                          <tr>
                            {["Set", "Current Level", "Claimable", "Type", ""].map((h) => (
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
                          {selectedBucketRows.map((r, idx) => {
                            const type = r.isBase ? "Base" : r.isInsert ? "Insert" : "Set";
                            const tone = prestigeToneForLevel(r.timesCompleted);
                            return (
                              <tr key={r.productSetId} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                                <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                    <div
                                      style={{
                                        width: 34,
                                        height: 44,
                                        borderRadius: 7,
                                        overflow: "hidden",
                                        border: `1px solid ${colors.border}`,
                                        background: colors.muted,
                                        flex: "0 0 auto",
                                        display: "grid",
                                        placeItems: "center",
                                        color: colors.subtext,
                                        fontSize: 10,
                                        fontWeight: 900,
                                      }}
                                      title={r.productSetName?.trim() || r.productSetId}
                                    >
                                      {r.sampleImageUrl ? (
                                        <img
                                          src={r.sampleImageUrl}
                                          alt=""
                                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                          onError={(e) => {
                                            e.currentTarget.style.display = "none";
                                          }}
                                        />
                                      ) : (
                                        <span>No img</span>
                                      )}
                                    </div>

                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontWeight: 950, lineHeight: 1.2 }}>
                                        {r.productSetName?.trim() || r.productSetId}
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 8,
                                      border: `1px solid ${tone.border}`,
                                      background: tone.bg,
                                      borderRadius: 999,
                                      padding: "6px 10px",
                                      fontWeight: 950,
                                      color: tone.text,
                                      boxShadow: `0 10px 20px ${tone.ring}`,
                                    }}
                                    title={`Current completion level: ${safeInt(r.timesCompleted)}×`}
                                  >
                                    <span
                                      aria-hidden
                                      style={{
                                        width: 7,
                                        height: 7,
                                        borderRadius: 999,
                                        background: tone.dot,
                                        display: "inline-block",
                                      }}
                                    />
                                    <span>{safeInt(r.timesCompleted)}×</span>
                                  </span>
                                </td>

                                <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 950 }}>
                                  {safeInt(r.claimable)}
                                </td>

                                <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>{type}</td>

                                <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                                  <Link
                                    href={`/checklist/${encodeURIComponent(r.productSetId)}`}
                                    style={{ textDecoration: "underline", fontWeight: 900, color: colors.accent }}
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
                  )}
                </div>
              ) : null}

              {prestige.claimable.length === 0 ? (
                <div style={{ marginTop: 12, color: colors.subtext, fontWeight: 800 }}>Nothing to claim right now.</div>
              ) : (
                <div style={{ marginTop: 12, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                    <thead style={{ background: "#f7f7f7" }}>
                      <tr>
                        {["Set", "Prestige", "Claimable", "Reward Ready", "Type", ""].map((h) => (
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
                      {prestige.claimable.map((r, idx) => {
                        const type = r.isBase ? "Base" : r.isInsert ? "Insert" : "Set";
                        const tone = prestigeToneForLevel(r.timesCompleted);

                        return (
                          <tr key={r.productSetId} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                            <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                              <div style={{ fontWeight: 950 }}>{r.productSetName?.trim() || r.productSetId}</div>
                              <div style={{ fontSize: 12, color: colors.subtext, fontWeight: 800 }}>{r.productId ?? ""}</div>
                            </td>

                            <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 8,
                                  border: `1px solid ${tone.border}`,
                                  background: tone.bg,
                                  borderRadius: 999,
                                  padding: "6px 10px",
                                  fontWeight: 950,
                                  color: tone.text,
                                  boxShadow: `0 10px 20px ${tone.ring}`,
                                }}
                                title={`Current completion level: ${safeInt(r.timesCompleted)}× • milestone ${labelForCurrentMilestone(
                                  r.timesCompleted
                                )}`}
                              >
                                <span
                                  aria-hidden
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: 999,
                                    background: tone.dot,
                                    display: "inline-block",
                                  }}
                                />
                                <span>{safeInt(r.timesCompleted)}×</span>
                              </span>
                            </td>

                            <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 950 }}>{safeInt(r.claimable)}</td>

                            <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 950 }}>
                              {centsToMoney(r.rewardReadyCents)}
                              <div style={{ fontSize: 12, color: colors.subtext, fontWeight: 800 }}>
                                Set value {money(r.setValue)}
                                {r.nextMilestoneLevel ? ` • Next milestone ${r.nextMilestoneLevel}×` : ""}
                              </div>
                            </td>

                            <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>{type}</td>

                            <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                              <button
                                className="vcs-btn"
                                onClick={() => redeemPrestige(r.productSetId)}
                                disabled={!isViewingMe}
                                title={!isViewingMe ? "You can’t claim rewards for another user." : "Claim rewards for this set"}
                                style={{ background: "#eef4ff" }}
                              >
                                Claim
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

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
                Top 100 for <span style={{ fontWeight: 900 }}>{selectedLabel}</span> ranked by <b>single-card</b> current value.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                <thead style={{ background: "#f7f7f7" }}>
                  <tr>
                    {["Card", "Player", "Team", "Grade", "Book Value", "Qty", "Card Value", "Details", "★"].map((h) => (
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
                      <tr key={`${c.cardId}-${c.grade}`} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                          #{c.cardNumber} {ps ? <span style={{ color: colors.subtext, fontWeight: 800 }}>{ps}</span> : null}
                        </td>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{c.player}</td>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{c.team ?? "—"}</td>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                          <GradeBadge grade={c.grade} label={c.gradeLabel} />
                        </td>
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
                const isGraded = c.grade > 0;

                return (
                  <div
                    key={`${c.cardId}-${c.grade}`}
                    style={{
                      border: `1px solid ${colors.border}`,
                      borderRadius: 16,
                      background: "#fff",
                      overflow: "hidden",
                      boxShadow: isGraded
                        ? "0 14px 28px rgba(47,111,237,0.10)"
                        : "0 6px 18px rgba(0,0,0,0.05)",
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
                      {isGraded ? <ShowcaseMiniSlab card={c} /> : <RawCardImage imageUrl={c.frontImageUrl} />}

                      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontSize: 12, color: colors.subtext, fontWeight: 800 }}>
                          Book: <span style={{ fontWeight: 900, color: colors.text }}>{money(c.bookValue)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: colors.subtext, fontWeight: 800 }}>
                          Qty: <span style={{ fontWeight: 900, color: colors.text }}>{safeInt(c.qty)}</span>
                        </div>
                      </div>

                      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 900 }}>Card Value: {money(c.ownedValue)}</div>
                        {isGraded ? <GradeBadge grade={c.grade} label={c.gradeLabel} /> : null}
                      </div>

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
            <div style={{ marginTop: 12, color: colors.subtext, fontWeight: 800 }}>No favorites yet. Star cards above and they’ll appear here.</div>
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
                          <img src={favCurrent.frontImageUrl} alt="Card front" />
                        ) : (
                          <div className="vcs-img-missing">(No front image)</div>
                        )}
                      </div>

                      <div className="vcs-face back">
                        {favCurrent?.backImageUrl ? (
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
                  {favCurrent ? (productSetParenFav(favCurrent) ? ` ${productSetParenFav(favCurrent)}` : "") : ""}
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 8, fontSize: 13, fontWeight: 900 }}>
                  <div>
                    Type: <span style={{ color: colors.subtext, fontWeight: 800 }}>{favCurrent?.isInsert ? "Insert" : "Base"}</span>
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
