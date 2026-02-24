// src/app/api/shop/singles/inventory/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const page = clampInt(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1, 100000);
    const pageSize = clampInt(parseInt(url.searchParams.get("pageSize") ?? "40", 10) || 40, 1, 100);

    const whereInv: any = { quantity: { gt: 0 } };

    // If q is present, filter through Card fields
    const cardWhere =
      q.length > 0
        ? {
            OR: [
              { player: { contains: q, mode: "insensitive" } },
              { team: { contains: q, mode: "insensitive" } },
              { cardNumber: { contains: q, mode: "insensitive" } },
              { subset: { contains: q, mode: "insensitive" } },
              { variant: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined;

    const [total, rows] = await prisma.$transaction([
      prisma.shopInventory.count({
        where: { ...whereInv, ...(cardWhere ? { card: cardWhere } : {}) },
      }),
      prisma.shopInventory.findMany({
        where: { ...whereInv, ...(cardWhere ? { card: cardWhere } : {}) },
        include: {
          card: {
            select: {
              id: true,
              player: true,
              team: true,
              cardNumber: true,
              subset: true,
              variant: true,
              bookValue: true,
              frontImageUrl: true,
              productSetId: true,
            },
          },
        },
        orderBy: [{ quantity: "desc" }, { updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json({ ok: true, q, page, pageSize, total, totalPages, rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed to load shop inventory." }, { status: 500 });
  }
}
