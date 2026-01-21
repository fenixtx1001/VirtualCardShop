"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ProductSetRow = {
  id: string;
  productId: string;
  name: string | null;
  isBase: boolean;
  isInsert: boolean;
  oddsPerPack: number | null;
  _count?: { cards: number };
};

export default function ProductSetsClient() {
  const [rows, setRows] = useState<ProductSetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setSaveOk(null);

    try {
      const res = await fetch("/api/product-sets", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load product sets (${res.status})`);
      const data = (await res.json()) as ProductSetRow[];
      setRows(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load product sets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const p = a.productId.localeCompare(b.productId);
      if (p !== 0) return p;

      // Base first, then Insert, then other pools
      const rank = (r: ProductSetRow) => (r.isBase ? 0 : r.isInsert ? 1 : 2);
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;

      return a.id.localeCompare(b.id);
    });
  }, [rows]);

  function patchRow(id: string, patch: Partial<ProductSetRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // Enforce: base and insert are mutually exclusive
  function setBase(id: string, v: boolean) {
    patchRow(id, { isBase: v, isInsert: v ? false : false });
  }
  function setInsert(id: string, v: boolean) {
    patchRow(id, { isInsert: v, isBase: v ? false : false });
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

      if (!res.ok) {
        throw new Error(j?.error ?? `Save failed (${res.status})`);
      }

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
      const res = await fetch(`/api/product-sets/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Delete returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) {
        throw new Error(j?.error ?? `Delete failed (${res.status})`);
      }

      setSaveOk(`Deleted ${row.id}`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    } finally {
      setSavingId(null);
    }
  }

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: 8,
    borderBottom: "1px solid #ddd",
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    padding: 8,
    borderBottom: "1px solid #eee",
    whiteSpace: "nowrap",
    verticalAlign: "top",
  };

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
      </div>

      <hr style={{ margin: "16px 0" }} />

      {error && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {error}
        </div>
      )}

      {saveOk && (
        <div style={{ marginBottom: 12, padding: 10, background: "#efe", border: "1px solid #9f9" }}>
          {saveOk}
        </div>
      )}

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: "#f7f7f7", zIndex: 2 }}>
              <tr>
                {["Product", "Product Set ID", "Name", "Base?", "Insert?", "Odds (1:X packs)", "Cards", "Actions"].map(
                  (h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody>
              {sortedRows.map((r, idx) => {
                const zebra = idx % 2 === 0 ? "#fff" : "#fcfcfc";
                const saving = savingId === r.id;

                return (
                  <tr key={r.id} style={{ background: zebra }}>
                    <td style={td}>
                      <Link
                        href={`/admin/products/${encodeURIComponent(r.productId)}`}
                        style={{ textDecoration: "underline", fontWeight: 700 }}
                      >
                        {r.productId}
                      </Link>
                    </td>

                    <td style={td}>
                      <Link
                        href={`/admin/product-sets/${encodeURIComponent(r.id)}`}
                        style={{ textDecoration: "underline", fontWeight: 700 }}
                      >
                        {r.id}
                      </Link>
                    </td>

                    <td style={{ ...td, whiteSpace: "normal", minWidth: 120 }}>{r.name ?? "—"}</td>

                    <td style={td}>
                      <input type="checkbox" checked={!!r.isBase} onChange={(e) => setBase(r.id, e.target.checked)} />{" "}
                      {r.isBase ? "Yes" : "No"}
                    </td>

                    <td style={td}>
                      <input
                        type="checkbox"
                        checked={!!r.isInsert}
                        onChange={(e) => setInsert(r.id, e.target.checked)}
                      />{" "}
                      {r.isInsert ? "Yes" : "No"}
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

                    <td style={td}>{r._count?.cards ?? "—"}</td>

                    <td style={td}>
                      <button onClick={() => saveRow(r)} disabled={saving} style={{ padding: "6px 10px", marginRight: 8 }}>
                        {saving ? "Saving..." : "Save"}
                      </button>

                      <button
                        onClick={() => deleteRow(r)}
                        disabled={saving}
                        style={{ padding: "6px 10px", color: "red" }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}

              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 12 }}>
                    No product sets yet. Create them from a Product detail page.
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
