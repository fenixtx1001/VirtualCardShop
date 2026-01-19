"use client";

import { useEffect, useMemo, useState } from "react";

const ECONOMY_CHANGED_EVENT = "vcs:economy-changed";

type ProductRow = {
  id: string;
  year: number | null;
  brand: string | null;
  sport: string | null;
  packPriceCents: number;
  packsPerBox: number | null;
  boxPriceCents: number | null;
  packImageUrl: string | null;
  boxImageUrl: string | null;
  productSetsCount: number;
};

function centsToDollars(cents: number | null | undefined) {
  const c = typeof cents === "number" ? cents : 0;
  return (c / 100).toFixed(2);
}

function safeImgSrc(url: string | null | undefined) {
  const u = (url ?? "").trim();
  return u.length ? u : null;
}

function Thumb({
  src,
  label,
  size = 160,
}: {
  src: string | null;
  label: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return (
      <div
        title={`${label} image not set (or blocked)`}
        style={{
          width: size,
          height: size,
          border: "1px dashed #bbb",
          borderRadius: 14,
          display: "grid",
          placeItems: "center",
          fontSize: 12,
          color: "#777",
          background: "#fafafa",
          padding: 10,
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        No {label}
        <br />
        image
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${label} image`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      onError={() => setBroken(true)}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        border: "1px solid #ddd",
        borderRadius: 14,
        background: "white",
        display: "block",
      }}
    />
  );
}

function computeBoxPriceCents(packPriceCents: number, packsPerBox: number) {
  return Math.round(packPriceCents * packsPerBox * 0.75);
}

type SortKey = "name" | "year_desc" | "price_asc" | "price_desc";

export default function ShopPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [qty, setQty] = useState<Record<string, number>>({});
  const [buyingKey, setBuyingKey] = useState<string | null>(null);

  const [msg, setMsg] = useState<string | null>(null);

  // Filters / sort
  const [q, setQ] = useState("");
  const [sport, setSport] = useState<string>("all");
  const [year, setYear] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("name");

  async function load() {
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/shop/products", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Failed to load (${res.status})`);
      setRows(j);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load shop");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function buy(productId: string, kind: "pack" | "box") {
    const quantity = Math.max(1, Math.floor(qty[`${productId}:${kind}`] ?? 1));
    const key = `${productId}:${kind}`;
    setBuyingKey(key);
    setErr(null);
    setMsg(null);

    try {
      const res = await fetch("/api/shop/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, kind, quantity }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Non-JSON from buy (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Buy failed (${res.status})`);

      setMsg(
        `Bought ${kind} x${quantity} for $${centsToDollars(j.costCents)}. Packs added: ${j.packsAdded}.`
      );

      window.dispatchEvent(new CustomEvent(ECONOMY_CHANGED_EVENT));
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Buy failed");
    } finally {
      setBuyingKey(null);
    }
  }

  const sportOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.sport) set.add(r.sport);
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    for (const r of rows) if (typeof r.year === "number") set.add(r.year);
    const years = Array.from(set).sort((a, b) => b - a);
    return ["all", ...years.map(String)];
  }, [rows]);

  const filteredSorted = useMemo(() => {
    const query = q.trim().toLowerCase();

    let out = rows.filter((r) => {
      if (sport !== "all" && (r.sport ?? "") !== sport) return false;
      if (year !== "all" && String(r.year ?? "") !== year) return false;

      if (!query) return true;

      const hay = [
        r.id,
        r.brand ?? "",
        r.sport ?? "",
        r.year ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(query);
    });

    out.sort((a, b) => {
      if (sort === "name") return a.id.localeCompare(b.id);
      if (sort === "year_desc") return (b.year ?? 0) - (a.year ?? 0);
      if (sort === "price_asc") return (a.packPriceCents ?? 0) - (b.packPriceCents ?? 0);
      if (sort === "price_desc") return (b.packPriceCents ?? 0) - (a.packPriceCents ?? 0);
      return 0;
    });

    return out;
  }, [rows, q, sport, year, sort]);

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 900, marginTop: 0, marginBottom: 6 }}>Shop</h1>
          <div style={{ color: "#444" }}>
            Buy packs or discounted boxes. Boxes are priced at packPrice × packsPerBox × 0.75.
          </div>
        </div>

        <button
          onClick={load}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "white",
            fontWeight: 800,
          }}
        >
          Refresh
        </button>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 14,
          background: "#fafafa",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search (name, brand, sport, year)…"
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ccc",
            minWidth: 240,
          }}
        />

        <select
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ccc" }}
        >
          {sportOptions.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All sports" : s}
            </option>
          ))}
        </select>

        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ccc" }}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y === "all" ? "All years" : y}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ccc" }}
        >
          <option value="name">Sort: Name</option>
          <option value="year_desc">Sort: Year (new → old)</option>
          <option value="price_asc">Sort: Pack Price (low → high)</option>
          <option value="price_desc">Sort: Pack Price (high → low)</option>
        </select>

        <div style={{ marginLeft: "auto", fontSize: 12, color: "#444" }}>
          Showing <span style={{ fontWeight: 900 }}>{filteredSorted.length}</span> / {rows.length}
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {err ? (
        <div style={{ marginBottom: 12, padding: 12, background: "#fee", border: "1px solid #f99", borderRadius: 12 }}>
          {err}
        </div>
      ) : null}

      {msg ? (
        <div style={{ marginBottom: 12, padding: 12, background: "#efe", border: "1px solid #9f9", borderRadius: 12 }}>
          {msg}
        </div>
      ) : null}

      {loading ? (
        <div>Loading…</div>
      ) : filteredSorted.length === 0 ? (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12 }}>
          No matching products. Try clearing filters.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
          {filteredSorted.map((p) => {
            const packKey = `${p.id}:pack`;
            const boxKey = `${p.id}:box`;
            const packBuying = buyingKey === packKey;
            const boxBuying = buyingKey === boxKey;

            const packSrc = safeImgSrc(p.packImageUrl);
            const boxSrc = safeImgSrc(p.boxImageUrl);

            const derivedBox =
              p.packsPerBox && p.packsPerBox > 0
                ? computeBoxPriceCents(p.packPriceCents, p.packsPerBox)
                : null;

            const boxPriceCents = p.boxPriceCents ?? derivedBox;

            return (
              <div
                key={p.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 16,
                  background: "white",
                  overflow: "hidden",
                  boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ padding: 14, borderBottom: "1px solid #eee", background: "#fafafa" }}>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>{p.id}</div>
                  <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                    {(p.year ?? "—")} • {(p.brand ?? "—")} • {(p.sport ?? "—")} • Product Sets: {p.productSetsCount}
                  </div>
                </div>

                <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#333" }}>Pack</div>
                    <Thumb src={packSrc} label="Pack" />
                    <div style={{ fontSize: 12 }}>
                      <span style={{ fontWeight: 900 }}>Price:</span> ${centsToDollars(p.packPriceCents)}
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        value={String(qty[packKey] ?? 1)}
                        onChange={(e) => setQty((prev) => ({ ...prev, [packKey]: Number(e.target.value) }))}
                        style={{ width: 70, padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
                      />
                      <button
                        onClick={() => buy(p.id, "pack")}
                        disabled={packBuying}
                        style={{
                          flex: 1,
                          padding: "9px 10px",
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          background: packBuying ? "#f2f2f2" : "white",
                          fontWeight: 900,
                          cursor: packBuying ? "not-allowed" : "pointer",
                        }}
                      >
                        {packBuying ? "Buying…" : "Buy Pack(s)"}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#333" }}>Box</div>
                    <Thumb src={boxSrc} label="Box" />
                    <div style={{ fontSize: 12 }}>
                      <span style={{ fontWeight: 900 }}>Price:</span>{" "}
                      {boxPriceCents === null ? "—" : `$${centsToDollars(boxPriceCents)}`}
                      <span style={{ color: "#666" }}>{p.packsPerBox ? ` • ${p.packsPerBox} packs/box` : ""}</span>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        value={String(qty[boxKey] ?? 1)}
                        onChange={(e) => setQty((prev) => ({ ...prev, [boxKey]: Number(e.target.value) }))}
                        style={{ width: 70, padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
                      />
                      <button
                        onClick={() => buy(p.id, "box")}
                        disabled={boxBuying}
                        style={{
                          flex: 1,
                          padding: "9px 10px",
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          background: boxBuying ? "#f2f2f2" : "white",
                          fontWeight: 900,
                          cursor: boxBuying ? "not-allowed" : "pointer",
                        }}
                      >
                        {boxBuying ? "Buying…" : "Buy Box(es)"}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ padding: 14, borderTop: "1px solid #eee", background: "#fcfcfc", fontSize: 12, color: "#555" }}>
                  Images: use your own uploads (recommended). External sites may block hotlinking.
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
