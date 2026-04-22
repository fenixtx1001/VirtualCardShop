import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanCanonicalPlayerName, normalizePlayerName } from "@/lib/player-tiers";

export async function POST() {
  try {
    const cards = await prisma.card.findMany({
      where: {
        player: {
          not: "",
        },
      },
      select: {
        player: true,
        productSetId: true,
        productSet: {
          select: {
            product: {
              select: {
                sport: true,
              },
            },
          },
        },
      },
    });

    let created = 0;
    let updated = 0;
    const seen = new Set<string>();

    for (const card of cards) {
      const canonicalName = cleanCanonicalPlayerName(card.player);
      const normalizedName = normalizePlayerName(canonicalName);
      const sport = card.productSet?.product?.sport?.trim() || "";

      if (!canonicalName || !normalizedName) continue;

      const key = `${sport}::${normalizedName}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const existing = await prisma.playerTierProfile.findUnique({
        where: {
          sport_normalizedName: {
            sport,
            normalizedName,
          },
        },
      });

      if (existing) {
        await prisma.playerTierProfile.update({
          where: { id: existing.id },
          data: {
            canonicalName,
            normalizedName,
          },
        });
        updated += 1;
      } else {
        await prisma.playerTierProfile.create({
          data: {
            sport,
            canonicalName,
            normalizedName,
            tier: null,
            notes: null,
          },
        });
        created += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      updated,
      totalUniquePlayersSeen: seen.size,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to rebuild player tiers" },
      { status: 500 }
    );
  }
}