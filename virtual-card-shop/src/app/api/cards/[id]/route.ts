import { Gradeability } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePlayerTierProfile } from "@/lib/player-tiers";
import { repriceProduct } from "@/lib/pack-pricing";

type Ctx =
  | {
      params: {
        id?: string;
      };
    }
  | {
      params: Promise<{
        id?: string;
      }>;
    };

async function getId(ctx: Ctx) {
  const p: any = (ctx as any).params;

  const params =
    typeof p?.then === "function"
      ? await p
      : p;

  const raw = params?.id;

  const id =
    typeof raw === "string"
      ? Number(raw)
      : NaN;

  return Number.isFinite(id)
    ? id
    : null;
}

function hasOwn(obj: any, key: string) {
  return Object.prototype.hasOwnProperty.call(
    obj,
    key
  );
}

function numOrNull(v: any) {
  if (
    v === null ||
    v === undefined ||
    v === ""
  ) {
    return null;
  }

  const n = Number(v);

  return Number.isFinite(n)
    ? n
    : null;
}

function strOrNull(v: any) {
  if (v === null || v === undefined) {
    return null;
  }

  const s = String(v).trim();

  return s.length
    ? s
    : null;
}

function gradeabilityOrNull(
  v: any
): Gradeability | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;

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

async function saveCard(
  req: Request,
  ctx: Ctx
) {
  try {
    const id = await getId(ctx);

    if (!id) {
      return NextResponse.json(
        {
          error: "Invalid card id",
        },
        {
          status: 400,
        }
      );
    }

    const body = await req
      .json()
      .catch(() => ({} as any));

    const existing =
      await prisma.card.findUnique({
        where: {
          id,
        },

        select: {
          id: true,
          productSetId: true,
          player: true,

          productSet: {
            select: {
              productId: true,

              product: {
                select: {
                  sport: true,
                },
              },
            },
          },

          set: {
            select: {
              sport: true,
            },
          },
        },
      });

    if (!existing) {
      return NextResponse.json(
        {
          error: "Card not found",
        },
        {
          status: 404,
        }
      );
    }

    const data: any = {};

    if (hasOwn(body, "cardNumber")) {
      data.cardNumber =
        strOrNull(body.cardNumber) ??
        undefined;
    }

    if (hasOwn(body, "player")) {
      data.player =
        strOrNull(body.player) ??
        undefined;
    }

    if (hasOwn(body, "team")) {
      data.team =
        strOrNull(body.team);
    }

    if (hasOwn(body, "position")) {
      data.position =
        strOrNull(body.position);
    }

    if (hasOwn(body, "subset")) {
      data.subset =
        strOrNull(body.subset);
    }

    if (hasOwn(body, "variant")) {
      data.variant =
        strOrNull(body.variant);
    }

    if (hasOwn(body, "quantityOwned")) {
      data.quantityOwned =
        numOrNull(body.quantityOwned) ??
        undefined;
    }

    if (hasOwn(body, "bookValue")) {
      data.bookValue =
        numOrNull(body.bookValue) ??
        undefined;
    }

    /*
     * Only update images when those fields are
     * explicitly included in the request.
     */
    if (hasOwn(body, "frontImageUrl")) {
      data.frontImageUrl =
        strOrNull(body.frontImageUrl);
    } else if (hasOwn(body, "imageUrl")) {
      data.frontImageUrl =
        strOrNull(body.imageUrl);
    }

    if (hasOwn(body, "backImageUrl")) {
      data.backImageUrl =
        strOrNull(body.backImageUrl);
    }

    if (
      hasOwn(
        body,
        "gradeabilityOverride"
      )
    ) {
      data.gradeabilityOverride =
        gradeabilityOrNull(
          body.gradeabilityOverride
        );
    }

    const updated =
      await prisma.card.update({
        where: {
          id,
        },

        data,

        select: {
          id: true,
          setId: true,
          productSetId: true,
          cardNumber: true,
          player: true,
          team: true,
          position: true,
          subset: true,
          variant: true,
          bookValue: true,
          quantityOwned: true,
          frontImageUrl: true,
          backImageUrl: true,
          gradeabilityOverride: true,
        },
      });

    const sport =
      existing.productSet?.product?.sport?.trim() ||
      existing.set?.sport?.trim() ||
      null;

    await ensurePlayerTierProfile({
      prisma,
      sport,
      player: updated.player,
    });

    /*
     * A book-value change affects the expected
     * value of every pack containing this card.
     */
    if (
      hasOwn(body, "bookValue") &&
      existing.productSet?.productId
    ) {
      await repriceProduct(
        existing.productSet.productId
      );
    }

    return NextResponse.json({
      ok: true,
      card: updated,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          e?.message ??
          "Save failed",
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
  return saveCard(req, ctx);
}

export async function PATCH(
  req: Request,
  ctx: Ctx
) {
  return saveCard(req, ctx);
}

export async function DELETE(
  _req: Request,
  ctx: Ctx
) {
  try {
    const id = await getId(ctx);

    if (!id) {
      return NextResponse.json(
        {
          error: "Invalid card id",
        },
        {
          status: 400,
        }
      );
    }

    const existing =
      await prisma.card.findUnique({
        where: {
          id,
        },

        select: {
          productSet: {
            select: {
              productId: true,
            },
          },
        },
      });

    await prisma.card.delete({
      where: {
        id,
      },
    });

    /*
     * Deleting a card changes its Product Set’s
     * average value and therefore its pack EV.
     */
    if (
      existing?.productSet?.productId
    ) {
      await repriceProduct(
        existing.productSet.productId
      );
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          e?.message ??
          "Delete failed",
      },
      {
        status: 500,
      }
    );
  }
}