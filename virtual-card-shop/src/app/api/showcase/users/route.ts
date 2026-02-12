// src/app/api/showcase/users/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // ensure logged in
    await requireUser();

    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, image: true },
      orderBy: [{ name: "asc" }],
    });

    return NextResponse.json({ ok: true, users }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load users" },
      { status: 500 }
    );
  }
}
