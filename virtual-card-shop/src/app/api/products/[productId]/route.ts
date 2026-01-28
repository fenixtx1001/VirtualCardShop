import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx =
  | { params: { productId?: string; productid?: string } }
  | { params: Promise<{ productId?: string; productid?: string }> };

async function getParam(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;
  const raw = params?.productId ?? params?.productid;
  return typeof raw === "string" ? decodeURIComponent(raw) : undefined;
}

function stringOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// ✅ NEW: safe boolean parsing (supports true/false and "true"/"false")
function boolOrUndefined(v: unknown): boolean | undefined {
  if (v === undefined) return undefined;
  if (v === null) return undefined;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "true") return true;
  if (s === "false") return false;
  return undefined;
}

export async function GET(_req: Request, ctx: Ctx) {
  const productId = await getParam(ctx);
  if (!productId || productId === "undefined") {
    return NextResponse.json({ error: "Missing productId in route params" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      productSets: { orderBy: [{ isBase: "desc" }, { isInsert: "desc" }, { id: "asc" }] },
      _count: { select: { productSets: true } },
    },
  });

  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  return NextResponse.json(product);
}

export async function PUT(req: Request, ctx: Ctx) {
  const productId = await getParam(ctx);
  if (!productId || productId === "undefined") {
    return NextResponse.json({ error: "Missing productId in route params" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      year: body?.year === "" ? null : body?.year ?? undefined,
      brand: stringOrNull(body?.brand),
      sport: stringOrNull(body?.sport),
      packPriceCents: body?.packPriceCents ?? undefined,
      packsPerBox: body?.packsPerBox ?? undefined,
      packImageUrl: stringOrNull(body?.packImageUrl),
      boxImageUrl: stringOrNull(body?.boxImageUrl),
      cardsPerPack: intOrNull(body?.cardsPerPack), // ✅
      released: boolOrUndefined(body?.released), // ✅ NEW
    },
  });

  return NextResponse.json(updated);
}
