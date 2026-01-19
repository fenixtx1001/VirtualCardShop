"use client";

import { useEffect, useMemo, useState } from "react";

type ProductRow = {
  id: string;
  packPriceCents: number | null;
  packsPerBox: number | null;
  packImageUrl: string | null;
  boxImageUrl: string | null;
  _count?: { productSets: number };
};

type MeResponse = {
  user: { balanceCents: number; nextRewardAt: string | null };
};

function centsToDollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function boxPriceCents(packPriceCents: number, packsPerBox: number) {
  return Math.round(packPriceCents * packsPerBox * 0.75);
}

export default function ShopClient() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [balanceCents, setBalanceCents] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      const [pRes, meRes] = await Promise.all([
        fetch("/api/shop/products", { cache: "no-store" }),
        fetch("/api/me", { cache: "no-store" }),
      ]);

      if (!pRes.ok) throw new Error(`Failed to load products (${pRes.status})`);
      if (!meRes.ok) throw new Error(`Failed to load user (${meRes.status})`);

      const p = (await pRes.json()) as ProductRow[];
      const me = (await meRes.json()) as MeResponse;

      setProducts(p);
      setBalanceCents(me.user.balanceCents ?? 0);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(() => [...products].sort((a, b) => a.id.localeCompare(b.id)), [products]);

  async function buy(productId: string, kind: "PACK" | "BOX") {
    setBuying(`${productId}:${kind}`);
    setErr(null);
    setMsg(null);

    try {
      const res = await fetch("/api/shop/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, kind, qty: 1 }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Buy returned non-JSON (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Buy failed (${res.status})`);

      setBalanceCents(j.user?.balanceCents ?? balanceCents);
      setMsg(
        kind === "PACK"
          ? `Bought 1 pack of ${productId} for $${centsToDollars(j.spentCents)}.`
          : `Bought 1 box of ${productId} for $${centsToDollars(j.spentCents)} (+${j.packsAdded} packs).`
      );
    } catch (e: any) {
      setErr(e?.message ?? "Buy failed");
    } finally {
      setBuying(null);
    }
  }

  return (
    <main>
      <h1 style={{ fontSize: 32, fontWeight: 900, margin: "6px 0 10px" }}>Shop</h1>
      <div style={{ marginBottom: 14, fontWeight: 800 }}>
        Balance: ${centsToDollars(balanceCents)}
      </div>

      {err && <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>{err}</div>}
      {msg && <div style={{ marginBottom: 12, padding: 10, background: "#efe", border: "1px solid #9f9" }}>{msg}</div>}

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {sorted.map((p) => {
            const pack = p.packPriceCents ?? 0;
            const ppb = p.packsPerBox ?? 0;
            const canBuyPack = pack > 0;
            const canBuyBox = pack > 0 && ppb > 0;

            const box = canBuyBox ? boxPriceCents(pack, ppb) : 0;

            return (
              <div key={p.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>{p.id}</div>
                <div style={{ color: "#333", marginBottom: 10 }}>
                  Pack: {canBuyPack ? `$${centsToDollars(pack)}` : "—"}{" "}
                  {canBuyBox ? `• Box (${ppb} packs): $${centsToDollars(box)}` : ""}
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
                  {p.packImageUrl ? (
                    <img src={p.packImageUrl} alt="Pack" style={{ width: 72, height: 96, objectFit: "cover", border: "1px solid #eee" }} />
                  ) : (
                    <div style={{ width: 72, height: 96, border: "1px dashed #ccc", display: "grid", placeItems: "center", color: "#888" }}>
                      Pack
                    </div>
                  )}
                  {p.boxImageUrl ? (
                    <img src={p.boxImageUrl} alt="Box" style={{ width: 96, height: 72, objectFit: "cover", border: "1px solid #eee" }} />
                  ) : (
                    <div style={{ width: 96, height: 72, border: "1px dashed #ccc", display: "grid", placeItems: "center", color: "#888" }}>
                      Box
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={() => buy(p.id, "PACK")}
                    disabled={!canBuyPack || buying === `${p.id}:PACK`}
                    style={{ padding: "8px 12px" }}
                  >
                    {buying === `${p.id}:PACK` ? "Buying…" : "Buy Pack"}
                  </button>

                  <button
                    onClick={() => buy(p.id, "BOX")}
                    disabled={!canBuyBox || buying === `${p.id}:BOX`}
                    style={{ padding: "8px 12px" }}
                  >
                    {buying === `${p.id}:BOX` ? "Buying…" : "Buy Box"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
