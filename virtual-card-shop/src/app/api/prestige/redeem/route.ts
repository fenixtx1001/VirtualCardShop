// src/app/api/prestige/redeem/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { createFinancialTransaction } from "@/lib/financial-transactions";
import { redeemPrestigeForProductSet } from "@/lib/prestige";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shortErr(e: any) {
  const code = e?.code ?? e?.name ?? "UNKNOWN";
  let message = String(e?.message ?? "Unknown error");
  if (message.length > 260) message = message.slice(0, 260) + "…";
  return { code, message };
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const body = await req.json().catch(() => ({}));
    const productSetId = String(body?.productSetId ?? "").trim();

    if (!productSetId) {
      return NextResponse.json({ ok: false, error: "Missing productSetId." }, { status: 400 });
    }

    const txResult = await prisma.$transaction(async (tx) => {
      const result = await redeemPrestigeForProductSet({ tx, userId: user.id, productSetId });

      const me = await tx.user.findUnique({
        where: { id: user.id },
        select: { balanceCents: true },
      });

      if (result.awardedCents > 0) {
        await createFinancialTransaction({
          tx,
          userId: user.id,
          category: "PRESTIGE_REWARD",
          amountCents: result.awardedCents,
          description: `Claimed prestige reward for product set ${productSetId}`,
          balanceAfterCents: me?.balanceCents ?? null,
          metadata: {
            productSetId,
            awardedCents: result.awardedCents,
            setValue: result.setValue,
            fromLevel: result.fromLevel,
            toLevel: result.toLevel,
            currentLevel: result.currentLevel,
            claimable: result.claimable,
          },
        });
      }

      return {
        result,
        balanceCents: me?.balanceCents ?? 0,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        result: txResult.result,
        balanceCents: txResult.balanceCents,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Failed to redeem prestige.", extra: shortErr(e) },
      { status: 500 }
    );
  }
}