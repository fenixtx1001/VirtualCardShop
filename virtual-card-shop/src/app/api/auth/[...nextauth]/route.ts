import NextAuth from "next-auth";
import { authOptions } from "@/auth";

// Support both NextAuth styles:
// - v4: NextAuth(authOptions) returns a handler function
// - v5: NextAuth(authOptions) returns { handlers: { GET, POST }, ... }
const result: any = NextAuth(authOptions as any);

export const GET = result?.handlers?.GET ?? result;
export const POST = result?.handlers?.POST ?? result;
