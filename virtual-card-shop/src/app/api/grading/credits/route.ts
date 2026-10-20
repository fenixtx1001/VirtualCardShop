import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { bookValueToCents, calculateGradingFeeCents } from "@/lib/grading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const id = Number(new URL(req.url).searchParams.get("cardId"));
    if (!Number.isSafeInteger(id) || id <= 0)
      return NextResponse.json({ ok: false, error: "Invalid cardId" }, { status: 400 });
    const card = await prisma.card.findUnique({
      where: { id }, select: {
        productSetId: true, bookValue: true,
        productSet: { select: { name: true, isBase: true, product: { select: { year: true, brand: true, sport: true } } } },
      },
    });
    if (!card) return NextResponse.json({ ok: false, error: "Card not found" }, { status: 404 });
    const prestige = card.productSetId ? await prisma.productSetPrestige.findUnique({
      where: { userId_productSetId: { userId: user.id, productSetId: card.productSetId } },
      select: { gradingCreditBalanceCents: true, timesCompleted: true },
    }) : null;
    const creditCount = Math.floor((prestige?.gradingCreditBalanceCents ?? 0) / 100);
    return NextResponse.json({
      ok: true, productSetId: card.productSetId, creditCount,
      prestigeLevel: prestige?.timesCompleted ?? 0,
      productSetName: card.productSet?.isBase ? "Base Set" : card.productSet?.name ?? null,
      productName: [card.productSet?.product.year, card.productSet?.product.brand, card.productSet?.product.sport].filter(Boolean).join(" "),
      creditPerCopyCents: Math.min(100, calculateGradingFeeCents(bookValueToCents(card.bookValue))),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to quote grading credits" }, { status: 500 });
  }
}
