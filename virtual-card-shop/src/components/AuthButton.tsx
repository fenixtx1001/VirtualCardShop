"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export default function AuthButton() {
  const { data, status } = useSession();

  if (status === "loading") return null;

  if (!data?.user) {
    return (
      <button
        onClick={() => signIn("google")}
        style={{
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #ccc",
          background: "white",
          fontWeight: 800,
        }}
      >
        Sign in
      </button>
    );
  }

  return (
    <button
      onClick={() => signOut()}
      style={{
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid #ccc",
        background: "white",
        fontWeight: 800,
      }}
      title={data.user.email ?? undefined}
    >
      Sign out
    </button>
  );
}
