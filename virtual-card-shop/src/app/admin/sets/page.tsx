"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SetRow = {
  id: string;
  year: number | null;
  brand: string | null;
  sport: string | null;
  packPriceCents: number | null;
  _count?: { cards: number };
};

function dollarsFromCents(cents: number) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "0.00";
  return (n / 100).toFixed(2);
}

function centsFromDollarInput(s: string) {
  const cleaned = (s ?? "").toString().replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(Math.round(n * 100)));
}

function intOrNull(s: string) {
  const cleaned = (s ?? "").toString().replace(/[^0-9-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function textOrNull(s: string) {
  const v = (s ?? "").toString().trim();
  return v.length ? v : null;
}

export default function AdminSetsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SetRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/sets", { cache: "no-store" });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Sets fetch failed (${res.status}): ${txt}`);
      }
      const json = await res.json();
      const list: SetRow[] = json?.sets ?? json ?? [];
      setRows(list);
    } catch (e: any) {
      setRows([]);
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const updateSet = async (id: string, patch: Partial<SetRow>) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/sets/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Save failed (${res.status}): ${txt}`);
      }

      // optimistic update
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setSavingId(null);
    }
  };

  const styles = useMemo(() => {
    return {
      page: { padding: 24 },
      h1: { fontSize: 28, fontWeight: 700 as const, marginTop: 10 },
      subtitle: { marginTop: 6, color: "#555" },
      errorBox: {
        marginTop: 12,
        padding: 12,
        background: "#fff7f7",
        border: "1px solid #ffd7d7",
        whiteSpace: "pre-wrap" as const,
        borderRadius: 10,
      },
      tableWrap: {
        marginTop: 12,
        overflow: "auto" as const,
        maxHeight: "calc(100vh - 220px)",
        border: "1px solid #e9e9e9",
        borderRadius: 12,
      },
      table: { width: "100%", borderCollapse: "separate" as const, borderSpacing: 0 },
      th: {
        position: "sticky" as const,
        top: 0,
        zIndex: 2,
        textAlign: "left" as const,
        padding: 10,
        borderBottom: "1px solid #e5e5e5",
        background: "#fafafa",
        fontWeight: 700 as const,
        whiteSpace: "nowrap" as const,
      },
      td: {
        padding: 10,
        borderBottom: "1px solid #f0f0f0",
        verticalAlign: "middle" as const,
        whiteSpace: "nowrap" as const,
      },
      trOdd: { background: "#fff" },
      trEven: { background: "#fcfcfc" },
      input: {
        height: 32,
        padding: "6px 10px",
        borderRadius: 10,
        border: "1px solid #d7d7d7",
        outline: "none",
        background: "white",
      } as const,
      link: { textDecoration: "underline" },
      pillSaving: {
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        background: "#eef2ff",
        border: "1px solid #dbe4ff",
        fontSize: 12,
      },
    };
  }, []);

  if (loading) {
    return (
      <div style={styles.page}>
        <h1 style={styles.h1}>Admin: Sets</h1>
        <p style={{ marginTop: 12 }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>Admin: Sets</h1>
      <div style={styles.subtitle}>
        View all loaded sets. Click one to edit set info and the checklist.
      </div>

      <div style={{ marginTop: 12 }}>
        <Link href="/admin/import" style={styles.link}>
          ← Back to Import
        </Link>
      </div>

      {error && <pre style={styles.errorBox}>{error}</pre>}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, minWidth: 320 }}>Set ID</th>
              <th style={{ ...styles.th, minWidth: 120 }}>Year</th>
              <th style={{ ...styles.th, minWidth: 180 }}>Brand</th>
              <th style={{ ...styles.th, minWidth: 180 }}>Sport</th>
              <th style={{ ...styles.th, minWidth: 140 }}>Pack Price</th>
              <th style={{ ...styles.th, minWidth: 100 }}>Cards</th>
              <th style={{ ...styles.th, minWidth: 120 }}>Status</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r, idx) => {
              const zebra = idx % 2 === 0 ? styles.trOdd : styles.trEven;

              return (
                <tr key={r.id} style={zebra}>
                  {/* Set ID (not editable; it’s your primary key right now) */}
                  <td style={styles.td}>
                    <Link href={`/admin/sets/${encodeURIComponent(r.id)}`} style={styles.link}>
                      {r.id}
                    </Link>
                  </td>

                  {/* Year */}
                  <td style={styles.td}>
                    <input
                      style={{ ...styles.input, width: 90 }}
                      defaultValue={r.year ?? ""}
                      placeholder="—"
                      onBlur={(e) => updateSet(r.id, { year: intOrNull(e.target.value) })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </td>

                  {/* Brand */}
                  <td style={styles.td}>
                    <input
                      style={{ ...styles.input, width: 160 }}
                      defaultValue={r.brand ?? ""}
                      placeholder="—"
                      onBlur={(e) => updateSet(r.id, { brand: textOrNull(e.target.value) })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </td>

                  {/* Sport */}
                  <td style={styles.td}>
                    <input
                      style={{ ...styles.input, width: 160 }}
                      defaultValue={r.sport ?? ""}
                      placeholder="—"
                      onBlur={(e) => updateSet(r.id, { sport: textOrNull(e.target.value) })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </td>

                  {/* Pack Price */}
                  <td style={styles.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#333" }}>$</span>
                      <input
                        style={{ ...styles.input, width: 110 }}
                        defaultValue={dollarsFromCents(r.packPriceCents ?? 0)}
                        onBlur={(e) =>
                          updateSet(r.id, { packPriceCents: centsFromDollarInput(e.target.value) })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                      />
                    </div>
                  </td>

                  {/* Cards count */}
                  <td style={styles.td}>{r._count?.cards ?? "—"}</td>

                  {/* Status */}
                  <td style={styles.td}>
                    {savingId === r.id ? <span style={styles.pillSaving}>Saving…</span> : ""}
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 14 }}>
                  No sets found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
