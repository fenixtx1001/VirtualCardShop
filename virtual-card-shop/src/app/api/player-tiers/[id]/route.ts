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
  return typeof raw === "string" ? raw : "";
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
    const idRaw = await getId(ctx);
    const id = Number(idRaw);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));

    const canonicalName = cleanCanonicalPlayerName(body.canonicalName);
    const normalizedName = normalizePlayerName(canonicalName);
    const sport = String(body.sport ?? "").trim();
    const tier = body.tier ?? null;
    const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

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
      { ok: false, error: e?.message ?? "Failed to update player tier" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const idRaw = await getId(ctx);
    const id = Number(idRaw);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    await prisma.playerTierProfile.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to delete player tier" },
      { status: 500 }
    );
  }
}