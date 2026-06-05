// src/lib/shop-offers.ts
import type { Gradeability } from "@prisma/client";
import {
  GRADED_SHOP_OFFER_BONUS_BPS,
  RAW_GRADE,
  calculateGradedValueCents,
  getEffectiveGradeability,
} from "@/lib/grading";

/**
 * Balanced & fun offer distribution (more mid offers, fewer high ones).
 * Offer stored as basis points (bps): 5000 = 50.00%, 9500 = 95.00%
 *
 * Buckets (sum = 100):
 * - 50–55% → 10%
 * - 55–60% → 15%
 * - 60–65% → 20%
 * - 65–70% → 18%
 * - 70–75% → 14%
 * - 75–80% → 10%
 * - 80–85% → 7%
 * - 85–90% → 4%
 * - 90–95% → 2%
 */

type Bucket = { minBps: number; maxBps: number; weight: number };

const BUCKETS: Bucket[] = [
  { minBps: 5000, maxBps: 5500, weight: 10 },
  { minBps: 5500, maxBps: 6000, weight: 15 },
  { minBps: 6000, maxBps: 6500, weight: 20 },
  { minBps: 6500, maxBps: 7000, weight: 18 },
  { minBps: 7000, maxBps: 7500, weight: 14 },
  { minBps: 7500, maxBps: 8000, weight: 10 },
  { minBps: 8000, maxBps: 8500, weight: 7 },
  { minBps: 8500, maxBps: 9000, weight: 4 },
  { minBps: 9000, maxBps: 9500, weight: 2 },
];

function randInt(minInclusive: number, maxExclusive: number) {
  return Math.floor(Math.random() * (maxExclusive - minInclusive)) + minInclusive;
}

export function generateOfferBps(): number {
  const total = BUCKETS.reduce((s, b) => s + b.weight, 0);
  let r = Math.random() * total;

  for (const b of BUCKETS) {
    if (r < b.weight) return randInt(b.minBps, b.maxBps);
    r -= b.weight;
  }

  return 6000;
}

export function addHours(d: Date, hours: number) {
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}

export function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function bookValueToPerCardCents(bookValue: unknown): number {
  const v =
    typeof bookValue === "number" && Number.isFinite(bookValue)
      ? bookValue
      : Number(bookValue ?? 0);

  if (!Number.isFinite(v) || v <= 0) return 0;

  return Math.max(0, Math.round(v * 100));
}

export function calcSellTotalCents(perCardCents: number, qty: number, offerBps: number) {
  const q = Math.max(0, Math.floor(qty));
  const p = Math.max(0, Math.floor(perCardCents));
  const b = Math.max(0, Math.floor(offerBps));

  return Math.round((p * q * b) / 10000);
}

export function isVcsGrade(grade: number) {
  return Number.isInteger(grade) && grade >= 6 && grade <= 10;
}

export function labelShopGrade(grade: number) {
  if (grade === RAW_GRADE) return "Raw";
  if (isVcsGrade(grade)) return `VCS ${grade}`;
  return "Unknown";
}

export function calcShopPerCardValueCents(input: {
  rawBookValueCents: number;
  grade: number;
  gradeability: Gradeability;
}) {
  const rawBookValueCents = Math.max(0, Math.floor(input.rawBookValueCents));

  if (input.grade === RAW_GRADE) {
    return rawBookValueCents;
  }

  if (!isVcsGrade(input.grade)) {
    return rawBookValueCents;
  }

  return calculateGradedValueCents({
    rawBookValueCents,
    gradeability: input.gradeability,
    grade: input.grade,
  });
}

export function calcShopOfferBpsForGrade(input: {
  baseOfferBps: number;
  grade: number;
}) {
  const baseOfferBps = Math.max(0, Math.floor(input.baseOfferBps));

  if (input.grade === RAW_GRADE) {
    return baseOfferBps;
  }

  if (!isVcsGrade(input.grade)) {
    return baseOfferBps;
  }

  return baseOfferBps + GRADED_SHOP_OFFER_BONUS_BPS;
}

export function calcShopSellQuote(input: {
  rawBookValueCents: number;
  quantity: number;
  baseOfferBps: number;
  grade: number;
  gradeability: Gradeability;
}) {
  const quantity = Math.max(0, Math.floor(input.quantity));

  const perCardValueCents = calcShopPerCardValueCents({
    rawBookValueCents: input.rawBookValueCents,
    grade: input.grade,
    gradeability: input.gradeability,
  });

  const effectiveOfferBps = calcShopOfferBpsForGrade({
    baseOfferBps: input.baseOfferBps,
    grade: input.grade,
  });

  return {
    grade: input.grade,
    gradeLabel: labelShopGrade(input.grade),
    quantity,
    perCardValueCents,
    baseOfferBps: input.baseOfferBps,
    effectiveOfferBps,
    totalCents: calcSellTotalCents(perCardValueCents, quantity, effectiveOfferBps),
  };
}

export function getShopGradeability(input: {
  cardOverride?: Gradeability | null;
  productSetDefault?: Gradeability | null;
}) {
  return getEffectiveGradeability({
    cardOverride: input.cardOverride,
    productSetDefault: input.productSetDefault,
  });
}