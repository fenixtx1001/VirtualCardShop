import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { previousDateKey, selectPromotions, shopDateKey, type PromotionDay } from "./pricing";

/** Persist a complete day atomically. Never repick on catalog changes or refresh. */
export async function getShopPromotions(now = new Date()): Promise<PromotionDay> {
  const dateKey = shopDateKey(now);
  const saved = await prisma.dailyDeal.findUnique({ where: { dateKey } });
  if (saved?.shopPromotionsVersion === 1) return saved;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const today = await tx.dailyDeal.findUnique({ where: { dateKey } });
        if (today?.shopPromotionsVersion === 1) return today;
        const yesterday = await tx.dailyDeal.findUnique({ where: { dateKey: previousDateKey(dateKey) } });
        const products = await tx.product.findMany({
          where: { released: true, packPriceCents: { gt: 0 } }, select: { id: true },
        });
        const chosen = selectPromotions(products.map((p) => p.id), dateKey, yesterday, today?.productId);
        // Tiny catalogs prefer fewer promotions to repeating yesterday's products.
        if (!chosen.productId) return chosen;
        const data = { productId: chosen.productId, saleProductIds: chosen.saleProductIds, shopPromotionsVersion: 1 };
        return tx.dailyDeal.upsert({ where: { dateKey }, create: { dateKey, ...data }, update: data });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 3) continue;
      throw error;
    }
  }
  throw new Error("Could not prepare today's shop. Please retry.");
}
