// src/app/api/checklist/product/[productId]/route.ts
import { NextResponse } from "next/server";

// Reuse the canonical checklist route logic so behavior is identical.
// This avoids subtle bugs where different pages call different endpoints.
import { GET as CanonicalGET } from "@/app/api/checklist/[productId]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx =
  | { params: { productId?: string } }
  | { params: Promise<{ productId?: string }> };

export async function GET(req: Request, ctx: Ctx) {
  // Just forward to the canonical handler.
  // It already:
  // - requires login
  // - supports selectedUserId compare mode (read-only)
  // - supports productSetId
  // - supports pagination (page/pageSize)
  return CanonicalGET(req, ctx as any);
}
