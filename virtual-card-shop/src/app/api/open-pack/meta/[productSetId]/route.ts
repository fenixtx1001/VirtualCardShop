import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx =
  | { params: { productSetId?: string } }
  | { params: Promise<{ productSetId?: string }> };

async function getParam(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;
  const raw = params?.productSetId;
  const id = typeof raw === "string" ? decodeURIComponent(raw) : undefined;
  return id as string | undefined;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const productSetId = await getParam(ctx);

    if (!productSetId || productSetId === "undefined") {
      return NextResponse.json({ error: "Missing productSetId" }, { status: 400 });
    }

    const ps = await prisma.productSet.findUnique({
      where: { id: productSetId },
      include: {
        product: true,
      },
    });

    if (!ps) {
      return NextResponse.json({ error: "Product Set not found" }, { status: 404 });
    }

    // Prefer Product pack image (since your Shop page shows it there)
    const packImageUrl =
      (ps.product as any)?.packImageUrl ??
      (ps as any)?.packImageUrl ??
      null;

    const displayName = ps.name ?? ps.id;

    return NextResponse.json({
      ok: true,
      productSetId: ps.id,
      displayName,
      packImageUrl,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to load pack meta" },
      { status: 500 }
    );
  }
}
