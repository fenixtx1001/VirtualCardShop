export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type MaybePromise<T> = T | Promise<T>;
type Ctx = { params: MaybePromise<{ productId?: string }> };

async function getParams<T>(p: MaybePromise<T>) {
  return (p as any)?.then ? await (p as Promise<T>) : (p as T);
}

export async function GET(_req: Request, ctx: Ctx) {
  const { productId: raw } = await getParams(ctx.params);
  if (!raw) return NextResponse.json({ ok: false, error: "Missing productId" }, { status: 400 });

  const productId = decodeURIComponent(raw);

  const productSets = await prisma.productSet.findMany({
    where: { productId },
    orderBy: { id: "asc" },
    include: { _count: { select: { cards: true } } },
  });

  return NextResponse.json({ ok: true, productSets });
}
