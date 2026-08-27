// src/app/api/checklist/[productId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserWithSelection } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCKOUT_HOURS = 24;

type ChecklistOfferStatus =
  | { state: "AVAILABLE" }
  | { state: "ACTIVE"; offerId: number; expiresAt: string }
  | { state: "LOCKED"; lockedUntil: string };

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

type Ctx =
  | { params: { productId?: string } }
  | { params: Promise<{ productId?: string }> };

async function getProductId(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;

  const raw = params?.productId;
  if (typeof raw !== "string" || !raw.trim()) return "";

  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseCardNo(raw: string | null | undefined) {
  const s = (raw ?? "").trim();
  const lower = s.toLowerCase();

  const m = lower.match(/(\d+)/);
  if (!m || m.index == null) {
    return { n: Number.POSITIVE_INFINITY, suf: lower, raw: lower };
  }

  const numStr = m[1];
  const n = parseInt(numStr, 10);

  const start = m.index;
  const end = start + numStr.length;
  const suffixRaw = lower.slice(end);
  const suf = suffixRaw.replace(/[^a-z0-9]+/g, "");

  return {
    n: Number.isFinite(n) ? n : Number.POSITIVE_INFINITY,
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

function toNumber(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === "object" && typeof v.toNumber === "function") {
    try {
      const n = v.toNumber();
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

function safeQty(value: unknown) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

type SortKey =
  | "cardNumber"
  | "owned"
  | "qty"
  | "player"
  | "team"
  | "subset"
  | "variant"
  | "bookValue";

type SortDir = "asc" | "desc";

function parseSort(url: URL): { sortKey: SortKey; sortDir: SortDir } {
  const rawKey = (url.searchParams.get("sortKey") ?? "").trim();
  const rawDir = (url.searchParams.get("sortDir") ?? "").trim().toLowerCase();

  const allowed: SortKey[] = [
    "cardNumber",
    "owned",
    "qty",
    "player",
    "team",
    "subset",
    "variant",
    "bookValue",
  ];

  const sortKey = (allowed.includes(rawKey as SortKey) ? rawKey : "cardNumber") as SortKey;
  const sortDir = (rawDir === "desc" ? "desc" : "asc") as SortDir;

  return { sortKey, sortDir };
}

function cmpText(a: any, b: any) {
  const as = String(a ?? "").toLowerCase();
  const bs = String(b ?? "").toLowerCase();
  return as.localeCompare(bs);
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { currentUser, selectedUserId, isCompareMode } =
      await requireUserWithSelection(req);

    const productId = await getProductId(ctx);
    if (!productId) {
      return NextResponse.json({ ok: false, error: "Missing productId" }, { status: 400 });
    }

    const url = new URL(req.url);

    const page = clampInt(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1, 999999);
    const pageSizeRaw = parseInt(url.searchParams.get("pageSize") ?? "100", 10) || 100;
    const pageSize = clampInt(pageSizeRaw, 25, 200);

    const rawProductSetId = url.searchParams.get("productSetId");
    const requestedSetId = rawProductSetId ? decodeURIComponent(rawProductSetId).trim() : "";

    const { sortKey, sortDir } = parseSort(url);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { productSets: true },
    });

    if (!product) {
      return NextResponse.json(
        { ok: false, error: `Product not found: ${productId}` },
        { status: 404 }
      );
    }

    const baseSet = product.productSets.find((ps) => ps.isBase) ?? product.productSets[0];
    if (!baseSet) {
      return NextResponse.json(
        { ok: false, error: `Product has no productSets: ${productId}` },
        { status: 400 }
      );
    }

    const selectedSet =
      requestedSetId
        ? product.productSets.find((ps) => ps.id === requestedSetId) ?? null
        : baseSet;

    if (!selectedSet) {
      return NextResponse.json(
        { ok: false, error: `productSetId not found on product: ${requestedSetId}` },
        { status: 404 }
      );
    }

    const totalCards = await prisma.card.count({
      where: { productSetId: selectedSet.id },
    });

    const totalPages = Math.max(1, Math.ceil(totalCards / pageSize));
    const safePage = clampInt(page, 1, totalPages);
    const skip = (safePage - 1) * pageSize;

    const allCards = await prisma.card.findMany({
      where: { productSetId: selectedSet.id },
      select: {
        id: true,
        cardNumber: true,
        player: true,
        team: true,
        subset: true,
        variant: true,
        bookValue: true,
        productSetId: true,
      },
    });

    const userIdsToFetch = isCompareMode
      ? [selectedUserId, currentUser.id]
      : [selectedUserId];

    const ownershipAll = await prisma.cardOwnership.findMany({
      where: {
        userId: { in: userIdsToFetch },
        quantity: { gt: 0 },
        card: { productSetId: selectedSet.id },
      },
      select: {
        userId: true,
        cardId: true,
        quantity: true,
        auctionLockedQuantity: true,
      },
    });

    const pendingAll = await prisma.gradingOrder.findMany({
      where: {
        userId: { in: userIdsToFetch },
        quantity: { gt: 0 },
        status: { in: ["PENDING", "READY"] },
        card: { productSetId: selectedSet.id },
      },
      select: { userId: true, cardId: true, quantity: true },
    });

    const selectedOwnedMap = new Map<number, number>();
    const selectedAuctionLockedMap = new Map<number, number>();
    const selectedPendingMap = new Map<number, number>();
    const myOwnedMap = new Map<number, number>();
    const myAuctionLockedMap = new Map<number, number>();
    const myPendingMap = new Map<number, number>();

    for (const o of ownershipAll) {
      const qty = safeQty(o.quantity);
      const auctionLockedQty = Math.min(qty, safeQty(o.auctionLockedQuantity));
      const availableQty = Math.max(0, qty - auctionLockedQty);
      if (qty <= 0) continue;

      if (o.userId === selectedUserId) {
        if (availableQty > 0) {
          selectedOwnedMap.set(o.cardId, (selectedOwnedMap.get(o.cardId) ?? 0) + availableQty);
        }
        if (auctionLockedQty > 0) {
          selectedAuctionLockedMap.set(
            o.cardId,
            (selectedAuctionLockedMap.get(o.cardId) ?? 0) + auctionLockedQty
          );
        }
      }

      if (o.userId === currentUser.id) {
        if (availableQty > 0) {
          myOwnedMap.set(o.cardId, (myOwnedMap.get(o.cardId) ?? 0) + availableQty);
        }
        if (auctionLockedQty > 0) {
          myAuctionLockedMap.set(
            o.cardId,
            (myAuctionLockedMap.get(o.cardId) ?? 0) + auctionLockedQty
          );
        }
      }
    }

    for (const p of pendingAll) {
      const qty = safeQty(p.quantity);
      if (qty <= 0) continue;

      if (p.userId === selectedUserId) {
        selectedPendingMap.set(p.cardId, (selectedPendingMap.get(p.cardId) ?? 0) + qty);
      }

      if (p.userId === currentUser.id) {
        myPendingMap.set(p.cardId, (myPendingMap.get(p.cardId) ?? 0) + qty);
      }
    }

    const dir = sortDir === "desc" ? -1 : 1;

    allCards.sort((a, b) => {
      const aOwnedQty = (selectedOwnedMap.get(a.id) ?? 0) + (selectedPendingMap.get(a.id) ?? 0);
      const bOwnedQty = (selectedOwnedMap.get(b.id) ?? 0) + (selectedPendingMap.get(b.id) ?? 0);

      const aOwned = aOwnedQty > 0 ? 1 : 0;
      const bOwned = bOwnedQty > 0 ? 1 : 0;

      const aBV = toNumber((a as any).bookValue);
      const bBV = toNumber((b as any).bookValue);

      let primary = 0;

      switch (sortKey) {
        case "cardNumber":
          primary = cardNoCompare(a.cardNumber, b.cardNumber);
          break;

        case "owned":
          primary = sortDir === "desc" ? bOwned - aOwned : aOwned - bOwned;
          break;

        case "qty":
          primary = sortDir === "desc" ? bOwnedQty - aOwnedQty : aOwnedQty - bOwnedQty;
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
          primary = sortDir === "desc" ? bBV - aBV : aBV - bBV;
          break;

        default:
          primary = cardNoCompare(a.cardNumber, b.cardNumber);
      }

      if (primary !== 0) return primary;

      const cn = cardNoCompare(a.cardNumber, b.cardNumber);
      if (cn !== 0) return cn;

      return a.id - b.id;
    });

    const pageCards = allCards.slice(skip, skip + pageSize);

    const now = new Date();
    const lockoutWindowStart = new Date(now.getTime() - LOCKOUT_HOURS * 60 * 60 * 1000);
    const visibleCardIds = pageCards.map((c) => c.id);

    const visibleOfferRows = visibleCardIds.length
      ? await prisma.shopOffer.findMany({
          where: {
            userId: currentUser.id,
            cardId: { in: visibleCardIds },
            acceptedAt: null,
            OR: [
              // Active offer.
              { rejectedAt: null, expiresAt: { gt: now } },
              // Recently rejected offer.
              { rejectedAt: { gt: lockoutWindowStart } },
              // Recently expired offer.
              { rejectedAt: null, expiresAt: { lte: now, gt: lockoutWindowStart } },
            ],
          },
          select: {
            id: true,
            cardId: true,
            expiresAt: true,
            rejectedAt: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        })
      : [];

    const offerStatusByCard = new Map<number, ChecklistOfferStatus>();

    for (const offer of visibleOfferRows) {
      const current = offerStatusByCard.get(offer.cardId);

      // Active offers take priority over lockouts.
      if (!offer.rejectedAt && offer.expiresAt.getTime() > now.getTime()) {
        offerStatusByCard.set(offer.cardId, {
          state: "ACTIVE",
          offerId: offer.id,
          expiresAt: offer.expiresAt.toISOString(),
        });
        continue;
      }

      if (current?.state === "ACTIVE") continue;

      const lockedUntil = offer.rejectedAt
        ? addHours(offer.rejectedAt, LOCKOUT_HOURS)
        : addHours(offer.expiresAt, LOCKOUT_HOURS);

      if (lockedUntil.getTime() <= now.getTime()) continue;

      if (current?.state === "LOCKED") {
        const currentUntil = new Date(current.lockedUntil);
        if (currentUntil.getTime() >= lockedUntil.getTime()) continue;
      }

      offerStatusByCard.set(offer.cardId, {
        state: "LOCKED",
        lockedUntil: lockedUntil.toISOString(),
      });
    }

    const uniqueOwnedCardIds = new Set<number>();

    for (const [cardId, qty] of selectedOwnedMap.entries()) {
      if (qty > 0) uniqueOwnedCardIds.add(cardId);
    }

    for (const [cardId, qty] of selectedPendingMap.entries()) {
      if (qty > 0) uniqueOwnedCardIds.add(cardId);
    }

    const uniqueOwned = uniqueOwnedCardIds.size;
    const percentComplete = totalCards ? (uniqueOwned / totalCards) * 100 : 0;

    const agg = await prisma.card.aggregate({
      where: { productSetId: selectedSet.id },
      _sum: { bookValue: true },
    });
    const setTotalBookValue = toNumber((agg as any)?._sum?.bookValue);

    let setOwnedBookValue = 0;
    let mySetOwnedBookValue: number | null = null;

    for (const c of allCards) {
      const bv = toNumber((c as any).bookValue);

      const selectedQty =
        (selectedOwnedMap.get(c.id) ?? 0) + (selectedPendingMap.get(c.id) ?? 0);
      setOwnedBookValue += selectedQty * bv;

      if (isCompareMode) {
        const myQty = (myOwnedMap.get(c.id) ?? 0) + (myPendingMap.get(c.id) ?? 0);
        mySetOwnedBookValue = (mySetOwnedBookValue ?? 0) + myQty * bv;
      }
    }

    const setMissingBookValue = Math.max(0, setTotalBookValue - setOwnedBookValue);
    const setOwnedValuePercent =
      setTotalBookValue > 0 ? (setOwnedBookValue / setTotalBookValue) * 100 : 0;

    const rows = pageCards.map((c) => {
      const revealedOwnedQty = selectedOwnedMap.get(c.id) ?? 0;
      const auctionLockedQty = selectedAuctionLockedMap.get(c.id) ?? 0;
      const pendingGradingQty = selectedPendingMap.get(c.id) ?? 0;
      const ownedQty = revealedOwnedQty + pendingGradingQty;

      const baseRow: any = {
        cardId: c.id,
        cardNumber: c.cardNumber,
        player: c.player,
        team: c.team,
        subset: c.subset,
        variant: c.variant,
        isInsert: !selectedSet.isBase,
        bookValue: toNumber((c as any).bookValue),
        ownedQty,
        offerStatus: offerStatusByCard.get(c.id) ?? { state: "AVAILABLE" },

        // Grading-aware ownership fields. Auction-locked copies are excluded
        // from revealedOwnedQty/ownedQty but returned separately for future visibility.
        revealedOwnedQty,
        auctionLockedQty,
        pendingGradingQty,
      };

      if (isCompareMode) {
        const myRevealedOwnedQty = myOwnedMap.get(c.id) ?? 0;
        const myAuctionLockedQty = myAuctionLockedMap.get(c.id) ?? 0;
        const myPendingGradingQty = myPendingMap.get(c.id) ?? 0;

        baseRow.myOwnedQty = myRevealedOwnedQty + myPendingGradingQty;
        baseRow.myRevealedOwnedQty = myRevealedOwnedQty;
        baseRow.myAuctionLockedQty = myAuctionLockedQty;
        baseRow.myPendingGradingQty = myPendingGradingQty;
      }

      return baseRow;
    });

    return NextResponse.json({
      ok: true,

      currentUserId: currentUser.id,
      selectedUserId,
      isCompareMode,

      productId,
      productSetId: selectedSet.id,
      productSetIsBase: selectedSet.isBase,

      totalCards,
      uniqueOwned,
      percentComplete,

      setTotalBookValue,
      setOwnedBookValue,
      setMissingBookValue,
      setOwnedValuePercent,
      ...(isCompareMode ? { mySetOwnedBookValue } : {}),

      sortKey,
      sortDir,
      allowedSortKeys: [
        "cardNumber",
        "owned",
        "qty",
        "player",
        "team",
        "subset",
        "variant",
        "bookValue",
      ],

      page: safePage,
      pageSize,
      totalPages,

      productSets: product.productSets.map((ps) => ({
        id: ps.id,
        isBase: ps.isBase,
        name: (ps as any).name ?? null,
      })),

      rows,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ ok: false, error: e?.message ?? "Checklist failed" }, { status });
  }
}