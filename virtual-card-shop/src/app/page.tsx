import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 36, fontWeight: 900, marginTop: 0 }}>Virtual Card Shop</h1>
      <p style={{ marginTop: 6 }}>
        Open packs, build your collection, and complete sets.
      </p>

      <div style={{ marginTop: 16, display: "grid", gap: 10, maxWidth: 520 }}>
        <Link href="/shop" style={{ textDecoration: "underline", fontWeight: 800 }}>
          Go to Shop
        </Link>
        <Link href="/inventory" style={{ textDecoration: "underline", fontWeight: 800 }}>
          View Inventory (unopened packs)
        </Link>
        <Link href="/collection" style={{ textDecoration: "underline", fontWeight: 800 }}>
          View Collection (opened cards)
        </Link>
        <Link href="/rip-pack" style={{ textDecoration: "underline", fontWeight: 800 }}>
          Rip a Pack
        </Link>
        <Link href="/rip-log" style={{ textDecoration: "underline", fontWeight: 800 }}>
          Rip Log
        </Link>
        <Link href="/admin" style={{ textDecoration: "underline", fontWeight: 800 }}>
          Admin (admins only)
        </Link>
      </div>
    </main>
  );
}
