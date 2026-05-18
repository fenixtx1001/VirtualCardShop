import { PlayerTier, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

const PRESERVED_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

const BUILT_IN_IGNORE_TOKENS = [
  "rc",
  "roo",
  "rookie",
  "rookie card",
  "as",
  "all star",
  "mvp",
  "cy",
  "auto",
  "autograph",
  "au",
  "fin",
  "in",
  "tp",
];

const TRAILING_REGEX_PATTERNS: RegExp[] = [
  /\bSN\d+\b\.?$/i,
  /\bSN[\s-]?\d+\b\.?$/i,
  /\bPR\d+\b\.?$/i,
  /\bPR[\s-]?\d+\b\.?$/i,
  /\b#?\d+\/\d+\b\.?$/i,
];

type IgnoreTokenCache = {
  tokens: string[];
  expiresAt: number;
};

let ignoreTokenCache: IgnoreTokenCache | null = null;
const IGNORE_TOKEN_CACHE_MS = 60_000;

function collapseWhitespace(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

export function normalizeIgnoreToken(input: string | null | undefined) {
  return collapseWhitespace(String(input ?? ""))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[^a-zA-Z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeWord(input: string | null | undefined) {
  return String(input ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .trim()
    .toLowerCase();
}

function stripTrailingPunctuation(input: string) {
  return input.replace(/[,\-–—:;()/.]+$/g, "").trim();
}

async function getIgnoreTokens(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && ignoreTokenCache && ignoreTokenCache.expiresAt > now) {
    return ignoreTokenCache.tokens;
  }

  const dbRows = await prisma.playerTierIgnoreToken.findMany({
    where: { isEnabled: true },
    select: { normalizedToken: true },
    orderBy: [{ normalizedToken: "asc" }],
  });

  const tokens = Array.from(
    new Set(
      [...BUILT_IN_IGNORE_TOKENS, ...dbRows.map((r) => normalizeIgnoreToken(r.normalizedToken))]
        .map((t) => normalizeIgnoreToken(t))
        .filter(Boolean)
    )
  ).sort((a, b) => b.split(" ").length - a.split(" ").length || b.length - a.length);

  ignoreTokenCache = {
    tokens,
    expiresAt: now + IGNORE_TOKEN_CACHE_MS,
  };

  return tokens;
}

export function clearPlayerTierIgnoreTokenCache() {
  ignoreTokenCache = null;
}

async function stripTrailingIgnoredTokens(input: string) {
  let current = collapseWhitespace(String(input ?? ""));
  if (!current) return "";

  const ignoreTokens = await getIgnoreTokens();

  while (true) {
    let next = stripTrailingPunctuation(current);
    let changed = false;

    for (const pattern of TRAILING_REGEX_PATTERNS) {
      const stripped = stripTrailingPunctuation(next.replace(pattern, ""));
      if (stripped !== next) {
        next = stripped;
        changed = true;
        break;
      }
    }

    if (changed) {
      current = next;
      continue;
    }

    const words = next.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      current = "";
      break;
    }

    const lastWordNorm = normalizeWord(words[words.length - 1]);
    if (PRESERVED_SUFFIXES.has(lastWordNorm)) {
      current = next;
      break;
    }

    let matchedPhraseLength = 0;
    for (const token of ignoreTokens) {
      const tokenWords = token.split(/\s+/).filter(Boolean);
      if (tokenWords.length === 0) continue;
      if (words.length <= tokenWords.length) continue;

      const candidateWords = words.slice(words.length - tokenWords.length).map((w) => normalizeWord(w));
      const matches = tokenWords.every((tw, idx) => candidateWords[idx] === normalizeWord(tw));

      if (matches) {
        matchedPhraseLength = tokenWords.length;
        break;
      }
    }

    if (matchedPhraseLength > 0) {
      current = stripTrailingPunctuation(words.slice(0, words.length - matchedPhraseLength).join(" "));
      continue;
    }

    current = next;
    break;
  }

  return current;
}

export async function cleanCanonicalPlayerName(input: string | null | undefined) {
  const collapsed = collapseWhitespace(String(input ?? ""));
  if (!collapsed) return "";
  return stripTrailingIgnoredTokens(collapsed);
}

export async function normalizePlayerName(input: string | null | undefined) {
  const canonical = await cleanCanonicalPlayerName(input);

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
  prisma: PrismaClient;
  sport: string | null | undefined;
  player: string | null | undefined;
}) {
  const canonicalName = await cleanCanonicalPlayerName(params.player);
  const normalizedName = await normalizePlayerName(canonicalName);
  const sport = params.sport?.trim() || "";

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
  prisma: PrismaClient;
  productSetId: string;
  player: string | null | undefined;
}) {
  const canonicalName = await cleanCanonicalPlayerName(params.player);
  const normalizedName = await normalizePlayerName(canonicalName);

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

  const sport = productSet.product?.sport?.trim() || "";

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
      sport: sport || null,
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
      sport: profile.sport || null,
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
      sport: profile.sport || null,
      tier: profile.tier,
      defaultPrice: null,
      reason: "no-price-for-tier",
    } satisfies DefaultPriceResult;
  }

  return {
    ok: true,
    normalizedName,
    canonicalName: profile.canonicalName,
    sport: profile.sport || null,
    tier: profile.tier,
    defaultPrice,
    reason: "ok",
  } satisfies DefaultPriceResult;
}
