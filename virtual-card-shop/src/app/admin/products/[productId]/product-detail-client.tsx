"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ProductSetRow = {
  id: string;
  name: string | null;
  isBase: boolean;
  isInsert: boolean;
  oddsPerPack: number | null;
};

type ProductResponse = {
  id: string;
  year: number | null;
  brand: string | null;
  sport: string | null;
  packPriceCents: number | null;
  packsPerBox: number | null;
  packImageUrl: string | null;
  boxImageUrl: string | null;
  cardsPerPack: number | null; // ✅
  productSets: ProductSetRow[];
};

function dollarsToCents(s: string) {
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
function centsToDollars(cents: number | null | undefined) {
  const n = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return (n / 100).toFixed(2);
}

export default function ProductDetailClient({ productId }: { productId: string }) {
  const [data, setData] = useState<ProductResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Create product set form
  const [newSetId, setNewSetId] = useState("");
  const [newSetName, setNewSetName] = useState("Base");
  const [newIsBase, setNewIsBase] = useState(true);
  const [newIsInsert, setNewIsInsert] = useState(false);
  const [newOddsPerPack, setNewOddsPerPack] = useState<string>("");

  async function load() {
    setLoading(true);
    setPageError(null);
    setSaveOk(null);

    try {
      const res = await fetch(`/api/products/${encodeURIComponent(productId)}`, { cache: "no-store" });
      const raw = await res.text();

      let j: any;
      try {
        j = JSON.parse(raw);
      } catch {
        throw new Error(`API returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed to load (${res.status})`);

      setData(j as ProductResponse);
      setNewSetId(`${productId}_Base`);
    } catch (e: any) {
      setPageError(e?.message ?? "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function patch(patch: Partial<ProductResponse>) {
    setData((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function saveProduct() {
    if (!data) return;

    setSaving(true);
    setPageError(null);
    setSaveOk(null);

    try {
      const res = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: data.year,
          brand: data.brand,
          sport: data.sport,
          packPriceCents: data.packPriceCents ?? 0,
          packsPerBox: data.packsPerBox,
          packImageUrl: data.packImageUrl,
          boxImageUrl: data.boxImageUrl,
          cardsPerPack: data.cardsPerPack, // ✅
        }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Save returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Save failed (${res.status})`);

      setSaveOk("Saved product.");
      await load();
    } catch (e: any) {
      setPageError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function createProductSet() {
    setPageError(null);
    setSaveOk(null);

    try {
      if (newIsBase && newIsInsert) {
        throw new Error("A Product Set cannot be both Base and Insert.");
      }

      const oddsNum = newOddsPerPack.trim() === "" ? null : Number(newOddsPerPack.trim());
      const oddsPerPack = oddsNum !== null && Number.isFinite(oddsNum) ? Math.trunc(oddsNum) : null;

      const res = await fetch("/api/product-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newSetId.trim(),
          productId,
          name: newSetName.trim() || null,
          isBase: newIsBase,
          isInsert: newIsInsert,
          oddsPerPack,
        }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Create returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Create failed (${res.status})`);

      setSaveOk("Created product set.");
      await load();
    } catch (e: any) {
      setPageError(e?.message ?? "Create failed");
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 32, fontWeight: 800 }}>Admin: Product Detail</h1>

      <div style={{ marginTop: 8, display: "flex", gap: 12 }}>
        <Link href="/admin/products" style={{ textDecoration: "underline" }}>
          ← Back to Products
        </Link>
        <Link href="/admin/product-sets" style={{ textDecoration: "underline" }}>
          Admin: Product Sets
        </Link>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {pageError && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {pageError}
        </div>
      )}
      {saveOk && (
        <div style={{ marginBottom: 12, padding: 10, background: "#efe", border: "1px solid #9f9" }}>
          {saveOk}
        </div>
      )}

      {loading || !data ? (
        <div>Loading…</div>
      ) : (
        <>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>{data.id}</div>

          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 10, maxWidth: 760 }}>
            <div>Year</div>
            <input
              value={data.year ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === "") return patch({ year: null });
                const n = Number(v);
                patch({ year: Number.isFinite(n) ? Math.trunc(n) : null });
              }}
              style={{ padding: 6 }}
            />

            <div>Brand</div>
            <input value={data.brand ?? ""} onChange={(e) => patch({ brand: e.target.value || null })} style={{ padding: 6 }} />

            <div>Sport</div>
            <input value={data.sport ?? ""} onChange={(e) => patch({ sport: e.target.value || null })} style={{ padding: 6 }} />

            <div>Pack Price ($)</div>
            <input
              value={centsToDollars(data.packPriceCents)}
              onChange={(e) => patch({ packPriceCents: dollarsToCents(e.target.value) })}
              style={{ padding: 6 }}
            />

            <div>Packs per Box</div>
            <input
              value={data.packsPerBox ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === "") return patch({ packsPerBox: null });
                const n = Number(v);
                patch({ packsPerBox: Number.isFinite(n) ? Math.trunc(n) : null });
              }}
              style={{ padding: 6 }}
            />

            {/* ✅ NEW */}
            <div>Cards per Pack</div>
            <input
              value={data.cardsPerPack ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === "") return patch({ cardsPerPack: null });
                const n = Number(v);
                patch({ cardsPerPack: Number.isFinite(n) ? Math.max(1, Math.trunc(n)) : null });
              }}
              placeholder="Required for ripping"
              style={{ padding: 6 }}
            />

            <div>Pack Image URL</div>
            <input
              value={data.packImageUrl ?? ""}
              onChange={(e) => patch({ packImageUrl: e.target.value || null })}
              style={{ padding: 6 }}
            />

            <div>Box Image URL</div>
            <input
              value={data.boxImageUrl ?? ""}
              onChange={(e) => patch({ boxImageUrl: e.target.value || null })}
              style={{ padding: 6 }}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <button onClick={saveProduct} disabled={saving} style={{ padding: "8px 12px" }}>
              {saving ? "Saving..." : "Save Product"}
            </button>
          </div>

          <hr style={{ margin: "18px 0" }} />

          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Create Product Set</h2>

          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 10, maxWidth: 760 }}>
            <div>Product Set ID</div>
            <input value={newSetId} onChange={(e) => setNewSetId(e.target.value)} style={{ padding: 6 }} />

            <div>Name</div>
            <input value={newSetName} onChange={(e) => setNewSetName(e.target.value)} style={{ padding: 6 }} />

            <div>Is Base?</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={newIsBase}
                onChange={(e) => {
                  const v = e.target.checked;
                  setNewIsBase(v);
                  if (v) setNewIsInsert(false);
                }}
              />
              {newIsBase ? "Yes" : "No"}
            </label>

            <div>Is Insert?</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={newIsInsert}
                onChange={(e) => {
                  const v = e.target.checked;
                  setNewIsInsert(v);
                  if (v) setNewIsBase(false);
                }}
              />
              {newIsInsert ? "Yes" : "No"}
            </label>

            <div>Odds per Pack</div>
            <input
              value={newOddsPerPack}
              onChange={(e) => setNewOddsPerPack(e.target.value)}
              placeholder='Optional (e.g. 84 for "1:84")'
              style={{ padding: 6 }}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <button onClick={createProductSet} style={{ padding: "8px 12px" }}>
              Create Product Set
            </button>
          </div>

          <hr style={{ margin: "18px 0" }} />

          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Existing Product Sets</h2>
          <div style={{ border: "1px solid #ddd" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f7f7f7" }}>
                <tr>
                  {["Product Set ID"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.productSets ?? []).map((ps, idx) => (
                  <tr key={ps.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{ps.id}</td>
                  </tr>
                ))}
                {(data.productSets ?? []).length === 0 && (
                  <tr>
                    <td style={{ padding: 12 }}>No product sets yet.</td>
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
