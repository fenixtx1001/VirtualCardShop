import { NextResponse } from "next/server";
import { PlayerTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cleanCanonicalPlayerName, normalizePlayerName } from "@/lib/player-tiers";

function parseBool(v: string | null) {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function validTier(v: unknown): v is PlayerTier {
  return (
    v === "COMMON" ||
    v === "SEMI_STAR" ||
    v === "UNLISTED_STAR" ||
    v === "STAR_1" ||
    v === "STAR_2" ||
    v === "STAR_3"
  );
}

function tierRank(tier: PlayerTier | null | undefined) {
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

type ProfileRow = {
  id: number;
  sport: string;
  canonicalName: string;
  normalizedName: string;
  tier: PlayerTier | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const sport = (url.searchParams.get("sport") ?? "").trim() || undefined;
    const onlyUnassigned = parseBool(url.searchParams.get("onlyUnassigned"));

    const page = clampInt(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1, 100000);
    const pageSize = clampInt(parseInt(url.searchParams.get("pageSize") ?? "100", 10) || 100, 1, 500);

    const where: any = {};
    if (sport && sport !== "Unknown") where.sport = sport;
    if (sport === "Unknown") where.sport = "";

    const rawRows = (await prisma.playerTierProfile.findMany({
      where,
      orderBy: [{ sport: "asc" }, { canonicalName: "asc" }, { id: "asc" }],
    })) as ProfileRow[];

    const dedupedMap = new Map<string, ProfileRow>();

    for (const row of rawRows) {
      const cleanedCanonicalName = await cleanCanonicalPlayerName(row.canonicalName);
      const cleanedNormalizedName = await normalizePlayerName(cleanedCanonicalName);
      const sportKey = row.sport ?? "";
      const key = `${sportKey}::${cleanedNormalizedName}`;

      const candidate: ProfileRow = {
        ...row,
        canonicalName: cleanedCanonicalName,
        normalizedName: cleanedNormalizedName,
      };

      const existing = dedupedMap.get(key);
      if (!existing) {
        dedupedMap.set(key, candidate);
        continue;
      }

      const existingTierRank = tierRank(existing.tier);
      const candidateTierRank = tierRank(candidate.tier);

      if (candidateTierRank > existingTierRank) {
        dedupedMap.set(key, candidate);
        continue;
      }

      const existingHasNotes = !!existing.notes?.trim();
      const candidateHasNotes = !!candidate.notes?.trim();

      if (!existingHasNotes && candidateHasNotes) {
        dedupedMap.set(key, candidate);
        continue;
      }

      if (
        candidateTierRank === existingTierRank &&
        existingHasNotes === candidateHasNotes &&
        candidate.canonicalName.length < existing.canonicalName.length
      ) {
        dedupedMap.set(key, candidate);
      }
    }

    let rows = Array.from(dedupedMap.values());

    if (q) {
      const normalizedQ = await normalizePlayerName(q);
      rows = rows.filter((row) => {
        const canonicalMatch = row.canonicalName.toLowerCase().includes(q.toLowerCase());
        const normalizedMatch = row.normalizedName.includes(normalizedQ);
        return canonicalMatch || normalizedMatch;
      });
    }

    if (onlyUnassigned) {
      rows = rows.filter((row) => row.tier == null);
    }

    rows.sort((a, b) => {
      const sportA = a.sport || "Unknown";
      const sportB = b.sport || "Unknown";
      const sportCmp = sportA.localeCompare(sportB);
      if (sportCmp !== 0) return sportCmp;

      const tierCmp = tierRank(a.tier) - tierRank(b.tier);
      if (tierCmp !== 0) return tierCmp;

      return a.canonicalName.localeCompare(b.canonicalName);
    });

    const sportCountsMap = new Map<string, number>();
    for (const row of Array.from(dedupedMap.values())) {
      const key = row.sport ?? "";
      sportCountsMap.set(key, (sportCountsMap.get(key) ?? 0) + 1);
    }

    const sports = Array.from(sportCountsMap.entries())
      .map(([sportValue, count]) => ({
        sport: sportValue === "" ? null : sportValue,
        count,
      }))
      .sort((a, b) => {
        const aa = a.sport ?? "Unknown";
        const bb = b.sport ?? "Unknown";
        return aa.localeCompare(bb);
      });

    const total = rows.length;
    const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      ok: true,
      rows: pagedRows.map((row) => ({
        ...row,
        sport: row.sport === "" ? null : row.sport,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      sports,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load player tiers" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const canonicalName = await cleanCanonicalPlayerName(body.canonicalName);
    const normalizedName = await normalizePlayerName(canonicalName);
    const sport = String(body.sport ?? "").trim();
    const tier = body.tier ?? null;
    const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

    if (!canonicalName || !normalizedName) {
      return NextResponse.json({ ok: false, error: "canonicalName is required" }, { status: 400 });
    }

    if (tier !== null && !validTier(tier)) {
      return NextResponse.json({ ok: false, error: "Invalid tier" }, { status: 400 });
    }

    const row = await prisma.playerTierProfile.upsert({
      where: {
        sport_normalizedName: {
          sport,
          normalizedName,
        },
      },
      create: {
        sport,
        canonicalName,
        normalizedName,
        tier,
        notes,
      },
      update: {
        canonicalName,
        normalizedName,
        tier,
        notes,
      },
    });

    return NextResponse.json({
      ok: true,
      row: {
        ...row,
        sport: row.sport === "" ? null : row.sport,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to save player tier" },
      { status: 500 }
    );
  }
}