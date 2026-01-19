import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx =
  | { params: { productSetId?: string; productsetid?: string } }
  | { params: Promise<{ productSetId?: string; productsetid?: string }> };

async function getParam(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;

  const raw = params?.productSetId ?? params?.productsetid;

  // Next can sometimes pass already-decoded; decode safely either way
  const id = typeof raw === "string" ? decodeURIComponent(raw) : undefined;
  return id as string | undefined;
}

export async function GET(_req: Request, ctx: Ctx) {
  const productSetId = await getParam(ctx);

  if (!productSetId || productSetId === "undefined") {
    return NextResponse.json(
      { error: "Missing productSetId in route params" },
      { status: 400 }
    );
  }

  const productSet = await prisma.productSet.findUnique({
    where: { id: productSetId },
    include: {
      product: true,
      _count: { select: { cards: true } },
      cards: {
        orderBy: [{ cardNumber: "asc" }],
        take: 200, // keep it safe for now; we can paginate later
      },
    },
  });

  if (!productSet) {
    return NextResponse.json({ error: "Product Set not found" }, { status: 404 });
  }

  return NextResponse.json(productSet);
}
