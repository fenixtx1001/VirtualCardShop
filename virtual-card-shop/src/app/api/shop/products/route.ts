import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_DEAL_DISCOUNT_BPS = 1000; // 10%
const DAILY_DEAL_TIME_ZONE = "America/Chicago";

function computeBoxPriceCents(packPriceCents: number, packsPerBox: number) {
  return Math.round(packPriceCents * packsPerBox * 0.75);
}

function applyDailyDealDiscount(cents: number | null) {
  if (typeof cents !== "number") return null;
  return Math.round((cents * (10000 - DAILY_DEAL_DISCOUNT_BPS)) / 10000);
}

function cleanUrl(u: unknown): string | null {
  const s = typeof u === "string" ? u.trim() : "";
  return s.length ? s : null;
}

function isAddedWithinPastWeek(createdAt: unknown) {
  if (!(createdAt instanceof Date)) return false;

  const now = Date.now();
  const added = createdAt.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  return now - added >= 0 && now - added <= sevenDaysMs;
}

function getDailyDealDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_DEAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  const day = parts.find((p) => p.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

function hashString(input: string) {
  let hash = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function pickDailyDealProductId(productIds: string[], dateKey: string) {
  if (productIds.length === 0) return null;

  const sorted = [...productIds].sort((a, b) => a.localeCompare(b));
  const idx = hashString(`${dateKey}:vcs-daily-deal`) % sorted.length;

  return sorted[idx] ?? null;
}

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      where: { released: true },
      orderBy: [{ year: "asc" }, { brand: "asc" }, { id: "asc" }],
      include: {
        _count: { select: { productSets: true } },
      },
    });

    const dailyDealDateKey = getDailyDealDateKey();
    const dailyDealProductId = pickDailyDealProductId(
      products.map((p) => p.id),
      dailyDealDateKey
    );

    const out = products.map((p) => {
      const pack = typeof p.packPriceCents === "number" ? p.packPriceCents : 0;
      const ppb = typeof p.packsPerBox === "number" ? p.packsPerBox : 0;

      const derivedBox = ppb > 0 ? computeBoxPriceCents(pack, ppb) : null;
      const boxPriceCents =
        typeof (p as any).boxPriceCents === "number"
          ? (p as any).boxPriceCents
          : derivedBox;

      const isDailyDeal = p.id === dailyDealProductId;

      const dealPackPriceCents = applyDailyDealDiscount(pack) ?? pack;
      const dealBoxPriceCents = applyDailyDealDiscount(boxPriceCents);

      const packImageUrl = cleanUrl((p as any).packImageUrl);
      const boxImageUrl = cleanUrl((p as any).boxImageUrl);
      const displayBoxImageUrl = boxImageUrl ?? packImageUrl;

      return {
        id: p.id,
        year: p.year,
        brand: p.brand,
        sport: p.sport,

        packPriceCents: pack,
        packsPerBox: p.packsPerBox,
        boxPriceCents,

        packImageUrl,
        boxImageUrl,
        displayBoxImageUrl,

        productSetsCount: p._count?.productSets ?? 0,

        // Critical: shop page filters on this
        released: p.released,

        isDailyDeal,
        dailyDealDateKey,
        dailyDealDiscountBps: DAILY_DEAL_DISCOUNT_BPS,

        standardPackPriceCents: pack,
        standardBoxPriceCents: boxPriceCents,

        dealPackPriceCents,
        dealBoxPriceCents,

        effectivePackPriceCents: isDailyDeal ? dealPackPriceCents : pack,
        effectiveBoxPriceCents: isDailyDeal ? dealBoxPriceCents : boxPriceCents,

        createdAt: (p as any).createdAt ?? null,
        isNewProduct: isAddedWithinPastWeek((p as any).createdAt),

        debug: {
          hasPackImage: !!packImageUrl,
          hasBoxImage: !!boxImageUrl,
          displayBoxFrom: boxImageUrl ? "boxImageUrl" : packImageUrl ? "packImageUrl" : "none",
          dailyDealProductId,
          dailyDealDateKey,
        },
      };
    });

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load shop products" },
      { status: 500 }
    );
  }
}
