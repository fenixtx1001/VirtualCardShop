"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ImageUploader from "@/components/ImageUploader";

type ProductRow = {
  id: string;
  year: number | null;
  brand: string | null;
  sport: string | null;
  packPriceCents: number | null;
  packsPerBox: number | null;
  packImageUrl: string | null;
  boxImageUrl: string | null;
  released: boolean; // ✅ NEW
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

export default function ProductsClient() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newId, setNewId] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // ✅ per-row buffered display value for Pack Price input
  const [packPriceDisplay, setPackPriceDisplay] = useState<Record<string, string>>({});

  function setPackDisplay(id: string, v: string) {
    setPackPriceDisplay((prev) => ({ ...prev, [id]: v }));
  }

  function getPackDisplay(r: ProductRow) {
    return packPriceDisplay[r.id] ?? centsToDollars(r.packPriceCents);
  }

  function commitPackDisplayToCents(id: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const raw = packPriceDisplay[id] ?? centsToDollars(r.packPriceCents);
        const cents = dollarsToCentsLoose(raw);
        return { ...r, packPriceCents: cents };
      })
    );

    // normalize display string to 2 decimals after commit
    setPackPriceDisplay((prev) => {
      const raw = prev[id];
      const cents = dollarsToCentsLoose(raw ?? "0");
      return { ...prev, [id]: centsToDollars(cents) };
    });
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load products (${res.status})`);
      const data = (await res.json()) as ProductRow[];

      // ✅ safety: if older API responses don't include released, default false
      const normalized = data.map((r: any) => ({
        ...r,
        released: typeof r.released === "boolean" ? r.released : false,
      })) as ProductRow[];

      setRows(normalized);

      // ✅ initialize buffered pack price display values from server data
      const map: Record<string, string> = {};
      for (const r of normalized) map[r.id] = centsToDollars(r.packPriceCents);
      setPackPriceDisplay(map);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => a.id.localeCompare(b.id));
  }, [rows]);

  function updateRow(id: string, patch: Partial<ProductRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveRow(row: ProductRow) {
    setSavingId(row.id);
    setError(null);
    try {
      // ✅ ensure pack price is committed before save
      commitPackDisplayToCents(row.id);

      // We need the most current version of the row (after commit),
      // so read it from state right before sending.
      const latest = (() => {
        const found = rows.find((r) => r.id === row.id);
        if (!found) return row;
        // If commit hasn't re-rendered yet, compute cents directly from display
        const cents = dollarsToCentsLoose(
          packPriceDisplay[row.id] ?? centsToDollars(found.packPriceCents)
        );
        return { ...found, packPriceCents: cents };
      })();

      const res = await fetch(`/api/products/${encodeURIComponent(latest.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: latest.year,
          brand: latest.brand,
          sport: latest.sport,
          packPriceCents: latest.packPriceCents ?? 0,
          packsPerBox: latest.packsPerBox,
          packImageUrl: latest.packImageUrl,
          boxImageUrl: latest.boxImageUrl,
          released: latest.released, // ✅ NEW
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
      setSavingId(null);
    }
  }

  async function createProduct() {
    const id = newId.trim();
    if (!id) return;

    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Create failed (${res.status})`);
      }
      setNewId("");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 32, fontWeight: 800 }}>Admin: Products</h1>
      <p style={{ marginTop: 6 }}>
        Products are what users buy in the shop (pack/box identity). Each Product has one or more Product Sets (Base, Elite, etc.).
      </p>

      <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
        <Link href="/admin" style={{ textDecoration: "underline" }}>
          ← Admin Home
        </Link>
        <Link href="/" style={{ textDecoration: "underline" }}>
          Home
        </Link>
        <Link href="/admin/sets" style={{ textDecoration: "underline" }}>
          Admin: Sets (legacy)
        </Link>
        <Link href="/admin/product-sets" style={{ textDecoration: "underline" }}>
          Admin: Product Sets
        </Link>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <input
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          placeholder='New Product ID (e.g. "1991_Donruss_Baseball")'
          style={{ padding: 8, width: 360 }}
        />
        <button
          onClick={createProduct}
          disabled={creating || !newId.trim()}
          style={{ padding: "8px 12px" }}
        >
          {creating ? "Creating..." : "Create Product"}
        </button>
        <button onClick={load} style={{ padding: "8px 12px" }}>
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
              <tr>
                {[
                  "Product ID",
                  "Year",
                  "Brand",
                  "Sport",
                  "Released", // ✅ NEW
                  "Pack Price ($)",
                  "Packs/Box",
                  "Product Sets",
                  "Pack Image",
                  "Box Image",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: 8,
                      borderBottom: "1px solid #ddd",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r, idx) => {
                const zebra = idx % 2 === 0 ? "#fff" : "#fcfcfc";
                const saving = savingId === r.id;

                return (
                  <tr key={r.id} style={{ background: zebra }}>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                      <Link
                        href={`/admin/products/${encodeURIComponent(r.id)}`}
                        style={{ textDecoration: "underline", fontWeight: 700 }}
                      >
                        {r.id}
                      </Link>
                    </td>

                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      <input
                        value={r.year ?? ""}
                        onChange={(e) =>
                          updateRow(r.id, { year: e.target.value === "" ? null : Number(e.target.value) })
                        }
                        style={{ width: 90, padding: 6 }}
                      />
                    </td>

                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      <input
                        value={r.brand ?? ""}
                        onChange={(e) => updateRow(r.id, { brand: e.target.value || null })}
                        style={{ width: 180, padding: 6 }}
                      />
                    </td>

                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      <input
                        value={r.sport ?? ""}
                        onChange={(e) => updateRow(r.id, { sport: e.target.value || null })}
                        style={{ width: 140, padding: 6 }}
                      />
                    </td>

                    {/* ✅ Released checkbox */}
                    <td
                      style={{
                        padding: 8,
                        borderBottom: "1px solid #eee",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!r.released}
                        onChange={(e) => updateRow(r.id, { released: e.target.checked })}
                      />
                    </td>

                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      {/* ✅ buffered string, commit on blur */}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={getPackDisplay(r)}
                        onChange={(e) => setPackDisplay(r.id, e.target.value)}
                        onBlur={() => commitPackDisplayToCents(r.id)}
                        style={{ width: 110, padding: 6 }}
                      />
                    </td>

                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      <input
                        value={r.packsPerBox ?? ""}
                        onChange={(e) =>
                          updateRow(r.id, { packsPerBox: e.target.value === "" ? null : Number(e.target.value) })
                        }
                        style={{ width: 110, padding: 6 }}
                      />
                    </td>

                    <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                      {r._count?.productSets ?? "—"}
                    </td>

                    {/* ✅ Pack image uploader + URL input */}
                    <td style={{ padding: 8, borderBottom: "1px solid #eee", minWidth: 340 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <ImageUploader
                          label="Pack image"
                          value={r.packImageUrl}
                          onUploaded={(url) => updateRow(r.id, { packImageUrl: url })}
                        />
                        <input
                          value={r.packImageUrl ?? ""}
                          onChange={(e) => updateRow(r.id, { packImageUrl: e.target.value || null })}
                          placeholder='Or paste URL (e.g. "/uploads/..." )'
                          style={{ width: 320, padding: 6 }}
                        />
                      </div>
                    </td>

                    {/* ✅ Box image uploader + URL input */}
                    <td style={{ padding: 8, borderBottom: "1px solid #eee", minWidth: 340 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <ImageUploader
                          label="Box image"
                          value={r.boxImageUrl}
                          onUploaded={(url) => updateRow(r.id, { boxImageUrl: url })}
                        />
                        <input
                          value={r.boxImageUrl ?? ""}
                          onChange={(e) => updateRow(r.id, { boxImageUrl: e.target.value || null })}
                          placeholder='Or paste URL (e.g. "/uploads/..." )'
                          style={{ width: 320, padding: 6 }}
                        />
                      </div>
                    </td>

                    <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => saveRow(r)}
                        disabled={saving}
                        style={{ padding: "6px 10px", marginRight: 8 }}
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <Link href={`/admin/products/${encodeURIComponent(r.id)}`} style={{ textDecoration: "underline" }}>
                        Details →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ padding: 12 }}>
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
