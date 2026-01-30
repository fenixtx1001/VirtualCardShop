// src/lib/auth-options.ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

function parseAllowlist(raw: string | undefined) {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const allowed = parseAllowlist(process.env.ALLOWED_EMAILS);

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  adapter: PrismaAdapter(prisma),

  session: { strategy: "database" },

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      // If no allowlist is set, allow anyone (you can tighten later)
      if (allowed.length === 0) return true;

      const email = (user.email ?? "").toLowerCase().trim();
      return allowed.includes(email);
    },
  },

  // Give new users starting economy immediately after they’re created by the adapter.
  events: {
    async createUser({ user }) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            // Only set if not already set (protect against future changes)
            balanceCents: (user as any).balanceCents ?? 5000, // $50
            nextRewardAt: (user as any).nextRewardAt ?? null, // can claim immediately
          },
        });
      } catch (e) {
        console.error("[auth] createUser economy init failed", e);
      }
    },
  },
};
