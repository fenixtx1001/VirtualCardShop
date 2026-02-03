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
  productId: string; // productSet.productId if present, else card.setId fallback
  year: number | null; // product.year or set.year fallback
  productSetName: string | null;
  productSetIsBase: boolean | null;

  // ✅ images (added)
  frontImageUrl: string | null;
  backImageUrl: string | null;
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

export default function SearchClient() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const pageSize = 50;

  // ✅ View toggle: table vs cards
  const [view, setView] = useState<"table" | "cards">("table");

  // For card tiles: track which side is shown per cardId
  const [sideByCardId, setSideByCardId] = useState<Record<number, "front" | "back">>({});

  // debounce + cancel stale responses
  const timerRef = useRef<any>(null);
  const requestIdRef = useRef(0);

  async function load(opts?: { q?: string; page?: number }) {
    const qq = (opts?.q ?? q).trim();
    const nextPage = opts?.page ?? page;

    // No query -> clear results
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

      // Reset per-card side state for new page of results
      const nextSides: Record<number, "front" | "back"> = {};
      for (const r of next.rows ?? []) nextSides[r.cardId] = "front";
      setSideByCardId(nextSides);
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

  function setLabel(r: Row) {
    const baseLabel = r.productSetName?.trim()
      ? r.productSetName.trim()
      : r.productSetIsBase == null
        ? "—"
        : r.productSetIsBase
          ? "Base"
          : "Insert";

    const prefix = r.productSetIsBase == null ? "" : r.productSetIsBase ? "Base — " : "Insert — ";
    return `${prefix}${baseLabel}`;
  }

  function totalValue(r: Row) {
    return (r.qty ?? 0) * (r.bookValue ?? 0);
  }

  function toggleSide(cardId: number) {
    setSideByCardId((prev) => {
      const cur = prev[cardId] ?? "front";
      return { ...prev, [cardId]: cur === "front" ? "back" : "front" };
    });
  }

  function pickImage(r: Row) {
    const side = sideByCardId[r.cardId] ?? "front";
    if (side === "back") return r.backImageUrl || r.frontImageUrl || null;
    return r.frontImageUrl || r.backImageUrl || null;
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/collection" style={{ textDecoration: "underline", fontWeight: 800 }}>
          ← Back to Collection
        </Link>
        <div style={{ fontWeight: 900, fontSize: 26 }}>Search Collection</div>

        {/* ✅ View toggle */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontWeight: 900, color: "#666" }}>View:</div>
          <button
            onClick={() => setView("table")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              fontWeight: 900,
              background: view === "table" ? "#f0f6ff" : "#fff",
            }}
          >
            Table
          </button>
          <button
            onClick={() => setView("cards")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              fontWeight: 900,
              background: view === "cards" ? "#f0f6ff" : "#fff",
            }}
          >
            Cards
          </button>
        </div>
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

          {/* ✅ CARDS VIEW */}
          {view === "cards" ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 14,
              }}
            >
              {rows.map((r) => {
                const img = pickImage(r);
                const hasBack = Boolean(r.backImageUrl);
                const side = sideByCardId[r.cardId] ?? "front";
                const totalVal = totalValue(r);

                return (
                  <div
                    key={r.cardId}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 14,
                      overflow: "hidden",
                      background: "#fff",
                    }}
                  >
                    <div style={{ padding: 10, borderBottom: "1px solid #eee", display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontWeight: 1000, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.player}
                      </div>
                      <Link
                        href={`/cards/${encodeURIComponent(String(r.cardId))}`}
                        style={{ textDecoration: "underline", fontWeight: 900, whiteSpace: "nowrap" }}
                      >
                        Detail
                      </Link>
                    </div>

                    <div style={{ padding: 10 }}>
                      <div
                        style={{
                          width: "100%",
                          aspectRatio: "2.5 / 3.5",
                          borderRadius: 12,
                          border: "1px solid #eee",
                          overflow: "hidden",
                          background: "#fafafa",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {img ? (
                          <img
                            src={img}
                            alt={`${r.player} #${r.cardNumber}`}
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            loading="lazy"
                          />
                        ) : (
                          <div style={{ color: "#777", fontWeight: 900 }}>No image</div>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                        <div style={{ fontWeight: 900 }}>#{r.cardNumber}</div>
                        <div style={{ color: "#666", fontWeight: 800 }}>{r.year ?? "—"}</div>
                        <div style={{ marginLeft: "auto", fontWeight: 1000 }}>Qty: {r.qty}</div>
                      </div>

                      <div style={{ marginTop: 6, color: "#444", fontWeight: 700 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <span style={{ fontWeight: 900 }}>Product:</span> {r.productId}
                        </div>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <span style={{ fontWeight: 900 }}>Set:</span> {setLabel(r)}
                        </div>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <span style={{ fontWeight: 900 }}>Subset/Variant:</span> {r.subset ?? "—"} / {r.variant ?? "—"}
                        </div>
                        <div>
                          <span style={{ fontWeight: 900 }}>Book:</span> ${Number(r.bookValue ?? 0).toFixed(2)}{" "}
                          <span style={{ marginLeft: 10, fontWeight: 900 }}>Total:</span> ${Number(totalVal).toFixed(2)}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button
                          onClick={() => setSideByCardId((prev) => ({ ...prev, [r.cardId]: "front" }))}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            fontWeight: 900,
                            background: side === "front" ? "#f7f7f7" : "#fff",
                            flex: 1,
                          }}
                        >
                          Front
                        </button>

                        <button
                          onClick={() => setSideByCardId((prev) => ({ ...prev, [r.cardId]: "back" }))}
                          disabled={!hasBack}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            fontWeight: 900,
                            background: side === "back" ? "#f7f7f7" : "#fff",
                            opacity: hasBack ? 1 : 0.45,
                            flex: 1,
                          }}
                          title={hasBack ? "Show back image" : "No back image available"}
                        >
                          Back
                        </button>

                        {/* Quick flip button (optional convenience) */}
                        <button
                          onClick={() => toggleSide(r.cardId)}
                          disabled={!hasBack}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            fontWeight: 1000,
                            opacity: hasBack ? 1 : 0.45,
                          }}
                          title="Flip"
                        >
                          ↺
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ✅ TABLE VIEW (your original table, plus Detail link) */
            <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
                  <tr>
                    {["Player", "Year", "Product", "Set", "#", "Subset", "Variant", "Qty", "Book", "Total", "Detail"].map(
                      (h) => (
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
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {rows.map((r, idx) => {
                    const zebra = idx % 2 === 0 ? "#fff" : "#fcfcfc";
                    const totalVal = totalValue(r);

                    return (
                      <tr key={`${r.cardId}-${idx}`} style={{ background: zebra }}>
                        <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                          {r.player}
                        </td>
                        <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.year ?? "—"}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 800 }}>
                          {r.productId}
                        </td>
                        <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{setLabel(r)}</td>
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
                        <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                          <Link
                            href={`/cards/${encodeURIComponent(String(r.cardId))}`}
                            style={{ textDecoration: "underline", fontWeight: 900 }}
                          >
                            Detail
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
