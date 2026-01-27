"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ProductSetOption = {
  id: string;
  isBase: boolean;
  name: string | null;
};

type ChecklistRow = {
  cardId: number;
  cardNumber: string;
  player: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  isInsert: boolean;
  bookValue: number | null;
  ownedQty: number;
};

type ChecklistResponse = {
  ok: boolean;
  productId: string;

  // ✅ new (from API)
  productSetId: string;
  productSetIsBase: boolean;
  productSets: ProductSetOption[];

  totalCards: number;
  uniqueOwned: number;
  percentComplete: number;
  rows: ChecklistRow[];
};

// --- Card number-aware sorting (ignores any prefix)
// Examples handled:
//   "BC-1" < "BC-2" < "BC-10"
//   "DK-007" < "DK-8"
//   "10" < "10a" < "10b" < "11"
//   "A12b" sorts like 12b
function parseCardNo(raw: string | null | undefined) {
  const s = (raw ?? "").trim();
  const lower = s.toLowerCase();

  // Find the first run of digits anywhere in the string.
  const m = lower.match(/(\d+)/);

  if (!m || m.index == null) {
    // No digits at all -> push to bottom, sort by text
    return {
      hasNum: false,
      n: Number.POSITIVE_INFINITY,
      suf: lower,
      raw: lower,
    };
  }

  const numStr = m[1];
  const n = parseInt(numStr, 10);

  // Everything AFTER that digit-run becomes the suffix for tie-breaking.
  // We also normalize by removing separators/spaces, keeping only a-z0-9.
  const start = m.index;
  const end = start + numStr.length;
  const suffixRaw = lower.slice(end);

  const suf = suffixRaw.replace(/[^a-z0-9]+/g, "");

  return {
    hasNum: Number.isFinite(n),
    n: Number.isFinite(n) ? n : Number.POSITIVE_INFINITY,
    suf,
    raw: lower,
  };
}

function cardNoCompare(aNo: string, bNo: string) {
  const a = parseCardNo(aNo);
  const b = parseCardNo(bNo);

  // numeric first (prefix ignored)
  if (a.n !== b.n) return a.n - b.n;

  // see "10a" vs "10b"
  if (a.suf !== b.suf) return a.suf.localeCompare(b.suf);

  // stable fallback (still does not prioritize prefix; it's only for deterministic ordering)
  return a.raw.localeCompare(b.raw);
}

function formatSetLabel(ps: ProductSetOption) {
  // Prefer name if you have it; otherwise show the id
  const base = ps.name?.trim() ? ps.name!.trim() : ps.id;
  return ps.isBase ? `Base — ${base}` : `Insert — ${base}`;
}

export default function ChecklistClient({ productId }: { productId: string }) {
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // dropdown state
  const [selectedProductSetId, setSelectedProductSetId] = useState<string>("");

  async function load(explicitProductSetId?: string) {
    setLoading(true);
    setErr(null);

    try {
      const qs = new URLSearchParams();
      const psid = (explicitProductSetId ?? selectedProductSetId).trim();
      if (psid) qs.set("productSetId", psid);

      const url =
        `/api/checklist/product/${encodeURIComponent(productId)}` +
        (qs.toString() ? `?${qs.toString()}` : "");

      const res = await fetch(url, { cache: "no-store" });
      const raw = await res.text();

      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Checklist returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      const next = j as ChecklistResponse;
      setData(next);

      // If we don't have a selection yet, lock the dropdown to whatever the API chose (base by default)
      if (!selectedProductSetId && next?.productSetId) {
        setSelectedProductSetId(next.productSetId);
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load checklist");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const sorted = useMemo(() => {
    const rows = data?.rows ?? [];
    return [...rows].sort((a, b) => cardNoCompare(a.cardNumber, b.cardNumber));
  }, [data]);

  const productSetsSorted = useMemo(() => {
    const arr = data?.productSets ?? [];
    // Base first, then inserts
    return [...arr].sort((a, b) => Number(b.isBase) - Number(a.isBase));
  }, [data]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Link
          href={`/collection/${encodeURIComponent(productId)}`}
          style={{ textDecoration: "underline", fontWeight: 800 }}
        >
          ← Back to Set
        </Link>

        <div style={{ fontWeight: 900, fontSize: 22 }}>Checklist: {productId}</div>

        <button onClick={() => load()} style={{ padding: "6px 10px" }}>
          Refresh
        </button>

        <Link href="/collection" style={{ textDecoration: "underline", fontWeight: 800 }}>
          Collection →
        </Link>
      </div>

      <hr style={{ margin: "14px 0" }} />

      {/* ✅ ProductSet dropdown */}
      {data?.productSets?.length ? (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 900 }}>Viewing:</div>
          <select
            value={selectedProductSetId}
            onChange={(e) => {
              const nextId = e.target.value;
              setSelectedProductSetId(nextId);
              load(nextId);
            }}
            style={{
              padding: "8px 10px",
              border: "1px solid #ddd",
              borderRadius: 10,
              minWidth: 260,
              fontWeight: 700,
            }}
          >
            {productSetsSorted.map((ps) => (
              <option key={ps.id} value={ps.id}>
                {formatSetLabel(ps)}
              </option>
            ))}
          </select>

          <div style={{ color: "#666", fontWeight: 700 }}>
            {data.productSetIsBase ? "Base set completion" : "Insert set completion"}
          </div>
        </div>
      ) : null}

      {err && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {err}
        </div>
      )}

      {loading ? (
        <div>Loading…</div>
      ) : !data ? (
        <div>No data.</div>
      ) : (
        <>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>
            Complete: {data.percentComplete.toFixed(1)}% ({data.uniqueOwned}/{data.totalCards} unique)
          </div>

          {sorted.length === 0 && (
            <div style={{ padding: 10, border: "1px solid #ddd", background: "#fffdf2" }}>
              Checklist loaded but returned 0 rows. This usually means the product set has no cards.
            </div>
          )}

          <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
                <tr>
                  {["Owned", "#", "Player", "Team", "Subset", "Variant", "Type", "Qty"].map((h) => (
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
                {sorted.map((r, idx) => {
                  const owned = (r.ownedQty ?? 0) > 0;
                  return (
                    <tr key={r.cardId} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {owned ? "✅" : "⬜"}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {r.cardNumber}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.player}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.team ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.subset ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.variant ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                        {r.isInsert ? "Insert" : "Base"}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 800 }}>
                        {r.ownedQty ?? 0}
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
