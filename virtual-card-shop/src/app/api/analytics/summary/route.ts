import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function friendlyId(s: string | null | undefined) {
  const v = String(s ?? "").trim();
  if (!v) return "—";
  return v.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function norm(s: string | number | null | undefined) {
  return String(s ?? "").trim().toLowerCase();
}

function normalizePlayerGroupName(player: string | null | undefined) {
  let s = String(player ?? "").trim();
  if (!s) return "—";

  const suffixPatterns = [
    /\s+\(rc\)$/i,
    /\s+\(roo\)$/i,
    /\s+\(as\)$/i,
    /\s+\(all-?star\)$/i,
    /\s+\(rookie\)$/i,
    /\s+rc$/i,
    /\s+roo$/i,
    /\s+as$/i,
    /\s+all-?star$/i,
    /\s+rookie$/i,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of suffixPatterns) {
      const next = s.replace(pattern, "").trim();
      if (next !== s) {
        s = next;
        changed = true;
      }
    }
  }

  return s || "—";
}

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

type SortMode =
  | "owned_value_desc"
  | "owned_qty_desc"
  | "unique_cards_desc"
  | "avg_book_value_desc"
  | "max_book_value_desc"
  | "name_asc";

type SummaryBucket = {
  key: string;
  label: string;
  uniqueCards: number;
  ownedQty: number;
  ownedValue: number;
  totalBookValue: number;
  maxBookValue: number;
  topCardLabel: string;
};

export async function GET(req: Request) {
  try {
    const me = await requireUser();
    const url = new URL(req.url);

    const scope = (url.searchParams.get("scope") ?? "me") as ScopeMode;
    const universe = (url.searchParams.get("universe") ?? "owned") as UniverseMode;
    const selectedUserId = (url.searchParams.get("selectedUserId") ?? "").trim() || null;

    const groupBy = (url.searchParams.get("groupBy") ?? "player") as GroupByMode;
    const sort = (url.searchParams.get("sort") ?? "owned_value_desc") as SortMode;

    const search = (url.searchParams.get("search") ?? "").trim();
    const sport = (url.searchParams.get("sport") ?? "").trim();
    const year = (url.searchParams.get("year") ?? "").trim();
    const brand = (url.searchParams.get("brand") ?? "").trim();
    const productId = (url.searchParams.get("productId") ?? "").trim();
    const productSetId = (url.searchParams.get("productSetId") ?? "").trim();
    const team = (url.searchParams.get("team") ?? "").trim();
    const player = (url.searchParams.get("player") ?? "").trim();

    const page = clampInt(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1, 100000);
    const pageSize = clampInt(parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50, 1, 200);

    const targetUserId =
      scope === "me" ? me.id : scope === "single_user" ? selectedUserId : null;

    const where: any = {};
    const andClauses: any[] = [];

    if (player) {
      andClauses.push({ player: { contains: player, mode: "insensitive" } });
    }

    if (team) {
      andClauses.push({ team: { contains: team, mode: "insensitive" } });
    }

    if (productSetId) {
      andClauses.push({ productSetId });
    }

    if (productId) {
      andClauses.push({
        productSet: {
          productId,
        },
      });
    }

    if (sport) {
      andClauses.push({
        productSet: {
          product: {
            sport,
          },
        },
      });
    }

    if (brand) {
      andClauses.push({
        productSet: {
          product: {
            brand,
          },
        },
      });
    }

    if (year) {
      const y = parseInt(year, 10);
      if (Number.isFinite(y)) {
        andClauses.push({
          productSet: {
            product: {
              year: y,
            },
          },
        });
      }
    }

    if (search) {
      const searchYear = parseInt(search, 10);
      const orClauses: any[] = [
        { player: { contains: search, mode: "insensitive" } },
        { team: { contains: search, mode: "insensitive" } },
        { cardNumber: { contains: search, mode: "insensitive" } },
        { productSetId: { contains: search, mode: "insensitive" } },
        {
          productSet: {
            name: { contains: search, mode: "insensitive" },
          },
        },
        {
          productSet: {
            product: {
              id: { contains: search, mode: "insensitive" },
            },
          },
        },
        {
          productSet: {
            product: {
              brand: { contains: search, mode: "insensitive" },
            },
          },
        },
        {
          productSet: {
            product: {
              sport: { contains: search, mode: "insensitive" },
            },
          },
        },
      ];

      if (Number.isFinite(searchYear)) {
        orClauses.push({
          productSet: {
            product: {
              year: searchYear,
            },
          },
        });
      }

      andClauses.push({ OR: orClauses });
    }

    if (universe === "owned") {
      if (scope === "all_users") {
        andClauses.push({
          ownerships: {
            some: {
              quantity: { gt: 0 },
            },
          },
        });
      } else if (targetUserId) {
        andClauses.push({
          ownerships: {
            some: {
              userId: targetUserId,
              quantity: { gt: 0 },
            },
          },
        });
      }
    }

    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    const cards = await prisma.card.findMany({
      where,
      include: {
        productSet: {
          select: {
            id: true,
            name: true,
            productId: true,
            product: {
              select: {
                id: true,
                year: true,
                brand: true,
                sport: true,
              },
            },
          },
        },
        ownerships:
          scope === "all_users"
            ? {
                where: { quantity: { gt: 0 } },
                select: {
                  userId: true,
                  quantity: true,
                },
              }
            : {
                where: targetUserId
                  ? {
                      userId: targetUserId,
                      quantity: { gt: 0 },
                    }
                  : { quantity: { gt: 0 } },
                select: {
                  userId: true,
                  quantity: true,
                },
              },
      },
    });

    const buckets = new Map<string, SummaryBucket>();

    for (const c of cards) {
      const ownedQty =
        scope === "all_users"
          ? c.ownerships.reduce((sum, o) => sum + (o.quantity ?? 0), 0)
          : c.ownerships[0]?.quantity ?? 0;

      const bookValue = Number(c.bookValue ?? 0);
      const ownedValue = ownedQty * bookValue;

      const product = c.productSet?.product;
      const productLabel =
        [product?.year, product?.brand, product?.sport].filter(Boolean).join(" ").trim() ||
        friendlyId(product?.id ?? c.productSet?.productId);

      const productSetLabel =
        (c.productSet?.name ?? "").trim() || friendlyId(c.productSetId);

      let key = "";
      let label = "";

      if (groupBy === "player") {
        const normalizedPlayer = normalizePlayerGroupName(c.player);
        key = normalizedPlayer;
        label = normalizedPlayer;
      } else if (groupBy === "team") {
        key = c.team || "—";
        label = c.team || "—";
      } else if (groupBy === "product") {
        key = product?.id || c.productSet?.productId || "—";
        label = productLabel;
      } else if (groupBy === "product_set") {
        key = c.productSetId || "—";
        label = productSetLabel;
      } else if (groupBy === "brand") {
        key = product?.brand || "—";
        label = product?.brand || "—";
      } else if (groupBy === "year") {
        key = String(product?.year ?? "—");
        label = String(product?.year ?? "—");
      } else if (groupBy === "sport") {
        key = product?.sport || "—";
        label = product?.sport || "—";
      }

      const topCardLabel = `${c.player}${c.cardNumber ? ` #${c.cardNumber}` : ""}`;

      if (!buckets.has(key)) {
        buckets.set(key, {
          key,
          label,
          uniqueCards: 0,
          ownedQty: 0,
          ownedValue: 0,
          totalBookValue: 0,
          maxBookValue: 0,
          topCardLabel: topCardLabel || "—",
        });
      }

      const bucket = buckets.get(key)!;
      bucket.uniqueCards += 1;
      bucket.ownedQty += ownedQty;
      bucket.ownedValue += ownedValue;
      bucket.totalBookValue += bookValue;

      if (bookValue > bucket.maxBookValue) {
        bucket.maxBookValue = bookValue;
        bucket.topCardLabel = topCardLabel || "—";
      }
    }

    const rows = Array.from(buckets.values()).map((b) => ({
      ...b,
      avgBookValue: b.uniqueCards > 0 ? b.totalBookValue / b.uniqueCards : 0,
    }));

    rows.sort((a, b) => {
      if (sort === "owned_value_desc") {
        if (b.ownedValue !== a.ownedValue) return b.ownedValue - a.ownedValue;
        return norm(a.label).localeCompare(norm(b.label));
      }
      if (sort === "owned_qty_desc") {
        if (b.ownedQty !== a.ownedQty) return b.ownedQty - a.ownedQty;
        return norm(a.label).localeCompare(norm(b.label));
      }
      if (sort === "unique_cards_desc") {
        if (b.uniqueCards !== a.uniqueCards) return b.uniqueCards - a.uniqueCards;
        return norm(a.label).localeCompare(norm(b.label));
      }
      if (sort === "avg_book_value_desc") {
        if (b.avgBookValue !== a.avgBookValue) return b.avgBookValue - a.avgBookValue;
        return norm(a.label).localeCompare(norm(b.label));
      }
      if (sort === "max_book_value_desc") {
        if (b.maxBookValue !== a.maxBookValue) return b.maxBookValue - a.maxBookValue;
        return norm(a.label).localeCompare(norm(b.label));
      }
      if (sort === "name_asc") {
        return norm(a.label).localeCompare(norm(b.label));
      }
      return 0;
    });

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const pagedRows = rows.slice(start, start + pageSize);

    return NextResponse.json(
      {
        ok: true,
        page: safePage,
        pageSize,
        total,
        totalPages,
        rows: pagedRows,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load analytics summary." },
      { status: 500 }
    );
  }
}