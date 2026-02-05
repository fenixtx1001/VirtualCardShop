// src/app/collection/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SummaryRow = {
  productId: string;
  uniqueOwned: number;
  totalQty: number;
  totalCards: number;
  percentComplete: number;
  packImageUrl: string | null;

  // ✅ NEW
  totalValueCents: number;
};

const colors = {
  bg: "#fbfaf7",
  card: "#ffffff",
  border: "#e7e3dc",
  text: "#121212",
  subtext: "#333333",
  mutedText: "#5a5a5a",
  muted: "#f2efe9",
  accent: "#2f6fed",
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNum(v: any, fallback = 0) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function formatDollars(cents: number) {
  const c = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return (c / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

// ✅ Friendly name from productId (no DB changes)
function formatProductName(productId: string) {
  const s = String(productId || "").trim();
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function ImgThumb({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  const url = (src ?? "").trim();

  if (!url || broken) {
    return (
      <div
        aria-label={`${alt} missing`}
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          border: `1px dashed ${colors.border}`,
          background: colors.muted,
          display: "grid",
          placeItems: "center",
          fontSize: 11,
          color: colors.mutedText,
          fontWeight: 800,
        }}
        title="No pack image"
      >
        —
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        objectFit: "cover",
        border: `1px solid ${colors.border}`,
        background: "#fff",
        display: "block",
      }}
    />
  );
}

export default function CollectionPage() {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/collection/summary", { cache: "no-store" });
      const raw = await res.text();

      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Collection summary returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed to load (${res.status})`);

      const arr = Array.isArray(j) ? (j as SummaryRow[]) : [];
      setRows(arr);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load collection");
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
    copy.sort((a, b) => safeNum(b.percentComplete) - safeNum(a.percentComplete));
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
      <style jsx>{`
        .desktopOnly {
          display: block;
        }
        .mobileOnly {
          display: none;
        }

        @media (max-width: 780px) {
          .desktopOnly {
            display: none;
          }
          .mobileOnly {
            display: block;
          }
          .pageTitle {
            font-size: 28px !important;
          }
          .subText {
            font-size: 14px !important;
            color: #222 !important;
          }
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 className="pageTitle" style={{ fontSize: 34, fontWeight: 900, marginTop: 0, marginBottom: 6 }}>
              Collection
            </h1>
            <div className="subText" style={{ color: colors.subtext, fontSize: 14, lineHeight: 1.45 }}>
              Click a set to view your owned cards + completion. Checklist shows every card with an owned checkbox.
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button
                onClick={load}
                style={{
                  border: `1px solid ${colors.border}`,
                  background: colors.muted,
                  borderRadius: 10,
                  padding: "8px 10px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Refresh
              </button>

              <Link href="/collection/search" style={{ textDecoration: "underline", fontWeight: 900, color: colors.text }}>
                Search Collection
              </Link>

              <Link href="/inventory" style={{ textDecoration: "underline", fontWeight: 900, color: colors.text }}>
                Inventory
              </Link>

              <Link href="/shop" style={{ textDecoration: "underline", fontWeight: 900, color: colors.text }}>
                Shop
              </Link>
            </div>
          </div>
        </div>

        <hr style={{ margin: "16px 0", borderColor: colors.border }} />

        {err ? (
          <div style={{ marginBottom: 12, padding: 12, background: "#fff1f1", border: "1px solid #f3b7b7", borderRadius: 12 }}>
            {err}
          </div>
        ) : null}

        {loading ? (
          <div style={{ color: colors.subtext, fontWeight: 800 }}>Loading…</div>
        ) : sorted.length === 0 ? (
          <div
            style={{
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              padding: 16,
              color: colors.subtext,
            }}
          >
            No sets yet. Buy packs in the Shop and your collection will start showing up here.
          </div>
        ) : (
          <>
            {/* ===================== DESKTOP TABLE ===================== */}
            <div className="desktopOnly">
              <div style={{ overflowX: "auto", border: `1px solid ${colors.border}`, borderRadius: 14, background: colors.card }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1040 }}>
                  <thead style={{ background: "#f7f7f7" }}>
                    <tr>
                      {["Set", "Complete", "Unique Owned", "Total Cards", "Total Qty", "Total Value", "Pack", "Actions"].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: 10,
                            fontSize: 12,
                            letterSpacing: 0.2,
                            color: "#222",
                            borderBottom: `1px solid ${colors.border}`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r, idx) => {
                      const pct = clamp(safeNum(r.percentComplete), 0, 100);
                      const friendly = formatProductName(r.productId);

                      return (
                        <tr key={r.productId} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                          <td style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                            <Link
                              href={`/collection/${encodeURIComponent(r.productId)}`}
                              style={{ textDecoration: "underline", color: colors.text }}
                            >
                              {friendly}
                            </Link>
                          </td>

                          <td style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                            {pct.toFixed(1)}%
                          </td>

                          <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{safeNum(r.uniqueOwned)}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{safeNum(r.totalCards)}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{safeNum(r.totalQty)}</td>

                          {/* ✅ NEW */}
                          <td style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                            {formatDollars(safeNum(r.totalValueCents))}
                          </td>

                          <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>
                            <ImgThumb src={r.packImageUrl} alt={`${friendly} pack`} />
                          </td>

                          <td style={{ padding: 10, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                            <Link
                              href={`/collection/${encodeURIComponent(r.productId)}`}
                              style={{ textDecoration: "underline", fontWeight: 900, color: colors.text, marginRight: 12 }}
                            >
                              View cards
                            </Link>
                            <Link
                              href={`/checklist/${encodeURIComponent(r.productId)}`}
                              style={{ textDecoration: "underline", fontWeight: 900, color: colors.text }}
                            >
                              Checklist
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ===================== MOBILE CARDS ===================== */}
            <div className="mobileOnly" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {sorted.map((r) => {
                const pct = clamp(safeNum(r.percentComplete), 0, 100);
                const friendly = formatProductName(r.productId);

                return (
                  <div
                    key={r.productId}
                    style={{
                      background: colors.card,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 16,
                      padding: 14,
                    }}
                  >
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <ImgThumb src={r.packImageUrl} alt={`${friendly} pack`} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 900, fontSize: 16, color: colors.text, lineHeight: 1.2 }}>
                          {friendly}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, color: "#222", fontWeight: 800 }}>
                          {pct.toFixed(1)}% complete
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        height: 10,
                        borderRadius: 999,
                        background: colors.muted,
                        overflow: "hidden",
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: colors.accent,
                          borderRadius: 999,
                          transition: "width 200ms ease",
                        }}
                      />
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div style={{ fontSize: 13, color: "#222", fontWeight: 800 }}>
                        Unique: <span style={{ fontWeight: 900 }}>{safeNum(r.uniqueOwned)}</span> / {safeNum(r.totalCards)}
                      </div>
                      <div style={{ fontSize: 13, color: "#222", fontWeight: 800 }}>
                        Total cards: <span style={{ fontWeight: 900 }}>{safeNum(r.totalQty)}</span>
                      </div>

                      {/* ✅ NEW */}
                      <div style={{ fontSize: 13, color: "#222", fontWeight: 800 }}>
                        Total value: <span style={{ fontWeight: 900 }}>{formatDollars(safeNum(r.totalValueCents))}</span>
                      </div>
                    </div>

                    <div style={{ marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap" }}>
                      <Link
                        href={`/collection/${encodeURIComponent(r.productId)}`}
                        style={{ textDecoration: "underline", fontWeight: 900, color: colors.accent }}
                      >
                        View cards
                      </Link>
                      <Link
                        href={`/checklist/${encodeURIComponent(r.productId)}`}
                        style={{ textDecoration: "underline", fontWeight: 900, color: colors.text }}
                      >
                        Checklist
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
