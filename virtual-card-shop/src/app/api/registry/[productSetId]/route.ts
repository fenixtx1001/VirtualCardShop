import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { getSetRegistry } from "@/lib/graded-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  context: { params: Promise<{ productSetId: string }> }
) {
  try {
    const viewer = await requireUser();
    const { productSetId } = await context.params;
    const userId = new URL(req.url).searchParams.get("userId") || viewer.id;
    const registry = await getSetRegistry(productSetId, viewer.id, userId);
    if (!registry) return NextResponse.json({ ok: false, error: "Set not found" }, { status: 404 });
    return NextResponse.json({ ok: true, ...registry }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load graded registry" }, { status: 500 });
  }
}
