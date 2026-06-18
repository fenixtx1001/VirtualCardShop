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