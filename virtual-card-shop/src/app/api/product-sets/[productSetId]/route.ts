export const revalidate = 60;

import { Gradeability } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { repriceProduct } from "@/lib/pack-pricing";

type RouteParams = {
  productSetId?: string;
  productsetid?: string;
  setId?: string;
};

type Ctx = {
  params:
    | RouteParams
    | Promise<RouteParams>;
};

type ProductSetRouteError = {
  message?: string;
};

async function getParam(ctx: Ctx) {
  const params = await ctx.params;

  const raw =
    params?.productSetId ??
    params?.productsetid ??
    params?.setId;

  return typeof raw === "string"
    ? decodeURIComponent(raw)
    : undefined;
}

function stringOrNull(
  v: unknown
): string | null {
  const s =
    typeof v === "string"
      ? v.trim()
      : "";

  return s.length ? s : null;
}

function numberOrNull(
  v: unknown
): number | null {
  if (v === null || v === undefined) {
    return null;
  }

  if (
    typeof v === "number" &&
    Number.isFinite(v)
  ) {
    return v;
  }

  if (
    typeof v === "string" &&
    v.trim() === ""
  ) {
    return null;
  }

  const n = Number(v);

  return Number.isFinite(n)
    ? n
    : null;
}

function gradeabilityOrUndefined(
  v: unknown
): Gradeability | undefined {
  if (
    v === undefined ||
    v === null ||
    v === ""
  ) {
    return undefined;
  }

  const s = String(v)
    .trim()
    .toUpperCase();

  if (s === "COMMON") {
    return Gradeability.COMMON;
  }

  if (s === "GREAT") {
    return Gradeability.GREAT;
  }

  if (s === "ICONIC") {
    return Gradeability.ICONIC;
  }

  return undefined;
}

function clampInt(
  n: number,
  min: number,
  max: number
) {
  return Math.max(
    min,
    Math.min(max, n)
  );
}

function getErrorMessage(
  e: unknown,
  fallback: string
) {
  const err =
    e as ProductSetRouteError;

  return typeof err?.message === "string"
    ? err.message
    : fallback;
}

export async function GET(
  req: Request,
  ctx: Ctx
) {
  try {
    const productSetId =
      await getParam(ctx);

    if (
      !productSetId ||
      productSetId === "undefined"
    ) {
      return NextResponse.json(
        {
          error:
            "Missing productSetId in route params",
        },
        {
          status: 400,
        }
      );
    }

    const url = new URL(req.url);

    const page = clampInt(
      Number(
        url.searchParams.get("page") ??
          "1"
      ),
      1,
      999999
    );

    const pageSize = clampInt(
      Number(
        url.searchParams.get(
          "pageSize"
        ) ?? "100"
      ),
      1,
      500
    );

    const productSet =
      await prisma.productSet.findUnique({
        where: {
          id: productSetId,
        },

        select: {
          id: true,
          productId: true,
          name: true,
          isBase: true,
          isInsert: true,
          oddsPerPack: true,
          commonPrice: true,
          semiStarPrice: true,
          unlistedStarPrice: true,
          star1Price: true,
          star2Price: true,
          star3Price: true,
          defaultGradeability: true,
          product: true,

          _count: {
            select: {
              cards: true,
            },
          },
        },
      });

    if (!productSet) {
      return NextResponse.json(
        {
          error:
            "Product Set not found",
        },
        {
          status: 404,
        }
      );
    }

    const totalCards =
      productSet._count.cards;

    const totalPages = Math.max(
      1,
      Math.ceil(
        totalCards / pageSize
      )
    );

    const safePage = clampInt(
      page,
      1,
      totalPages
    );

    const skip =
      (safePage - 1) * pageSize;

    const cards =
      await prisma.card.findMany({
        where: {
          productSetId,
        },

        select: {
          id: true,
          cardNumber: true,
          player: true,
          team: true,
          position: true,
          subset: true,
          variant: true,
          quantityOwned: true,
          bookValue: true,
          frontImageUrl: true,
          backImageUrl: true,
          productSetId: true,
          gradeabilityOverride: true,
        },

        orderBy: [
          {
            id: "asc",
          },
        ],

        skip,
        take: pageSize,
      });

    const sortedCards = cards.sort(
      (a, b) => {
        const aNum = String(
          a.cardNumber ?? ""
        ).trim();

        const bNum = String(
          b.cardNumber ?? ""
        ).trim();

        const aIsNumeric =
          /^\d+$/.test(aNum);

        const bIsNumeric =
          /^\d+$/.test(bNum);

        if (
          aIsNumeric &&
          bIsNumeric
        ) {
          return (
            Number(aNum) -
            Number(bNum)
          );
        }

        if (aIsNumeric) return -1;
        if (bIsNumeric) return 1;

        return aNum.localeCompare(
          bNum,
          undefined,
          {
            numeric: true,
            sensitivity: "base",
          }
        );
      }
    );

    return NextResponse.json({
      ...productSet,
      cards: sortedCards,

      pagination: {
        page: safePage,
        pageSize,
        totalCards,
        totalPages,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error: getErrorMessage(
          e,
          "Failed to load product set"
        ),
      },
      {
        status: 500,
      }
    );
  }
}

export async function PUT(
  req: Request,
  ctx: Ctx
) {
  try {
    const productSetId =
      await getParam(ctx);

    if (
      !productSetId ||
      productSetId === "undefined"
    ) {
      return NextResponse.json(
        {
          error:
            "Missing productSetId in route params",
        },
        {
          status: 400,
        }
      );
    }

    const body = await req
      .json()
      .catch(() => ({}));

    const isBase =
      typeof body.isBase === "boolean"
        ? body.isBase
        : undefined;

    const isInsert =
      typeof body.isInsert ===
      "boolean"
        ? body.isInsert
        : undefined;

    const defaultGradeability =
      gradeabilityOrUndefined(
        body.defaultGradeability
      );

    if (
      isBase === true &&
      isInsert === true
    ) {
      return NextResponse.json(
        {
          error:
            "A Product Set cannot be both Base and Insert.",
        },
        {
          status: 400,
        }
      );
    }

    const updated =
      await prisma.productSet.update({
        where: {
          id: productSetId,
        },

        data: {
          name:
            stringOrNull(body.name) ??
            undefined,

          isBase:
            isBase ?? undefined,

          isInsert:
            isInsert ?? undefined,

          oddsPerPack:
            numberOrNull(
              body.oddsPerPack
            ),

          commonPrice:
            numberOrNull(
              body.commonPrice
            ),

          semiStarPrice:
            numberOrNull(
              body.semiStarPrice
            ),

          unlistedStarPrice:
            numberOrNull(
              body.unlistedStarPrice
            ),

          star1Price:
            numberOrNull(
              body.star1Price
            ),

          star2Price:
            numberOrNull(
              body.star2Price
            ),

          star3Price:
            numberOrNull(
              body.star3Price
            ),

          defaultGradeability,
        },
      });

    await repriceProduct(
      updated.productId
    );

    return NextResponse.json({
      ok: true,
      productSet: updated,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error: getErrorMessage(
          e,
          "Save failed"
        ),
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: Ctx
) {
  try {
    const productSetId =
      await getParam(ctx);

    if (
      !productSetId ||
      productSetId === "undefined"
    ) {
      return NextResponse.json(
        {
          error:
            "Missing productSetId in route params",
        },
        {
          status: 400,
        }
      );
    }

    const existingProductSet =
      await prisma.productSet.findUnique({
        where: {
          id: productSetId,
        },

        select: {
          productId: true,
        },
      });

    const cards =
      await prisma.card.findMany({
        where: {
          productSetId,
        },

        select: {
          id: true,
        },
      });

    const cardIds = cards.map(
      (card) => card.id
    );

    await prisma.$transaction(
      async (tx) => {
        if (cardIds.length) {
          await tx.cardOwnership.deleteMany({
            where: {
              cardId: {
                in: cardIds,
              },
            },
          });
        }

        await tx.card.deleteMany({
          where: {
            productSetId,
          },
        });

        await tx.productSet.delete({
          where: {
            id: productSetId,
          },
        });
      }
    );

    if (
      existingProductSet?.productId
    ) {
      await repriceProduct(
        existingProductSet.productId
      );
    }

    return NextResponse.json({
      ok: true,
      deletedProductSetId:
        productSetId,
      deletedCards:
        cardIds.length,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error: getErrorMessage(
          e,
          "Delete failed"
        ),
      },
      {
        status: 500,
      }
    );
  }
}