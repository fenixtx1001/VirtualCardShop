// src/app/api/shop/singles/offers/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { addHours, bookValueToPerCardCents, generateOfferBps } from "@/lib/shop-offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OFFER_HOURS = 24;
const LOCKOUT_HOURS = 24;

function shortErr(e: any) {
  const code = e?.code ?? e?.name ?? "UNKNOWN";
  let message = String(e?.message ?? "Unknown error");
  if (message.length > 260) message = message.slice(0, 260) + "…";
  return { code, message };
}

function hoursRemainingFromMs(ms: number) {
  return Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
}

function lockoutMessage(until: Date, now: Date) {
  const hours = hoursRemainingFromMs(until.getTime() - now.getTime());
  return `The shop recently quoted this card. You can request another offer for this card in about ${hours} hour${hours === 1 ? "" : "s"}.`;
}

const offerCardSelect = {
  id: true,
  player: true,
  cardNumber: true,
  team: true,
  subset: true,
  variant: true,
  bookValue: true,
  frontImageUrl: true,
  productSetId: true,
} as const;

const offerSelect = {
  id: true,
  userId: true,
  cardId: true,
  offerBps: true,
  createdAt: true,
  expiresAt: true,
  acceptedAt: true,
  rejectedAt: true,
  acceptedQty: true,
  acceptedTotalCents: true,
  card: { select: offerCardSelect },
} as const;

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
        rejectedAt: null,
        expiresAt: { gt: now },
      },
      select: offerSelect,
      orderBy: [{ expiresAt: "asc" }],
      take: 200,
    });

    return NextResponse.json({ ok: true, offers }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to load offers.", extra: shortErr(e) }, { status: 500 });
  }
}

/**
 * PATCH: reject an active offer
 * Body: { offerId: number, action: "reject" }
 *
 * Rejection closes the offer and starts a 24-hour card-level lockout.
 */
export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const offerId = Number(body?.offerId);
    const action = String(body?.action ?? "").toLowerCase();

    if (action !== "reject") {
      return NextResponse.json({ ok: false, error: "Unsupported offer action." }, { status: 400 });
    }

    if (!Number.isFinite(offerId) || offerId <= 0) {
      return NextResponse.json({ ok: false, error: "Missing or invalid offerId." }, { status: 400 });
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const offer = await tx.shopOffer.findUnique({
        where: { id: offerId },
        select: {
          id: true,
          userId: true,
          cardId: true,
          expiresAt: true,
          acceptedAt: true,
          rejectedAt: true,
        },
      });

      if (!offer) return { ok: false as const, status: 404 as const, error: "Offer not found." };
      if (offer.userId !== user.id) return { ok: false as const, status: 403 as const, error: "Not allowed." };
      if (offer.acceptedAt) return { ok: false as const, status: 400 as const, error: "Offer already accepted." };
      if (offer.rejectedAt) return { ok: false as const, status: 400 as const, error: "Offer already rejected." };
      if (offer.expiresAt.getTime() <= now.getTime()) {
        return { ok: false as const, status: 400 as const, error: "Offer already expired." };
      }

      const updated = await tx.shopOffer.update({
        where: { id: offer.id },
        data: { rejectedAt: now },
        select: offerSelect,
      });

      const lockedUntil = addHours(now, LOCKOUT_HOURS);
      return { ok: true as const, status: 200 as const, offer: updated, lockedUntil };
    });

    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, offer: result.offer, lockedUntil: result.lockedUntil }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to reject offer.", extra: shortErr(e) }, { status: 500 });
  }
}

/**
 * POST: request an offer for a card
 * Body: { cardId: number }
 *
 * Rules:
 * - no global active-offer cap
 * - no new offer for a card if an active offer for that card exists
 * - accepted offers close cleanly and do not create a lockout
 * - rejected offers lock the same card out for 24 hours
 * - expired offers also lock the same card out for 24 hours after expiry
 * - user must own at least 1 copy across all grade buckets
 * - offer lasts 24 hours
 *
 * Note:
 * This route creates card-level offers. Selling requires the user
 * to intentionally choose the exact grade bucket to sell.
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
    const lockoutWindowStart = new Date(now.getTime() - LOCKOUT_HOURS * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      // Reuse existing active offer for this card.
      const existing = await tx.shopOffer.findFirst({
        where: {
          userId: user.id,
          cardId,
          acceptedAt: null,
          rejectedAt: null,
          expiresAt: { gt: now },
        },
        select: offerSelect,
      });
      if (existing) {
        return { ok: true as const, status: 200 as const, offer: existing, reused: true };
      }

      // Rejected offers create a 24-hour card-level lockout.
      const recentRejected = await tx.shopOffer.findFirst({
        where: {
          userId: user.id,
          cardId,
          acceptedAt: null,
          rejectedAt: { gt: lockoutWindowStart },
        },
        orderBy: [{ rejectedAt: "desc" }],
        select: { rejectedAt: true },
      });

      if (recentRejected?.rejectedAt) {
        const lockedUntil = addHours(recentRejected.rejectedAt, LOCKOUT_HOURS);
        return {
          ok: false as const,
          status: 429 as const,
          error: lockoutMessage(lockedUntil, now),
          lockedUntil,
        };
      }

      // Expired, unaccepted, unrejected offers also create a 24-hour card-level lockout.
      const recentExpired = await tx.shopOffer.findFirst({
        where: {
          userId: user.id,
          cardId,
          acceptedAt: null,
          rejectedAt: null,
          expiresAt: { lte: now, gt: lockoutWindowStart },
        },
        orderBy: [{ expiresAt: "desc" }],
        select: { expiresAt: true },
      });

      if (recentExpired?.expiresAt) {
        const lockedUntil = addHours(recentExpired.expiresAt, LOCKOUT_HOURS);
        return {
          ok: false as const,
          status: 429 as const,
          error: lockoutMessage(lockedUntil, now),
          lockedUntil,
        };
      }

      // Must own at least 1 copy across raw + graded buckets.
      const ownedAgg = await tx.cardOwnership.aggregate({
        where: {
          userId: user.id,
          cardId,
          quantity: { gt: 0 },
        },
        _sum: { quantity: true },
      });

      const totalOwned = Number(ownedAgg._sum.quantity ?? 0);
      if (totalOwned <= 0) {
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
      const expiresAt = addHours(now, OFFER_HOURS);

      const offer = await tx.shopOffer.create({
        data: { userId: user.id, cardId, offerBps, expiresAt },
        select: offerSelect,
      });

      return { ok: true as const, status: 200 as const, offer, reused: false };
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, lockedUntil: "lockedUntil" in result ? result.lockedUntil : undefined },
        { status: result.status }
      );
    }

    return NextResponse.json({ ok: true, offer: result.offer, reused: result.reused }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to create offer.", extra: shortErr(e) }, { status: 500 });
  }
}
