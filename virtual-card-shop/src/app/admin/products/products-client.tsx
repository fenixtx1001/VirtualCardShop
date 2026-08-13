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
  autoPackPricing: boolean;
  packsPerBox: number | null;
  packImageUrl: string | null;
  boxImageUrl: string | null;
  released: boolean;
  _count?: { productSets: number };
};

type EvItem = {
  productId: string;
  released: boolean;
  cardsPerPack: number;
  avgBaseValue: number;
  expectedInsertsPerPack: number;
  evPerPack: number;
  packPriceDollars: number;
  evPerDollar: number | null;
  inserts: Array<{
    productSetId: string;
    oddsPerPack: number;
    pHit: number;
    avgInsertValue: number;
    insertCardCount: number;
  }>;
};

type SortKey =
  | "id_asc"
  | "id_desc"
  | "year_desc"
  | "year_asc"
  | "brand_asc"
  | "sport_asc";

function centsToDollars(cents: number | null | undefined) {
  const c = typeof cents === "number" ? cents : 0;
  return (c / 100).toFixed(2);
}

function fmtMoney(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function fmtRatio(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

function dollarsToCentsLoose(input: string) {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function norm(v: string | null | undefined) {
  return String(v ?? "").trim().toLowerCase();
}

function uniqueSortedStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function uniqueSortedYears(values: Array<number | null | undefined>) {
  return Array.from(
    new Set(values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)))
  ).sort((a, b) => b - a);
}

export default function ProductsClient() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newId, setNewId] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [packPriceDisplay, setPackPriceDisplay] = useState<Record<string, string>>({});

  const [evByProductId, setEvByProductId] = useState<Record<string, EvItem>>({});
  const [evLoading, setEvLoading] = useState(false);
  const [evError, setEvError] = useState<string | null>(null);
  const [evRefreshingId, setEvRefreshingId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [releasedFilter, setReleasedFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("id_asc");

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

      const normalized = data.map((r: any) => ({
        ...r,
        released: typeof r.released === "boolean" ? r.released : false,
      })) as ProductRow[];

      setRows(normalized);

      const map: Record<string, string> = {};
      for (const r of normalized) map[r.id] = centsToDollars(r.packPriceCents);
      setPackPriceDisplay(map);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  async function loadEvAll() {
    setEvLoading(true);
    setEvError(null);
    try {
      const res = await fetch("/api/admin/products/ev", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Failed to load EV (${res.status})`);

      const items: EvItem[] = Array.isArray(j?.items) ? j.items : [];
      const map: Record<string, EvItem> = {};
      for (const it of items) map[it.productId] = it;
      setEvByProductId(map);

      setRows((prev) =>
        prev.map((row) => {
          const item = map[row.id];
          if (!item || !row.autoPackPricing) return row;
          return { ...row, packPriceCents: Math.round(item.packPriceDollars * 100) };
        })
      );
      setPackPriceDisplay((prev) => {
        const next = { ...prev };
        for (const item of items) {
          next[item.productId] = item.packPriceDollars.toFixed(2);
        }
        return next;
      });
    } catch (e: any) {
      setEvError(e?.message ?? "Failed to load EV");
    } finally {
      setEvLoading(false);
    }
  }

  async function refreshEvOne(productId: string) {
    setEvRefreshingId(productId);
    setEvError(null);
    try {
      const res = await fetch(`/api/admin/products/ev?productId=${encodeURIComponent(productId)}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Failed to load EV (${res.status})`);

      const items: EvItem[] = Array.isArray(j?.items) ? j.items : [];
      const it = items.find((x) => x.productId === productId);
      if (it) {
        setEvByProductId((prev) => ({ ...prev, [productId]: it }));
        setRows((prev) =>
          prev.map((row) =>
            row.id === productId && row.autoPackPricing
              ? { ...row, packPriceCents: Math.round(it.packPriceDollars * 100) }
              : row
          )
        );
        setPackPriceDisplay((prev) => ({
          ...prev,
          [productId]: it.packPriceDollars.toFixed(2),
        }));
      }
    } catch (e: any) {
      setEvError(e?.message ?? "Failed to refresh EV");
    } finally {
      setEvRefreshingId(null);
    }
  }

  useEffect(() => {
    load();
    loadEvAll();
  }, []);

  function updateRow(id: string, patch: Partial<ProductRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveRow(row: ProductRow) {
    setSavingId(row.id);
    setError(null);
    try {
      commitPackDisplayToCents(row.id);

      const latest = (() => {
        const found = rows.find((r) => r.id === row.id);
        if (!found) return row;
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
          autoPackPricing: latest.autoPackPricing,
          packsPerBox: latest.packsPerBox,
          packImageUrl: latest.packImageUrl,
          boxImageUrl: latest.boxImageUrl,
          released: latest.released,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Save failed (${res.status})`);
      }

      await load();
      await refreshEvOne(row.id);
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
      await loadEvAll();
    } catch (e: any) {
      setError(e?.message ?? "Create failed");
    } finally {
      setCreating(false);
    }
  }

  const yearOptions = useMemo(() => uniqueSortedYears(rows.map((r) => r.year)), [rows]);
  const brandOptions = useMemo(() => uniqueSortedStrings(rows.map((r) => r.brand)), [rows]);
  const sportOptions = useMemo(() => uniqueSortedStrings(rows.map((r) => r.sport)), [rows]);

  const filteredSortedRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    let out = rows.filter((r) => {
      if (yearFilter !== "all" && String(r.year ?? "") !== yearFilter) return false;
      if (brandFilter !== "all" && norm(r.brand) !== norm(brandFilter)) return false;
      if (sportFilter !== "all" && norm(r.sport) !== norm(sportFilter)) return false;

      if (releasedFilter === "released" && !r.released) return false;
      if (releasedFilter === "unreleased" && r.released) return false;

      if (!q) return true;

      const hay = [
        r.id,
        r.year ?? "",
        r.brand ?? "",
        r.sport ?? "",
        r.released ? "released" : "unreleased",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });

    out.sort((a, b) => {
      if (sort === "id_asc") return a.id.localeCompare(b.id);
      if (sort === "id_desc") return b.id.localeCompare(a.id);
      if (sort === "year_desc") {
        const byYear = (b.year ?? -Infinity) - (a.year ?? -Infinity);
        if (byYear !== 0) return byYear;
        return a.id.localeCompare(b.id);
      }
      if (sort === "year_asc") {
        const byYear = (a.year ?? Infinity) - (b.year ?? Infinity);
        if (byYear !== 0) return byYear;
        return a.id.localeCompare(b.id);
      }
      if (sort === "brand_asc") {
        const byBrand = norm(a.brand).localeCompare(norm(b.brand));
        if (byBrand !== 0) return byBrand;
        return a.id.localeCompare(b.id);
      }
      if (sort === "sport_asc") {
        const bySport = norm(a.sport).localeCompare(norm(b.sport));
        if (bySport !== 0) return bySport;
        return a.id.localeCompare(b.id);
      }
      return a.id.localeCompare(b.id);
    });

    return out;
  }, [rows, search, yearFilter, brandFilter, sportFilter, releasedFilter, sort]);

  function resetFilters() {
    setSearch("");
    setYearFilter("all");
    setBrandFilter("all");
    setSportFilter("all");
    setReleasedFilter("all");
    setSort("id_asc");
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

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={loadEvAll}
            disabled={evLoading}
            title="Recalculate EV values (server-side averages)"
            style={{ padding: "8px 12px" }}
          >
            {evLoading ? "EV Loading..." : "Refresh EV"}
          </button>
          <span style={{ fontSize: 12, color: "#555" }}>
            {evError ? `EV: ${evError}` : evLoading ? "Computing…" : "EV ready"}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 12,
          padding: 12,
          border: "1px solid #ddd",
          background: "#fafafa",
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Product ID, year, brand, sport…"
          style={{ padding: 8, width: 280 }}
        />

        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          style={{ padding: 8 }}
        >
          <option value="all">All years</option>
          {yearOptions.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>

        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          style={{ padding: 8 }}
        >
          <option value="all">All brands</option>
          {brandOptions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <select
          value={sportFilter}
          onChange={(e) => setSportFilter(e.target.value)}
          style={{ padding: 8 }}
        >
          <option value="all">All sports</option>
          {sportOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={releasedFilter}
          onChange={(e) => setReleasedFilter(e.target.value)}
          style={{ padding: 8 }}
        >
          <option value="all">Released + unreleased</option>
          <option value="released">Released only</option>
          <option value="unreleased">Unreleased only</option>
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          style={{ padding: 8 }}
        >
          <option value="id_asc">Sort: Product ID (A → Z)</option>
          <option value="id_desc">Sort: Product ID (Z → A)</option>
          <option value="year_desc">Sort: Year (new → old)</option>
          <option value="year_asc">Sort: Year (old → new)</option>
          <option value="brand_asc">Sort: Brand</option>
          <option value="sport_asc">Sort: Sport</option>
        </select>

        <button onClick={resetFilters} style={{ padding: "8px 12px" }}>
          Reset Filters
        </button>

        <div style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>
          Showing <b>{filteredSortedRows.length}</b> / {rows.length}
        </div>
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
                  "Released",
                  "Pack Price ($)",
                  "Auto Price",
                  "Packs/Box",
                  "Product Sets",
                  "Avg Return/Pack ($)",
                  "EV ÷ Price",
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
              {filteredSortedRows.map((r, idx) => {
                const zebra = idx % 2 === 0 ? "#fff" : "#fcfcfc";
                const saving = savingId === r.id;

                const ev = evByProductId[r.id];
                const evRefreshing = evRefreshingId === r.id;

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
                      <input
                        type="text"
                        inputMode="decimal"
                        value={getPackDisplay(r)}
                        onChange={(e) => setPackDisplay(r.id, e.target.value)}
                        onBlur={() => commitPackDisplayToCents(r.id)}
                        disabled={r.autoPackPricing}
                        title={
                          r.autoPackPricing
                            ? "Automatic pricing targets an EV-to-price ratio of 2.00."
                            : "Manual pack price"
                        }
                        style={{
                          width: 110,
                          padding: 6,
                          background: r.autoPackPricing ? "#f3f3f3" : "#fff",
                          color: r.autoPackPricing ? "#666" : "#000",
                        }}
                      />
                    </td>

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
                        checked={r.autoPackPricing}
                        onChange={(e) =>
                          updateRow(r.id, { autoPackPricing: e.target.checked })
                        }
                        title="Automatically target an EV-to-price ratio of 2.00"
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

                    <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ fontWeight: 800 }}>
                          {ev ? fmtMoney(ev.evPerPack) : "—"}
                        </div>
                        <div style={{ fontSize: 12, color: "#666" }}>
                          {ev ? `${ev.cardsPerPack} cards • ~${ev.expectedInsertsPerPack.toFixed(2)} inserts` : ""}
                        </div>
                        <div>
                          <button
                            onClick={() => refreshEvOne(r.id)}
                            disabled={evRefreshing}
                            style={{ padding: "4px 8px", fontSize: 12 }}
                            title="Recompute EV for this product (uses latest book values)"
                          >
                            {evRefreshing ? "Recalc…" : "Recalc"}
                          </button>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                      {ev?.evPerDollar != null ? (
                        <span title="Expected book value per $1 spent on a pack">
                          {fmtRatio(ev.evPerDollar)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

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
              {filteredSortedRows.length === 0 && (
                <tr>
                  <td colSpan={13} style={{ padding: 12 }}>
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
