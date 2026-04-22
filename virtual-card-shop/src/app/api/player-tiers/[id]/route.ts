// src/app/api/player-tiers/[id]/route.ts
import { NextResponse } from "next/server";
import { PlayerTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cleanCanonicalPlayerName, normalizePlayerName } from "@/lib/player-tiers";

type Ctx =
  | { params: { id?: string } }
  | { params: Promise<{ id?: string }> };

async function getId(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;
  const raw = params?.id;
  const id = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(id) ? id : null;
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

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const id = await getId(ctx);
    if (!id) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));

    const existing = await prisma.playerTierProfile.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Player tier profile not found" }, { status: 404 });
    }

    const canonicalName =
      body.canonicalName !== undefined
        ? cleanCanonicalPlayerName(body.canonicalName)
        : existing.canonicalName;

    const normalizedName = normalizePlayerName(canonicalName);
    const sport =
      body.sport !== undefined ? String(body.sport ?? "").trim() || null : existing.sport;

    const tier =
      body.tier !== undefined ? body.tier : existing.tier;

    if (!canonicalName || !normalizedName) {
      return NextResponse.json({ ok: false, error: "canonicalName is required" }, { status: 400 });
    }

    if (tier !== null && !validTier(tier)) {
      return NextResponse.json({ ok: false, error: "Invalid tier" }, { status: 400 });
    }

    const row = await prisma.playerTierProfile.update({
      where: { id },
      data: {
        sport,
        canonicalName,
        normalizedName,
        tier,
        notes: body.notes !== undefined ? (String(body.notes ?? "").trim() || null) : existing.notes,
      },
    });

    return NextResponse.json({ ok: true, row });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to update player tier" },
      { status: 500 }
    );
  }
}