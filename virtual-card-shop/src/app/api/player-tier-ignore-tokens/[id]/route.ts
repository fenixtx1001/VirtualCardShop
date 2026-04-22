import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearPlayerTierIgnoreTokenCache, normalizeIgnoreToken } from "@/lib/player-tiers";

type Ctx =
  | { params: { id?: string } }
  | { params: Promise<{ id?: string }> };

async function getId(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;
  const raw = params?.id;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const id = await getId(ctx);
    if (!id) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const token = typeof body.token === "string" ? body.token.trim() : undefined;
    const notes = typeof body.notes === "string" ? body.notes.trim() || null : undefined;
    const isEnabled = typeof body.isEnabled === "boolean" ? body.isEnabled : undefined;

    const data: {
      token?: string;
      normalizedToken?: string;
      notes?: string | null;
      isEnabled?: boolean;
    } = {};

    if (token !== undefined) {
      if (!token) {
        return NextResponse.json({ ok: false, error: "token cannot be blank" }, { status: 400 });
      }
      data.token = token;
      data.normalizedToken = normalizeIgnoreToken(token);
    }

    if (notes !== undefined) {
      data.notes = notes;
    }

    if (isEnabled !== undefined) {
      data.isEnabled = isEnabled;
    }

    const row = await prisma.playerTierIgnoreToken.update({
      where: { id },
      data,
    });

    clearPlayerTierIgnoreTokenCache();

    return NextResponse.json({ ok: true, row });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to update ignore token" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const id = await getId(ctx);
    if (!id) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    await prisma.playerTierIgnoreToken.delete({
      where: { id },
    });

    clearPlayerTierIgnoreTokenCache();

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to delete ignore token" },
      { status: 500 }
    );
  }
}