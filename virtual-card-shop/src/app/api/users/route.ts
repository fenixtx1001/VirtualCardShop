// src/app/api/users/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns a list of users for the "Viewing:" dropdown.
 * For now: returns all users (authenticated).
 * Later: restrict to "viewable users" (same universe / friends / admin).
 */
export async function GET() {
  try {
    const me = await requireUser();

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });

    // Put "Me" first in the list by ensuring current user appears at top.
    const meRow = users.find((u) => u.id === me.id);
    const rest = users.filter((u) => u.id !== me.id);

    return NextResponse.json({
      ok: true,
      users: meRow ? [meRow, ...rest] : users,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load users" },
      { status }
    );
  }
}
