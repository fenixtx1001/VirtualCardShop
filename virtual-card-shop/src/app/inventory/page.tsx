// src/app/inventory/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type InventoryRow = {
  productId: string;
  packsOwned: number;
  packPriceCents: number;
  cardsPerPack: number | null;
  packImageUrl: string | null;
  updatedAt: string;
};

type InventoryResponse = {
  ok: boolean;
  rows: InventoryRow[];
  error?: string;
};

const HIDE_ZERO_PACKS_STORAGE_KEY = "vcs.inventory.hideZeroPacks";

// Cozy palette (match Home)
const colors = {
  bg: "#fbfaf7",
  card: "#ffffff",
  border: "#e7e3dc",
  text: "#1f1f1f",
  subtext: "#5a5a5a",
  accent: "#2f6fed",
  muted: "#f2efe9",
};

function formatDollars(cents: number) {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatFriendlyProductName(productId: string) {
  const s = String(productId || "").trim();
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function readHideZeroPacksPreference() {
  if (typeof window === "undefined") return true;
  const saved = window.localStorage.getItem(HIDE_ZERO_PACKS_STORAGE_KEY);

  // Default to hiding 0-pack products. Only show them if the user explicitly turns the filter off.
  if (saved === null) return true;

  return saved === "1";
}

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [hideZeroPacks, setHideZeroPacks] = useState(() => readHideZeroPacksPreference());

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/inventory", { cache: "no-store" });
      const raw = await res.text();

      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Inventory returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      const data = j as InventoryResponse;
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load inventory");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HIDE_ZERO_PACKS_STORAGE_KEY, hideZeroPacks ? "1" : "0");
  }, [hideZeroPacks]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    // keep your current “recently updated” feel
    copy.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return copy;
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (!hideZeroPacks) return sorted;
    return sorted.filter((r) => (r.packsOwned ?? 0) > 0);
  }, [hideZeroPacks, sorted]);

  const zeroPackCount = useMemo(() => {
    return sorted.filter((r) => (r.packsOwned ?? 0) <= 0).length;
  }, [sorted]);

  return (
    <main
      style={{
        background: colors.bg,
        minHeight: "calc(100vh - 80px)",
        padding: 20,
        color: colors.text,
        fontFamily: "system-ui",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.4 }}>Inventory</div>
              <div style={{ marginTop: 6, color: colors.subtext, fontSize: 13, lineHeight: 1.5 }}>
                Unopened packs you own. (Boxes are stored as packs.) Open one when you’re ready to rip.
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link href="/shop" style={{ color: colors.subtext, textDecoration: "underline", fontWeight: 800 }}>
                  Go to Shop
                </Link>
                <Link href="/" style={{ color: colors.subtext, textDecoration: "underline", fontWeight: 800 }}>
                  Home
                </Link>
              </div>
            </div>

            <button
              onClick={load}
              disabled={loading}
              style={{
                border: `1px solid ${colors.border}`,
                background: colors.muted,
                borderRadius: 10,
                padding: "8px 12px",
                fontWeight: 900,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                height: 38,
              }}
              title="Refresh inventory"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {err ? (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                background: "#fff1f1",
                border: "1px solid #f3b7b7",
                borderRadius: 12,
                fontWeight: 800,
              }}
            >
              {err}
            </div>
          ) : null}
        </div>

        {/* Table card */}
        <div
          style={{
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderBottom: `1px solid ${colors.border}`,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              background: "#fff",
            }}
          >
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 900,
                color: colors.text,
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={hideZeroPacks}
                onChange={(e) => setHideZeroPacks(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              Hide 0-pack products
            </label>

            <div style={{ fontSize: 12, color: colors.subtext, fontWeight: 800 }}>
              Showing {visibleRows.length.toLocaleString()} of {sorted.length.toLocaleString()} products
              {zeroPackCount > 0 ? ` • ${zeroPackCount.toLocaleString()} with 0 packs` : ""}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
                <tr>
                  {["", "Product", "Packs Owned", "Pack Price", "Cards/Pack", "Updated", "Action"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: 12,
                        borderBottom: `1px solid ${colors.border}`,
                        whiteSpace: "nowrap",
                        fontWeight: 900,
                        fontSize: 12,
                        color: "#333",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {!loading && visibleRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: 16,
                        color: colors.subtext,
                      }}
                    >
                      {hideZeroPacks
                        ? "No unopened packs right now. Turn off the 0-pack filter to see all products you’ve purchased before."
                        : "No unopened packs yet. Head to the shop and grab some wax."}
                    </td>
                  </tr>
                ) : null}

                {visibleRows.map((r, idx) => {
                  const friendlyName = formatFriendlyProductName(r.productId);

                  return (
                    <tr
                      key={`${r.productId}-${idx}`}
                      style={{
                        borderBottom: `1px solid ${colors.border}`,
                        background: idx % 2 === 0 ? "#fff" : "#fcfcfc",
                      }}
                    >
                      {/* pack image */}
                      <td style={{ padding: 10, verticalAlign: "middle", width: 64 }}>
                        <div
                          style={{
                            width: 36,
                            height: 52,
                            borderRadius: 8,
                            overflow: "hidden",
                            border: `1px solid ${colors.border}`,
                            background: "#fff",
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          {r.packImageUrl ? (
                            <img
                              src={r.packImageUrl}
                              alt={friendlyName}
                              loading="lazy"
                              decoding="async"
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <div style={{ fontSize: 10, color: colors.subtext }}>No image</div>
                          )}
                        </div>
                      </td>

                      {/* product */}
                      <td style={{ padding: 12, verticalAlign: "middle" }}>
                        <div style={{ fontWeight: 900, fontSize: 15, lineHeight: 1.2 }}>{friendlyName}</div>
                      </td>

                      {/* packs owned */}
                      <td style={{ padding: 12, verticalAlign: "middle", fontWeight: 900 }}>{r.packsOwned}</td>

                      {/* pack price */}
                      <td style={{ padding: 12, verticalAlign: "middle", fontWeight: 900 }}>
                        {formatDollars(r.packPriceCents)}
                      </td>

                      {/* cards per pack */}
                      <td style={{ padding: 12, verticalAlign: "middle", fontWeight: 900 }}>
                        {r.cardsPerPack ?? "—"}
                      </td>

                      {/* updated */}
                      <td style={{ padding: 12, verticalAlign: "middle", fontWeight: 900 }}>
                        {formatDateTime(r.updatedAt)}
                      </td>

                      {/* action */}
                      <td style={{ padding: 12, verticalAlign: "middle" }}>
                        <Link
                          href={`/open-pack/${encodeURIComponent(r.productId)}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            background: colors.accent,
                            color: "#fff",
                            textDecoration: "none",
                            fontWeight: 900,
                            padding: "8px 12px",
                            borderRadius: 10,
                            whiteSpace: "nowrap",
                            boxShadow: "0 8px 18px rgba(47,111,237,0.18)",
                          }}
                        >
                          Open Pack <span>→</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}

                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 16 }}>
                      Loading inventory…
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
