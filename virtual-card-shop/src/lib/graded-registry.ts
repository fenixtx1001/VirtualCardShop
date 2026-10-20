import { prisma } from "@/lib/prisma";

// Only the highest currently owned graded copy of each card scores.
// Raw prices are deliberately read live so corrected book values recalculate ratings.
export const REGISTRY_GRADE_POINTS: Record<number, number> = {
  6: 0, 7: 1, 8: 10, 9: 30, 10: 100,
};

type CardRow = {
  id: number;
  cardNumber: string;
  player: string;
  team: string | null;
  bookValue: number;
  frontImageUrl: string | null;
  backImageUrl: string | null;
  productSetId: string | null;
};
type OwnRow = {
  userId: string;
  cardId: number;
  grade: number;
  quantity: number;
  gradedAt: Date | null;
};
export type RegistryCard = {
  cardId: number;
  cardNumber: string;
  player: string;
  team: string | null;
  frontImageUrl: string | null;
  backImageUrl: string | null;
  rawValue: number;
  grade: number;
  gradedAt: string | null;
  weight: number;
  basePoints: number;
  points: number;
};
export type RegistryStanding = {
  userId: string;
  score: number;
  rating: number;
  qualified: number;
  gems: number;
  owned: number;
  name?: string;
};
function median(values: number[]): number {
  if (!values.length) return 0.01;
  const sorted = values.map(v => Math.max(0, v)).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.max(0.01, sorted.length % 2
    ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}
function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
export function registryValueWeight(value: number, setMedian: number) {
  return Math.min(8, 1 + 2 * Math.log10(Math.max(1, Math.max(0, value) / Math.max(0.01, setMedian))));
}
export function registrySetMultiplier(setValue: number) {
  return clamp(Math.sqrt(Math.max(0, setValue) / 100), 0.35, 4);
}
function compute(cards: CardRow[], ownership: OwnRow[]) {
  const medianValue = median(cards.map(c => c.bookValue));
  const setValue = cards.reduce((sum, c) => sum + Math.max(0, c.bookValue), 0);
  const multiplier = registrySetMultiplier(setValue);
  const maximumBase = cards.reduce(
    (sum, c) => sum + 100 * registryValueWeight(c.bookValue, medianValue), 0);
  const cardLookup = new Map(cards.map(c => [c.id, c]));
  const byUser = new Map<string, Map<number, OwnRow>>();
  for (const own of ownership) {
    if (own.quantity <= 0 || own.grade < 6 || own.grade > 10 || !cardLookup.has(own.cardId)) continue;
    if (!byUser.has(own.userId)) byUser.set(own.userId, new Map());
    const map = byUser.get(own.userId)!;
    const previous = map.get(own.cardId);
    if (!previous || own.grade > previous.grade) map.set(own.cardId, own);
  }
  const standings: RegistryStanding[] = [];
  const cardsByUser = new Map<string, RegistryCard[]>();
  for (const [userId, owned] of byUser) {
    let base = 0, qualified = 0, gems = 0;
    const result: RegistryCard[] = [];
    for (const card of cards) {
      const own = owned.get(card.id);
      const grade = own?.grade ?? 0;
      const weight = registryValueWeight(card.bookValue, medianValue);
      const basePoints = (REGISTRY_GRADE_POINTS[grade] ?? 0) * weight;
      base += basePoints;
      if (grade >= 8) qualified++;
      if (grade === 10) gems++;
      result.push({
        cardId: card.id, cardNumber: card.cardNumber, player: card.player,
        team: card.team, frontImageUrl: card.frontImageUrl,
        backImageUrl: card.backImageUrl,
        rawValue: card.bookValue, grade,
        gradedAt: own?.gradedAt?.toISOString() ?? null,
        weight: Number(weight.toFixed(4)),
        basePoints: Number(basePoints.toFixed(2)),
        points: Math.round(basePoints * multiplier),
      });
    }
    const rating = maximumBase > 0 ? 100 * base / maximumBase : 0;
    standings.push({
      userId, score: Math.round(base * multiplier),
      rating: Number(rating.toFixed(2)), qualified, gems, owned: owned.size,
    });
    cardsByUser.set(userId, result);
  }
  standings.sort((a, b) => b.score - a.score || b.qualified - a.qualified || a.userId.localeCompare(b.userId));
  return { standings, cardsByUser, maximum: Math.round(maximumBase * multiplier),
    setValue, multiplier, medianValue, totalCards: cards.length };
}

export async function getSetRegistry(productSetId: string, viewerId: string, targetUserId: string) {
  const set = await prisma.productSet.findUnique({
    where: { id: productSetId },
    select: { id: true, name: true, productId: true, isBase: true,
      product: { select: { year: true, brand: true, sport: true } },
    },
  });
  if (!set) return null;
  const [cards, owned, prestige, productSets] = await Promise.all([
    prisma.card.findMany({
      where: { productSetId },
      select: { id: true, cardNumber: true, player: true, team: true,
        bookValue: true, frontImageUrl: true, backImageUrl: true, productSetId: true },
    }),
    prisma.cardOwnership.findMany({
      where: { quantity: { gt: 0 }, grade: { gte: 6 }, card: { productSetId } },
      select: { userId: true, cardId: true, grade: true, quantity: true, gradedAt: true },
    }),
    viewerId === targetUserId ? prisma.productSetPrestige.findUnique({
      where: { userId_productSetId: { userId: viewerId, productSetId } },
      select: { gradingCreditBalanceCents: true, timesCompleted: true },
    }) : Promise.resolve(null),
    prisma.productSet.findMany({
      where: { productId: set.productId },
      select: { id: true, name: true, isBase: true, isInsert: true },
      orderBy: [{ isBase: "desc" }, { name: "asc" }],
    }),
  ]);
  const calc = compute(cards, owned);
  const collectors = calc.standings.length ? await prisma.user.findMany({
    where: { id: { in: calc.standings.map(s => s.userId) } },
    select: { id: true, name: true, email: true },
  }) : [];
  const nameById = new Map(collectors.map(user => [user.id,
    user.name?.trim() || user.email?.split("@")[0] || "Collector"]));
  for (const score of calc.standings) score.name = nameById.get(score.userId) || "Collector";
  const standing = calc.standings.find(s => s.userId === targetUserId)
    ?? { userId: targetUserId, score: 0, rating: 0, qualified: 0, gems: 0, owned: 0 };
  const empty: RegistryCard[] = cards.map(card => ({
    cardId: card.id, cardNumber: card.cardNumber, player: card.player,
    team: card.team, frontImageUrl: card.frontImageUrl, backImageUrl: card.backImageUrl,
    rawValue: card.bookValue, grade: 0, gradedAt: null,
    weight: registryValueWeight(card.bookValue, calc.medianValue),
    basePoints: 0, points: 0,
  }));
  return {
    productSet: set,
    productSets,
    ...calc,
    cards: calc.cardsByUser.get(targetUserId) ?? empty,
    standing, rank: calc.standings.findIndex(s => s.userId === targetUserId) + 1 || null,
    isMyRegistry: viewerId === targetUserId,
    gradingCreditBalanceCents: prestige?.gradingCreditBalanceCents ?? 0,
    timesCompleted: prestige?.timesCompleted ?? 0,
  };
}

export async function getRegistryCommunity() {
  const ownership = await prisma.cardOwnership.findMany({
    where: { quantity: { gt: 0 }, grade: { gte: 6 }, card: { productSetId: { not: null } } },
    select: { userId: true, cardId: true, grade: true, quantity: true, gradedAt: true,
      card: { select: { productSetId: true } } },
  });
  const setIds = [...new Set(ownership.map(o => o.card.productSetId).filter((id): id is string => Boolean(id)))];
  if (!setIds.length) return [];
  const [cards, setMeta] = await Promise.all([prisma.card.findMany({
    where: { productSetId: { in: setIds } },
    select: { id: true, cardNumber: true, player: true, team: true,
      bookValue: true, frontImageUrl: true, backImageUrl: true, productSetId: true },
  }), prisma.productSet.findMany({
    where: { id: { in: setIds } },
    select: { id: true, name: true, product: { select: { year: true, brand: true } } },
  })]);
  const metaById = new Map(setMeta.map(s => [s.id, [s.product.year, s.product.brand, s.name].filter(Boolean).join(" · ")]));
  const groupedCards = new Map<string, CardRow[]>();
  for (const c of cards) {
    if (!c.productSetId) continue;
    const rows = groupedCards.get(c.productSetId) ?? [];
    rows.push(c);
    groupedCards.set(c.productSetId, rows);
  }
  const groupedOwnership = new Map<string, OwnRow[]>();
  for (const o of ownership) {
    const id = o.card.productSetId;
    if (!id) continue;
    const rows = groupedOwnership.get(id) ?? [];
    rows.push(o);
    groupedOwnership.set(id, rows);
  }
  const totals = new Map<string, {
    userId: string; totalPoints: number; activeRegistries: number;
    gem10s: number; qualified: number;
    topSets: Array<{ productSetId: string; name: string; points: number; rating: number }>;
  }>();
  for (const [setId, setCards] of groupedCards) {
    const result = compute(setCards, groupedOwnership.get(setId) ?? []);
    for (const standing of result.standings) {
      let total = totals.get(standing.userId);
      if (!total) {
        total = { userId: standing.userId, totalPoints: 0, activeRegistries: 0,
          gem10s: 0, qualified: 0, topSets: [] };
        totals.set(standing.userId, total);
      }
      total.totalPoints += standing.score;
      total.activeRegistries++;
      total.gem10s += standing.gems;
      total.qualified += standing.qualified;
      total.topSets.push({ productSetId: setId, name: metaById.get(setId) || setId, points: standing.score, rating: standing.rating });
    }
  }
  return [...totals.values()].map(row => ({
    ...row, topSets: row.topSets.sort((a, b) => b.points - a.points).slice(0, 5),
  })).sort((a, b) => b.totalPoints - a.totalPoints || b.gem10s - a.gem10s);
}
