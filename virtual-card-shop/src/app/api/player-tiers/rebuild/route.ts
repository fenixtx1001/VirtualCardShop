import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanCanonicalPlayerName, normalizePlayerName } from "@/lib/player-tiers";

function tierRank(tier: string | null | undefined) {
  switch (tier) {
    case "COMMON":
      return 1;
    case "SEMI_STAR":
      return 2;
    case "UNLISTED_STAR":
      return 3;
    case "STAR_1":
      return 4;
    case "STAR_2":
      return 5;
    case "STAR_3":
      return 6;
    default:
      return 0;
  }
}

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

    const desiredMap = new Map<
      string,
      {
        sport: string;
        canonicalName: string;
        normalizedName: string;
      }
    >();

    for (const card of cards) {
      const canonicalName = await cleanCanonicalPlayerName(card.player);
      const normalizedName = await normalizePlayerName(canonicalName);
      const sport = card.productSet?.product?.sport?.trim() || "";

      if (!canonicalName || !normalizedName) continue;

      const key = `${sport}::${normalizedName}`;
      if (!desiredMap.has(key)) {
        desiredMap.set(key, {
          sport,
          canonicalName,
          normalizedName,
        });
      }
    }

    const existingRows = await prisma.playerTierProfile.findMany({
      orderBy: [{ id: "asc" }],
    });

    const groupedExisting = new Map<string, typeof existingRows>();

    for (const row of existingRows) {
      const canonicalName = await cleanCanonicalPlayerName(row.canonicalName);
      const normalizedName = await normalizePlayerName(canonicalName);
      const sport = row.sport?.trim() || "";
      const key = `${sport}::${normalizedName}`;

      const nextRow = {
        ...row,
        sport,
        canonicalName,
        normalizedName,
      };

      const list = groupedExisting.get(key) ?? [];
      list.push(nextRow);
      groupedExisting.set(key, list);
    }

    let deletedDuplicates = 0;
    let insertedProfiles = 0;
    let updatedProfiles = 0;

    for (const [key, rows] of groupedExisting.entries()) {
      const sorted = [...rows].sort((a, b) => {
        const tierCmp = tierRank(b.tier) - tierRank(a.tier);
        if (tierCmp !== 0) return tierCmp;

        const aHasNotes = !!a.notes?.trim();
        const bHasNotes = !!b.notes?.trim();
        if (aHasNotes !== bHasNotes) return aHasNotes ? -1 : 1;

        return a.canonicalName.length - b.canonicalName.length;
      });

      const survivor = sorted[0];
      const duplicates = sorted.slice(1);

      await prisma.playerTierProfile.update({
        where: { id: survivor.id },
        data: {
          sport: survivor.sport,
          canonicalName: survivor.canonicalName,
          normalizedName: survivor.normalizedName,
        },
      });

      if (duplicates.length > 0) {
        await prisma.playerTierProfile.deleteMany({
          where: {
            id: {
              in: duplicates.map((r) => r.id),
            },
          },
        });
        deletedDuplicates += duplicates.length;
      }

      groupedExisting.set(key, [survivor]);
    }

    for (const [key, desired] of desiredMap.entries()) {
      const existing = groupedExisting.get(key)?.[0];

      if (existing) {
        await prisma.playerTierProfile.update({
          where: { id: existing.id },
          data: {
            sport: desired.sport,
            canonicalName: desired.canonicalName,
            normalizedName: desired.normalizedName,
          },
        });
        updatedProfiles += 1;
      } else {
        await prisma.playerTierProfile.create({
          data: {
            sport: desired.sport,
            canonicalName: desired.canonicalName,
            normalizedName: desired.normalizedName,
            tier: null,
            notes: null,
          },
        });
        insertedProfiles += 1;
      }
    }

    const unassignedProfiles = await prisma.playerTierProfile.count({
      where: {
        tier: null,
      },
    });

    return NextResponse.json({
      ok: true,
      summary: {
        scannedDistinctPlayers: desiredMap.size,
        insertedProfiles,
        updatedProfiles,
        deletedDuplicates,
        unassignedProfiles,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to rebuild player tiers" },
      { status: 500 }
    );
  }
}