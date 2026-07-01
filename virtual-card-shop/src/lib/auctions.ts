import { RAW_GRADE, calculateGradedValueCents, getEffectiveGradeability } from "@/lib/grading";
import type { Gradeability } from "@prisma/client";

export const AUCTION_DURATION_MS = 24 * 60 * 60 * 1000;
export const SLAB_AUCTION_PREMIUM_BPS = 300; // +3%

export type AuctionHeatTier = "COLD" | "SOFT" | "NORMAL" | "STRONG" | "HOT" | "BIDDING_WAR";

export type AuctionOutcomeTier = {
  key: AuctionHeatTier;
  label: string;
  odds: number;
  minBps: number;
  maxBps: number;
};

export type AuctionBidIntentInput = {
  dummyBidderName: string;
  maxBidCents: number;
  dueAt: Date;
};

export const AUCTION_OUTCOME_TABLE: AuctionOutcomeTier[] = [
  { key: "COLD", label: "Cold", odds: 5, minBps: 6000, maxBps: 7000 },
  { key: "SOFT", label: "Soft", odds: 20, minBps: 7000, maxBps: 8000 },
  { key: "NORMAL", label: "Normal", odds: 40, minBps: 8000, maxBps: 9000 },
  { key: "STRONG", label: "Strong", odds: 25, minBps: 9000, maxBps: 10000 },
  { key: "HOT", label: "Hot", odds: 8, minBps: 10000, maxBps: 11500 },
  { key: "BIDDING_WAR", label: "Bidding War", odds: 2, minBps: 11500, maxBps: 13500 },
];

export const DUMMY_BIDDER_NAMES = [
  "WaxPackWendy",
  "GemMintGreg",
  "VintageVince",
  "CardboardCarl",
  "ProspectPete",
  "SlabHunterSam",
  "SetBuilderSue",
  "RipCityRyan",
  "ChromeKingChris",
  "BinderBossBen",
  "FoilFanFrank",
  "RookieRadarRob",
];

function seededNumber(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function formatAuctionTierLabel(tier: AuctionHeatTier): string {
  switch (tier) {
    case "COLD":
      return "Cold";
    case "SOFT":
      return "Soft";
    case "NORMAL":
      return "Normal";
    case "STRONG":
      return "Strong";
    case "HOT":
      return "Hot";
    case "BIDDING_WAR":
      return "Bidding War";
  }
}

export function getAuctionTierForPercent(percentOfValueBps: number): AuctionHeatTier {
  if (percentOfValueBps < 7000) return "COLD";
  if (percentOfValueBps < 8000) return "SOFT";
  if (percentOfValueBps < 9000) return "NORMAL";
  if (percentOfValueBps < 10000) return "STRONG";
  if (percentOfValueBps < 11500) return "HOT";
  return "BIDDING_WAR";
}

export function getAuctionTierClassName(tier: AuctionHeatTier): string {
  switch (tier) {
    case "COLD":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "SOFT":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "NORMAL":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "STRONG":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "HOT":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "BIDDING_WAR":
      return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
  }
}

export function getPercentOfValueBps(input: {
  amountCents: number;
  valueBasisCents: number;
}): number {
  if (!Number.isFinite(input.amountCents) || !Number.isFinite(input.valueBasisCents)) return 0;
  if (input.amountCents <= 0 || input.valueBasisCents <= 0) return 0;
  return Math.round((input.amountCents * 10000) / input.valueBasisCents);
}

export function applyBps(amountCents: number, bps: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  return Math.max(1, Math.round((amountCents * bps) / 10000));
}

export function calculateAuctionValueBasisCents(input: {
  rawBookValueCents: number;
  grade: number;
  cardOverride?: Gradeability | null;
  productSetDefault?: Gradeability | null;
}): {
  valueBasisCents: number;
  slabPremiumBps: number;
} {
  const rawBookValueCents = Math.max(0, Math.round(input.rawBookValueCents || 0));

  if (input.grade === RAW_GRADE) {
    return {
      valueBasisCents: rawBookValueCents,
      slabPremiumBps: 0,
    };
  }

  const gradeability = getEffectiveGradeability({
    cardOverride: input.cardOverride ?? null,
    productSetDefault: input.productSetDefault ?? null,
  });

  const gradedValueCents = calculateGradedValueCents({
    rawBookValueCents,
    gradeability,
    grade: input.grade,
  });

  const premiumCents = applyBps(gradedValueCents, SLAB_AUCTION_PREMIUM_BPS);

  return {
    valueBasisCents: gradedValueCents + premiumCents,
    slabPremiumBps: SLAB_AUCTION_PREMIUM_BPS,
  };
}

export function rollAuctionOutcomeBps(randomValue = Math.random()): {
  tier: AuctionOutcomeTier;
  bps: number;
} {
  const roll = Math.max(0, Math.min(0.999999999, randomValue)) * 100;

  let cumulative = 0;
  let selected = AUCTION_OUTCOME_TABLE[AUCTION_OUTCOME_TABLE.length - 1];

  for (const row of AUCTION_OUTCOME_TABLE) {
    cumulative += row.odds;
    if (roll < cumulative) {
      selected = row;
      break;
    }
  }

  const spread = selected.maxBps - selected.minBps;
  const bps = selected.minBps + Math.round(Math.random() * spread);

  return {
    tier: selected,
    bps,
  };
}

export function calculateHiddenDummyMaxBidCents(valueBasisCents: number): {
  hiddenDummyMaxBidCents: number;
  outcomeTier: AuctionOutcomeTier;
  outcomeBps: number;
} {
  const outcome = rollAuctionOutcomeBps();

  return {
    hiddenDummyMaxBidCents: Math.max(1, applyBps(valueBasisCents, outcome.bps)),
    outcomeTier: outcome.tier,
    outcomeBps: outcome.bps,
  };
}

export function calculateStartingBidCents(valueBasisCents: number): number {
  if (!Number.isFinite(valueBasisCents) || valueBasisCents <= 0) return 1;

  const halfValue = Math.round(valueBasisCents * 0.5);
  return Math.max(1, halfValue);
}

export function calculateBidIncrementCents(currentBidCents: number): number {
  const current = Math.max(0, Math.round(currentBidCents || 0));

  if (current < 25) return 1;
  if (current < 100) return 5;
  if (current < 500) return 10;
  if (current < 2000) return 25;
  if (current < 5000) return 50;
  if (current < 10000) return 100;

  return Math.max(100, Math.round(current * 0.02));
}

export function calculateMinimumNextBidCents(currentBidCents: number, startingBidCents: number): number {
  const current = Math.max(0, Math.round(currentBidCents || 0));
  const starting = Math.max(1, Math.round(startingBidCents || 1));

  if (current <= 0) return starting;

  return current + calculateBidIncrementCents(current);
}

export function pickDummyBidderName(seed?: number): string {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return DUMMY_BIDDER_NAMES[Math.abs(Math.round(seed)) % DUMMY_BIDDER_NAMES.length];
  }

  return DUMMY_BIDDER_NAMES[Math.floor(Math.random() * DUMMY_BIDDER_NAMES.length)];
}

function getIntentCount(input: {
  valueBasisCents: number;
  startingBidCents: number;
  hiddenDummyMaxBidCents: number;
  tierKey?: AuctionHeatTier;
}) {
  const gap = Math.max(0, input.hiddenDummyMaxBidCents - input.startingBidCents);
  const percentTarget = getPercentOfValueBps({
    amountCents: input.hiddenDummyMaxBidCents,
    valueBasisCents: input.valueBasisCents,
  });

  if (gap <= 0) return 1;
  if (input.valueBasisCents <= 100) return percentTarget >= 10000 ? 3 : 2;
  if (input.valueBasisCents <= 500) return percentTarget >= 10000 ? 5 : 3;
  if (input.valueBasisCents <= 2500) return percentTarget >= 10000 ? 8 : 5;
  if (input.valueBasisCents <= 10000) return percentTarget >= 10000 ? 12 : 7;

  switch (input.tierKey) {
    case "BIDDING_WAR":
      return 28;
    case "HOT":
      return 20;
    case "STRONG":
      return 15;
    case "NORMAL":
      return 11;
    case "SOFT":
      return 8;
    case "COLD":
    default:
      return 6;
  }
}

function getIntentTimePct(input: {
  index: number;
  count: number;
  auctionIdSeed: number;
}) {
  const progress = input.count <= 1 ? 0.94 : input.index / (input.count - 1);
  const backloaded = Math.pow(progress, 1.65);
  const basePct = 8 + backloaded * 90;

  const jitter = (seededNumber(input.auctionIdSeed * 73 + input.index * 19) - 0.5) * 10;
  return clamp(basePct + jitter, 3, 98.8);
}

function getIntentMaxCents(input: {
  index: number;
  count: number;
  startingBidCents: number;
  hiddenDummyMaxBidCents: number;
  auctionIdSeed: number;
}) {
  const start = Math.max(1, input.startingBidCents);
  const max = Math.max(start, input.hiddenDummyMaxBidCents);

  if (input.count <= 1 || input.index === input.count - 1) return max;

  if (input.index === input.count - 2) {
    const supportBid = max - calculateBidIncrementCents(max);
    return Math.max(start, Math.min(max - 1, supportBid));
  }

  const progress = input.index / (input.count - 1);
  const curved = Math.pow(progress, 1.15);
  const jitter = (seededNumber(input.auctionIdSeed * 101 + input.index * 31) - 0.5) * 0.06;
  const adjusted = clamp(curved + jitter, 0.04, 0.92);

  return Math.max(start, Math.min(max - 1, start + Math.round((max - start) * adjusted)));
}

export function generateAuctionBidIntents(input: {
  auctionIdSeed: number;
  createdAt: Date;
  endsAt: Date;
  valueBasisCents: number;
  startingBidCents: number;
  hiddenDummyMaxBidCents: number;
  outcomeTierKey?: AuctionHeatTier;
}): AuctionBidIntentInput[] {
  const count = getIntentCount({
    valueBasisCents: input.valueBasisCents,
    startingBidCents: input.startingBidCents,
    hiddenDummyMaxBidCents: input.hiddenDummyMaxBidCents,
    tierKey: input.outcomeTierKey,
  });

  const durationMs = Math.max(1, input.endsAt.getTime() - input.createdAt.getTime());

  const intents = Array.from({ length: count }, (_, index) => {
    const timePct = getIntentTimePct({
      index,
      count,
      auctionIdSeed: input.auctionIdSeed,
    });

    const dueAt = new Date(input.createdAt.getTime() + Math.round(durationMs * (timePct / 100)));

    return {
      dummyBidderName: pickDummyBidderName(input.auctionIdSeed + index),
      maxBidCents: getIntentMaxCents({
        index,
        count,
        startingBidCents: input.startingBidCents,
        hiddenDummyMaxBidCents: input.hiddenDummyMaxBidCents,
        auctionIdSeed: input.auctionIdSeed,
      }),
      dueAt,
    };
  });

  const deduped = intents
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.maxBidCents - b.maxBidCents)
    .map((intent, index, rows) => {
      const previous = rows[index - 1];
      if (!previous) return intent;

      if (intent.dueAt.getTime() <= previous.dueAt.getTime()) {
        return {
          ...intent,
          dueAt: new Date(previous.dueAt.getTime() + 60_000),
        };
      }

      return intent;
    });

  return deduped;
}

export function formatMoneyCents(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(safe / 100);
}

export function formatPercentBps(bps: number): string {
  const safe = Number.isFinite(bps) ? bps : 0;
  return `${(safe / 100).toFixed(safe % 100 === 0 ? 0 : 1)}%`;
}