import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  normalizePlayerName,
  cleanCanonicalPlayerName,
} from "@/lib/player-tiers";

export async function POST() {
  try {
    const cards = await prisma.card.findMany({
      select: {
        player: true,
        productSet: {
          select: {
            product: {
              select: {
                sport: true,
              },
            },
          },
        },
        set: {
          select: {
            sport: true,
          },
        },
      },
    });

    let scanned = 0;
    let inserted = 0;
    const seen = new Set<string>();

    for (const card of cards) {
      const canonicalName = cleanCanonicalPlayerName(card.player);
      if (!canonicalName) continue;

      const normalizedName = normalizePlayerName(canonicalName);
      if (!normalizedName) continue;

      const sport =
        card.productSet?.product?.sport?.trim() ||
        card.set?.sport?.trim() ||
        null;

      const key = `${sport ?? ""}::${normalizedName}`;
      if (seen.has(key)) continue;
      seen.add(key);

      scanned++;

      const existing = await prisma.playerTierProfile.findUnique({
        where: {
          sport_normalizedName: {
            sport,
            normalizedName,
          },
        },
      });

      if (!existing) {
        await prisma.playerTierProfile.create({
          data: {
            sport,
            canonicalName,
            normalizedName,
            tier: null,
          },
        });
        inserted++;
      }
    }

    const unassigned = await prisma.playerTierProfile.count({
      where: { tier: null },
    });

    return NextResponse.json({
      ok: true,
      summary: {
        scannedDistinctPlayers: scanned,
        insertedProfiles: inserted,
        unassignedProfiles: unassigned,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to rebuild player repository" },
      { status: 500 }
    );
  }
}