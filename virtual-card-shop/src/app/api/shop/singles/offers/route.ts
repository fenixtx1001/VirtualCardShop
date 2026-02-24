// src/app/api/shop/singles/offers/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { addHours, bookValueToPerCardCents, generateOfferBps } from "@/lib/shop-offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shortErr(e: any) {
  const code = e?.code ?? e?.name ?? "UNKNOWN";
  let message = String(e?.message ?? "Unknown error");
  if (message.length > 260) message = message.slice(0, 260) + "…";
  return { code, message };
}

/**
 * GET: list active offers for the current user
 */
export async function GET() {
  try {
    const user = await requireUser();
    const now = new Date();

    const offers = await prisma.shopOffer.findMany({
      where: {
        userId: user.id,
        acceptedAt: null,
        expiresAt: { gt: now },
      },
      include: {
        card: {
          select: {
            id: true,
            player: true,
            cardNumber: true,
            team: true,
            subset: true,
            variant: true,
            bookValue: true,
            frontImageUrl: true,
            productSetId: true,
          },
        },
      },
      orderBy: [{ expiresAt: "asc" }],
      take: 200,
    });

    return NextResponse.json({ ok: true, offers }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to load offers.", extra: shortErr(e) }, { status: 500 });
  }
}

/**
 * POST: request an offer for a card
 * Body: { cardId: number }
 *
 * Rules:
 * - max 15 active offers per user
 * - no new offer for a card if an active offer for that card exists
 * - user must own at least 1 of the card
 * - offer lasts 24 hours
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const cardId = Number(body?.cardId);

    if (!Number.isFinite(cardId) || cardId <= 0) {
      return NextResponse.json({ ok: false, error: "Missing or invalid cardId." }, { status: 400 });
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Active offer cap: 15
      const activeCount = await tx.shopOffer.count({
        where: { userId: user.id, acceptedAt: null, expiresAt: { gt: now } },
      });
      if (activeCount >= 15) {
        return {
          ok: false as const,
          status: 429 as const,
          error: "Offer limit reached (15 active offers). Accept offers or wait for them to expire.",
        };
      }

      // Reuse existing active offer for this card
      const existing = await tx.shopOffer.findFirst({
        where: { userId: user.id, cardId, acceptedAt: null, expiresAt: { gt: now } },
        select: { id: true, offerBps: true, createdAt: true, expiresAt: true },
      });
      if (existing) {
        return { ok: true as const, status: 200 as const, offer: existing, reused: true };
      }

      // Must own at least 1
      const own = await tx.cardOwnership.findUnique({
        where: { userId_cardId: { userId: user.id, cardId } },
        select: { quantity: true },
      });
      if (!own || (own.quantity ?? 0) <= 0) {
        return { ok: false as const, status: 400 as const, error: "You do not own this card." };
      }

      const card = await tx.card.findUnique({
        where: { id: cardId },
        select: { id: true, bookValue: true },
      });
      if (!card) return { ok: false as const, status: 404 as const, error: "Card not found." };

      const perCardCents = bookValueToPerCardCents(card.bookValue);
      if (perCardCents <= 0) {
        return { ok: false as const, status: 400 as const, error: "Card has no book value." };
      }

      const offerBps = generateOfferBps();
      const expiresAt = addHours(now, 24);

      const offer = await tx.shopOffer.create({
        data: { userId: user.id, cardId, offerBps, expiresAt },
        select: { id: true, offerBps: true, createdAt: true, expiresAt: true },
      });

      return { ok: true as const, status: 200 as const, offer, reused: false };
    });

    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, offer: result.offer, reused: result.reused }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to create offer.", extra: shortErr(e) }, { status: 500 });
  }
}
