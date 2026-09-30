import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  requireUserWithSelection,
} from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCKOUT_HOURS = 24;

type ChecklistOfferStatus =
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
type ChecklistFilter = "all" | "need";

type Ctx =
  | { params: { productId?: string } }
  | { params: Promise<{ productId?: string }> };

async function getProductId(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params =
    typeof p?.then === "function" ? await p : p;

  const raw = params?.productId;

  if (typeof raw !== "string" || !raw.trim()) {
    return "";
  }

  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

function addHours(date: Date, hours: number) {
  return new Date(
    date.getTime() + hours * 60 * 60 * 1000
  );
}

function clampInt(
  value: number,
  min: number,
  max: number
) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: any) {
  if (value == null) return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  if (
    typeof value === "object" &&
    typeof value.toNumber === "function"
  ) {
    try {
      const n = value.toNumber();
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  return 0;
}

function safeQty(value: unknown) {
  const n =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number(value ?? 0);

  if (!Number.isFinite(n) || n <= 0) {
    return 0;
  }

  return Math.floor(n);
}

function parseCardNo(raw: string | null | undefined) {
  const s = (raw ?? "").trim();
  const lower = s.toLowerCase();
  const match = lower.match(/(\d+)/);

  if (!match || match.index == null) {
    return {
      n: Number.POSITIVE_INFINITY,
      suf: lower,
      raw: lower,
    };
  }

  const numStr = match[1];
  const n = parseInt(numStr, 10);

  const suffixRaw = lower.slice(
    match.index + numStr.length
  );

  const suf = suffixRaw.replace(/[^a-z0-9]+/g, "");

  return {
    n: Number.isFinite(n)
      ? n
      : Number.POSITIVE_INFINITY,
    suf,
    raw: lower,
  };
}

function cardNoCompare(aNo: string, bNo: string) {
  const a = parseCardNo(aNo);
  const b = parseCardNo(bNo);

  if (a.n !== b.n) return a.n - b.n;
  if (a.suf !== b.suf) return a.suf.localeCompare(b.suf);

  return a.raw.localeCompare(b.raw);
}

function cmpText(a: any, b: any) {
  return String(a ?? "")
    .toLowerCase()
    .localeCompare(String(b ?? "").toLowerCase());
}

function parseSort(url: URL): {
  sortKey: SortKey;
  sortDir: SortDir;
} {
  const rawKey = (
    url.searchParams.get("sortKey") ?? ""
  ).trim();

  const rawDir = (
    url.searchParams.get("sortDir") ?? ""
  )
    .trim()
    .toLowerCase();

  const allowed: SortKey[] = [
    "cardNumber",
    "owned",
    "qty",
    "rawQty",
    "player",
    "team",
    "subset",
    "variant",
    "bookValue",
  ];

  return {
    sortKey: allowed.includes(rawKey as SortKey)
      ? (rawKey as SortKey)
      : "cardNumber",

    sortDir: rawDir === "desc" ? "desc" : "asc",
  };
}

function parseFilter(url: URL): ChecklistFilter {
  return (
    url.searchParams.get("filter") ?? ""
  )
    .trim()
    .toLowerCase() === "need"
    ? "need"
    : "all";
}

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const {
      currentUser,
      selectedUserId,
      isCompareMode,
    } = await requireUserWithSelection(req);

    const productId = await getProductId(ctx);

    if (!productId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing productId",
        },
        { status: 400 }
      );
    }

    const url = new URL(req.url);

    const page = clampInt(
      parseInt(
        url.searchParams.get("page") ?? "1",
        10
      ) || 1,
      1,
      999999
    );

    const pageSize = clampInt(
      parseInt(
        url.searchParams.get("pageSize") ?? "100",
        10
      ) || 100,
      25,
      200
    );

    const requestedSetId = (
      url.searchParams.get("productSetId") ?? ""
    ).trim();

    const searchText = (
      url.searchParams.get("q") ?? ""
    ).trim();

    const searchTerms = normalizeSearch(searchText)
      .split(" ")
      .filter(Boolean);

    const { sortKey, sortDir } = parseSort(url);
    const filterMode = parseFilter(url);

    const product = await prisma.product.findUnique({
      where: {
        id: productId,
      },
      include: {
        productSets: true,
      },
    });

    if (!product) {
      return NextResponse.json(
        {
          ok: false,
          error: `Product not found: ${productId}`,
        },
        { status: 404 }
      );
    }

    const baseSet =
      product.productSets.find((ps) => ps.isBase) ??
      product.productSets[0];

    if (!baseSet) {
      return NextResponse.json(
        {
          ok: false,
          error: `Product has no product sets: ${productId}`,
        },
        { status: 400 }
      );
    }

    const selectedSet = requestedSetId
      ? product.productSets.find(
          (ps) => ps.id === requestedSetId
        ) ?? null
      : baseSet;

    if (!selectedSet) {
      return NextResponse.json(
        {
          ok: false,
          error: `Product set not found: ${requestedSetId}`,
        },
        { status: 404 }
      );
    }

    const allCards = await prisma.card.findMany({
      where: {
        productSetId: selectedSet.id,
      },
      select: {
        id: true,
        cardNumber: true,
        player: true,
        team: true,
        subset: true,
        variant: true,
        bookValue: true,
        frontImageUrl: true,
        productSetId: true,
      },
    });

    const totalCards = allCards.length;

    const userIdsToFetch = isCompareMode
      ? Array.from(
          new Set([selectedUserId, currentUser.id])
        )
      : [selectedUserId];

    const ownershipAll =
      await prisma.cardOwnership.findMany({
        where: {
          userId: {
            in: userIdsToFetch,
          },
          quantity: {
            gt: 0,
          },
          card: {
            productSetId: selectedSet.id,
          },
        },
        select: {
          userId: true,
          cardId: true,
          grade: true,
          quantity: true,
          auctionLockedQuantity: true,
        },
      });

    const pendingAll =
      await prisma.gradingOrder.findMany({
        where: {
          userId: {
            in: userIdsToFetch,
          },
          quantity: {
            gt: 0,
          },
          status: {
            in: ["PENDING", "READY"],
          },
          card: {
            productSetId: selectedSet.id,
          },
        },
        select: {
          userId: true,
          cardId: true,
          quantity: true,
        },
      });

    /*
     * Important semantic split:
     *
     * total owned = all copies still owned, including copies
     * reserved in auctions and cards currently at grading.
     *
     * raw available = only unlocked grade-0 copies that can
     * actually be graded/sold/auctioned right now.
     */
    const selectedOwnedMap = new Map<number, number>();
    const selectedRawAvailableMap =
      new Map<number, number>();
    const selectedAuctionLockedMap =
      new Map<number, number>();
    const selectedPendingMap = new Map<number, number>();

    const myOwnedMap = new Map<number, number>();
    const myRawAvailableMap =
      new Map<number, number>();
    const myAuctionLockedMap =
      new Map<number, number>();
    const myPendingMap = new Map<number, number>();

    for (const ownership of ownershipAll) {
      const qty = safeQty(ownership.quantity);

      if (qty <= 0) continue;

      const locked = Math.min(
        qty,
        safeQty(ownership.auctionLockedQuantity)
      );

      const actionableRaw =
        ownership.grade === 0
          ? Math.max(0, qty - locked)
          : 0;

      if (ownership.userId === selectedUserId) {
        selectedOwnedMap.set(
          ownership.cardId,
          (selectedOwnedMap.get(ownership.cardId) ?? 0) +
            qty
        );

        if (locked > 0) {
          selectedAuctionLockedMap.set(
            ownership.cardId,
            (selectedAuctionLockedMap.get(
              ownership.cardId
            ) ?? 0) + locked
          );
        }

        if (actionableRaw > 0) {
          selectedRawAvailableMap.set(
            ownership.cardId,
            (selectedRawAvailableMap.get(
              ownership.cardId
            ) ?? 0) + actionableRaw
          );
        }
      }

      if (ownership.userId === currentUser.id) {
        myOwnedMap.set(
          ownership.cardId,
          (myOwnedMap.get(ownership.cardId) ?? 0) + qty
        );

        if (locked > 0) {
          myAuctionLockedMap.set(
            ownership.cardId,
            (myAuctionLockedMap.get(ownership.cardId) ?? 0) +
              locked
          );
        }

        if (actionableRaw > 0) {
          myRawAvailableMap.set(
            ownership.cardId,
            (myRawAvailableMap.get(ownership.cardId) ?? 0) +
              actionableRaw
          );
        }
      }
    }

    for (const pending of pendingAll) {
      const qty = safeQty(pending.quantity);

      if (qty <= 0) continue;

      if (pending.userId === selectedUserId) {
        selectedPendingMap.set(
          pending.cardId,
          (selectedPendingMap.get(pending.cardId) ?? 0) +
            qty
        );
      }

      if (pending.userId === currentUser.id) {
        myPendingMap.set(
          pending.cardId,
          (myPendingMap.get(pending.cardId) ?? 0) + qty
        );
      }
    }

    function selectedQty(cardId: number) {
      return (
        (selectedOwnedMap.get(cardId) ?? 0) +
        (selectedPendingMap.get(cardId) ?? 0)
      );
    }

    function myQty(cardId: number) {
      return (
        (myOwnedMap.get(cardId) ?? 0) +
        (myPendingMap.get(cardId) ?? 0)
      );
    }

    /*
     * Prestige is the minimum quantity owned across every card.
     */
    let prestigeLevel = 0;

    if (totalCards > 0) {
      let minimum = Number.POSITIVE_INFINITY;

      for (const card of allCards) {
        minimum = Math.min(
          minimum,
          selectedQty(card.id)
        );

        if (minimum === 0) break;
      }

      prestigeLevel = Number.isFinite(minimum)
        ? Math.max(0, Math.floor(minimum))
        : 0;
    }

    const nextPrestigeLevel = prestigeLevel + 1;

    let cardsAtNextPrestige = 0;

    for (const card of allCards) {
      if (
        selectedQty(card.id) >= nextPrestigeLevel
      ) {
        cardsAtNextPrestige++;
      }
    }

    const cardsNeededForNextPrestige =
      Math.max(
        0,
        totalCards - cardsAtNextPrestige
      );

    const nextPrestigePct =
      totalCards > 0
        ? Math.round(
            (cardsAtNextPrestige / totalCards) * 1000
          ) / 10
        : 0;

    let uniqueOwned = 0;

    for (const card of allCards) {
      if (selectedQty(card.id) > 0) {
        uniqueOwned++;
      }
    }

    const percentComplete =
      totalCards > 0
        ? (uniqueOwned / totalCards) * 100
        : 0;

    /*
     * Checklist value counts one represented copy per card.
     * Holdings value is the separate duplicate-inclusive value.
     */
    let setTotalBookValue = 0;
    let setOwnedBookValue = 0;
    let setMissingBookValue = 0;
    let holdingsBookValue = 0;

    let mySetOwnedBookValue: number | null =
      isCompareMode ? 0 : null;

    for (const card of allCards) {
      const bookValue = toNumber(card.bookValue);
      const qty = selectedQty(card.id);

      setTotalBookValue += bookValue;
      holdingsBookValue += qty * bookValue;

      if (qty > 0) {
        setOwnedBookValue += bookValue;
      } else {
        setMissingBookValue += bookValue;
      }

      if (isCompareMode && myQty(card.id) > 0) {
        mySetOwnedBookValue =
          (mySetOwnedBookValue ?? 0) + bookValue;
      }
    }

    const setOwnedValuePercent =
      setTotalBookValue > 0
        ? (setOwnedBookValue / setTotalBookValue) * 100
        : 0;

    let filteredCards = allCards.filter((card) => {
      if (searchTerms.length > 0) {
        const haystack = normalizeSearch(
          [
            card.cardNumber,
            card.player,
            card.team,
            card.subset,
            card.variant,
          ].join(" ")
        );

        const matches = searchTerms.every((term) =>
          haystack.includes(term)
        );

        if (!matches) return false;
      }

      if (filterMode === "need") {
        return (
          selectedQty(card.id) < nextPrestigeLevel
        );
      }

      return true;
    });

    const dir = sortDir === "desc" ? -1 : 1;

    filteredCards.sort((a, b) => {
      const aQty = selectedQty(a.id);
      const bQty = selectedQty(b.id);

      const aOwned = aQty > 0 ? 1 : 0;
      const bOwned = bQty > 0 ? 1 : 0;

      const aRaw =
        selectedRawAvailableMap.get(a.id) ?? 0;
      const bRaw =
        selectedRawAvailableMap.get(b.id) ?? 0;

      const aValue = toNumber(a.bookValue);
      const bValue = toNumber(b.bookValue);

      let primary = 0;

      switch (sortKey) {
        case "cardNumber":
          primary = cardNoCompare(
            a.cardNumber,
            b.cardNumber
          );
          break;

        case "owned":
          primary =
            sortDir === "desc"
              ? bOwned - aOwned
              : aOwned - bOwned;
          break;

        case "qty":
          primary =
            sortDir === "desc"
              ? bQty - aQty
              : aQty - bQty;
          break;

        case "rawQty":
          primary =
            sortDir === "desc"
              ? bRaw - aRaw
              : aRaw - bRaw;
          break;

        case "player":
          primary = cmpText(a.player, b.player) * dir;
          break;

        case "team":
          primary = cmpText(a.team, b.team) * dir;
          break;

        case "subset":
          primary = cmpText(a.subset, b.subset) * dir;
          break;

        case "variant":
          primary = cmpText(a.variant, b.variant) * dir;
          break;

        case "bookValue":
          primary =
            sortDir === "desc"
              ? bValue - aValue
              : aValue - bValue;
          break;
      }

      if (primary !== 0) {
        return primary;
      }

      const cardNo = cardNoCompare(
        a.cardNumber,
        b.cardNumber
      );

      if (cardNo !== 0) return cardNo;

      return a.id - b.id;
    });

    const resultCount = filteredCards.length;

    const totalPages = Math.max(
      1,
      Math.ceil(resultCount / pageSize)
    );

    const safePage = clampInt(
      page,
      1,
      totalPages
    );

    const skip = (safePage - 1) * pageSize;

    const pageCards = filteredCards.slice(
      skip,
      skip + pageSize
    );

    const now = new Date();

    const lockoutWindowStart = new Date(
      now.getTime() -
        LOCKOUT_HOURS * 60 * 60 * 1000
    );

    const visibleCardIds = pageCards.map(
      (card) => card.id
    );

    const visibleOfferRows =
      visibleCardIds.length > 0
        ? await prisma.shopOffer.findMany({
            where: {
              userId: currentUser.id,
              cardId: {
                in: visibleCardIds,
              },
              acceptedAt: null,
              OR: [
                {
                  rejectedAt: null,
                  expiresAt: {
                    gt: now,
                  },
                },
                {
                  rejectedAt: {
                    gt: lockoutWindowStart,
                  },
                },
                {
                  rejectedAt: null,
                  expiresAt: {
                    lte: now,
                    gt: lockoutWindowStart,
                  },
                },
              ],
            },
            select: {
              id: true,
              cardId: true,
              expiresAt: true,
              rejectedAt: true,
            },
            orderBy: [
              {
                createdAt: "desc",
              },
              {
                id: "desc",
              },
            ],
          })
        : [];

    const offerStatusByCard =
      new Map<number, ChecklistOfferStatus>();

    for (const offer of visibleOfferRows) {
      const current =
        offerStatusByCard.get(offer.cardId);

      if (
        !offer.rejectedAt &&
        offer.expiresAt.getTime() > now.getTime()
      ) {
        offerStatusByCard.set(offer.cardId, {
          state: "ACTIVE",
          offerId: offer.id,
          expiresAt: offer.expiresAt.toISOString(),
        });

        continue;
      }

      if (current?.state === "ACTIVE") {
        continue;
      }

      const lockedUntil = offer.rejectedAt
        ? addHours(offer.rejectedAt, LOCKOUT_HOURS)
        : addHours(offer.expiresAt, LOCKOUT_HOURS);

      if (lockedUntil.getTime() <= now.getTime()) {
        continue;
      }

      if (current?.state === "LOCKED") {
        const currentUntil = new Date(
          current.lockedUntil
        );

        if (
          currentUntil.getTime() >=
          lockedUntil.getTime()
        ) {
          continue;
        }
      }

      offerStatusByCard.set(offer.cardId, {
        state: "LOCKED",
        lockedUntil: lockedUntil.toISOString(),
      });
    }

    const rows = pageCards.map((card) => {
      const revealedOwnedQty =
        selectedOwnedMap.get(card.id) ?? 0;

      const pendingGradingQty =
        selectedPendingMap.get(card.id) ?? 0;

      const ownedQty =
        revealedOwnedQty + pendingGradingQty;

      const rawQty =
        selectedRawAvailableMap.get(card.id) ?? 0;

      const auctionLockedQty =
        selectedAuctionLockedMap.get(card.id) ?? 0;

      const needQty = Math.max(
        0,
        nextPrestigeLevel - ownedQty
      );

      const row: any = {
        cardId: card.id,
        cardNumber: card.cardNumber,
        player: card.player,
        team: card.team,
        subset: card.subset,
        variant: card.variant,
        isInsert: !selectedSet.isBase,
        bookValue: toNumber(card.bookValue),
        frontImageUrl: card.frontImageUrl,

        ownedQty,
        rawQty,
        needQty,

        revealedOwnedQty,
        auctionLockedQty,
        pendingGradingQty,

        offerStatus:
          offerStatusByCard.get(card.id) ?? {
            state: "AVAILABLE",
          },
      };

      if (isCompareMode) {
        row.myOwnedQty = myQty(card.id);
        row.myRawQty =
          myRawAvailableMap.get(card.id) ?? 0;
        row.myAuctionLockedQty =
          myAuctionLockedMap.get(card.id) ?? 0;
        row.myPendingGradingQty =
          myPendingMap.get(card.id) ?? 0;
      }

      return row;
    });

    return NextResponse.json({
      ok: true,

      currentUserId: currentUser.id,
      selectedUserId,
      isCompareMode,

      productId,

      productSetId: selectedSet.id,
      productSetIsBase: selectedSet.isBase,

      productSets: product.productSets.map((ps) => ({
        id: ps.id,
        isBase: ps.isBase,
        name: (ps as any).name ?? null,
      })),

      totalCards,
      uniqueOwned,
      percentComplete,

      prestigeLevel,
      nextPrestigeLevel,
      cardsAtNextPrestige,
      cardsNeededForNextPrestige,
      nextPrestigePct,

      setTotalBookValue,
      setOwnedBookValue,
      setMissingBookValue,
      setOwnedValuePercent,
      holdingsBookValue,

      ...(isCompareMode
        ? {
            mySetOwnedBookValue,
          }
        : {}),

      searchText,
      filterMode,
      resultCount,

      sortKey,
      sortDir,

      page: safePage,
      pageSize,
      totalPages,

      rows,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ?? "Checklist failed",
      },
      {
        status: error?.status ?? 500,
      }
    );
  }
}
