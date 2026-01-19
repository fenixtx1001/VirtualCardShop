export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type MaybePromise<T> = T | Promise<T>;
type Ctx = { params: MaybePromise<{ productSetId?: string }> };

async function getParams<T>(p: MaybePromise<T>) {
  return (p as any)?.then ? await (p as Promise<T>) : (p as T);
}

function cardNumberKey(s: string) {
  const m = String(s ?? "").match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { productSetId: raw } = await getParams(ctx.params);
  if (!raw) return NextResponse.json({ ok: false, error: "Missing productSetId" }, { status: 400 });

  const productSetId = decodeURIComponent(raw);

  const productSetExists = await prisma.productSet.findUnique({ where: { id: productSetId }, select: { id: true } });
  if (!productSetExists) return NextResponse.json({ ok: false, error: "ProductSet not found" }, { status: 404 });

  const cards = await prisma.card.findMany({
    where: { productSetId },
  });

  cards.sort((a, b) => {
    const an = cardNumberKey(a.cardNumber);
    const bn = cardNumberKey(b.cardNumber);
    if (an !== bn) return an - bn;

    return String(a.cardNumber ?? "").localeCompare(String(b.cardNumber ?? ""), undefined, { numeric: true, sensitivity: "base" });
  });

  return NextResponse.json({ ok: true, cards });
}
