"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ProductSetRow = {
  id: string;
  name: string | null;
  isBase: boolean;
  oddsPerPack: number | null;
  _count?: { cards: number };
};

type Product = {
  id: string;
  year: number | null;
  brand: string | null;
  sport: string | null;
  packPriceCents: number | null;
  packsPerBox: number | null;
  packImageUrl: string | null;
  boxImageUrl: string | null;
  productSets: ProductSetRow[];
  _count?: { productSets: number };
};

function centsToDollars(cents: number | null | undefined) {
  const c = typeof cents === "number" ? cents : 0;
  return (c / 100).toFixed(2);
}

// Accepts "$0.75", "0.75", ".75"
function dollarsToCentsLoose(input: string) {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export default function ProductDetailClient({ productId }: { productId: string }) {
  const [data, setData] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ✅ Uncontrolled input ref + key to reset defaultValue on reload
  const packPriceRef = useRef<HTMLInputElement | null>(null);
  const [packPriceKey, setPackPriceKey] = useState(0);

  // Create Product Set form state
  const [psId, setPsId] = useState("");
  const [psName, setPsName] = useState("");
  const [psIsBase, setPsIsBase] = useState(true);
  const [psOdds, setPsOdds] = useState<string>("");
  const [creatingPS, setCreatingPS] = useState(false);

  async function load() {
    if (!productId || productId === "undefined") {
      setError(`Missing productId in URL (received: "${productId}")`);
      setData(null);
      return;
    }

    setError(null);

    const res = await fetch(`/api/products/${encodeURIComponent(productId)}`, { cache: "no-store" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j?.error ?? `Failed to load product (${res.status})`);
      setData(null);
      return;
    }

    const j = (await res.json()) as Product;
    setData(j);

    // ✅ force pack price input to re-mount with new defaultValue
    setPackPriceKey((k) => k + 1);

    if (!psId) {
      setPsId(`${productId}_Base`);
      setPsName("Base");
      setPsIsBase(true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function patch(p: Partial<Product>) {
    setData((prev) => (prev ? { ...prev, ...p } : prev));
  }

  function commitPackPriceDisplayFormatting() {
    const el = packPriceRef.current;
    if (!el) return;
    const cents = dollarsToCentsLoose(el.value);
    el.value = centsToDollars(cents);
  }

  async function save() {
    if (!data) return;

    // ✅ Read directly from the input (guaranteed to be what user typed)
    const raw = packPriceRef.current?.value ?? "0";
    const packPriceCentsToSave = dollarsToCentsLoose(raw);

    // normalize display after save click
    if (packPriceRef.current) {
      packPriceRef.current.value = centsToDollars(packPriceCentsToSave);
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: data.year,
          brand: data.brand,
          sport: data.sport,
          packPriceCents: packPriceCentsToSave,
          packsPerBox: data.packsPerBox,
          packImageUrl: data.packImageUrl,
          boxImageUrl: data.boxImageUrl,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Save failed (${res.status})`);
      }

      await load();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function createProductSet() {
    const id = psId.trim();
    if (!id) return;

    setCreatingPS(true);
    setError(null);
    try {
      const res = await fetch("/api/product-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          productId,
          name: psName.trim() ? psName.trim() : null,
          isBase: psIsBase,
          oddsPerPack: psOdds.trim() === "" ? null : Number(psOdds),
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Create Product Set failed (${res.status})`);
      }

      if (psIsBase) {
        setPsIsBase(false);
        setPsName("Elite");
        setPsId(`${productId}_Elite`);
      } else {
        setPsId("");
        setPsName("");
      }
      setPsOdds("");

      await load();
    } catch (e: any) {
      setError(e?.message ?? "Create Product Set failed");
    } finally {
      setCreatingPS(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 32, fontWeight: 800 }}>Admin: Product Detail</h1>

      <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
        <Link href="/admin/products" style={{ textDecoration: "underline" }}>
          ← Back to Products
        </Link>
        <Link href="/admin/product-sets" style={{ textDecoration: "underline" }}>
          Admin: Product Sets
        </Link>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {error && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {error}
        </div>
      )}

      {!data ? (
        <div>Loading…</div>
      ) : (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{data.id}</h2>

          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, maxWidth: 760 }}>
            <label>Year</label>
            <input
              value={data.year ?? ""}
              onChange={(e) => patch({ year: e.target.value === "" ? null : Number(e.target.value) })}
              style={{ padding: 8 }}
            />

            <label>Brand</label>
            <input value={data.brand ?? ""} onChange={(e) => patch({ brand: e.target.value || null })} style={{ padding: 8 }} />

            <label>Sport</label>
            <input value={data.sport ?? ""} onChange={(e) => patch({ sport: e.target.value || null })} style={{ padding: 8 }} />

            <label>Pack Price ($)</label>
            <input
              key={packPriceKey}
              ref={packPriceRef}
              type="text"
              inputMode="decimal"
              defaultValue={centsToDollars(data.packPriceCents)}
              onBlur={commitPackPriceDisplayFormatting}
              placeholder="0.75"
              style={{ padding: 8 }}
            />

            <label>Packs per Box</label>
            <input
              value={data.packsPerBox ?? ""}
              onChange={(e) => patch({ packsPerBox: e.target.value === "" ? null : Number(e.target.value) })}
              style={{ padding: 8 }}
            />

            <label>Pack Image URL</label>
            <input
              value={data.packImageUrl ?? ""}
              onChange={(e) => patch({ packImageUrl: e.target.value || null })}
              style={{ padding: 8 }}
            />

            <label>Box Image URL</label>
            <input
              value={data.boxImageUrl ?? ""}
              onChange={(e) => patch({ boxImageUrl: e.target.value || null })}
              style={{ padding: 8 }}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <button onClick={save} disabled={saving} style={{ padding: "8px 12px" }}>
              {saving ? "Saving…" : "Save Product"}
            </button>
          </div>

          <hr style={{ margin: "18px 0" }} />

          <h3 style={{ fontSize: 18, fontWeight: 800 }}>Create Product Set</h3>
          <p style={{ marginTop: 6 }}>
            These are the “pools” inside the product (Base, Elite, etc.). Cards will eventually belong to a Product Set via{" "}
            <code>productSetId</code>.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, maxWidth: 760 }}>
            <label>Product Set ID</label>
            <input value={psId} onChange={(e) => setPsId(e.target.value)} style={{ padding: 8 }} />

            <label>Name</label>
            <input value={psName} onChange={(e) => setPsName(e.target.value)} style={{ padding: 8 }} />

            <label>Is Base?</label>
            <input
              type="checkbox"
              checked={psIsBase}
              onChange={(e) => setPsIsBase(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />

            <label>Odds per Pack</label>
            <input
              value={psOdds}
              onChange={(e) => setPsOdds(e.target.value)}
              placeholder='Optional (e.g. 84 for "1:84")'
              style={{ padding: 8 }}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <button onClick={createProductSet} disabled={creatingPS || !psId.trim()} style={{ padding: "8px 12px" }}>
              {creatingPS ? "Creating…" : "Create Product Set"}
            </button>
          </div>

          <hr style={{ margin: "18px 0" }} />

          <h3 style={{ fontSize: 18, fontWeight: 800 }}>Existing Product Sets</h3>

          <div style={{ overflowX: "auto", border: "1px solid #ddd", marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f7f7f7" }}>
                <tr>
                  {["Product Set ID", "Name", "Base?", "Odds (1:X packs)", "Cards"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.productSets.map((ps, idx) => (
                  <tr key={ps.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 700 }}>{ps.id}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{ps.name ?? "—"}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{ps.isBase ? "Yes" : "No"}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{ps.oddsPerPack ?? "—"}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{ps._count?.cards ?? "—"}</td>
                  </tr>
                ))}
                {data.productSets.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 12 }}>
                      No product sets yet for this product.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
