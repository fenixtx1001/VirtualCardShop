// src/app/page.tsx
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ fontSize: 36, fontWeight: 800, margin: "0 0 12px 0" }}>Virtual Card Shop</h1>
      <p style={{ marginTop: 0 }}>Open packs, build your collection, and complete sets.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        <Link href="/shop" style={{ textDecoration: "underline", fontWeight: 700 }}>
          Go to Shop
        </Link>

        <Link href="/inventory" style={{ textDecoration: "underline", fontWeight: 700 }}>
          View Inventory (unopened packs)
        </Link>

        <Link href="/collection" style={{ textDecoration: "underline", fontWeight: 700 }}>
          View Collection (opened cards)
        </Link>

        <Link href="/rip-log" style={{ textDecoration: "underline", fontWeight: 700 }}>
          Rip Log
        </Link>

        <Link href="/admin" style={{ textDecoration: "underline", fontWeight: 700 }}>
          Admin (admins only)
        </Link>
      </div>
    </main>
  );
}
