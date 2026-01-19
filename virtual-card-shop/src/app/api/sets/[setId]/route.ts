export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ setId?: string }> };

function normalizeSetId(raw: string) {
  // Next gives params already decoded in most cases, but we normalize anyway.
  // Also trims whitespace/newlines that can sneak in from imports.
  return decodeURIComponent(raw).trim();
}

export async function GET(_req: Request, { params }: Ctx) {
  const { setId: raw } = await params;
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Missing setId" }, { status: 400 });
  }

  const setId = normalizeSetId(raw);

  // IMPORTANT: If set isn't found, return helpful debug info so we can see what's happening.
  const set = await prisma.set.findUnique({
    where: { id: setId },
    include: { _count: { select: { cards: true } } },
  });

  if (!set) {
    const sample = await prisma.set.findMany({
      select: { id: true },
      take: 25,
      orderBy: { id: "asc" },
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Set not found",
        debug: {
          rawParam: raw,
          normalizedParam: setId,
          databaseUrlSeenByApi:
            process.env.DATABASE_URL ? process.env.DATABASE_URL : "(missing)",
          sampleSetIds: sample.map((s) => s.id),
        },
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, set });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { setId: raw } = await params;
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Missing setId" }, { status: 400 });
  }

  const setId = normalizeSetId(raw);
  const body = await req.json().catch(() => ({}));

  const year =
    body.year === null || body.year === undefined || body.year === ""
      ? null
      : Number(body.year);

  const packPriceCents =
    body.packPriceCents === null ||
    body.packPriceCents === undefined ||
    body.packPriceCents === ""
      ? null
      : Number(body.packPriceCents);

  const updated = await prisma.set.update({
    where: { id: setId },
    data: {
      year: Number.isFinite(year as any) ? (year as number) : null,
      brand: body.brand ?? null,
      sport: body.sport ?? null,
      packPriceCents:
        Number.isFinite(packPriceCents as any) ? (packPriceCents as number) : 0,
    },
  });

  return NextResponse.json({ ok: true, set: updated });
}
