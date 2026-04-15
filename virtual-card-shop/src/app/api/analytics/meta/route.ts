import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function uniqueSortedStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function uniqueSortedYears(values: Array<number | null | undefined>) {
  return Array.from(
    new Set(values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)))
  ).sort((a, b) => b - a);
}

export async function GET() {
  try {
    await requireUser();

    const [products, productSets] = await Promise.all([
      prisma.product.findMany({
        select: {
          id: true,
          year: true,
          brand: true,
          sport: true,
        },
        orderBy: [{ year: "desc" }, { brand: "asc" }, { id: "asc" }],
      }),
      prisma.productSet.findMany({
        select: {
          id: true,
          name: true,
          productId: true,
        },
        orderBy: [{ productId: "asc" }, { id: "asc" }],
      }),
    ]);

    return NextResponse.json(
      {
        ok: true,
        sports: uniqueSortedStrings(products.map((p) => p.sport)),
        years: uniqueSortedYears(products.map((p) => p.year)),
        brands: uniqueSortedStrings(products.map((p) => p.brand)),
        products: products.map((p) => ({
          id: p.id,
          label: [p.year, p.brand, p.sport].filter(Boolean).join(" ").trim() || p.id,
        })),
        productSets: productSets.map((ps) => ({
          id: ps.id,
          productId: ps.productId,
          label: (ps.name ?? "").trim() || ps.id.replace(/_/g, " "),
        })),
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load analytics metadata." },
      { status: 500 }
    );
  }
}