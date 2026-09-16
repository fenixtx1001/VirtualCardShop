import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getShopProgress } from "@/lib/shop/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await getCurrentUser();
    const progress = user ? await getShopProgress(user.id) : {};
    return NextResponse.json({ progress }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Shop discovery failed", error);
    return NextResponse.json({ error: "Your collection recommendations are temporarily unavailable." }, { status: 500 });
  }
}
