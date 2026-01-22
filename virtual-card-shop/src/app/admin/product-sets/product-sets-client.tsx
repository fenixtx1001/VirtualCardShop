"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

type ProductSetRow = {
  id: string;
  productId: string;
  name: string | null;
  isBase: boolean;
  isInsert: boolean;
  oddsPerPack: number | null;
  _count?: { cards: number };
  stats?: {
    totalCards: number;
    pricedCards: number;
    frontCards: number;
    backCards: number;
    pctPriced: number; // 0-100
    pctFront: number; // 0-100
    pctBack: number; // 0-100
  };
};

type ProductMeta = {
  id: string;
  year?: number | null;
  sport?: string | null;
  name?: string | null;
  brand?: string | null;
};

function safeNum(v: any, fallback = 0) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function norm(s: any) {
  return String(s ?? "").trim().toLowerCase();
}
function pctText(v: any) {
  const n = safeNum(v, 0);
  return `${n.toFixed(1)}%`;
}

export default function ProductSetsClient() {
  const [rows, setRows] = useState<ProductSetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  // Optional enrichment for filters (sport/year) if /api/products exists
  const [products, setProducts] = useState<ProductMeta[]>([]);
  const productMetaById = useMemo(() => {
    const m = new Map<string, ProductMeta>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  // --- Filters
  const [q, setQ] = useState("");
  const [productFilter, setProductFilter] = useState<string>("");
  const [onlyBase, setOnlyBase] = useState(false);
  const [onlyInsert, setOnlyInsert] = useState(false);
  const [sportFilter, setSportFilter] = useState<string>("");
  const [yearFilter, setYearFilter] = useState<string>("");

  async function load() {
    setLoading(true);
    setError(null);
    setSaveOk(null);

    try {
      const res = await fetch("/api/product-sets", { cache: "no-store" });
      const raw = await res.text();

      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Failed to parse /api/product-sets JSON. First chars: ${raw.slice(0, 140)}`);
      }

      if (!res.ok) {
        throw new Error(data?.error ?? `Failed to load product sets (${res.status})`);
      }

      const arr = Array.isArray(data) ? (data as ProductSetRow[]) : [];
      setRows(arr);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load product sets");
    } finally {
      setLoading(false);
    }
  }

  async function loadProductsForFilters() {
    setLoadingProducts(true);
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      if (!res.ok) return;

      const raw = await res.text();
      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        return;
      }

      if (!Array.isArray(j)) return;

      const metas: ProductMeta[] = j
        .map((p: any) => ({
          id: String(p?.id ?? ""),
          year: typeof p?.year === "number" ? p.year : p?.year ? Number(p.year) : null,
          sport: typeof p?.sport === "string" ? p.sport : p?.sport ?? null,
          name: typeof p?.name === "string" ? p.name : p?.name ?? null,
          brand: typeof p?.brand === "string" ? p.brand : p?.brand ?? null,
        }))
        .filter((p) => p.id);

      setProducts(metas);
    } finally {
      setLoadingProducts(false);
    }
  }

  useEffect(() => {
    load();
    loadProductsForFilters();
  }, []);

  // Sorting
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const p = a.productId.localeCompare(b.productId);
      if (p !== 0) return p;

      const rank = (r: ProductSetRow) => (r.isBase ? 0 : r.isInsert ? 1 : 2);
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;

      return a.id.localeCompare(b.id);
    });
  }, [rows]);

  // Editing helpers
  function patchRow(id: string, patch: Partial<ProductSetRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // Mutually exclusive only when CHECKING
  function setBase(id: string, v: boolean) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return { ...r, isBase: v, isInsert: v ? false : r.isInsert };
      })
    );
  }

  function setInsert(id: string, v: boolean) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return { ...r, isInsert: v, isBase: v ? false : r.isBase };
      })
    );
  }

  async function saveRow(row: ProductSetRow) {
    setSavingId(row.id);
    setError(null);
    setSaveOk(null);

    try {
      if (row.isBase && row.isInsert) {
        throw new Error("A Product Set cannot be both Base and Insert.");
      }

      const res = await fetch(`/api/product-sets/${encodeURIComponent(row.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: row.name,
          isBase: row.isBase,
          isInsert: row.isInsert,
          oddsPerPack: row.oddsPerPack,
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

      setSaveOk(`Saved ${row.id}`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteRow(row: ProductSetRow) {
    const ok = window.confirm(
      `Delete Product Set "${row.id}"?\n\nAll cards in this set will be permanently deleted.\nThis cannot be undone.`
    );
    if (!ok) return;

    setSavingId(row.id);
    setError(null);
    setSaveOk(null);

    try {
      const res = await fetch(`/api/product-sets/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      const raw = await res.text();

      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Delete returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Delete failed (${res.status})`);

      setSaveOk(`Deleted ${row.id}`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    } finally {
      setSavingId(null);
    }
  }

  // Filter options
  const productIds = useMemo(() => {
    const set = new Set(rows.map((r) => r.productId));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const sportOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      const s = (p.sport ?? "").trim();
      if (s) set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [products]);

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    for (const p of products) {
      const y = typeof p.year === "number" && Number.isFinite(p.year) ? p.year : null;
      if (y !== null) set.add(y);
    }
    return [...set].sort((a, b) => b - a);
  }, [products]);

  const visibleRows = useMemo(() => {
    const qq = norm(q);

    return sortedRows.filter((r) => {
      if (productFilter && r.productId !== productFilter) return false;
      if (onlyBase && !r.isBase) return false;
      if (onlyInsert && !r.isInsert) return false;

      if (sportFilter) {
        const meta = productMetaById.get(r.productId);
        if (norm(meta?.sport) !== norm(sportFilter)) return false;
      }

      if (yearFilter) {
        const meta = productMetaById.get(r.productId);
        if (String(meta?.year ?? "") !== String(yearFilter)) return false;
      }

      if (qq) {
        const meta = productMetaById.get(r.productId);
        const hay = [
          r.productId,
          r.id,
          r.name ?? "",
          meta?.name ?? "",
          meta?.brand ?? "",
          meta?.sport ?? "",
          meta?.year ?? "",
        ]
          .map((x) => String(x ?? ""))
          .join(" | ")
          .toLowerCase();

        if (!hay.includes(qq)) return false;
      }

      return true;
    });
  }, [sortedRows, q, productFilter, onlyBase, onlyInsert, sportFilter, yearFilter, productMetaById]);

  const th: CSSProperties = {
    textAlign: "left",
    padding: 8,
    borderBottom: "1px solid #ddd",
    whiteSpace: "nowrap",
  };

  const td: CSSProperties = {
    padding: 8,
    borderBottom: "1px solid #eee",
    whiteSpace: "nowrap",
    verticalAlign: "top",
  };

  const hasProductMeta = products.length > 0;

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 32, fontWeight: 800 }}>Admin: Product Sets</h1>
      <p style={{ marginTop: 6 }}>
        Product Sets are the pools inside a Product (Base, Inserts, etc.). Cards attach via <code>productSetId</code>.
      </p>

      <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/admin" style={{ textDecoration: "underline" }}>
          ← Admin Home
        </Link>
        <Link href="/admin/products" style={{ textDecoration: "underline" }}>
          Admin: Products
        </Link>
        <button onClick={load} style={{ padding: "8px 12px" }}>
          Refresh
        </button>
        <button onClick={loadProductsForFilters} style={{ padding: "8px 12px" }} disabled={loadingProducts}>
          {loadingProducts ? "Refreshing filters..." : "Refresh filters"}
        </button>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {/* Filters */}
      <div
        style={{
          border: "1px solid #ddd",
          padding: 12,
          borderRadius: 12,
          background: "#fafafa",
          marginBottom: 12,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>Search</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search product, set id, name..."
            style={{ padding: 8, width: 260 }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>Product</div>
          <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} style={{ padding: 8, width: 260 }}>
            <option value="">All products</option>
            {productIds.map((pid) => (
              <option key={pid} value={pid}>
                {pid}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>Type</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={onlyBase}
                onChange={(e) => {
                  const v = e.target.checked;
                  setOnlyBase(v);
                  if (v) setOnlyInsert(false);
                }}
              />
              Base only
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={onlyInsert}
                onChange={(e) => {
                  const v = e.target.checked;
                  setOnlyInsert(v);
                  if (v) setOnlyBase(false);
                }}
              />
              Insert only
            </label>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, opacity: hasProductMeta ? 1 : 0.5 }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>Sport</div>
          <select
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
            style={{ padding: 8, width: 160 }}
            disabled={!hasProductMeta}
            title={!hasProductMeta ? "Sport filter requires /api/products" : ""}
          >
            <option value="">All</option>
            {sportOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, opacity: hasProductMeta ? 1 : 0.5 }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>Year</div>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            style={{ padding: 8, width: 120 }}
            disabled={!hasProductMeta}
            title={!hasProductMeta ? "Year filter requires /api/products" : ""}
          >
            <option value="">All</option>
            {yearOptions.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => {
            setQ("");
            setProductFilter("");
            setOnlyBase(false);
            setOnlyInsert(false);
            setSportFilter("");
            setYearFilter("");
          }}
          style={{ padding: "10px 12px", fontWeight: 800 }}
        >
          Clear
        </button>
      </div>

      {error && <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>{error}</div>}
      {saveOk && <div style={{ marginBottom: 12, padding: 10, background: "#efe", border: "1px solid #9f9" }}>{saveOk}</div>}

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: "#f7f7f7", zIndex: 2 }}>
              <tr>
                {[
                  "Product",
                  "Product Set ID",
                  "Name",
                  "Base?",
                  "Insert?",
                  "Odds (1:X packs)",
                  "Priced",
                  "Front",
                  "Back",
                  "Cards",
                  "Actions",
                ].map((h) => (
                  <th key={h} style={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {visibleRows.map((r, idx) => {
                const zebra = idx % 2 === 0 ? "#fff" : "#fcfcfc";
                const saving = savingId === r.id;

                const total = safeNum(r.stats?.totalCards ?? r._count?.cards ?? 0);
                const pricedPct = r.stats?.pctPriced ?? 0;
                const frontPct = r.stats?.pctFront ?? 0;
                const backPct = r.stats?.pctBack ?? 0;

                // Compact display keeps it from feeling busy
                const mini = (pct: number, count: number) =>
                  total > 0 ? `${pctText(pct)} (${count}/${total})` : "—";

                return (
                  <tr key={r.id} style={{ background: zebra }}>
                    <td style={td}>
                      <Link href={`/admin/products/${encodeURIComponent(r.productId)}`} style={{ textDecoration: "underline", fontWeight: 700 }}>
                        {r.productId}
                      </Link>

                      {hasProductMeta ? (
                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                          {(() => {
                            const m = productMetaById.get(r.productId);
                            if (!m) return null;
                            const parts = [m.year ? String(m.year) : null, m.sport ? String(m.sport) : null].filter(Boolean);
                            return parts.length ? parts.join(" • ") : null;
                          })()}
                        </div>
                      ) : null}
                    </td>

                    <td style={td}>
                      <Link href={`/admin/product-sets/${encodeURIComponent(r.id)}`} style={{ textDecoration: "underline", fontWeight: 700 }}>
                        {r.id}
                      </Link>
                    </td>

                    <td style={{ ...td, whiteSpace: "normal", minWidth: 220 }}>
                      <input
                        value={r.name ?? ""}
                        onChange={(e) => patchRow(r.id, { name: e.target.value })}
                        placeholder="(e.g., Bonus Cards)"
                        style={{ width: "100%", padding: 6 }}
                      />
                    </td>

                    <td style={td}>
                      <input type="checkbox" checked={!!r.isBase} onChange={(e) => setBase(r.id, e.target.checked)} /> {r.isBase ? "Yes" : "No"}
                    </td>

                    <td style={td}>
                      <input type="checkbox" checked={!!r.isInsert} onChange={(e) => setInsert(r.id, e.target.checked)} /> {r.isInsert ? "Yes" : "No"}
                    </td>

                    <td style={td}>
                      <input
                        inputMode="numeric"
                        value={r.oddsPerPack ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          if (v === "") return patchRow(r.id, { oddsPerPack: null });
                          const n = Number(v);
                          patchRow(r.id, { oddsPerPack: Number.isFinite(n) ? n : null });
                        }}
                        placeholder="—"
                        style={{ width: 140, padding: 6 }}
                      />
                    </td>

                    <td style={{ ...td, fontSize: 12, opacity: 0.9 }}>
                      {mini(pricedPct, safeNum(r.stats?.pricedCards ?? 0))}
                    </td>

                    <td style={{ ...td, fontSize: 12, opacity: 0.9 }}>
                      {mini(frontPct, safeNum(r.stats?.frontCards ?? 0))}
                    </td>

                    <td style={{ ...td, fontSize: 12, opacity: 0.9 }}>
                      {mini(backPct, safeNum(r.stats?.backCards ?? 0))}
                    </td>

                    <td style={td}>{r._count?.cards ?? r.stats?.totalCards ?? "—"}</td>

                    <td style={td}>
                      <button onClick={() => saveRow(r)} disabled={saving} style={{ padding: "6px 10px", marginRight: 8 }}>
                        {saving ? "Saving..." : "Save"}
                      </button>

                      <button onClick={() => deleteRow(r)} disabled={saving} style={{ padding: "6px 10px", color: "red" }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}

              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ padding: 12 }}>
                    No matching product sets. Try clearing filters.
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
