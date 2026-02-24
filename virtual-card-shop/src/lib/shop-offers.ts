// src/lib/shop-offers.ts

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
  const v = typeof bookValue === "number" && Number.isFinite(bookValue) ? bookValue : 0;
  return Math.max(0, Math.round(v * 100));
}

export function calcSellTotalCents(perCardCents: number, qty: number, offerBps: number) {
  const q = Math.max(0, Math.floor(qty));
  const p = Math.max(0, Math.floor(perCardCents));
  const b = Math.max(0, Math.floor(offerBps));
  return Math.round((p * q * b) / 10000);
}
