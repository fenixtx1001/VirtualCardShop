"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Row = {
  cardId: number;
  player: string;
  cardNumber: string;
  subset: string | null;
  variant: string | null;

  qty: number;
  bookValue: number;

  // Display context
  productId: string;          // productSet.productId if present, else card.setId fallback
  year: number | null;        // product.year or set.year fallback
  productSetName: string | null;
  productSetIsBase: boolean | null;
};

type SearchResponse = {
  ok: boolean;
  q: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rows: Row[];
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function SearchClient() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const pageSize = 50;

  // debounce + cancel stale responses
  const timerRef = useRef<any>(null);
  const requestIdRef = useRef(0);

  async function load(opts?: { q?: string; page?: number }) {
    const qq = (opts?.q ?? q).trim();
    const nextPage = opts?.page ?? page;

    // No query -> clear results (we only search when user types something)
    if (!qq) {
      setErr(null);
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    const rid = ++requestIdRef.current;

    try {
      const params = new URLSearchParams();
      params.set("q", qq);
      params.set("page", String(nextPage));
      params.set("pageSize", String(pageSize));

      const res = await fetch(`/api/collection/search?${params.toString()}`, { cache: "no-store" });
      const raw = await res.text();

      if (rid !== requestIdRef.current) return; // stale response

      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Search returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      const next = j as SearchResponse;
      setData(next);
      setPage(next.page);
    } catch (e: any) {
      if (rid !== requestIdRef.current) return;
      setErr(e?.message ?? "Search failed");
      setData(null);
    } finally {
      if (rid === requestIdRef.current) setLoading(false);
    }
  }

  // Debounce search on input changes
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      setPage(1);
      load({ q, page: 1 });
    }, 350);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const totalPages = data?.totalPages ?? 1;
  const canPrev = (data?.page ?? 1) > 1;
  const canNext = (data?.page ?? 1) < totalPages;

  const rows = useMemo(() => data?.rows ?? [], [data]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/collection" style={{ textDecoration: "underline", fontWeight: 800 }}>
          ← Back to Collection
        </Link>
        <div style={{ fontWeight: 900, fontSize: 26 }}>Search Collection</div>
      </div>

      <p style={{ marginTop: 10, color: "#444", fontWeight: 600 }}>
        Search across everything you own (qty &gt; 0). Example: <span style={{ fontWeight: 900 }}>Ken Griffey</span>
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search player name (e.g. Ken Griffey Jr)"
          style={{
            width: 420,
            maxWidth: "100%",
            padding: "10px 12px",
            border: "1px solid #ddd",
            borderRadius: 12,
            fontWeight: 800,
          }}
        />

        <button
          onClick={() => {
            setPage(1);
            load({ q, page: 1 });
          }}
          disabled={loading}
          style={{ padding: "10px 12px", opacity: loading ? 0.7 : 1 }}
        >
          Search
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => canPrev && load({ q, page: (data?.page ?? 1) - 1 })}
            disabled={!canPrev || loading}
            style={{ padding: "8px 12px", opacity: !canPrev || loading ? 0.5 : 1 }}
          >
            ← Prev
          </button>

          <div style={{ fontWeight: 900, whiteSpace: "nowrap" }}>
            Page {data?.page ?? 1} of {totalPages}
          </div>

          <button
            onClick={() => canNext && load({ q, page: (data?.page ?? 1) + 1 })}
            disabled={!canNext || loading}
            style={{ padding: "8px 12px", opacity: !canNext || loading ? 0.5 : 1 }}
          >
            Next →
          </button>
        </div>
      </div>

      <hr style={{ margin: "14px 0" }} />

      {err && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {err}
        </div>
      )}

      {!q.trim() ? (
        <div style={{ color: "#666" }}>Type a player name to search your collection.</div>
      ) : loading ? (
        <div>Searching…</div>
      ) : !data ? (
        <div>No data.</div>
      ) : data.total === 0 ? (
        <div style={{ color: "#666" }}>No matches found in your collection.</div>
      ) : (
        <>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>
            Results: {data.total} (showing {rows.length} on this page)
          </div>

          <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
                <tr>
                  {["Player", "Year", "Product", "Set", "#", "Subset", "Variant", "Qty", "Book", "Total"].map((h) => (
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
                {rows.map((r, idx) => {
                  const zebra = idx % 2 === 0 ? "#fff" : "#fcfcfc";
                  const totalVal = (r.qty ?? 0) * (r.bookValue ?? 0);

                  const setLabel = r.productSetName?.trim()
                    ? r.productSetName.trim()
                    : r.productSetIsBase == null
                      ? "—"
                      : r.productSetIsBase
                        ? "Base"
                        : "Insert";

                  const setTypePrefix =
                    r.productSetIsBase == null ? "" : r.productSetIsBase ? "Base — " : "Insert — ";

                  return (
                    <tr key={`${r.cardId}-${idx}`} style={{ background: zebra }}>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {r.player}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.year ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 800 }}>
                        {r.productId}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                        {setTypePrefix}
                        {setLabel}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 800 }}>
                        {r.cardNumber}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.subset ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.variant ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {r.qty}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                        ${Number(r.bookValue ?? 0).toFixed(2)}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        ${Number(totalVal).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
