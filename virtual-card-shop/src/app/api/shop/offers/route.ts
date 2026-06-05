// src/app/api/shop/offers/route.ts
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

function isActiveOffer(o: { acceptedAt: Date | null; expiresAt: Date }, now: Date) {
  return !o.acceptedAt && o.expiresAt.getTime() > now.getTime();
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
 * - user must own at least 1 of the card across all grading buckets
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
      // 1) cap active offers
      const activeCount = await tx.shopOffer.count({
        where: { userId: user.id, acceptedAt: null, expiresAt: { gt: now } },
      });
      if (activeCount >= 15) {
        return {
          ok: false as const,
          status: 429 as const,
          error: "Offer limit reached (15 active offers). Accept or wait for some offers to expire.",
        };
      }

      // 2) ensure no active offer for this card
      const existing = await tx.shopOffer.findFirst({
        where: { userId: user.id, cardId, acceptedAt: null, expiresAt: { gt: now } },
        select: { id: true, offerBps: true, createdAt: true, expiresAt: true, acceptedAt: true },
      });
      if (existing && isActiveOffer({ acceptedAt: existing.acceptedAt, expiresAt: existing.expiresAt }, now)) {
        return { ok: true as const, status: 200 as const, offer: existing, reused: true };
      }

      // 3) verify user owns at least 1 copy across all grades.
      // CardOwnership is now bucketed by grade:
      // grade 0 = raw, grades 6-10 = VCS graded.
      const ownershipAgg = await tx.cardOwnership.aggregate({
        where: {
          userId: user.id,
          cardId,
          quantity: { gt: 0 },
        },
        _sum: { quantity: true },
      });

      const totalOwned = Number(ownershipAgg._sum.quantity ?? 0);
      if (totalOwned <= 0) {
        return { ok: false as const, status: 400 as const, error: "You do not own this card." };
      }

      // 4) get card for display / sanity
      const card = await tx.card.findUnique({
        where: { id: cardId },
        select: { id: true, bookValue: true, player: true, cardNumber: true },
      });
      if (!card) {
        return { ok: false as const, status: 404 as const, error: "Card not found." };
      }

      // Optional: disallow offers for $0 cards
      const perCardCents = bookValueToPerCardCents(card.bookValue);
      if (perCardCents <= 0) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "This card has no book value. Offers are only available for cards with a positive book value.",
        };
      }

      // 5) create offer
      const offerBps = generateOfferBps();
      const expiresAt = addHours(now, 24);

      const offer = await tx.shopOffer.create({
        data: { userId: user.id, cardId, offerBps, expiresAt },
        select: { id: true, offerBps: true, createdAt: true, expiresAt: true, acceptedAt: true },
      });

      return { ok: true as const, status: 200 as const, offer, reused: false };
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, offer: result.offer, reused: result.reused }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to create offer.", extra: shortErr(e) }, { status: 500 });
  }
}