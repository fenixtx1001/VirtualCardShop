// src/app/api/shop/buy/route.ts
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { createFinancialTransaction } from "@/lib/financial-transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getShopPromotions } from "@/lib/shop/promotions";
import { DAILY_DEAL_DISCOUNT_BPS, productPrices } from "@/lib/shop/pricing";

type BuyKind = "pack" | "box";

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

    if (!Number.isSafeInteger(rawQuantity) || rawQuantity <= 0 || rawQuantity > 100) {
      return NextResponse.json({ ok: false, error: "Invalid quantity" }, { status: 400 });
    }

    const quantity = Math.floor(rawQuantity);

    const day = await getShopPromotions();
    const dailyDealDateKey = day.dateKey;
    const dailyProductId = day.productId;

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
    const prices = productPrices(product, day);
    const { isDailyDeal, isSale, discountBps } = prices;
    const normalPackPriceCents = prices.standardPackPriceCents;
    const normalBoxPriceCents = prices.standardBoxPriceCents ?? 0;
    const dailyDealPackPriceCents = prices.dealPackPriceCents;
    const dailyDealBoxPriceCents = prices.dealBoxPriceCents ?? 0;
    const unitCost = kind === "pack" ? prices.effectivePackPriceCents : prices.effectiveBoxPriceCents!;

    // A stale tab must never silently charge a different price after midnight.
    if (body.expectedUnitCostCents !== undefined && body.expectedUnitCostCents !== unitCost) {
      return NextResponse.json({ error: "The price changed. Review the updated price and try again.", code: "PRICE_CHANGED" }, { status: 409 });
    }

    const costCents = unitCost * quantity;
    const packsToAdd = kind === "pack" ? quantity : packsPerBox * quantity;

    if (!Number.isSafeInteger(costCents) || !Number.isSafeInteger(packsToAdd) || packsToAdd <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid packsPerBox" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Conditional debit prevents simultaneous purchases from overspending.
      const debit = await tx.user.updateMany({
        where: { id: user.id, balanceCents: { gte: costCents } },
        data: { balanceCents: { decrement: costCents } },
      });
      if (debit.count !== 1) {
        const error = new Error("Insufficient funds") as Error & { status: number };
        error.status = 400;
        throw error;
      }
      const updatedUser = await tx.user.findUniqueOrThrow({
        where: { id: user.id }, select: { balanceCents: true },
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

      const purchaseBatchId = randomUUID();
      const ripBoxIds: number[] = [];

      if (kind === "box") {
        for (let i = 0; i < quantity; i += 1) {
          const ripBox = await tx.ripBox.create({
            data: {
              userId: user.id,
              productId,
              purchaseBatchId,
              purchasePriceCents: unitCost,
              packsPurchased: packsPerBox,
              packsOpened: 0,
              isClosed: false,
            },
            select: { id: true },
          });

          ripBoxIds.push(ripBox.id);
        }
      }

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
          isSale,
          discountBps,
          dailyDealDateKey,
          dailyDealProductId: dailyProductId,
          dailyDealDiscountBps: DAILY_DEAL_DISCOUNT_BPS,
          ripBoxIds,
          purchaseBatchId: kind === "box" ? purchaseBatchId : null,
        },
      });

      return {
        balanceCents: updatedUser.balanceCents ?? 0,
        packsOwned: inv.packsOwned ?? 0,
        ripBoxIds,
        purchaseBatchId: kind === "box" ? purchaseBatchId : null,
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
      isSale,
      discountBps,
      dailyDealDateKey,
      dailyDealProductId: dailyProductId,
      dailyDealDiscountBps: DAILY_DEAL_DISCOUNT_BPS,
      normalPackPriceCents,
      normalBoxPriceCents,
      dailyDealPackPriceCents,
      dailyDealBoxPriceCents,
      ripBoxIds: result.ripBoxIds,
      purchaseBatchId: result.purchaseBatchId,
    });
  } catch (e: unknown) {
    const status = getErrorStatus(e);

    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status });
  }
}