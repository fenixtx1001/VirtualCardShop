import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { repriceProduct } from "@/lib/pack-pricing";
import {
  parsePackRarityConfig,
  replaceBaseSubsetOdds,
  validateRarityInventory,
  type PackRarityConfig,
} from "@/lib/pack-rarity";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ productId: string }> };
type SubsetRow = { subset: string | null; count: number };

function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function loadProduct(productId: string) {
  return prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      released: true,
      cardsPerPack: true,
      packRarityConfig: true,
      productSets: {
        select: { id: true, name: true, isBase: true, oddsPerPack: true },
      },
    },
  });
}

async function baseSubsets(baseSetId: string): Promise<SubsetRow[]> {
  const data = await prisma.card.groupBy({
    by: ["subset"],
    where: { productSetId: baseSetId },
    _count: { _all: true },
  });
  return data.map(row => ({
    subset: row.subset,
    count: row._count._all,
  })).sort((a, b) => b.count - a.count ||
    String(a.subset).localeCompare(String(b.subset)));
}

function displayData(
  product: NonNullable<Awaited<ReturnType<typeof loadProduct>>>,
  subsets: SubsetRow[],
  config: PackRarityConfig | null
) {
  const baseSets = product.productSets.filter(set => set.isBase);
  const baseSet = baseSets.length === 1 ? baseSets[0] : null;
  const valid = subsets.length >= 2 && subsets.every(s => s.subset?.trim());
  const conflict = baseSet?.oddsPerPack != null;
  const otherRules = config?.hits.filter(rule =>
    rule.productSetId !== baseSet?.id) ?? [];
  const baseOdds: Record<string, number> = {};
  for (const hit of config?.hits ?? []) {
    if (hit.productSetId === baseSet?.id) baseOdds[hit.subset] = hit.oddsPerPack;
  }
  return {
    ok: true,
    productId: product.id,
    released: product.released,
    baseSetId: baseSet?.id ?? null,
    baseSetName: baseSet?.name ?? "Base",
    subsets,
    configEnabled: !!config,
    fallbackSubset: config?.fallback.productSetId === baseSet?.id
      ? config.fallback.subset : null,
    oddsBySubset: baseOdds,
    otherHitGroups: otherRules.length,
    canConfigure: !!baseSet && valid && !conflict,
    reason: !baseSet
      ? "Base subset odds require exactly one Base ProductSet."
      : conflict
        ? "Clear whole-ProductSet odds before configuring Base subsets."
        : subsets.length < 2
          ? "This Base set has fewer than two distinct subsets. It already uses ordinary equal Base odds."
          : subsets.some(s => !s.subset?.trim())
            ? "Every Base card must have a named subset before per-subset odds can be enabled."
            : null,
  };
}

async function currentInventory(
  sets: Array<{ id: string; isBase: boolean; oddsPerPack: number | null }>
) {
  const all = await prisma.card.groupBy({
    by: ["productSetId", "subset"],
    where: { productSetId: { in: sets.map(set => set.id) } },
    _count: { _all: true },
  });
  return sets.map(set => ({
    ...set,
    subsets: all.filter(row => row.productSetId === set.id)
      .map(row => row.subset),
  }));
}

async function saveWithReprice(
  productId: string,
  previous: Prisma.JsonValue | null,
  next: PackRarityConfig | null
) {
  await prisma.product.update({
    where: { id: productId },
    data: {
      packRarityConfig: next
        ? next as unknown as Prisma.InputJsonValue
        : Prisma.DbNull,
    },
  });
  try {
    await repriceProduct(productId);
  } catch (error) {
    // Prevent partially updating odds if the new pricing configuration is
    // invalid or the repricing stage fails. Old data stays untouched.
    try {
      await prisma.product.update({
        where: { id: productId },
        data: {
          packRarityConfig: previous === null
            ? Prisma.DbNull
            : previous as Prisma.InputJsonValue,
        },
      });
    } catch (rollbackError) {
      console.error("Pack rarity rollback failed:", rollbackError);
    }
    throw error;
  }
}

async function authenticate() {
  try {
    await requireUser();
    return true;
  } catch {
    return false;
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  if (!await authenticate()) return fail("Unauthorized", 401);
  try {
    const { productId } = await ctx.params;
    const product = await loadProduct(productId);
    if (!product) return fail("Product not found", 404);
    const baseSets = product.productSets.filter(set => set.isBase);
    const subsets = baseSets.length === 1
      ? await baseSubsets(baseSets[0].id) : [];
    const config = parsePackRarityConfig(product.packRarityConfig);
    return NextResponse.json(displayData(product, subsets, config));
  } catch (err) {
    console.error("Failed to read Base subset odds:", err);
    return fail("Failed to load Base subset odds", 500);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  if (!await authenticate()) return fail("Unauthorized", 401);
  try {
    const { productId } = await ctx.params;
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail("Provide a valid Base odds configuration");
    }
    const input = body as Record<string, unknown>;
    const product = await loadProduct(productId);
    if (!product) return fail("Product not found", 404);
    const baseSets = product.productSets.filter(set => set.isBase);
    if (baseSets.length !== 1) {
      return fail("Exactly one Base ProductSet is required");
    }
    const baseSet = baseSets[0];
    const subsets = await baseSubsets(baseSet.id);
    const info = displayData(
      product, subsets, parsePackRarityConfig(product.packRarityConfig)
    );
    if (!info.canConfigure) return fail(info.reason ?? "Base subsets unavailable");
    const existing = parsePackRarityConfig(product.packRarityConfig);
    const foreignHits = (existing?.hits ?? [])
      .filter(rule => rule.productSetId !== baseSet.id);

    if (input.mode === "reset") {
      if (foreignHits.length > 0) {
        return fail(
          "Other rarity rules are active on this product. " +
          "Reset would remove them; edit Base odds instead."
        );
      }
      await saveWithReprice(productId, product.packRarityConfig, null);
      const updated = await loadProduct(productId);
      return NextResponse.json(displayData(updated!, subsets, null));
    }
    if (input.baseSetId !== baseSet.id) {
      return fail("The selected Base ProductSet has changed. Reload the page.");
    }
    const fallbackSubset = input.fallbackSubset;
    const odds = input.oddsBySubset;
    if (typeof fallbackSubset !== "string" ||
        !subsets.some(row => row.subset === fallbackSubset)) {
      return fail("Choose a valid common Base subset");
    }
    if (!odds || typeof odds !== "object" || Array.isArray(odds)) {
      return fail("Every non-common Base subset needs 1-in-N odds");
    }
    const values = odds as Record<string, unknown>;
    const allowed = new Set(subsets.map(row => row.subset));
    for (const key of Object.keys(values)) {
      if (!allowed.has(key)) return fail("Unexpected Base subset: " + key);
    }
    const baseHits = subsets.filter(row => row.subset !== fallbackSubset)
      .map(row => {
        const value = values[row.subset!];
        if (typeof value !== "number" || !Number.isSafeInteger(value) ||
            value < 1 || value > 1_000_000) {
          throw new Error(
            "Enter a positive whole-number pack odds value for " + row.subset
          );
        }
        return {
          productSetId: baseSet.id,
          subset: row.subset!,
          oddsPerPack: value,
        };
      });
    const config = replaceBaseSubsetOdds(
      existing,
      baseSet.id,
      fallbackSubset,
      baseHits
    );
    validateRarityInventory(
      config,
      await currentInventory(product.productSets)
    );
    await saveWithReprice(productId, product.packRarityConfig, config);
    const updated = await loadProduct(productId);
    return NextResponse.json(displayData(updated!, subsets, config));
  } catch (err) {
    console.error("Failed to save Base subset odds:", err);
    const message = err instanceof Error ? err.message : "Save failed";
    return fail(message, 400);
  }
}
