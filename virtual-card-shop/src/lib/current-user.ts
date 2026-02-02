// src/lib/current-user.ts
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

/**
 * Returns the signed-in user, or null if not signed in.
 * No "default" fallback.
 */
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase().trim();

  if (!email) return null;

  // With PrismaAdapter, the user row should already exist,
  // but we’ll be safe and ensure it exists.
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      balanceCents: 5000, // $50.00
      nextRewardAt: null,
    },
    update: {},
  });

  return user;
}

/**
 * Same as getCurrentUser, but throws 401 if not signed in.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    const err = new Error("Unauthorized");
    (err as any).status = 401;
    throw err;
  }
  return user;
}

/**
 * Safely reads a query param from either NextRequest or standard Request.
 * - NextRequest has `.nextUrl`
 * - Request has `.url`
 */
function getQueryParam(req: Request, key: string): string | null {
  // NextRequest path
  const anyReq = req as any;
  const nextUrl = anyReq?.nextUrl;
  if (nextUrl?.searchParams?.get) {
    const v = nextUrl.searchParams.get(key);
    return v && v.trim().length ? v.trim() : null;
  }

  // Standard Request path
  try {
    const url = new URL(req.url);
    const v = url.searchParams.get(key);
    return v && v.trim().length ? v.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Returns a validated selectedUserId for READ endpoints.
 *
 * - Defaults to currentUserId (i.e., "Viewing: Me") if not provided.
 * - If provided but invalid / not found, throws 400/404.
 *
 * IMPORTANT:
 * - Use this ONLY for reads.
 * - Writes must always apply to currentUserId.
 */
export async function resolveSelectedUserId(
  req: Request,
  currentUserId: string
): Promise<string> {
  const raw = getQueryParam(req, "selectedUserId");

  // Default to me if not provided
  if (!raw) return currentUserId;

  // If the user picked "Me" (or the same id), treat as default mode
  if (raw === currentUserId) return currentUserId;

  // Validate the user exists (and later you can add "is viewable" rules here)
  const selected = await prisma.user.findUnique({
    where: { id: raw },
    select: { id: true },
  });

  if (!selected) {
    const err = new Error("Selected user not found");
    (err as any).status = 404;
    throw err;
  }

  return selected.id;
}

/**
 * Convenience helper for READ endpoints:
 * - currentUser: logged-in user
 * - selectedUserId: whose collection we're viewing (defaults to me)
 * - isCompareMode: true when selectedUserId !== currentUser.id
 */
export async function requireUserWithSelection(req: Request) {
  const currentUser = await requireUser();
  const selectedUserId = await resolveSelectedUserId(req, currentUser.id);
  const isCompareMode = selectedUserId !== currentUser.id;

  return { currentUser, selectedUserId, isCompareMode };
}
