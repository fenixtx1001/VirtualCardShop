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

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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

  const sorted = useMemo(() => {
    const copy = [...rows];
    // keep your current “recently updated” feel
    copy.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return copy;
  }, [rows]);

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
                {!loading && sorted.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 14, color: colors.subtext, fontWeight: 800 }}>
                      No unopened packs yet. Hit the Shop and grab a few packs to get started.
                    </td>
                  </tr>
                ) : (
                  sorted.map((r, idx) => {
                    const zebra = idx % 2 === 0 ? "#fff" : "#fcfcfc";
                    const name = formatFriendlyProductName(r.productId);

                    return (
                      <tr key={r.productId} style={{ background: zebra }}>
                        {/* Pack image */}
                        <td style={{ padding: 12, borderBottom: "1px solid #eee", width: 70 }}>
                          <div
                            style={{
                              width: 46,
                              height: 46,
                              borderRadius: 12,
                              border: `1px solid ${colors.border}`,
                              background: colors.muted,
                              overflow: "hidden",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 900,
                              color: "#777",
                              fontSize: 12,
                            }}
                            title={r.packImageUrl ? "Pack image" : "No pack image"}
                          >
                            {r.packImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={r.packImageUrl}
                                alt="Pack"
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                onError={(e) => {
                                  // fallback: show "Pack" if image fails
                                  const img = e.currentTarget;
                                  img.style.display = "none";
                                  (img.parentElement as any).textContent = "Pack";
                                }}
                              />
                            ) : (
                              "Pack"
                            )}
                          </div>
                        </td>

                        {/* Friendly product */}
                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                          <div style={{ fontWeight: 900 }}>{name}</div>
                          <div style={{ fontSize: 12, color: colors.subtext, marginTop: 2 }}>{r.productId}</div>
                        </td>

                        <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                          {Number(r.packsOwned ?? 0).toLocaleString()}
                        </td>

                        <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                          {formatDollars(r.packPriceCents ?? 0)}
                        </td>

                        <td style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                          {r.cardsPerPack != null ? r.cardsPerPack : "—"}
                        </td>

                        <td style={{ padding: 12, borderBottom: "1px solid #eee", color: colors.subtext, fontWeight: 800 }}>
                          {formatDateTime(r.updatedAt)}
                        </td>

                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                          <Link
                            href={`/rip-pack?productId=${encodeURIComponent(r.productId)}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              textDecoration: "none",
                              fontWeight: 900,
                              color: "white",
                              background: colors.accent,
                              padding: "8px 10px",
                              borderRadius: 10,
                              boxShadow: "0 8px 18px rgba(47,111,237,0.18)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Open Pack <span style={{ fontWeight: 900 }}>→</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer hint */}
          <div style={{ padding: 12, borderTop: `1px solid ${colors.border}`, color: colors.subtext, fontSize: 12, fontWeight: 700 }}>
            Tip: if you don’t see pack art, add a Pack Image on <span style={{ fontWeight: 900 }}>Admin → Products</span>.
          </div>
        </div>
      </div>
    </main>
  );
}
