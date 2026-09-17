"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import VcsSlab from "@/components/grading/VcsSlab";
import {
  bookValueToCents,
  calculateGradingFeeCents,
} from "@/lib/grading";

type UserOption = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

type UsersResponse = {
  ok: boolean;
  meId?: string;
  users?: UserOption[];
  error?: string;
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

type GradeFilter =
  | "overall"
  | "raw"
  | "10"
  | "9"
  | "8"
  | "7"
  | "6";

type ShowcaseTab =
  | "top"
  | "prestige"
  | "favorites"
  | "community";

type CommunityMetric = "value" | "cards" | "sets";

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
  productSet?: {
    id: string;
    name: string | null;
    productId: string;
    isInsert?: boolean;
  } | null;
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

type PrestigeClaim = {
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
  claimable: PrestigeClaim[];
  error?: string;
};

type IconKind =
  | "refresh"
  | "arrow"
  | "star"
  | "chevron"
  | "close"
  | "shuffle"
  | "flip";

const TOP_CARD_GRADE_FILTERS: Array<{
  value: GradeFilter;
  label: string;
}> = [
  { value: "overall", label: "Overall" },
  { value: "raw", label: "Raw" },
  { value: "10", label: "10" },
  { value: "9", label: "9" },
  { value: "8", label: "8" },
  { value: "7", label: "7" },
  { value: "6", label: "6" },
];

const PRESTIGE_BUCKET_ORDER: Array<{
  key: PrestigeBucketKey;
  label: string;
  level: number;
}> = [
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

const TAB_STORAGE_KEY = "vcs:showcase:tab:v2";

function safeNum(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function safeInt(value: unknown) {
  return Math.round(safeNum(value));
}

function number(value: unknown) {
  return safeInt(value).toLocaleString("en-US");
}

function money(value: unknown) {
  return safeNum(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function compactMoney(value: unknown) {
  const amount = safeNum(value);

  if (Math.abs(amount) >= 1000000) {
    return `$${(amount / 1000000).toFixed(
      amount >= 10000000 ? 0 : 1
    )}M`;
  }

  if (Math.abs(amount) >= 1000) {
    return `$${(amount / 1000).toFixed(
      amount >= 100000 ? 0 : 1
    )}K`;
  }

  return money(amount);
}

function centsToMoney(value: unknown) {
  return money(safeNum(value) / 100);
}

function formatUserLabel(user: UserOption | undefined | null) {
  if (!user) return "Collector";

  const name = (user.name ?? "").trim();
  if (name) return name;

  const email = (user.email ?? "").trim();
  if (email) {
    const beforeAt = email.split("@")[0]?.trim();
    if (beforeAt) return beforeAt;
  }

  return "Collector";
}

function favoriteSetName(card: FavoriteCard | null) {
  if (!card) return "";

  const name = card.productSet?.name?.trim();
  return name || card.productSetId || "";
}

function cardSetName(card: TopCardRow) {
  return card.productSetName?.trim() || "VCS Collection";
}

function prestigeType(row: {
  isBase: boolean;
  isInsert: boolean;
}) {
  if (row.isBase) return "Base";
  if (row.isInsert) return "Insert";
  return "Set";
}

function Icon({ kind }: { kind: IconKind }) {
  const paths: Record<IconKind, React.ReactNode> = {
    refresh: (
      <>
        <path d="M20 5v5h-5M4 19v-5h5" />
        <path d="M19 10a7 7 0 0 0-12-5M5 14a7 7 0 0 0 12 5" />
      </>
    ),
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    star: (
      <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
    ),
    chevron: <path d="m9 6 6 6-6 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    shuffle: (
      <>
        <path d="M3 6h3c4 0 8 12 12 12h3" />
        <path d="m17 14 4 4-4 4" />
        <path d="M3 18h3c1.2 0 2.3-.9 3.4-2.3" />
        <path d="M14.7 8.2C15.8 6.9 16.9 6 18 6h3" />
        <path d="m17 2 4 4-4 4" />
      </>
    ),
    flip: (
      <>
        <path d="M4 8a8 8 0 0 1 13.7-2.6L20 8" />
        <path d="M20 4v4h-4" />
        <path d="M20 16a8 8 0 0 1-13.7 2.6L4 16" />
        <path d="M4 20v-4h4" />
      </>
    ),
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

function Avatar({
  row,
  size = 38,
}: {
  row: Pick<LeaderRow, "name" | "email" | "image">;
  size?: number;
}) {
  const initial = (
    row.name?.trim()?.[0] ??
    row.email?.trim()?.[0] ??
    "?"
  ).toUpperCase();

  return (
    <span
      className="showcase-avatar"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {row.image ? (
        <img src={row.image} alt="" />
      ) : (
        <span>{initial}</span>
      )}
    </span>
  );
}

function RawCard({
  card,
  alt,
}: {
  card: Pick<TopCardRow, "frontImageUrl">;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="showcase-raw-card">
      {card.frontImageUrl && !failed ? (
        <img
          src={card.frontImageUrl}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="showcase-card-fallback">
          <strong>VCS</strong>
          <span>NO IMAGE</span>
        </div>
      )}
    </div>
  );
}

function PrestigeSetArt({
  src,
  alt,
}: {
  src?: string | null;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span className="showcase-prestige-art">
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>VCS</span>
      )}
    </span>
  );
}

export default function ShowcaseClient() {
  const [tab, setTab] = useState<ShowcaseTab>("top");

  const [users, setUsers] = useState<UserOption[]>([]);
  const [meId, setMeId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [usersLoading, setUsersLoading] = useState(true);

  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] =
    useState(true);
  const [leaderboardError, setLeaderboardError] = useState("");

  const [topCards, setTopCards] = useState<TopCardRow[]>([]);
  const [topLoading, setTopLoading] = useState(true);
  const [topLoadingMore, setTopLoadingMore] = useState(false);
  const [topError, setTopError] = useState("");
  const [topPage, setTopPage] = useState(1);
  const [topTotalPages, setTopTotalPages] = useState(1);
  const [topTotal, setTopTotal] = useState(0);
  const [topGradeFilter, setTopGradeFilter] =
    useState<GradeFilter>("overall");

  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(
    new Set()
  );
  const [favCards, setFavCards] = useState<FavoriteCard[]>([]);
  const [favLoading, setFavLoading] = useState(false);
  const [favError, setFavError] = useState("");
  const [favIndex, setFavIndex] = useState(0);
  const [favFlipped, setFavFlipped] = useState(false);

  const [prestige, setPrestige] =
    useState<PrestigeSummary | null>(null);
  const [prestigeLoading, setPrestigeLoading] =
    useState(true);
  const [prestigeError, setPrestigeError] = useState("");
  const [
    selectedPrestigeBucket,
    setSelectedPrestigeBucket,
  ] = useState<PrestigeBucketKey | null>(null);
  const [claimingPrestigeId, setClaimingPrestigeId] =
    useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);

  const [communityMetric, setCommunityMetric] =
    useState<CommunityMetric>("value");

  const [gradingCard, setGradingCard] =
    useState<TopCardRow | null>(null);
  const [gradingQuantity, setGradingQuantity] = useState(1);
  const [gradingBusy, setGradingBusy] = useState(false);
  const [gradingError, setGradingError] = useState("");

  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState("");

  const isViewingMe =
    selectedUserId === "" ||
    (!!meId && selectedUserId === meId);

  const selectedUser = useMemo(() => {
    const id = selectedUserId || meId;
    return users.find((user) => user.id === id) ?? null;
  }, [meId, selectedUserId, users]);

  const selectedLabel =
    selectedUser?.name?.trim() ||
    (isViewingMe ? "My Collection" : "Collector");

  const selectedStats = useMemo(() => {
    const id = selectedUserId || meId;
    if (!id) return null;

    return (
      leaderboard.find((row) => row.userId === id) ?? null
    );
  }, [leaderboard, meId, selectedUserId]);

  const selectedRank = useMemo(() => {
    if (!selectedStats) return null;

    const sorted = [...leaderboard].sort(
      (a, b) =>
        safeNum(b.totalValue) - safeNum(a.totalValue) ||
        safeNum(b.totalCards) - safeNum(a.totalCards)
    );

    const index = sorted.findIndex(
      (row) => row.userId === selectedStats.userId
    );

    return index >= 0 ? index + 1 : null;
  }, [leaderboard, selectedStats]);

  const selectedBucketMeta = PRESTIGE_BUCKET_ORDER.find(
    (bucket) => bucket.key === selectedPrestigeBucket
  );

  const selectedBucketRows =
    selectedPrestigeBucket && prestige
      ? prestige.summary.bucketSets[selectedPrestigeBucket] ?? []
      : [];

  const highestPrestige = useMemo(() => {
    if (!prestige) return 0;

    let highest = 0;

    for (const bucket of PRESTIGE_BUCKET_ORDER) {
      if ((prestige.summary.buckets[bucket.key] ?? 0) > 0) {
        highest = Math.max(highest, bucket.level);
      }
    }

    return highest;
  }, [prestige]);

  const communityRows = useMemo(() => {
    const copy = [...leaderboard];

    copy.sort((a, b) => {
      if (communityMetric === "cards") {
        return (
          safeNum(b.totalCards) - safeNum(a.totalCards) ||
          safeNum(b.totalValue) - safeNum(a.totalValue)
        );
      }

      if (communityMetric === "sets") {
        return (
          safeNum(b.completedBaseSets) -
            safeNum(a.completedBaseSets) ||
          safeNum(b.totalValue) - safeNum(a.totalValue)
        );
      }

      return (
        safeNum(b.totalValue) - safeNum(a.totalValue) ||
        safeNum(b.totalCards) - safeNum(a.totalCards)
      );
    });

    return copy;
  }, [communityMetric, leaderboard]);

  const gradingFeePerCardCents = useMemo(() => {
    if (!gradingCard) return 0;

    return calculateGradingFeeCents(
      bookValueToCents(gradingCard.bookValue)
    );
  }, [gradingCard]);

  const gradingMaxQty = Math.max(
    1,
    safeInt(gradingCard?.qty ?? 1)
  );

  const gradingTotalFeeCents =
    gradingFeePerCardCents *
    Math.max(
      1,
      Math.min(gradingQuantity, gradingMaxQty)
    );

  const showToast = useCallback((message: string) => {
    setToast(message);

    window.setTimeout(() => {
      setToast((current) =>
        current === message ? "" : current
      );
    }, 3200);
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);

    try {
      const response = await fetch("/api/showcase/users", {
        cache: "no-store",
      });

      const data =
        (await response.json()) as UsersResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Couldn't load collectors.");
      }

      setUsers(Array.isArray(data.users) ? data.users : []);
      setMeId(data.meId ?? "");
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    setLeaderboardError("");

    try {
      const response = await fetch(
        "/api/showcase/leaderboard",
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error || "Couldn't load the leaderboard."
        );
      }

      setLeaderboard(
        Array.isArray(data.rows) ? data.rows : []
      );
    } catch (error) {
      setLeaderboardError(
        error instanceof Error
          ? error.message
          : "Couldn't load the leaderboard."
      );
      setLeaderboard([]);
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  const loadTopCards = useCallback(
    async (
      userId: string,
      page: number,
      gradeFilter: GradeFilter,
      append = false
    ) => {
      if (append) {
        setTopLoadingMore(true);
      } else {
        setTopLoading(true);
      }

      setTopError("");

      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: "20",
          grade: gradeFilter,
        });

        if (userId) {
          params.set("userId", userId);
        }

        const response = await fetch(
          `/api/showcase/top-cards?${params.toString()}`,
          { cache: "no-store" }
        );

        const data =
          (await response.json()) as TopCardsResponse;

        if (!response.ok || !data?.ok) {
          throw new Error(
            data?.error || "Couldn't load top cards."
          );
        }

        const nextRows = Array.isArray(data.rows)
          ? data.rows
          : [];

        setTopCards((current) =>
          append ? [...current, ...nextRows] : nextRows
        );

        setTopPage(data.page || page);
        setTopTotalPages(data.totalPages || 1);
        setTopTotal(data.total || 0);
      } catch (error) {
        setTopError(
          error instanceof Error
            ? error.message
            : "Couldn't load top cards."
        );

        if (!append) {
          setTopCards([]);
          setTopPage(1);
          setTopTotalPages(1);
          setTopTotal(0);
        }
      } finally {
        setTopLoading(false);
        setTopLoadingMore(false);
      }
    },
    []
  );

  const loadFavoriteIds = useCallback(async () => {
    if (!isViewingMe) {
      setFavoriteIds(new Set());
      return;
    }

    try {
      const response = await fetch(
        "/api/favorites/ids?limit=20000",
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error("favorites");
      }

      setFavoriteIds(
        new Set(
          Array.isArray(data.ids)
            ? data.ids.map((id: unknown) => safeInt(id))
            : []
        )
      );
    } catch {
      setFavoriteIds(new Set());
    }
  }, [isViewingMe]);

  const loadFavoritesRandom = useCallback(async () => {
    if (!isViewingMe) {
      setFavCards([]);
      setFavError("");
      setFavIndex(0);
      setFavFlipped(false);
      return;
    }

    setFavLoading(true);
    setFavError("");

    try {
      const response = await fetch(
        "/api/favorites/random?limit=60",
        { cache: "no-store" }
      );

      const data =
        (await response.json()) as FavoritesRandomResponse;

      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error || "Couldn't load favorites."
        );
      }

      setFavCards(
        Array.isArray(data.cards) ? data.cards : []
      );
      setFavIndex(0);
      setFavFlipped(false);
    } catch (error) {
      setFavError(
        error instanceof Error
          ? error.message
          : "Couldn't load favorites."
      );
      setFavCards([]);
    } finally {
      setFavLoading(false);
    }
  }, [isViewingMe]);

  const loadPrestige = useCallback(async () => {
    setPrestigeLoading(true);
    setPrestigeError("");

    try {
      const params = new URLSearchParams({ limit: "100" });

      if (selectedUserId) {
        params.set("userId", selectedUserId);
      }

      const response = await fetch(
        `/api/prestige/summary?${params.toString()}`,
        { cache: "no-store" }
      );

      const data =
        (await response.json()) as PrestigeSummary;

      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error || "Couldn't load prestige."
        );
      }

      setPrestige(data);
    } catch (error) {
      setPrestigeError(
        error instanceof Error
          ? error.message
          : "Couldn't load prestige."
      );
      setPrestige(null);
    } finally {
      setPrestigeLoading(false);
    }
  }, [selectedUserId]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(TAB_STORAGE_KEY);

      if (
        stored === "top" ||
        stored === "prestige" ||
        stored === "favorites" ||
        stored === "community"
      ) {
        setTab(stored);
      }
    } catch {
      // Optional preference only.
    }

    void loadUsers();
    void loadLeaderboard();
  }, [loadLeaderboard, loadUsers]);

  useEffect(() => {
    setTopPage(1);
    void loadTopCards(
      selectedUserId,
      1,
      topGradeFilter,
      false
    );
  }, [
    loadTopCards,
    selectedUserId,
    topGradeFilter,
  ]);

  useEffect(() => {
    setSelectedPrestigeBucket(null);
    void loadPrestige();
    void loadFavoriteIds();
    void loadFavoritesRandom();
  }, [
    loadFavoriteIds,
    loadFavoritesRandom,
    loadPrestige,
    selectedUserId,
  ]);

  useEffect(() => {
    function refreshCollection() {
      setTopPage(1);

      void loadLeaderboard();
      void loadTopCards(
        selectedUserId,
        1,
        topGradeFilter,
        false
      );
      void loadPrestige();

      if (isViewingMe) {
        void loadFavoriteIds();
      }
    }

    window.addEventListener(
      "vcs:collection-changed",
      refreshCollection
    );

    return () => {
      window.removeEventListener(
        "vcs:collection-changed",
        refreshCollection
      );
    };
  }, [
    isViewingMe,
    loadFavoriteIds,
    loadLeaderboard,
    loadPrestige,
    loadTopCards,
    selectedUserId,
    topGradeFilter,
  ]);

  useEffect(() => {
    if (!gradingCard) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [gradingCard]);

  function changeTab(next: ShowcaseTab) {
    setTab(next);

    try {
      localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {
      // Optional preference only.
    }
  }

  async function refreshAll() {
    setRefreshing(true);

    try {
      await Promise.all([
        loadUsers(),
        loadLeaderboard(),
        loadTopCards(
          selectedUserId,
          1,
          topGradeFilter,
          false
        ),
        loadPrestige(),
        loadFavoriteIds(),
        loadFavoritesRandom(),
      ]);

      setTopPage(1);
      showToast("Showcase refreshed.");
    } finally {
      setRefreshing(false);
    }
  }

  async function toggleFavorite(cardId: number) {
    if (!isViewingMe) return;

    const wasFavorite = favoriteIds.has(cardId);

    setFavoriteIds((current) => {
      const next = new Set(current);

      if (wasFavorite) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }

      return next;
    });

    try {
      const response = await fetch(
        "/api/favorites/toggle",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cardId }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error("Couldn't update favorite.");
      }

      await loadFavoriteIds();

      if (tab === "favorites") {
        await loadFavoritesRandom();
      }
    } catch {
      await loadFavoriteIds();
      showToast("Couldn't update favorite.");
    }
  }

  function openGrading(card: TopCardRow) {
    if (!isViewingMe || card.grade !== 0) return;

    setGradingCard(card);
    setGradingQuantity(1);
    setGradingError("");
  }

  async function submitForGrading() {
    if (!gradingCard || gradingBusy) return;

    const quantity = Math.max(
      1,
      Math.min(
        gradingMaxQty,
        Math.floor(gradingQuantity || 1)
      )
    );

    setGradingBusy(true);
    setGradingError("");

    try {
      const response = await fetch(
        "/api/grading/submit",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            cardId: gradingCard.cardId,
            quantity,
          }),
        }
      );

      const raw = await response.text();

      let data: any = null;

      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(
          `Grading returned invalid data (${response.status}).`
        );
      }

      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error || "Couldn't submit for grading."
        );
      }

      const player = gradingCard.player;

      setGradingCard(null);
      setTopPage(1);

      await Promise.all([
        loadTopCards(
          selectedUserId,
          1,
          topGradeFilter,
          false
        ),
        loadLeaderboard(),
      ]);

      window.dispatchEvent(
        new Event("vcs:collection-changed")
      );
      window.dispatchEvent(
        new Event("vcs:economy-changed")
      );

      showToast(
        `${player} submitted for VCS grading.`
      );
    } catch (error) {
      setGradingError(
        error instanceof Error
          ? error.message
          : "Couldn't submit for grading."
      );
    } finally {
      setGradingBusy(false);
    }
  }

  async function redeemPrestige(productSetId: string) {
    if (!isViewingMe || claimingPrestigeId) return;

    setClaimingPrestigeId(productSetId);

    try {
      const response = await fetch(
        "/api/prestige/redeem",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ productSetId }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error || "Couldn't claim prestige reward."
        );
      }

      await loadPrestige();

      window.dispatchEvent(
        new Event("vcs:economy-changed")
      );

      showToast("Prestige reward claimed.");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Couldn't claim prestige reward."
      );
    } finally {
      setClaimingPrestigeId(null);
    }
  }

  async function redeemAllPrestige() {
    if (!isViewingMe || claimingAll) return;

    setClaimingAll(true);

    try {
      const response = await fetch(
        "/api/prestige/redeem-all",
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error || "Couldn't claim prestige rewards."
        );
      }

      await loadPrestige();

      window.dispatchEvent(
        new Event("vcs:economy-changed")
      );

      showToast("Prestige rewards claimed.");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Couldn't claim prestige rewards."
      );
    } finally {
      setClaimingAll(false);
    }
  }

  function viewCollector(userId: string) {
    setSelectedUserId(
      userId === meId ? "" : userId
    );
    changeTab("top");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function favoritePrevious() {
    if (!favCards.length) return;

    setFavFlipped(false);

    setFavIndex(
      (current) =>
        (current - 1 + favCards.length) %
        favCards.length
    );
  }

  function favoriteNext() {
    if (!favCards.length) return;

    setFavFlipped(false);

    setFavIndex(
      (current) => (current + 1) % favCards.length
    );
  }

  const favCurrent = favCards[favIndex] ?? null;

  return (
    <main className="showcase-shell">
      {toast ? (
        <div
          className="showcase-toast"
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      ) : null}

      <header className="showcase-masthead">
        <div className="showcase-masthead-copy">
          <span className="showcase-eyebrow">
            SHOWCASE
          </span>

          <div className="showcase-title-row">
            <h1>{selectedLabel}</h1>

            <label className="showcase-user-select">
              <span className="showcase-sr-only">
                View another collector
              </span>

              <select
                value={selectedUserId}
                onChange={(event) =>
                  setSelectedUserId(event.target.value)
                }
                disabled={usersLoading}
                aria-label="View collector"
              >
                <option value="">
                  {selectedUser
                    ? `${formatUserLabel(
                        users.find(
                          (user) => user.id === meId
                        )
                      )} (Me)`
                    : "Me"}
                </option>

                {users
                  .filter((user) => user.id !== meId)
                  .map((user) => (
                    <option
                      key={user.id}
                      value={user.id}
                    >
                      {formatUserLabel(user)}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <div className="showcase-summary">
            <span>
              <strong>
                {selectedStats
                  ? compactMoney(
                      selectedStats.totalValue
                    )
                  : "—"}
              </strong>{" "}
              value
            </span>

            <i>·</i>

            <span>
              <strong>
                {selectedStats
                  ? number(selectedStats.totalCards)
                  : "—"}
              </strong>{" "}
              cards
            </span>

            <i>·</i>

            <span>
              <strong>
                {selectedStats
                  ? number(
                      selectedStats.completedBaseSets
                    )
                  : "—"}
              </strong>{" "}
              complete sets
            </span>

            {selectedRank ? (
              <>
                <i>·</i>
                <span className="showcase-rank-summary">
                  <strong>#{selectedRank}</strong> by value
                </span>
              </>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          className={`showcase-icon-button ${
            refreshing ? "is-refreshing" : ""
          }`}
          onClick={() => void refreshAll()}
          disabled={refreshing}
          aria-label={
            refreshing
              ? "Refreshing Showcase"
              : "Refresh Showcase"
          }
          title="Refresh Showcase"
        >
          <Icon kind="refresh" />
        </button>
      </header>

      <nav
        className="showcase-tabs"
        aria-label="Showcase sections"
      >
        {(
          [
            ["top", "Top Cards"],
            ["prestige", "Prestige"],
            ["favorites", "Favorites"],
            ["community", "Community"],
          ] as Array<[ShowcaseTab, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={
              tab === value ? "is-active" : ""
            }
            aria-current={
              tab === value ? "page" : undefined
            }
            onClick={() => changeTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "top" ? (
        <section className="showcase-top-section">
          <div className="showcase-section-heading">
            <div>
              <span className="showcase-section-kicker">
                TOP {topTotal || 100}
              </span>

              <h2>Top Cards</h2>

              <p>
                {topGradeFilter === "overall"
                  ? "One spot per card, represented by the best version owned."
                  : topGradeFilter === "raw"
                    ? "Your highest-value raw cards."
                    : `Your highest-value VCS ${topGradeFilter} cards.`}
              </p>
            </div>

            {!topLoading ? (
              <span className="showcase-section-count">
                {number(topTotal)}{" "}
                {topTotal === 1 ? "card" : "cards"}
              </span>
            ) : null}
          </div>

          <div
            className="showcase-grade-tabs"
            role="group"
            aria-label="Filter top cards by grade"
          >
            {TOP_CARD_GRADE_FILTERS.map(
              (option) => (
                <button
                  key={option.value}
                  type="button"
                  className={[
                    topGradeFilter === option.value
                      ? "is-active"
                      : "",
                    option.value === "raw"
                      ? "is-raw"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-pressed={
                    topGradeFilter === option.value
                  }
                  onClick={() =>
                    setTopGradeFilter(option.value)
                  }
                >
                  {option.label}
                </button>
              )
            )}
          </div>

          {topGradeFilter === "raw" &&
          isViewingMe &&
          !topLoading &&
          topCards.length ? (
            <div className="showcase-raw-note">
              <span>
                Grade any raw card directly from its
                card below.
              </span>

              <Link href="/grading">
                Grading orders
                <Icon kind="arrow" />
              </Link>
            </div>
          ) : null}

          {topError ? (
            <div
              className="showcase-notice"
              role="alert"
            >
              {topError}
            </div>
          ) : null}

          {topLoading ? (
            <div className="showcase-card-grid showcase-loading-grid">
              {Array.from({ length: 8 }).map(
                (_, index) => (
                  <div
                    className="showcase-loading-card"
                    key={index}
                  >
                    <span />
                    <i />
                    <i />
                  </div>
                )
              )}
            </div>
          ) : topCards.length === 0 ? (
            <div className="showcase-empty">
              <strong>No cards here yet.</strong>
              <span>
                No owned cards match this grade
                selection.
              </span>
            </div>
          ) : (
            <>
              <div className="showcase-card-grid">
                {topCards.map((card, index) => {
                  const rank = index + 1;
                  const isFavorite =
                    isViewingMe &&
                    favoriteIds.has(card.cardId);
                  const graded = card.grade > 0;

                  return (
                    <article
                      className={[
                        "showcase-card",
                        rank <= 3
                          ? `rank-${rank}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={`${card.cardId}-${card.grade}`}
                    >
                      <div className="showcase-card-topline">
                        <span className="showcase-card-rank">
                          #{rank}
                        </span>

                        {isViewingMe ? (
                          <button
                            type="button"
                            className={`showcase-star ${
                              isFavorite
                                ? "is-favorite"
                                : ""
                            }`}
                            onClick={() =>
                              void toggleFavorite(
                                card.cardId
                              )
                            }
                            aria-label={
                              isFavorite
                                ? `Remove ${card.player} from favorites`
                                : `Favorite ${card.player}`
                            }
                            title={
                              isFavorite
                                ? "Remove favorite"
                                : "Favorite"
                            }
                          >
                            <Icon kind="star" />
                          </button>
                        ) : null}
                      </div>

                      <Link
                        href={`/cards/${card.cardId}`}
                        className="showcase-card-display"
                        aria-label={`Open ${card.player} details`}
                      >
                        {graded ? (
                          <div className="showcase-slab-wrap">
                            <VcsSlab
                              player={card.player}
                              cardNumber={
                                card.cardNumber
                              }
                              setName={cardSetName(card)}
                              team={card.team}
                              grade={card.grade}
                              imageUrl={
                                card.frontImageUrl
                              }
                            />
                          </div>
                        ) : (
                          <RawCard
                            card={card}
                            alt={`${card.player} #${card.cardNumber}`}
                          />
                        )}
                      </Link>

                      <div className="showcase-card-copy">
                        <Link
                          href={`/cards/${card.cardId}`}
                          className="showcase-card-name"
                        >
                          {card.player}
                        </Link>

                        <div className="showcase-card-meta">
                          <span>
                            #{card.cardNumber}
                          </span>

                          {card.productSetName ? (
                            <>
                              <i>·</i>
                              <span>
                                {card.productSetName}
                              </span>
                            </>
                          ) : null}
                        </div>

                        <div className="showcase-card-bottom">
                          <div>
                            <span
                              className={`showcase-grade-label ${
                                graded
                                  ? "is-graded"
                                  : "is-raw"
                              }`}
                            >
                              {graded
                                ? `VCS ${card.grade}`
                                : "Raw"}
                            </span>

                            <strong>
                              {money(
                                card.ownedValue
                              )}
                            </strong>
                          </div>

                          {topGradeFilter ===
                            "raw" &&
                          isViewingMe ? (
                            <button
                              type="button"
                              className="showcase-grade-action"
                              onClick={() =>
                                openGrading(card)
                              }
                            >
                              Grade
                              <Icon kind="arrow" />
                            </button>
                          ) : (
                            <Link
                              href={`/cards/${card.cardId}`}
                              className="showcase-details-action"
                            >
                              Details
                              <Icon kind="arrow" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {topPage < topTotalPages ? (
                <div className="showcase-load-more-wrap">
                  <button
                    type="button"
                    className="showcase-secondary"
                    disabled={topLoadingMore}
                    onClick={() =>
                      void loadTopCards(
                        selectedUserId,
                        topPage + 1,
                        topGradeFilter,
                        true
                      )
                    }
                  >
                    {topLoadingMore
                      ? "Loading…"
                      : `Load more · ${number(
                          topCards.length
                        )} of ${number(topTotal)}`}
                  </button>
                </div>
              ) : topCards.length > 20 ? (
                <div className="showcase-end-caption">
                  {number(topCards.length)} cards
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {tab === "prestige" ? (
        <section className="showcase-prestige-section">
          <div className="showcase-section-heading">
            <div>
              <span className="showcase-section-kicker">
                COLLECTION MASTERY
              </span>
              <h2>Prestige</h2>
              <p>
                Complete sets repeatedly to move them
                through prestige levels and earn rewards.
              </p>
            </div>
          </div>

          {prestigeError ? (
            <div
              className="showcase-notice"
              role="alert"
            >
              {prestigeError}
            </div>
          ) : prestigeLoading ? (
            <div className="showcase-prestige-loading">
              Loading prestige…
            </div>
          ) : !prestige ? (
            <div className="showcase-empty">
              <strong>No prestige data yet.</strong>
            </div>
          ) : (
            <>
              <div className="showcase-prestige-summary">
                <div>
                  <strong>
                    {number(
                      prestige.summary
                        .setsWithAnyCompletion
                    )}
                  </strong>
                  <span>prestiged sets</span>
                </div>

                <div>
                  <strong>
                    {number(
                      prestige.summary
                        .totalTimesCompleted
                    )}
                  </strong>
                  <span>completions</span>
                </div>

                <div>
                  <strong>
                    {highestPrestige
                      ? `${highestPrestige}×`
                      : "—"}
                  </strong>
                  <span>highest tier</span>
                </div>

                <div>
                  <strong>
                    {centsToMoney(
                      prestige.summary
                        .bonusAwardedCents
                    )}
                  </strong>
                  <span>lifetime rewards</span>
                </div>
              </div>

              {prestige.claimable.length > 0 ? (
                <section className="showcase-rewards">
                  <div className="showcase-rewards-head">
                    <div>
                      <span>REWARDS READY</span>
                      <strong>
                        {number(
                          prestige.summary
                            .totalClaimableCompletions
                        )}{" "}
                        completions ·{" "}
                        {centsToMoney(
                          prestige.claimable.reduce(
                            (sum, row) =>
                              sum +
                              safeNum(
                                row.rewardReadyCents
                              ),
                            0
                          )
                        )}
                      </strong>
                    </div>

                    {isViewingMe ? (
                      <button
                        type="button"
                        className="showcase-primary"
                        disabled={claimingAll}
                        onClick={() =>
                          void redeemAllPrestige()
                        }
                      >
                        {claimingAll
                          ? "Claiming…"
                          : "Claim All"}
                      </button>
                    ) : null}
                  </div>

                  <div className="showcase-reward-list">
                    {prestige.claimable.map(
                      (row) => (
                        <div
                          className="showcase-reward-row"
                          key={row.productSetId}
                        >
                          <div className="showcase-reward-copy">
                            <strong>
                              {row.productSetName?.trim() ||
                                row.productSetId}
                            </strong>

                            <span>
                              Prestige{" "}
                              {number(
                                row.timesCompleted
                              )}
                              × ·{" "}
                              {prestigeType(row)}
                              {row.nextMilestoneLevel
                                ? ` · Next ${row.nextMilestoneLevel}×`
                                : ""}
                            </span>
                          </div>

                          <div className="showcase-reward-value">
                            <strong>
                              {centsToMoney(
                                row.rewardReadyCents
                              )}
                            </strong>

                            {isViewingMe ? (
                              <button
                                type="button"
                                disabled={
                                  claimingPrestigeId ===
                                  row.productSetId
                                }
                                onClick={() =>
                                  void redeemPrestige(
                                    row.productSetId
                                  )
                                }
                              >
                                {claimingPrestigeId ===
                                row.productSetId
                                  ? "Claiming…"
                                  : "Claim"}
                              </button>
                            ) : (
                              <span>
                                {number(
                                  row.claimable
                                )}{" "}
                                ready
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </section>
              ) : null}

              <div className="showcase-prestige-ribbon">
                {PRESTIGE_BUCKET_ORDER.map(
                  (bucket) => {
                    const count =
                      prestige.summary.buckets[
                        bucket.key
                      ] ?? 0;

                    const active =
                      selectedPrestigeBucket ===
                      bucket.key;

                    return (
                      <button
                        type="button"
                        key={bucket.key}
                        className={[
                          "showcase-prestige-tier",
                          active
                            ? "is-active"
                            : "",
                          count > 0
                            ? "has-sets"
                            : "",
                          bucket.level >= 10
                            ? "is-major"
                            : "",
                          bucket.level >= 50
                            ? "is-elite"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-pressed={active}
                        onClick={() =>
                          setSelectedPrestigeBucket(
                            (current) =>
                              current === bucket.key
                                ? null
                                : bucket.key
                          )
                        }
                      >
                        <span>{bucket.label}</span>
                        <strong>
                          {number(count)}
                        </strong>
                      </button>
                    );
                  }
                )}
              </div>

              <div className="showcase-prestige-hint">
                Select a prestige level to see which sets
                are currently in that bucket.
              </div>

              {selectedBucketMeta ? (
                <section className="showcase-bucket-panel">
                  <header>
                    <div>
                      <span>
                        {
                          selectedBucketMeta.label
                        }{" "}
                        PRESTIGE
                      </span>

                      <h3>
                        {number(
                          selectedBucketRows.length
                        )}{" "}
                        {selectedBucketRows.length === 1
                          ? "set"
                          : "sets"}
                      </h3>
                    </div>

                    <button
                      type="button"
                      className="showcase-icon-button"
                      onClick={() =>
                        setSelectedPrestigeBucket(null)
                      }
                      aria-label="Close prestige bucket"
                    >
                      <Icon kind="close" />
                    </button>
                  </header>

                  {selectedBucketRows.length ===
                  0 ? (
                    <div className="showcase-bucket-empty">
                      No sets currently occupy this
                      prestige level.
                    </div>
                  ) : (
                    <div className="showcase-bucket-list">
                      {selectedBucketRows.map(
                        (row) => (
                          <div
                            className="showcase-bucket-row"
                            key={row.productSetId}
                          >
                            <PrestigeSetArt
                              src={
                                row.sampleImageUrl
                              }
                              alt={
                                row.productSetName?.trim() ||
                                row.productSetId
                              }
                            />

                            <div className="showcase-bucket-copy">
                              <strong>
                                {row.productSetName?.trim() ||
                                  row.productSetId}
                              </strong>

                              <span>
                                {prestigeType(row)} ·{" "}
                                {number(
                                  row.timesCompleted
                                )}
                                × complete
                                {row.claimable > 0
                                  ? ` · ${number(
                                      row.claimable
                                    )} reward ready`
                                  : ""}
                              </span>
                            </div>

                            <Link
                              href={`/checklist/${encodeURIComponent(
                                row.productSetId
                              )}`}
                              className="showcase-bucket-link"
                            >
                              Checklist
                              <Icon kind="arrow" />
                            </Link>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </section>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {tab === "favorites" ? (
        <section className="showcase-favorites-section">
          <div className="showcase-section-heading">
            <div>
              <span className="showcase-section-kicker">
                SHOEBOX
              </span>
              <h2>Favorites</h2>
              <p>
                A simple place to flip through cards
                you&apos;ve starred.
              </p>
            </div>

            {isViewingMe && favCards.length ? (
              <button
                type="button"
                className="showcase-text-button"
                disabled={favLoading}
                onClick={() =>
                  void loadFavoritesRandom()
                }
              >
                <Icon kind="shuffle" />
                Shuffle
              </button>
            ) : null}
          </div>

          {!isViewingMe ? (
            <div className="showcase-empty">
              <strong>Favorites are private.</strong>
              <span>
                Switch back to your own Showcase to
                view your favorites.
              </span>
            </div>
          ) : favError ? (
            <div
              className="showcase-notice"
              role="alert"
            >
              {favError}
            </div>
          ) : favLoading ? (
            <div className="showcase-prestige-loading">
              Loading favorites…
            </div>
          ) : !favCurrent ? (
            <div className="showcase-empty">
              <strong>No favorites yet.</strong>
              <span>
                Star a card from Top Cards and it will
                appear here.
              </span>
            </div>
          ) : (
            <div className="showcase-shoebox">
              <button
                type="button"
                className="showcase-favorite-card"
                onClick={() =>
                  setFavFlipped(
                    (current) => !current
                  )
                }
                aria-label={
                  favFlipped
                    ? "Show card front"
                    : "Show card back"
                }
              >
                {(
                  favFlipped
                    ? favCurrent.backImageUrl
                    : favCurrent.frontImageUrl
                ) ? (
                  <img
                    src={
                      (favFlipped
                        ? favCurrent.backImageUrl
                        : favCurrent.frontImageUrl) ||
                      ""
                    }
                    alt={
                      favFlipped
                        ? `${favCurrent.player} card back`
                        : `${favCurrent.player} card front`
                    }
                  />
                ) : (
                  <span className="showcase-card-fallback">
                    <strong>VCS</strong>
                    <span>
                      {favFlipped
                        ? "NO BACK IMAGE"
                        : "NO FRONT IMAGE"}
                    </span>
                  </span>
                )}
              </button>

              <div className="showcase-shoebox-info">
                <span className="showcase-section-kicker">
                  {favIndex + 1} OF{" "}
                  {favCards.length}
                </span>

                <h3>{favCurrent.player}</h3>

                <p>
                  #{favCurrent.cardNumber}
                  {favCurrent.team
                    ? ` · ${favCurrent.team}`
                    : ""}
                  {favoriteSetName(favCurrent)
                    ? ` · ${favoriteSetName(
                        favCurrent
                      )}`
                    : ""}
                </p>

                <strong className="showcase-favorite-value">
                  {money(favCurrent.bookValue)}
                </strong>

                <div className="showcase-shoebox-actions">
                  <button
                    type="button"
                    className="showcase-secondary"
                    onClick={favoritePrevious}
                  >
                    ←
                  </button>

                  <button
                    type="button"
                    className="showcase-secondary"
                    onClick={() =>
                      setFavFlipped(
                        (current) => !current
                      )
                    }
                  >
                    <Icon kind="flip" />
                    {favFlipped
                      ? "Front"
                      : "Flip"}
                  </button>

                  <button
                    type="button"
                    className="showcase-secondary"
                    onClick={favoriteNext}
                  >
                    →
                  </button>
                </div>

                <div className="showcase-shoebox-links">
                  <Link
                    href={`/cards/${favCurrent.id}`}
                  >
                    Details
                    <Icon kind="arrow" />
                  </Link>

                  <button
                    type="button"
                    onClick={() =>
                      void toggleFavorite(
                        favCurrent.id
                      )
                    }
                  >
                    <Icon kind="star" />
                    Remove favorite
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {tab === "community" ? (
        <section className="showcase-community-section">
          <div className="showcase-section-heading">
            <div>
              <span className="showcase-section-kicker">
                COMMUNITY
              </span>
              <h2>Collectors</h2>
              <p>
                Compare collections and open another
                collector&apos;s Showcase.
              </p>
            </div>
          </div>

          <div
            className="showcase-community-tabs"
            role="group"
            aria-label="Leaderboard metric"
          >
            <button
              type="button"
              className={
                communityMetric === "value"
                  ? "is-active"
                  : ""
              }
              onClick={() =>
                setCommunityMetric("value")
              }
            >
              Value
            </button>

            <button
              type="button"
              className={
                communityMetric === "cards"
                  ? "is-active"
                  : ""
              }
              onClick={() =>
                setCommunityMetric("cards")
              }
            >
              Cards
            </button>

            <button
              type="button"
              className={
                communityMetric === "sets"
                  ? "is-active"
                  : ""
              }
              onClick={() =>
                setCommunityMetric("sets")
              }
            >
              Completed Sets
            </button>
          </div>

          {leaderboardError ? (
            <div
              className="showcase-notice"
              role="alert"
            >
              {leaderboardError}
            </div>
          ) : leaderboardLoading ? (
            <div className="showcase-prestige-loading">
              Loading collectors…
            </div>
          ) : communityRows.length === 0 ? (
            <div className="showcase-empty">
              <strong>No collectors found.</strong>
            </div>
          ) : (
            <div className="showcase-community-list">
              {communityRows.map((row, index) => {
                const primary =
                  communityMetric === "cards"
                    ? `${number(
                        row.totalCards
                      )} cards`
                    : communityMetric === "sets"
                      ? `${number(
                          row.completedBaseSets
                        )} sets`
                      : money(row.totalValue);

                return (
                  <button
                    type="button"
                    className="showcase-community-row"
                    key={row.userId}
                    onClick={() =>
                      viewCollector(row.userId)
                    }
                  >
                    <span className="showcase-community-rank">
                      #{index + 1}
                    </span>

                    <Avatar row={row} />

                    <span className="showcase-community-copy">
                      <strong>
                        {row.name?.trim() ||
                          "Collector"}
                        {row.userId === meId
                          ? " (Me)"
                          : ""}
                      </strong>

                      <span>
                        {number(
                          row.totalCards
                        )}{" "}
                        cards ·{" "}
                        {number(
                          row.completedBaseSets
                        )}{" "}
                        complete sets
                      </span>
                    </span>

                    <span className="showcase-community-value">
                      <strong>{primary}</strong>
                      <Icon kind="chevron" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {gradingCard ? (
        <div
          className="showcase-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !gradingBusy
            ) {
              setGradingCard(null);
            }
          }}
        >
          <section
            className="showcase-grading-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="showcase-grade-title"
          >
            <header>
              <div>
                <span className="showcase-section-kicker">
                  VCS GRADING
                </span>

                <h2 id="showcase-grade-title">
                  Grade {gradingCard.player}
                </h2>
              </div>

              <button
                type="button"
                className="showcase-icon-button"
                disabled={gradingBusy}
                onClick={() =>
                  setGradingCard(null)
                }
                aria-label="Close grading"
              >
                <Icon kind="close" />
              </button>
            </header>

            <div className="showcase-grade-card-summary">
              <RawCard
                card={gradingCard}
                alt={`${gradingCard.player} #${gradingCard.cardNumber}`}
              />

              <div>
                <strong>
                  {gradingCard.player}
                </strong>

                <span>
                  #{gradingCard.cardNumber}
                  {gradingCard.team
                    ? ` · ${gradingCard.team}`
                    : ""}
                </span>

                <dl>
                  <div>
                    <dt>Raw value</dt>
                    <dd>
                      {money(
                        gradingCard.bookValue
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Raw copies</dt>
                    <dd>
                      {number(
                        gradingCard.qty
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Fee / card</dt>
                    <dd>
                      {centsToMoney(
                        gradingFeePerCardCents
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <label className="showcase-grade-quantity">
              <span>Quantity</span>

              <select
                value={Math.max(
                  1,
                  Math.min(
                    gradingQuantity,
                    gradingMaxQty
                  )
                )}
                onChange={(event) =>
                  setGradingQuantity(
                    Number(event.target.value)
                  )
                }
                disabled={gradingBusy}
              >
                {Array.from(
                  { length: gradingMaxQty },
                  (_, index) => index + 1
                ).map((quantity) => (
                  <option
                    key={quantity}
                    value={quantity}
                  >
                    {quantity}
                  </option>
                ))}
              </select>
            </label>

            <div className="showcase-grade-total">
              <span>Estimated grading fee</span>
              <strong>
                {centsToMoney(
                  gradingTotalFeeCents
                )}
              </strong>
            </div>

            <p className="showcase-grade-note">
              Grades are determined when submitted and
              remain hidden until the grading order is
              ready.
            </p>

            {gradingError ? (
              <div
                className="showcase-notice"
                role="alert"
              >
                {gradingError}
              </div>
            ) : null}

            <button
              type="button"
              className="showcase-primary showcase-grade-submit"
              disabled={gradingBusy}
              onClick={() =>
                void submitForGrading()
              }
            >
              {gradingBusy
                ? "Submitting…"
                : `Submit ${
                    Math.max(
                      1,
                      Math.min(
                        gradingQuantity,
                        gradingMaxQty
                      )
                    )
                  } for ${centsToMoney(
                    gradingTotalFeeCents
                  )}`}
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
