import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function computeBoxPriceCents(packPriceCents: number, packsPerBox: number) {
  // packPrice * packsPerBox * 0.75
  const raw = packPriceCents * packsPerBox * 0.75;
  return Math.round(raw);
}

function cleanUrl(u: unknown): string | null {
  const s = typeof u === "string" ? u.trim() : "";
  return s.length ? s : null;
}

export async function GET() {
  const products = await prisma.product.findMany({
    where: { released: true }, // only show released products in the shop
    orderBy: [{ year: "asc" }, { brand: "asc" }, { id: "asc" }],
    include: {
      _count: { select: { productSets: true } },
    },
  });

  const out = products.map((p) => {
    const pack = typeof p.packPriceCents === "number" ? p.packPriceCents : 0;
    const ppb = typeof p.packsPerBox === "number" ? p.packsPerBox : 0;

    // Prefer explicit boxPriceCents if your schema has it populated; otherwise derive
    const derivedBox = ppb > 0 ? computeBoxPriceCents(pack, ppb) : null;
    const boxPriceCents =
      typeof (p as any).boxPriceCents === "number" ? (p as any).boxPriceCents : derivedBox;

    const packImageUrl = cleanUrl((p as any).packImageUrl);
    const boxImageUrl = cleanUrl((p as any).boxImageUrl);

    // ✅ KEY FIX:
    // If boxImageUrl is missing, fall back to packImageUrl so the shop has ONE image to show.
    // (You still *display only the box image* in the UI, but this ensures something exists.)
    const displayBoxImageUrl = boxImageUrl ?? packImageUrl;

    return {
      id: p.id,
      year: p.year,
      brand: p.brand,
      sport: p.sport,

      packPriceCents: pack,
      packsPerBox: p.packsPerBox,
      boxPriceCents,

      // Return raw fields too (useful for debugging)
      packImageUrl,
      boxImageUrl,

      // ✅ Use this in the Shop page as the single displayed image
      displayBoxImageUrl,

      productSetsCount: p._count?.productSets ?? 0,
      released: p.released,

      // ✅ Debug helpers (safe to keep even for friends-only)
      debug: {
        hasPackImage: !!packImageUrl,
        hasBoxImage: !!boxImageUrl,
        displayBoxFrom: boxImageUrl ? "boxImageUrl" : packImageUrl ? "packImageUrl" : "none",
      },
    };
  });

  return NextResponse.json(out);
}
