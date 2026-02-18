// src/app/api/prestige/redeem/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { redeemPrestigeForProductSet } from "@/lib/prestige";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const body = await req.json().catch(() => ({}));
    const productSetId = String(body?.productSetId ?? "").trim();

    if (!productSetId) {
      return NextResponse.json({ ok: false, error: "Missing productSetId." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      return redeemPrestigeForProductSet({ tx, userId: user.id, productSetId });
    });

    // Also return latest balance
    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { balanceCents: true } });

    return NextResponse.json(
      {
        ok: true,
        result,
        balanceCents: me?.balanceCents ?? 0,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to redeem prestige." }, { status: 500 });
  }
}
