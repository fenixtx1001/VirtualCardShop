import { PlayerTier, PrismaClient } from "@prisma/client";

type ProductSetWithDefaults = {
  commonPrice: number | null;
  semiStarPrice: number | null;
  unlistedStarPrice: number | null;
  star1Price: number | null;
  star2Price: number | null;
  star3Price: number | null;
};

export type DefaultPriceResult = {
  ok: boolean;
  normalizedName: string;
  canonicalName: string;
  sport: string | null;
  tier: PlayerTier | null;
  defaultPrice: number | null;
  reason:
    | "ok"
    | "no-player"
    | "no-product-set"
    | "no-tier-profile"
    | "unassigned-tier"
    | "no-price-for-tier";
};

const TRAILING_PLAYER_DESIGNATION_PATTERNS: RegExp[] = [
  /\bRC\b\.?$/i,
  /\bROO\b\.?$/i,
  /\bROOKIE\b\.?$/i,
  /\bROOKIE[\s-]?CARD\b\.?$/i,
  /\bAS\b\.?$/i,
  /\bALL[\s-]?STAR\b\.?$/i,
  /\bMVP\b\.?$/i,
  /\bCY\b\.?$/i,
  /\bSN\d+\b\.?$/i,
  /\bSN[\s-]?\d+\b\.?$/i,
  /\bAUTO\b\.?$/i,
  /\bAUTOGRAPH\b\.?$/i,
  /\bAU\b\.?$/i,
];

function stripTrailingPlayerDesignations(input: string) {
  let s = input.trim();

  while (true) {
    const next = s
      .replace(/[,\-–—:;()/.]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    let changed = false;

    for (const pattern of TRAILING_PLAYER_DESIGNATION_PATTERNS) {
      const stripped = next.replace(pattern, "").trim();
      if (stripped !== next) {
        s = stripped;
        changed = true;
        break;
      }
    }

    if (!changed) {
      s = next;
      break;
    }
  }

  return s;
}

export function cleanCanonicalPlayerName(input: string | null | undefined) {
  const collapsed = String(input ?? "").replace(/\s+/g, " ").trim();
  return stripTrailingPlayerDesignations(collapsed);
}

export function normalizePlayerName(input: string | null | undefined) {
  const canonical = cleanCanonicalPlayerName(input);

  return canonical
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function tierLabel(tier: PlayerTier | null | undefined) {
  switch (tier) {
    case "COMMON":
      return "Common";
    case "SEMI_STAR":
      return "Semi-Star";
    case "UNLISTED_STAR":
      return "Unlisted Star";
    case "STAR_1":
      return "Star Tier 1";
    case "STAR_2":
      return "Star Tier 2";
    case "STAR_3":
      return "Star Tier 3";
    default:
      return "Unassigned";
  }
}

export function defaultPriceForTier(
  productSet: ProductSetWithDefaults | null | undefined,
  tier: PlayerTier | null | undefined
) {
  if (!productSet || !tier) return null;

  switch (tier) {
    case "COMMON":
      return productSet.commonPrice ?? null;
    case "SEMI_STAR":
      return productSet.semiStarPrice ?? null;
    case "UNLISTED_STAR":
      return productSet.unlistedStarPrice ?? null;
    case "STAR_1":
      return productSet.star1Price ?? null;
    case "STAR_2":
      return productSet.star2Price ?? null;
    case "STAR_3":
      return productSet.star3Price ?? null;
    default:
      return null;
  }
}

export async function ensurePlayerTierProfile(params: {
  prisma: PrismaClient | PrismaClient["$extends"];
  sport: string | null | undefined;
  player: string | null | undefined;
}) {
  const canonicalName = cleanCanonicalPlayerName(params.player);
  const normalizedName = normalizePlayerName(canonicalName);
  const sport = params.sport?.trim() || null;

  if (!canonicalName || !normalizedName) {
    return null;
  }

  return params.prisma.playerTierProfile.upsert({
    where: {
      sport_normalizedName: {
        sport,
        normalizedName,
      },
    },
    create: {
      sport,
      canonicalName,
      normalizedName,
      tier: null,
    },
    update: {
      canonicalName,
      normalizedName,
    },
  });
}

export async function getDefaultPriceForPlayer(params: {
  prisma: PrismaClient | PrismaClient["$extends"];
  productSetId: string;
  player: string | null | undefined;
}) {
  const canonicalName = cleanCanonicalPlayerName(params.player);
  const normalizedName = normalizePlayerName(canonicalName);

  if (!canonicalName || !normalizedName) {
    return {
      ok: false,
      normalizedName,
      canonicalName,
      sport: null,
      tier: null,
      defaultPrice: null,
      reason: "no-player",
    } satisfies DefaultPriceResult;
  }

  const productSet = await params.prisma.productSet.findUnique({
    where: { id: params.productSetId },
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
    return {
      ok: false,
      normalizedName,
      canonicalName,
      sport: null,
      tier: null,
      defaultPrice: null,
      reason: "no-product-set",
    } satisfies DefaultPriceResult;
  }

  const sport = productSet.product?.sport?.trim() || null;

  const profile = await params.prisma.playerTierProfile.findUnique({
    where: {
      sport_normalizedName: {
        sport,
        normalizedName,
      },
    },
    select: {
      canonicalName: true,
      normalizedName: true,
      sport: true,
      tier: true,
    },
  });

  if (!profile) {
    return {
      ok: false,
      normalizedName,
      canonicalName,
      sport,
      tier: null,
      defaultPrice: null,
      reason: "no-tier-profile",
    } satisfies DefaultPriceResult;
  }

  if (!profile.tier) {
    return {
      ok: false,
      normalizedName,
      canonicalName: profile.canonicalName,
      sport,
      tier: null,
      defaultPrice: null,
      reason: "unassigned-tier",
    } satisfies DefaultPriceResult;
  }

  const defaultPrice = defaultPriceForTier(productSet, profile.tier);
  if (defaultPrice === null || !Number.isFinite(defaultPrice)) {
    return {
      ok: false,
      normalizedName,
      canonicalName: profile.canonicalName,
      sport,
      tier: profile.tier,
      defaultPrice: null,
      reason: "no-price-for-tier",
    } satisfies DefaultPriceResult;
  }

  return {
    ok: true,
    normalizedName,
    canonicalName: profile.canonicalName,
    sport,
    tier: profile.tier,
    defaultPrice,
    reason: "ok",
  } satisfies DefaultPriceResult;
}