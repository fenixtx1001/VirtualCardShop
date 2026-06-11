// src/app/api/shop/buy/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { createFinancialTransaction } from "@/lib/financial-transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_DEAL_DISCOUNT_BPS = 1000; // 10% additional discount
const BOX_DISCOUNT_MULTIPLIER = 0.75; // normal box price = pack price x packs per box x .75
const DAILY_DEAL_TIME_ZONE = "America/Chicago";

type BuyKind = "pack" | "box";

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

async function getOrCreateDailyDealProductId(productIds: string[], dateKey: string) {
  if (productIds.length === 0) return null;

  const existing = await prisma.dailyDeal.findUnique({
    where: { dateKey },
    select: { productId: true },
  });

  if (existing?.productId) return existing.productId;

  const productId = pickDailyDealProductId(productIds, dateKey);
  if (!productId) return null;

  try {
    const created = await prisma.dailyDeal.create({
      data: { dateKey, productId },
      select: { productId: true },
    });

    return created.productId;
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      const winner = await prisma.dailyDeal.findUnique({
        where: { dateKey },
        select: { productId: true },
      });

      return winner?.productId ?? productId;
    }

    throw e;
  }
}

function applyDailyDealDiscount(cents: number) {
  return Math.round((cents * (10000 - DAILY_DEAL_DISCOUNT_BPS)) / 10000);
}

function getNormalBoxPriceCents(packPriceCents: number, packsPerBox: number) {
  return Math.round(packPriceCents * packsPerBox * BOX_DISCOUNT_MULTIPLIER);
}

function getUnitCostCents(args: {
  kind: BuyKind;
  packPriceCents: number;
  packsPerBox: number;
  isDailyDeal: boolean;
}) {
  const { kind, packPriceCents, packsPerBox, isDailyDeal } = args;

  const normalUnitCost =
    kind === "pack"
      ? packPriceCents
      : getNormalBoxPriceCents(packPriceCents, packsPerBox);

  return isDailyDeal ? applyDailyDealDiscount(normalUnitCost) : normalUnitCost;
}

function getProductDisplayName(product: {
  year: number | null;
  brand: string | null;
  sport: string | null;
}) {
  return [product.year, product.brand, product.sport].filter(Boolean).join(" ") || "Product";
}

function getErrorStatus(e: unknown) {
  if (
    typeof e === "object" &&
    e !== null &&
    "status" in e &&
    typeof (e as { status?: unknown }).status === "number"
  ) {
    return (e as { status: number }).status;
  }

  return 500;
}

function getErrorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  return "Buy failed";
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const body = await req.json().catch(() => ({}));
    const productId = String(body?.productId ?? "");
    const kind = String(body?.kind ?? "") as BuyKind;
    const rawQuantity = Number(body?.quantity ?? 1);

    if (!productId) {
      return NextResponse.json({ ok: false, error: "Missing productId" }, { status: 400 });
    }

    if (kind !== "pack" && kind !== "box") {
      return NextResponse.json({ ok: false, error: "Invalid kind" }, { status: 400 });
    }

    if (!Number.isFinite(rawQuantity) || rawQuantity <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid quantity" }, { status: 400 });
    }

    const quantity = Math.floor(rawQuantity);

    const products = await prisma.product.findMany({
      where: { released: true },
      orderBy: [{ year: "asc" }, { brand: "asc" }, { id: "asc" }],
      select: { id: true },
    });

    const dailyDealDateKey = getDailyDealDateKey();
    const dailyProductId = await getOrCreateDailyDealProductId(
      products.map((p) => p.id),
      dailyDealDateKey
    );

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        year: true,
        brand: true,
        sport: true,
        released: true,
        packPriceCents: true,
        packsPerBox: true,
      },
    });

    if (!product) {
      return NextResponse.json({ ok: false, error: "Product not found" }, { status: 404 });
    }

    if (!product.released) {
      return NextResponse.json({ ok: false, error: "Product is not released" }, { status: 400 });
    }

    const packPriceCents = product.packPriceCents ?? 0;
    const packsPerBox = product.packsPerBox ?? 0;

    if (packPriceCents <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid pack price" }, { status: 400 });
    }

    if (kind === "box" && packsPerBox <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid packsPerBox" }, { status: 400 });
    }

    const productDisplayName = getProductDisplayName(product);
    const isDailyDeal = product.id === dailyProductId;

    const normalPackPriceCents = packPriceCents;
    const normalBoxPriceCents =
      packsPerBox > 0 ? getNormalBoxPriceCents(packPriceCents, packsPerBox) : 0;

    const dailyDealPackPriceCents = applyDailyDealDiscount(normalPackPriceCents);
    const dailyDealBoxPriceCents =
      normalBoxPriceCents > 0 ? applyDailyDealDiscount(normalBoxPriceCents) : 0;

    const unitCost = getUnitCostCents({
      kind,
      packPriceCents,
      packsPerBox,
      isDailyDeal,
    });

    const costCents = unitCost * quantity;
    const packsToAdd = kind === "pack" ? quantity : packsPerBox * quantity;

    if (packsToAdd <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid packsPerBox" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const u = await tx.user.findUnique({
        where: { id: user.id },
        select: { balanceCents: true },
      });

      if (!u) throw new Error("User not found");

      if ((u.balanceCents ?? 0) < costCents) {
        const err = new Error("Insufficient funds");
        (err as Error & { status?: number }).status = 400;
        throw err;
      }

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { balanceCents: { decrement: costCents } },
        select: { balanceCents: true },
      });

      const inv = await tx.sealedInventory.upsert({
        where: {
          userId_productId: {
            userId: user.id,
            productId,
          },
        },
        create: {
          userId: user.id,
          productId,
          packsOwned: packsToAdd,
        },
        update: {
          packsOwned: { increment: packsToAdd },
        },
        select: { packsOwned: true },
      });

      await createFinancialTransaction({
        tx,
        userId: user.id,
        category: kind === "pack" ? "PACK_PURCHASE" : "BOX_PURCHASE",
        amountCents: -costCents,
        description:
          kind === "pack"
            ? `Purchased ${quantity} pack${quantity === 1 ? "" : "s"} of ${productDisplayName}`
            : `Purchased ${quantity} box${quantity === 1 ? "" : "es"} of ${productDisplayName}`,
        balanceAfterCents: updatedUser.balanceCents ?? 0,
        metadata: {
          productId,
          productName: productDisplayName,
          year: product.year,
          brand: product.brand,
          sport: product.sport,
          kind,
          quantity,
          unitCostCents: unitCost,
          costCents,
          packsAdded: packsToAdd,
          packsPerBox,
          isDailyDeal,
          dailyDealDateKey,
          dailyDealProductId: dailyProductId,
          dailyDealDiscountBps: DAILY_DEAL_DISCOUNT_BPS,
        },
      });

      return {
        balanceCents: updatedUser.balanceCents ?? 0,
        packsOwned: inv.packsOwned ?? 0,
      };
    });

    return NextResponse.json({
      ok: true,
      productId,
      kind,
      quantity,
      unitCostCents: unitCost,
      costCents,
      packsAdded: packsToAdd,
      balanceCents: result.balanceCents,
      packsOwned: result.packsOwned,
      isDailyDeal,
      dailyDealDateKey,
      dailyDealProductId: dailyProductId,
      dailyDealDiscountBps: DAILY_DEAL_DISCOUNT_BPS,
      normalPackPriceCents,
      normalBoxPriceCents,
      dailyDealPackPriceCents,
      dailyDealBoxPriceCents,
    });
  } catch (e: unknown) {
    const status = getErrorStatus(e);

    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status });
  }
}