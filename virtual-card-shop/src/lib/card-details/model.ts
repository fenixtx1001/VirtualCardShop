export type CopyRow = {
  grade: number;
  label: string;
  quantity: number;
  valueCents: number;
  availableQuantity?: number;
  auctionLockedQuantity?: number;
};
export type Owner = {
  userId: string;
  name: string | null;
  quantity: number;
  rawQuantity: number;
  gradedQuantity: number;
  pendingGradingQuantity: number;
  totalQuantity: number;
  totalValueCents: number;
  gradeBreakdown: CopyRow[];
  slabs: CopyRow[];
};
export type CardDetails = {
  ok: boolean;
  card: {
    id: number;
    player: string;
    cardNumber: string;
    team: string | null;
    subset: string | null;
    variant: string | null;
    bookValue: number;
    productId: string | null;
    productYear: number | null;
    productBrand: string | null;
    productSport: string | null;
    productSetId: string | null;
    productSetName: string | null;
    productSetIsBase: boolean | null;
    frontImageUrl: string | null;
    backImageUrl: string | null;
  };
  population: {
    uniqueOwners: number;
    totalOwned: number;
    totalOwnedIncludingPending: number;
    raw: number;
    graded: number;
    pendingGrading: number;
    totalValueCents: number;
    gradeBreakdown: {
      grade: number;
      label: string;
      quantity: number;
      percentage: number;
    }[];
  };
  myOwnership: Owner;
  owners: Owner[];
};
export type Progress = {
  level: number;
  nextLevel: number;
  totalCards: number;
  ownedCards: number;
  cardsAtNext: number;
  missingCopies: number;
  thisCardOwned: number;
  thisCardNeeded: number;
};
export type CollectorContext = {
  ok: boolean;
  cardId: number;
  favorited: boolean;
  progress: Progress | null;
  pendingOrders: { id: number; quantity: number; readyAt: string | null }[];
  auctions: {
    id: number;
    grade: number;
    quantity: number;
    status: string;
    endsAt: string;
  }[];
  history: {
    id: string;
    date: string;
    label: string;
    quantity: number;
    href: string | null;
  }[];
};
export type MarketRange = "7D" | "30D" | "90D" | "ALL";
export type Sale = {
  id: number;
  grade: number;
  label: string;
  saleType: "SHOP" | "AUCTION";
  buyerType: "SHOP" | "DUMMY" | "HUMAN";
  salePriceCents: number;
  createdAt: string;
  auctionId: number | null;
};
export type GraphPoint = {
  date: string;
  salesCount: number;
  averageSaleCents: number;
};
export type MarketGrade = {
  grade: number;
  label: string;
  salesCount: number;
  lastSaleCents: number;
  lastSaleAt: string | null;
  averageSaleCents: number;
  highestSaleCents: number;
  lowestSaleCents: number;
  trendBps: number;
  graphData: GraphPoint[];
  recentSales: Sale[];
};
export type Market = { ok: boolean; range: MarketRange; grades: MarketGrade[] };
export type OfferStatus = {
  ok: boolean;
  available: boolean;
  reason: string;
  message?: string;
  lockedUntil?: string | null;
  activeOffer: { id: number; offerBps: number; expiresAt: string } | null;
};
export const grades = [0, 10, 9, 8, 7, 6];
export const gradeLabel = (grade: number) =>
  grade === 0 ? "Raw" : `VCS ${grade}`;
export const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
export const dateLabel = (date: string) =>
  new Date(date.length === 10 ? `${date}T12:00:00Z` : date).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric", year: "numeric" },
  );
export const availableCopies = (row?: CopyRow) =>
  row
    ? Math.max(
        0,
        row.availableQuantity ??
          row.quantity - (row.auctionLockedQuantity ?? 0),
      )
    : 0;
export function saleImpact(
  owned: number,
  quantity: number,
  progress: Progress | null,
) {
  const remaining = Math.max(0, owned - quantity);
  if (quantity >= owned && owned > 0)
    return "This is your last copy. Selling it leaves a gap in your current set.";
  if (progress && remaining < progress.nextLevel)
    return `After selling, you will need ${progress.nextLevel - remaining} more ${progress.nextLevel - remaining === 1 ? "copy" : "copies"} of this card for prestige ${progress.nextLevel}. Earned prestige is kept.`;
  return null;
}
export function trendLabel(row: Pick<MarketGrade, "salesCount" | "trendBps">) {
  if (row.salesCount < 4) return "Insufficient history";
  if (!row.trendBps) return "Unchanged";
  return `${row.trendBps > 0 ? "↑" : "↓"} ${(Math.abs(row.trendBps) / 100).toFixed(1)}%`;
}
export function graphCoordinates(
  points: GraphPoint[],
  width: number,
  height: number,
) {
  const clean = points
    .filter(
      (p) =>
        Number.isFinite(Date.parse(p.date)) &&
        Number.isFinite(p.averageSaleCents),
    )
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (!clean.length) return { points: [], low: 0, high: 0 };
  const min = Math.min(...clean.map((p) => p.averageSaleCents));
  const max = Math.max(...clean.map((p) => p.averageSaleCents));
  const pad = Math.max(1, (max - min) * 0.15, max * 0.025);
  const low = Math.max(0, min - pad),
    high = max + pad;
  const start = Date.parse(clean[0].date),
    end = Date.parse(clean[clean.length - 1].date);
  return {
    low,
    high,
    points: clean.map((p) => ({
      ...p,
      x:
        64 +
        (end === start ? 0.5 : (Date.parse(p.date) - start) / (end - start)) *
          (width - 82),
      y: 18 + ((high - p.averageSaleCents) / (high - low)) * (height - 58),
    })),
  };
}
export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "The server could not complete this request. Please try again.",
    );
  }
  if (!response.ok || body?.ok === false)
    throw new Error(
      body?.error || body?.message || "This request could not be completed.",
    );
  return body as T;
}
export const postJson = <T>(url: string, body: unknown) =>
  requestJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
