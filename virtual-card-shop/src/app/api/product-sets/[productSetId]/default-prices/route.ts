export const revalidate = 300;
import { NextResponse } from "next/server";
import { PlayerTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  cleanCanonicalPlayerName,
  defaultPriceForTier,
  normalizePlayerName,
  tierLabel,
} from "@/lib/player-tiers";

type RouteParams = {
  productSetId?: string;
  setId?: string;
};

type Ctx =
  | { params: RouteParams }
  | { params: Promise<RouteParams> };

type DefaultPriceReason =
  | "ok"
  | "no-player"
  | "no-product-set"
  | "no-tier-profile"
  | "unassigned-tier"
  | "no-price-for-tier";

type DefaultPricePayload = {
  ok: boolean;
  normalizedName: string;
  canonicalName: string;
  sport: string | null;
  tier: PlayerTier | null;
  defaultPrice: number | null;
  reason: DefaultPriceReason;
  tierLabel: string;
};

async function getProductSetId(ctx: Ctx) {
  const params = await Promise.resolve(ctx.params);
  const raw = params?.productSetId ?? params?.setId;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

function productSetDefaultPrices(productSet: {
  commonPrice: number | null;
  semiStarPrice: number | null;
  unlistedStarPrice: number | null;
  star1Price: number | null;
  star2Price: number | null;
  star3Price: number | null;
}) {
  return {
    commonPrice: productSet.commonPrice,
    semiStarPrice: productSet.semiStarPrice,
    unlistedStarPrice: productSet.unlistedStarPrice,
    star1Price: productSet.star1Price,
    star2Price: productSet.star2Price,
    star3Price: productSet.star3Price,
  };
}

function withTierLabel(payload: Omit<DefaultPricePayload, "tierLabel">): DefaultPricePayload {
  return {
    ...payload,
    tierLabel: tierLabel(payload.tier),
  };
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const productSetId = await getProductSetId(ctx);

    if (!productSetId) {
      return NextResponse.json(
        { ok: false, error: "Missing productSetId" },
        { status: 400 }
      );
    }

    const productSet = await prisma.productSet.findUnique({
      where: { id: productSetId },
      select: {
        id: true,
        commonPrice: true,
        semiStarPrice: true,
        unlistedStarPrice: true,
        star1Price: true,
        star2Price: true,
        star3Price: true,
        product: {
          select: {
            sport: true,
          },
        },
      },
    });

    if (!productSet) {
      return NextResponse.json(
        { ok: false, error: "Product set not found" },
        { status: 404 }
      );
    }

    const sport = productSet.product?.sport?.trim() || "";
    const defaultPrices = productSetDefaultPrices(productSet);

    const cards = await prisma.card.findMany({
      where: { productSetId },
      select: {
        id: true,
        player: true,
      },
      orderBy: [{ cardNumber: "asc" }, { id: "asc" }],
    });

    const cardNameById = new Map<number, { canonicalName: string; normalizedName: string }>();
    const uniqueNormalizedNames = new Set<string>();

    for (const card of cards) {
      const canonicalName = await cleanCanonicalPlayerName(card.player);
      const normalizedName = await normalizePlayerName(canonicalName);

      cardNameById.set(card.id, { canonicalName, normalizedName });

      if (canonicalName && normalizedName) {
        uniqueNormalizedNames.add(normalizedName);
      }
    }

    const profiles = uniqueNormalizedNames.size
      ? await prisma.playerTierProfile.findMany({
          where: {
            sport,
            normalizedName: {
              in: Array.from(uniqueNormalizedNames),
            },
          },
          select: {
            canonicalName: true,
            normalizedName: true,
            sport: true,
            tier: true,
          },
        })
      : [];

    const profileByNormalizedName = new Map(
      profiles.map((profile) => [profile.normalizedName, profile])
    );

    const resultByNormalizedName = new Map<string, DefaultPricePayload>();

    for (const normalizedName of uniqueNormalizedNames) {
      const firstCardName = Array.from(cardNameById.values()).find(
        (name) => name.normalizedName === normalizedName
      );
      const canonicalName = firstCardName?.canonicalName ?? "";
      const profile = profileByNormalizedName.get(normalizedName);

      if (!profile) {
        resultByNormalizedName.set(
          normalizedName,
          withTierLabel({
            ok: false,
            normalizedName,
            canonicalName,
            sport: sport || null,
            tier: null,
            defaultPrice: null,
            reason: "no-tier-profile",
          })
        );
        continue;
      }

      if (!profile.tier) {
        resultByNormalizedName.set(
          normalizedName,
          withTierLabel({
            ok: false,
            normalizedName,
            canonicalName: profile.canonicalName,
            sport: profile.sport || null,
            tier: null,
            defaultPrice: null,
            reason: "unassigned-tier",
          })
        );
        continue;
      }

      const defaultPrice = defaultPriceForTier(defaultPrices, profile.tier);

      if (defaultPrice === null || !Number.isFinite(defaultPrice)) {
        resultByNormalizedName.set(
          normalizedName,
          withTierLabel({
            ok: false,
            normalizedName,
            canonicalName: profile.canonicalName,
            sport: profile.sport || null,
            tier: profile.tier,
            defaultPrice: null,
            reason: "no-price-for-tier",
          })
        );
        continue;
      }

      resultByNormalizedName.set(
        normalizedName,
        withTierLabel({
          ok: true,
          normalizedName,
          canonicalName: profile.canonicalName,
          sport: profile.sport || null,
          tier: profile.tier,
          defaultPrice,
          reason: "ok",
        })
      );
    }

    const results: Record<number, DefaultPricePayload> = {};

    for (const card of cards) {
      const name = cardNameById.get(card.id);

      if (!name?.canonicalName || !name.normalizedName) {
        results[card.id] = withTierLabel({
          ok: false,
          normalizedName: name?.normalizedName ?? "",
          canonicalName: name?.canonicalName ?? "",
          sport: null,
          tier: null,
          defaultPrice: null,
          reason: "no-player",
        });
        continue;
      }

      results[card.id] = resultByNormalizedName.get(name.normalizedName) ?? withTierLabel({
        ok: false,
        normalizedName: name.normalizedName,
        canonicalName: name.canonicalName,
        sport: sport || null,
        tier: null,
        defaultPrice: null,
        reason: "no-tier-profile",
      });
    }

    return NextResponse.json({
      ok: true,
      productSetId,
      count: cards.length,
      uniquePlayersChecked: uniqueNormalizedNames.size,
      results,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load default prices";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
