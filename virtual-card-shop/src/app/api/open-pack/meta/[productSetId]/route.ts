import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveOpenPackMeta } from "@/lib/open-pack-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The dynamic segment is named productSetId for historical compatibility.
// The actual Rip page and Inventory both navigate with a PRODUCT ID.
type Ctx =
  | { params: { productSetId?: string } }
  | { params: Promise<{ productSetId?: string }> };

async function getParam(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;
  const raw = params?.productSetId;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const id = await getParam(ctx);
    if (!id || id === "undefined") {
      return NextResponse.json(
        { ok: false, error: "Missing productId" },
        { status: 400 }
      );
    }

    const meta = await resolveOpenPackMeta(id, {
      findProductById: (productId) =>
        prisma.product.findUnique({
          where: { id: productId },
          select: { id: true, packImageUrl: true },
        }),
      findLegacySetById: (productSetId) =>
        prisma.productSet.findUnique({
          where: { id: productSetId },
          select: {
            id: true,
            product: { select: { id: true, packImageUrl: true } },
          },
        }),
    });

    if (!meta) {
      return NextResponse.json(
        { ok: false, error: "Product not found" },
        { status: 404 }
      );
    }

    // This is precisely the same Product.packImageUrl as /api/inventory.
    return NextResponse.json(meta, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error: unknown) {
    console.error("Open-pack metadata failed", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load pack metadata" },
      { status: 500 }
    );
  }
}
