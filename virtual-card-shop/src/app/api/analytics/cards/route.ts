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

function norm(s: string | null | undefined) {
  return String(s ?? "").trim().toLowerCase();
}

function compareCardNumber(a: string | null | undefined, b: string | null | undefined) {
  const aa = String(a ?? "").trim();
  const bb = String(b ?? "").trim();

  const re = /^(\d+)(.*)$/;
  const ma = aa.match(re);
  const mb = bb.match(re);

  if (ma && mb) {
    const na = parseInt(ma[1], 10);
    const nb = parseInt(mb[1], 10);
    if (na !== nb) return na - nb;

    const sa = ma[2].trim().toLowerCase();
    const sb = mb[2].trim().toLowerCase();
    return sa.localeCompare(sb);
  }

  return aa.localeCompare(bb, undefined, { numeric: true, sensitivity: "base" });
}

type ScopeMode = "me" | "all_users" | "single_user";
type UniverseMode = "owned" | "all";
type SortMode =
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

export async function GET(req: Request) {
  try {
    const me = await requireUser();
    const url = new URL(req.url);

    const compareMode = url.searchParams.get("compareMode") === "1";

    const scope = (url.searchParams.get("scope") ?? "me") as ScopeMode;
    const universe = (url.searchParams.get("universe") ?? "owned") as UniverseMode;

    const selectedUserId = (url.searchParams.get("selectedUserId") ?? "").trim() || null;
    const compareUserAId = (url.searchParams.get("compareUserAId") ?? "").trim() || null;
    const compareUserBId = (url.searchParams.get("compareUserBId") ?? "").trim() || null;

    const search = (url.searchParams.get("search") ?? "").trim();
    const sport = (url.searchParams.get("sport") ?? "").trim();
    const year = (url.searchParams.get("year") ?? "").trim();
    const brand = (url.searchParams.get("brand") ?? "").trim();
    const productId = (url.searchParams.get("productId") ?? "").trim();
    const productSetId = (url.searchParams.get("productSetId") ?? "").trim();
    const team = (url.searchParams.get("team") ?? "").trim();
    const player = (url.searchParams.get("player") ?? "").trim();

    const sort = (url.searchParams.get("sort") ?? "owned_value_desc") as SortMode;
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

    if (compareMode) {
      if (universe === "owned") {
        if (compareUserAId && compareUserBId) {
          andClauses.push({
            ownerships: {
              some: {
                OR: [
                  { userId: compareUserAId, quantity: { gt: 0 } },
                  { userId: compareUserBId, quantity: { gt: 0 } },
                ],
              },
            },
          });
        } else if (compareUserAId) {
          andClauses.push({
            ownerships: {
              some: {
                userId: compareUserAId,
                quantity: { gt: 0 },
              },
            },
          });
        }
      }
    } else {
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
        ownerships: compareMode
          ? {
              where: {
                quantity: { gt: 0 },
                ...(compareUserAId || compareUserBId
                  ? {
                      userId: {
                        in: [compareUserAId, compareUserBId].filter(Boolean) as string[],
                      },
                    }
                  : {}),
              },
              select: {
                userId: true,
                quantity: true,
              },
            }
          : scope === "all_users"
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

    const rows = cards.map((c) => {
      const product = c.productSet?.product;
      const productLabel = [product?.year, product?.brand, product?.sport]
        .filter(Boolean)
        .join(" ")
        .trim();

      const bookValue = Number(c.bookValue ?? 0);

      if (compareMode) {
        const aQty =
          compareUserAId
            ? c.ownerships.find((o) => o.userId === compareUserAId)?.quantity ?? 0
            : 0;

        const bQty =
          compareUserBId
            ? c.ownerships.find((o) => o.userId === compareUserBId)?.quantity ?? 0
            : 0;

        const aValue = aQty * bookValue;
        const bValue = bQty * bookValue;
        const diffQty = aQty - bQty;
        const diffValue = aValue - bValue;

        return {
          cardId: c.id,
          player: c.player,
          cardNumber: c.cardNumber,
          team: c.team,
          bookValue,
          frontImageUrl: c.frontImageUrl,
          year: product?.year ?? null,
          brand: product?.brand ?? null,
          sport: product?.sport ?? null,
          productId: product?.id ?? c.productSet?.productId ?? null,
          productLabel: productLabel || friendlyId(product?.id ?? c.productSet?.productId),
          productSetId: c.productSetId,
          productSetLabel:
            (c.productSet?.name ?? "").trim() || friendlyId(c.productSetId),
          compare: {
            aQty,
            aValue,
            bQty,
            bValue,
            diffQty,
            diffValue,
          },
        };
      }

      const ownedQty =
        scope === "all_users"
          ? c.ownerships.reduce((sum, o) => sum + (o.quantity ?? 0), 0)
          : c.ownerships[0]?.quantity ?? 0;

      const ownedValue = ownedQty * bookValue;

      return {
        cardId: c.id,
        player: c.player,
        cardNumber: c.cardNumber,
        team: c.team,
        bookValue,
        ownedQty,
        ownedValue,
        frontImageUrl: c.frontImageUrl,
        year: product?.year ?? null,
        brand: product?.brand ?? null,
        sport: product?.sport ?? null,
        productId: product?.id ?? c.productSet?.productId ?? null,
        productLabel: productLabel || friendlyId(product?.id ?? c.productSet?.productId),
        productSetId: c.productSetId,
        productSetLabel:
          (c.productSet?.name ?? "").trim() || friendlyId(c.productSetId),
      };
    });

    rows.sort((a: any, b: any) => {
      if (compareMode) {
        if (sort === "a_value_desc") {
          if (b.compare.aValue !== a.compare.aValue) return b.compare.aValue - a.compare.aValue;
          return a.player.localeCompare(b.player);
        }
        if (sort === "b_value_desc") {
          if (b.compare.bValue !== a.compare.bValue) return b.compare.bValue - a.compare.bValue;
          return a.player.localeCompare(b.player);
        }
        if (sort === "diff_value_desc") {
          if (b.compare.diffValue !== a.compare.diffValue) return b.compare.diffValue - a.compare.diffValue;
          return a.player.localeCompare(b.player);
        }
        if (sort === "a_qty_desc") {
          if (b.compare.aQty !== a.compare.aQty) return b.compare.aQty - a.compare.aQty;
          return a.player.localeCompare(b.player);
        }
        if (sort === "b_qty_desc") {
          if (b.compare.bQty !== a.compare.bQty) return b.compare.bQty - a.compare.bQty;
          return a.player.localeCompare(b.player);
        }
        if (sort === "diff_qty_desc") {
          if (b.compare.diffQty !== a.compare.diffQty) return b.compare.diffQty - a.compare.diffQty;
          return a.player.localeCompare(b.player);
        }
      }

      if (sort === "owned_value_desc") {
        const av = compareMode ? a.compare.aValue : a.ownedValue;
        const bv = compareMode ? b.compare.aValue : b.ownedValue;
        if (bv !== av) return bv - av;
        if (b.bookValue !== a.bookValue) return b.bookValue - a.bookValue;
        return a.player.localeCompare(b.player);
      }
      if (sort === "book_value_desc") {
        if (b.bookValue !== a.bookValue) return b.bookValue - a.bookValue;
        return a.player.localeCompare(b.player);
      }
      if (sort === "book_value_asc") {
        if (a.bookValue !== b.bookValue) return a.bookValue - b.bookValue;
        return a.player.localeCompare(b.player);
      }
      if (sort === "owned_qty_desc") {
        const av = compareMode ? a.compare.aQty : a.ownedQty;
        const bv = compareMode ? b.compare.aQty : b.ownedQty;
        if (bv !== av) return bv - av;
        if (b.bookValue !== a.bookValue) return b.bookValue - a.bookValue;
        return a.player.localeCompare(b.player);
      }
      if (sort === "player_asc") {
        const byPlayer = norm(a.player).localeCompare(norm(b.player));
        if (byPlayer !== 0) return byPlayer;
        return compareCardNumber(a.cardNumber, b.cardNumber);
      }
      if (sort === "year_desc") {
        const ay = a.year ?? -Infinity;
        const by = b.year ?? -Infinity;
        if (by !== ay) return by - ay;
        return a.player.localeCompare(b.player);
      }
      if (sort === "brand_asc") {
        const byBrand = norm(a.brand).localeCompare(norm(b.brand));
        if (byBrand !== 0) return byBrand;
        return a.player.localeCompare(b.player);
      }
      if (sort === "card_number_asc") {
        const byCard = compareCardNumber(a.cardNumber, b.cardNumber);
        if (byCard !== 0) return byCard;
        return norm(a.player).localeCompare(norm(b.player));
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
      { ok: false, error: e?.message ?? "Failed to load analytics cards." },
      { status: 500 }
    );
  }
}