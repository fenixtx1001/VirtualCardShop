import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearPlayerTierIgnoreTokenCache, normalizeIgnoreToken } from "@/lib/player-tiers";

export async function GET() {
  try {
    const rows = await prisma.playerTierIgnoreToken.findMany({
      orderBy: [{ isEnabled: "desc" }, { token: "asc" }],
    });

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load ignore tokens" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const token = String(body.token ?? "").trim();
    const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

    if (!token) {
      return NextResponse.json({ ok: false, error: "token is required" }, { status: 400 });
    }

    const normalizedToken = normalizeIgnoreToken(token);
    if (!normalizedToken) {
      return NextResponse.json({ ok: false, error: "token is required" }, { status: 400 });
    }

    const row = await prisma.playerTierIgnoreToken.upsert({
      where: { normalizedToken },
      create: {
        token,
        normalizedToken,
        isEnabled: true,
        notes,
      },
      update: {
        token,
        notes,
        isEnabled: true,
      },
    });

    clearPlayerTierIgnoreTokenCache();

    return NextResponse.json({ ok: true, row });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to save ignore token" },
      { status: 500 }
    );
  }
}