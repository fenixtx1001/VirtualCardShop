// src/app/api/checklist/[productId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserWithSelection } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

// --- Card number-aware sorting (ignores any prefix)
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

// Prisma may return Decimal for bookValue; normalize safely to number.
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

    // Pagination
    const page = clampInt(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1, 999999);
    const pageSizeRaw = parseInt(url.searchParams.get("pageSize") ?? "100", 10) || 100;
    const pageSize = clampInt(pageSizeRaw, 25, 200);

    // Optional productSetId query param
    const rawProductSetId = url.searchParams.get("productSetId");
    const requestedSetId = rawProductSetId ? decodeURIComponent(rawProductSetId).trim() : "";

    // ✅ NEW: sort params
    const { sortKey, sortDir } = parseSort(url);

    // Load product + its productSets so we can default to Base, and allow toggling sets.
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

    // Total cards in this productSet (for paging + completion stats)
    const totalCards = await prisma.card.count({
      where: { productSetId: selectedSet.id },
    });

    const totalPages = Math.max(1, Math.ceil(totalCards / pageSize));
    const safePage = clampInt(page, 1, totalPages);
    const skip = (safePage - 1) * pageSize;

    // ✅ Pull all cards' sort fields (cheap enough for set sizes like 770, 600, etc.)
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

    // ✅ Pull ownership for the whole set for sorting (selected user + me in compare mode)
    const userIdsToFetch = isCompareMode
      ? [selectedUserId, currentUser.id]
      : [selectedUserId];

    const ownershipAll = await prisma.cardOwnership.findMany({
      where: {
        userId: { in: userIdsToFetch },
        quantity: { gt: 0 },
        card: { productSetId: selectedSet.id },
      },
      select: { userId: true, cardId: true, quantity: true },
    });

    const selectedOwnedMap = new Map<number, number>();
    const myOwnedMap = new Map<number, number>();

    for (const o of ownershipAll) {
      if (o.userId === selectedUserId) selectedOwnedMap.set(o.cardId, o.quantity);
      if (o.userId === currentUser.id) myOwnedMap.set(o.cardId, o.quantity);
    }

    // ✅ Sort across the WHOLE set, then paginate
    const dir = sortDir === "desc" ? -1 : 1;

    allCards.sort((a, b) => {
      const aOwnedQty = selectedOwnedMap.get(a.id) ?? 0;
      const bOwnedQty = selectedOwnedMap.get(b.id) ?? 0;

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
          // owned first (desc) is the natural view; but respect sortDir
          primary = (aOwned - bOwned) * dir;
          // If descending, we want owned(1) first => reverse
          if (sortDir === "desc") primary = (bOwned - aOwned);
          break;

        case "qty":
          primary = (aOwnedQty - bOwnedQty) * dir;
          // natural: bigger qty first when desc
          if (sortDir === "desc") primary = (bOwnedQty - aOwnedQty);
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
          primary = (aBV - bBV) * dir;
          if (sortDir === "desc") primary = (bBV - aBV);
          break;

        default:
          primary = cardNoCompare(a.cardNumber, b.cardNumber);
      }

      if (primary !== 0) return primary;

      // Stable tie-breakers (so paging doesn’t “shuffle” on refresh)
      // 1) card number
      const cn = cardNoCompare(a.cardNumber, b.cardNumber);
      if (cn !== 0) return cn;

      // 2) id
      return a.id - b.id;
    });

    const pageCards = allCards.slice(skip, skip + pageSize);
    const pageCardIds = pageCards.map((c) => c.id);

    // Completion stats (selected user) across the WHOLE set
    const uniqueOwnedRows = await prisma.cardOwnership.findMany({
      where: {
        userId: selectedUserId,
        quantity: { gt: 0 },
        card: { productSetId: selectedSet.id },
      },
      select: { cardId: true },
      distinct: ["cardId"],
    });

    const uniqueOwned = uniqueOwnedRows.length;
    const percentComplete = totalCards ? (uniqueOwned / totalCards) * 100 : 0;

    // ✅ NEW: Set value totals for the SELECTED productSet (whole set, not paged)
    const agg = await prisma.card.aggregate({
      where: { productSetId: selectedSet.id },
      _sum: { bookValue: true },
    });
    const setTotalBookValue = toNumber((agg as any)?._sum?.bookValue);

    // Selected user's owned book value across entire set
    const ownedAllRows = await prisma.cardOwnership.findMany({
      where: {
        userId: selectedUserId,
        quantity: { gt: 0 },
        card: { productSetId: selectedSet.id },
      },
      select: {
        quantity: true,
        card: { select: { bookValue: true } },
      },
    });

    let setOwnedBookValue = 0;
    for (const r of ownedAllRows) {
      const qty = typeof r.quantity === "number" ? r.quantity : 0;
      const bv = toNumber((r as any).card?.bookValue);
      setOwnedBookValue += qty * bv;
    }

    // My owned book value (compare mode only)
    let mySetOwnedBookValue: number | null = null;
    if (isCompareMode) {
      const myRows = await prisma.cardOwnership.findMany({
        where: {
          userId: currentUser.id,
          quantity: { gt: 0 },
          card: { productSetId: selectedSet.id },
        },
        select: {
          quantity: true,
          card: { select: { bookValue: true } },
        },
      });

      let sum = 0;
      for (const r of myRows) {
        const qty = typeof r.quantity === "number" ? r.quantity : 0;
        const bv = toNumber((r as any).card?.bookValue);
        sum += qty * bv;
      }
      mySetOwnedBookValue = sum;
    }

    const setMissingBookValue = Math.max(0, setTotalBookValue - setOwnedBookValue);
    const setOwnedValuePercent =
      setTotalBookValue > 0 ? (setOwnedBookValue / setTotalBookValue) * 100 : 0;

    const rows = pageCards.map((c) => {
      const ownedQty = selectedOwnedMap.get(c.id) ?? 0;

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
      };

      if (isCompareMode) {
        baseRow.myOwnedQty = myOwnedMap.get(c.id) ?? 0;
      }

      return baseRow;
    });

    return NextResponse.json({
      ok: true,

      // identity + mode
      currentUserId: currentUser.id,
      selectedUserId,
      isCompareMode,

      // product + set info
      productId,
      productSetId: selectedSet.id,
      productSetIsBase: selectedSet.isBase,

      // stats for selected user (whole set)
      totalCards,
      uniqueOwned,
      percentComplete,

      // value totals for the selected ProductSet
      setTotalBookValue,
      setOwnedBookValue,
      setMissingBookValue,
      setOwnedValuePercent,
      ...(isCompareMode ? { mySetOwnedBookValue } : {}),

      // ✅ NEW: sort info
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

      // pagination
      page: safePage,
      pageSize,
      totalPages,

      // allow UI toggle
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
