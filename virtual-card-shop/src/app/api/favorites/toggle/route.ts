// src/app/api/favorites/toggle/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500, extra?: any) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ? { extra } : {}) },
    { status }
  );
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const body = await req.json().catch(() => ({}));
    const cardIdRaw = (body as any)?.cardId;
    const cardId =
      typeof cardIdRaw === "number" ? cardIdRaw : parseInt(String(cardIdRaw ?? ""), 10);

    if (!Number.isFinite(cardId)) {
      return jsonError("Invalid cardId.", 400);
    }

    // Sanity: ensure card exists (prevents FK errors and gives a clean message)
    const cardExists = await prisma.card.findUnique({
      where: { id: cardId },
      select: { id: true },
    });

    if (!cardExists) {
      return jsonError(`Card ${cardId} does not exist.`, 404);
    }

    // IMPORTANT: if the delegate doesn't exist, this will throw immediately
    const existing = await prisma.cardFavorite.findUnique({
      where: { userId_cardId: { userId: user.id, cardId } },
      select: { id: true },
    });

    if (existing) {
      await prisma.cardFavorite.delete({
        where: { userId_cardId: { userId: user.id, cardId } },
      });
      return NextResponse.json({ ok: true, favorited: false }, { status: 200 });
    }

    await prisma.cardFavorite.create({
      data: { userId: user.id, cardId },
    });

    return NextResponse.json({ ok: true, favorited: true }, { status: 200 });
  } catch (e: any) {
    // Return a small, helpful error so we can fix this fast.
    // We intentionally include Prisma code/message during debugging.
    const message = typeof e?.message === "string" ? e.message : "Unknown error";
    const code = e?.code;
    return jsonError("Failed to toggle favorite.", 500, {
      code,
      message,
      name: e?.name,
    });
  }
}
