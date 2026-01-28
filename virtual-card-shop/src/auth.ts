import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

function parseAllowlist(raw: string | undefined) {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const allowed = parseAllowlist(process.env.ALLOWED_EMAILS);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    async signIn({ user }) {
      // If no allowlist is set, allow anyone (not recommended)
      if (allowed.length === 0) return true;

      const email = (user.email ?? "").toLowerCase().trim();
      return allowed.includes(email);
    },
  },
});
