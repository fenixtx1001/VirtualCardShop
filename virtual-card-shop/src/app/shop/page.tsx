// src/app/shop/page.tsx
"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { YourCardsPicker } from "./your-cards-picker";

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
  displayBoxImageUrl?: string | null;
  debug?: {
    hasPackImage?: boolean;
    hasBoxImage?: boolean;
    displayBoxFrom?: string;
  };
  productSetsCount: number;
  released?: boolean;

  isDailyDeal?: boolean;
  dailyDealDateKey?: string | null;
  dailyDealDiscountBps?: number;

  standardPackPriceCents?: number;
  standardBoxPriceCents?: number | null;
  dealPackPriceCents?: number;
  dealBoxPriceCents?: number | null;
  effectivePackPriceCents?: number;
  effectiveBoxPriceCents?: number | null;

  createdAt?: string | null;
  isNewProduct?: boolean;
};

type SortKey = "name" | "year_desc" | "price_asc" | "price_desc";
type SinglesSortKey = "default" | "price_asc" | "price_desc";

type OfferCard = {
  id: number;
  player: string;
  cardNumber: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  bookValue: number;
  frontImageUrl: string | null;
  productSetId: string | null;
};

type ShopOfferRow = {
  id: number;
  userId: string;
  cardId: number;
  offerBps: number;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedQty?: number | null;
  acceptedTotalCents?: number | null;
  card?: OfferCard;
};

type ShopInventoryCard = {
  id: number;
  player: string;
  team: string | null;
  cardNumber: string;
  subset: string | null;
  variant: string | null;
  bookValue: number;
  frontImageUrl: string | null;
  productSetId: string | null;
  friendlySetName?: string | null;
  friendlyProductLabel?: string | null;
};

type ShopInventoryRow = {
  cardId: number;
  quantity: number;
  updatedAt?: string;
  youOwnQty: number;
  card: ShopInventoryCard;
};

function centsToDollars(cents: number | null | undefined) {
  const c = typeof cents === "number" ? cents : 0;
  return (c / 100).toFixed(2);
}

function dailyDealLabel(p: ProductRow | null | undefined) {
  if (!p?.isDailyDeal) return null;
  const bps = typeof p.dailyDealDiscountBps === "number" ? p.dailyDealDiscountBps : 1000;
  const pct = Math.round(bps / 100);
  return `${pct}% OFF TODAY`;
}

function effectivePackPrice(p: ProductRow) {
  return typeof p.effectivePackPriceCents === "number" ? p.effectivePackPriceCents : p.packPriceCents;
}

function standardPackPrice(p: ProductRow) {
  return typeof p.standardPackPriceCents === "number" ? p.standardPackPriceCents : p.packPriceCents;
}

function effectiveBoxPrice(p: ProductRow, derivedBox: number | null) {
  if (typeof p.effectiveBoxPriceCents === "number") return p.effectiveBoxPriceCents;
  return p.boxPriceCents ?? derivedBox;
}

function standardBoxPrice(p: ProductRow, derivedBox: number | null) {
  if (typeof p.standardBoxPriceCents === "number") return p.standardBoxPriceCents;
  return p.boxPriceCents ?? derivedBox;
}

function PriceLine({
  label,
  standardCents,
  effectiveCents,
  isDeal,
  suffix,
}: {
  label: string;
  standardCents: number | null;
  effectiveCents: number | null;
  isDeal: boolean;
  suffix?: string;
}) {
  return (
    <div style={{ fontSize: 12 }}>
      <span style={{ fontWeight: 900 }}>{label}:</span>{" "}
      {effectiveCents === null ? (
        "—"
      ) : isDeal && standardCents !== null && standardCents > effectiveCents ? (
        <>
          <span style={{ textDecoration: "line-through", color: "#777", marginRight: 6 }}>
            ${centsToDollars(standardCents)}
          </span>
          <span style={{ fontWeight: 1000, color: "#9b1c1c" }}>${centsToDollars(effectiveCents)}</span>
        </>
      ) : (
        <>${centsToDollars(effectiveCents)}</>
      )}
      {suffix ? <span style={{ color: "#666" }}> {suffix}</span> : null}
    </div>
  );
}

function NewProductBadge() {
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 3,
        display: "flex",
        alignItems: "center",
        gap: 5,
        borderRadius: 999,
        padding: "5px 9px",
        background: "#0f172a",
        color: "white",
        fontSize: 11,
        fontWeight: 1000,
        letterSpacing: 0.3,
        boxShadow: "0 0 16px rgba(34, 197, 94, 0.75)",
        border: "1px solid rgba(34, 197, 94, 0.9)",
      }}
      title="Added within the past week"
    >
      ✨ New
    </div>
  );
}

function safeImgSrc(url: string | null | undefined) {
  const u = (url ?? "").trim();
  return u.length ? u : null;
}

function formatFriendlyProductName(productId: string) {
  const s = String(productId || "").trim();
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function formatFriendlyProductSetLabel(card: ShopInventoryCard) {
  const setName = (card.friendlySetName ?? "").trim();
  const productLabel = (card.friendlyProductLabel ?? "").trim();

  if (setName && productLabel) return `${productLabel} • ${setName}`;
  if (setName) return setName;
  if (card.productSetId) return formatFriendlyProductName(card.productSetId);
  return "—";
}

function compactMetaLine(parts: Array<string | null | undefined>) {
  return parts.map((x) => (x ?? "").trim()).filter(Boolean).join(" • ");
}

function Thumb({
  src,
  label,
  size = 190,
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

function pctBpsToText(bps: number) {
  const pct = bps / 100;
  return `${pct.toFixed(2)}%`;
}

function fmtOfferLine(o: ShopOfferRow) {
  const player = o.card?.player ?? `Card #${o.cardId}`;
  const num = o.card?.cardNumber ? ` #${o.card.cardNumber}` : "";
  return `${player}${num}`;
}

function tabBtnStyle(active: boolean): CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ccc",
    background: active ? "#111" : "white",
    color: active ? "white" : "#111",
    fontWeight: 900,
    cursor: "pointer",
  };
}

/** ---------------------------
 *  SEALED TAB
 *  ------------------------- */
function SealedShopTab() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [qty, setQty] = useState<Record<string, number>>({});
  const [buyingKey, setBuyingKey] = useState<string | null>(null);

  const [msg, setMsg] = useState<string | null>(null);

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

      const incoming = Array.isArray(j) ? (j as ProductRow[]) : [];
      const normalized = incoming.map((p: any) => ({
        ...p,
        released: typeof p?.released === "boolean" ? p.released : false,
      })) as ProductRow[];

      setRows(normalized.filter((p) => p.released === true));
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

      setMsg(`Bought ${kind} x${quantity} for $${centsToDollars(j.costCents)}. Packs added: ${j.packsAdded}.`);

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
      if (r.released !== true) return false;
      if (sport !== "all" && (r.sport ?? "") !== sport) return false;
      if (year !== "all" && String(r.year ?? "") !== year) return false;
      if (!query) return true;

      const friendly = formatFriendlyProductName(r.id);
      const hay = [r.id, friendly, r.brand ?? "", r.sport ?? "", r.year ?? ""].join(" ").toLowerCase();

      return hay.includes(query);
    });

    out.sort((a, b) => {
      if (sort === "name") return formatFriendlyProductName(a.id).localeCompare(formatFriendlyProductName(b.id));
      if (sort === "year_desc") return (b.year ?? 0) - (a.year ?? 0);
      if (sort === "price_asc") return effectivePackPrice(a) - effectivePackPrice(b);
      if (sort === "price_desc") return effectivePackPrice(b) - effectivePackPrice(a);
      return 0;
    });

    return out;
  }, [rows, q, sport, year, sort]);

  const dailyDeal = useMemo(
    () => rows.find((r) => r.released === true && r.isDailyDeal === true) ?? null,
    [rows]
  );

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 900, marginTop: 0, marginBottom: 6 }}>Shop</h1>
          <div style={{ color: "#444" }}>
            Buy packs or discounted boxes. Boxes are priced at packPrice × packsPerBox × 0.75. One daily deal gets an extra 10% off packs and boxes until midnight.
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

      {dailyDeal ? (
        <div
          style={{
            marginTop: 16,
            border: "2px solid #f0b429",
            borderRadius: 18,
            overflow: "hidden",
            background: "linear-gradient(135deg, #fff7cc 0%, #fffdf2 48%, #ffffff 100%)",
            boxShadow: "0 0 22px rgba(240, 180, 41, 0.38)",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(240, 180, 41, 0.18)",
              borderBottom: "1px solid rgba(240, 180, 41, 0.4)",
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 1000, letterSpacing: 1.2, color: "#8a5a00" }}>
                🔥 DAILY DEAL
              </div>
              <div style={{ fontSize: 24, fontWeight: 1000 }}>
                {formatFriendlyProductName(dailyDeal.id)}
              </div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                {dailyDeal.year ?? "—"} • {dailyDeal.brand ?? "—"} • {dailyDeal.sport ?? "—"} • Changes at midnight
              </div>
            </div>

            <div
              style={{
                borderRadius: 999,
                padding: "8px 12px",
                background: "#111",
                color: "white",
                fontSize: 12,
                fontWeight: 1000,
              }}
            >
              {dailyDealLabel(dailyDeal)}
            </div>
          </div>

          <div
            style={{
              padding: 16,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 18,
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div style={{ position: "relative", display: "inline-block" }}>
                {dailyDeal.isNewProduct ? <NewProductBadge /> : null}
                <Thumb
                  src={safeImgSrc(dailyDeal.displayBoxImageUrl ?? dailyDeal.boxImageUrl ?? dailyDeal.packImageUrl)}
                  label="Daily Deal Box"
                  size={200}
                />
              </div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {(() => {
                const derivedBox =
                  dailyDeal.packsPerBox && dailyDeal.packsPerBox > 0
                    ? computeBoxPriceCents(dailyDeal.packPriceCents, dailyDeal.packsPerBox)
                    : null;

                const packKey = `${dailyDeal.id}:pack`;
                const boxKey = `${dailyDeal.id}:box`;

                return (
                  <>
                    <PriceLine
                      label="Pack deal"
                      standardCents={standardPackPrice(dailyDeal)}
                      effectiveCents={effectivePackPrice(dailyDeal)}
                      isDeal={dailyDeal.isDailyDeal === true}
                    />

                    <PriceLine
                      label="Box deal"
                      standardCents={standardBoxPrice(dailyDeal, derivedBox)}
                      effectiveCents={effectiveBoxPrice(dailyDeal, derivedBox)}
                      isDeal={dailyDeal.isDailyDeal === true}
                      suffix={dailyDeal.packsPerBox ? `• ${dailyDeal.packsPerBox} packs/box` : ""}
                    />

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                      <button
                        onClick={() => buy(dailyDeal.id, "pack")}
                        disabled={buyingKey === packKey}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: "1px solid #111",
                          background: buyingKey === packKey ? "#f2f2f2" : "#111",
                          color: buyingKey === packKey ? "#555" : "white",
                          fontWeight: 1000,
                          cursor: buyingKey === packKey ? "not-allowed" : "pointer",
                        }}
                      >
                        {buyingKey === packKey ? "Buying…" : "Buy Daily Deal Pack"}
                      </button>

                      <button
                        onClick={() => buy(dailyDeal.id, "box")}
                        disabled={buyingKey === boxKey}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: "1px solid #111",
                          background: buyingKey === boxKey ? "#f2f2f2" : "white",
                          color: "#111",
                          fontWeight: 1000,
                          cursor: buyingKey === boxKey ? "not-allowed" : "pointer",
                        }}
                      >
                        {buyingKey === boxKey ? "Buying…" : "Buy Daily Deal Box"}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      ) : null}

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

            const displayName = formatFriendlyProductName(p.id);
            const boxOnlySrc = safeImgSrc(p.displayBoxImageUrl ?? p.boxImageUrl ?? p.packImageUrl);

            const derivedBox =
              p.packsPerBox && p.packsPerBox > 0 ? computeBoxPriceCents(p.packPriceCents, p.packsPerBox) : null;

            const boxPriceCents = effectiveBoxPrice(p, derivedBox);
            const originalBoxPriceCents = standardBoxPrice(p, derivedBox);
            const packPriceCents = effectivePackPrice(p);
            const originalPackPriceCents = standardPackPrice(p);
            const isDeal = p.isDailyDeal === true;

            return (
              <div
                key={p.id}
                style={{
                  border: isDeal ? "2px solid #f0b429" : "1px solid #ddd",
                  borderRadius: 16,
                  background: isDeal ? "linear-gradient(180deg, #fffdf2 0%, #ffffff 45%)" : "white",
                  overflow: "hidden",
                  boxShadow: isDeal ? "0 0 16px rgba(240, 180, 41, 0.32)" : "0 1px 0 rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ padding: 14, borderBottom: "1px solid #eee", background: "#fafafa" }}>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>{displayName}</div>
                  {isDeal ? (
                    <div
                      style={{
                        display: "inline-block",
                        marginTop: 6,
                        borderRadius: 999,
                        padding: "4px 8px",
                        background: "#111",
                        color: "white",
                        fontSize: 11,
                        fontWeight: 1000,
                      }}
                    >
                      🔥 DAILY DEAL • {dailyDealLabel(p)}
                    </div>
                  ) : null}
                  <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                    {(p.year ?? "—")} • {(p.brand ?? "—")} • {(p.sport ?? "—")} • Product Sets: {p.productSetsCount}
                  </div>
                </div>

                <div style={{ padding: 14, display: "flex", justifyContent: "center" }}>
                  <div style={{ position: "relative", display: "inline-block" }}>
                    {p.isNewProduct ? <NewProductBadge /> : null}
                    <Thumb src={boxOnlySrc} label="Box" size={190} />
                  </div>
                </div>

                <div style={{ padding: "0 14px 10px", fontSize: 11, color: "#666" }}>
                  {boxOnlySrc ? (
                    <>
                      Image source:{" "}
                      <span style={{ fontWeight: 800 }}>{p.debug?.displayBoxFrom ?? "displayBoxImageUrl/box/pack"}</span> •{" "}
                      <a href={boxOnlySrc} target="_blank" rel="noreferrer">
                        Open image
                      </a>
                    </>
                  ) : (
                    <>
                      No image URL found (boxImageUrl and packImageUrl are empty).{" "}
                      <span style={{ fontWeight: 800 }}>
                        (hasBox={String(!!p.boxImageUrl)}, hasPack={String(!!p.packImageUrl)})
                      </span>
                    </>
                  )}
                </div>

                <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#333" }}>Pack</div>

                    <PriceLine
                      label="Price"
                      standardCents={originalPackPriceCents}
                      effectiveCents={packPriceCents}
                      isDeal={isDeal}
                    />

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

                    <PriceLine
                      label="Price"
                      standardCents={originalBoxPriceCents}
                      effectiveCents={boxPriceCents}
                      isDeal={isDeal}
                      suffix={p.packsPerBox ? `• ${p.packsPerBox} packs/box` : ""}
                    />

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

                <div
                  style={{
                    padding: 14,
                    borderTop: "1px solid #eee",
                    background: "#fcfcfc",
                    fontSize: 12,
                    color: "#555",
                  }}
                >
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

/** ---------------------------
 *  SINGLES TAB
 *  ------------------------- */
function SinglesShopTab() {
  const [offers, setOffers] = useState<ShopOfferRow[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersErr, setOffersErr] = useState<string | null>(null);
  const [offersMsg, setOffersMsg] = useState<string | null>(null);

  const [requestCardId, setRequestCardId] = useState<string>("");
  const [requesting, setRequesting] = useState(false);

  const [sellQty, setSellQty] = useState<Record<number, number>>({});
  const [sellingOfferId, setSellingOfferId] = useState<number | null>(null);

  const [invRows, setInvRows] = useState<ShopInventoryRow[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [invErr, setInvErr] = useState<string | null>(null);

  const [invQ, setInvQ] = useState("");
  const [invPage, setInvPage] = useState(1);
  const [invTotalPages, setInvTotalPages] = useState(1);
  const [invTotal, setInvTotal] = useState(0);
  const [invSort, setInvSort] = useState<SinglesSortKey>("default");
  const [onlyNeed, setOnlyNeed] = useState(false);

  const [buyQty, setBuyQty] = useState<Record<number, number>>({});
  const [buyingCardId, setBuyingCardId] = useState<number | null>(null);

  async function loadOffers() {
    setOffersLoading(true);
    setOffersErr(null);
    setOffersMsg(null);
    try {
      const res = await fetch("/api/shop/singles/offers", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Failed to load offers (${res.status})`);
      setOffers(Array.isArray(j?.offers) ? (j.offers as ShopOfferRow[]) : []);
    } catch (e: any) {
      setOffersErr(e?.message ?? "Failed to load offers");
    } finally {
      setOffersLoading(false);
    }
  }

  async function loadInventory(
    page = invPage,
    q = invQ,
    sort = invSort,
    needOnly = onlyNeed
  ) {
    setInvLoading(true);
    setInvErr(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      params.set("page", String(page));
      params.set("pageSize", "30");
      params.set("sort", sort);
      if (needOnly) params.set("onlyNeed", "1");

      const res = await fetch(`/api/shop/singles/inventory?${params.toString()}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Failed to load inventory (${res.status})`);

      setInvRows(Array.isArray(j?.rows) ? (j.rows as ShopInventoryRow[]) : []);
      setInvTotalPages(typeof j?.totalPages === "number" ? j.totalPages : 1);
      setInvPage(typeof j?.page === "number" ? j.page : page);
      setInvTotal(typeof j?.total === "number" ? j.total : 0);
    } catch (e: any) {
      setInvErr(e?.message ?? "Failed to load shop inventory");
    } finally {
      setInvLoading(false);
    }
  }

  useEffect(() => {
    loadOffers();
    loadInventory(1, "", "default", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestOffer() {
    const cardId = Number(requestCardId);
    if (!Number.isFinite(cardId) || cardId <= 0) {
      setOffersErr("Enter a valid Card ID.");
      return;
    }

    setRequesting(true);
    setOffersErr(null);
    setOffersMsg(null);

    try {
      const res = await fetch("/api/shop/singles/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Non-JSON from offers (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Offer request failed (${res.status})`);

      setOffersMsg(j?.reused ? "Offer already active for that card (reused)." : "Offer created.");
      setRequestCardId("");
      await loadOffers();
    } catch (e: any) {
      setOffersErr(e?.message ?? "Offer request failed");
    } finally {
      setRequesting(false);
    }
  }

  async function sellOffer(offerId: number) {
    const q = Math.max(1, Math.floor(sellQty[offerId] ?? 1));
    setSellingOfferId(offerId);
    setOffersErr(null);
    setOffersMsg(null);

    try {
      const res = await fetch("/api/shop/singles/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, quantity: q }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Non-JSON from sell (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Sell failed (${res.status})`);

      setOffersMsg(`Sold x${j.quantity} for $${centsToDollars(j.totalCents)} @ ${pctBpsToText(j.offerBps)}.`);
      window.dispatchEvent(new CustomEvent(ECONOMY_CHANGED_EVENT));
      await loadOffers();
      await loadInventory(invPage, invQ, invSort, onlyNeed);
    } catch (e: any) {
      setOffersErr(e?.message ?? "Sell failed");
    } finally {
      setSellingOfferId(null);
    }
  }

  async function buySingle(cardId: number) {
    const q = Math.max(1, Math.floor(buyQty[cardId] ?? 1));
    setBuyingCardId(cardId);
    setInvErr(null);
    setOffersMsg(null);

    try {
      const res = await fetch("/api/shop/singles/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, quantity: q }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Non-JSON from buy single (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Buy failed (${res.status})`);

      setOffersMsg(`Bought x${j.quantity} for $${centsToDollars(j.totalCents)}.`);
      window.dispatchEvent(new CustomEvent(ECONOMY_CHANGED_EVENT));
      await loadInventory(invPage, invQ, invSort, onlyNeed);
    } catch (e: any) {
      setInvErr(e?.message ?? "Buy failed");
    } finally {
      setBuyingCardId(null);
    }
  }

  const activeCount = offers.length;

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 6px" }}>Singles</h2>
      <div style={{ color: "#444", marginBottom: 12 }}>
        Sell cards to the shop via 24h offers (max <b>15 active offers</b>). Buy singles from shop inventory at{" "}
        <b>100% book</b>.
      </div>

      {offersErr ? (
        <div style={{ marginBottom: 12, padding: 12, background: "#fee", border: "1px solid #f99", borderRadius: 12 }}>
          {offersErr}
        </div>
      ) : null}

      {offersMsg ? (
        <div style={{ marginBottom: 12, padding: 12, background: "#efe", border: "1px solid #9f9", borderRadius: 12 }}>
          {offersMsg}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12, background: "#fafafa" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Request an offer</div>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>
            Current active offers: <b>{activeCount}</b> / 15
          </div>

          <YourCardsPicker
            onPick={(id) => {
              setRequestCardId(String(id));
              setOffersMsg(`Selected Card ID ${id}. Now click “Get Offer (24h)”.`);
              setOffersErr(null);
            }}
            disabled={requesting}
          />

          <div style={{ height: 10 }} />

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={requestCardId}
              onChange={(e) => setRequestCardId(e.target.value)}
              placeholder="Card ID (auto-filled above, or type manually)"
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ccc", width: 320 }}
            />
            <button
              onClick={requestOffer}
              disabled={requesting}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: requesting ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: requesting ? "not-allowed" : "pointer",
              }}
            >
              {requesting ? "Requesting…" : "Get Offer (24h)"}
            </button>

            <button
              onClick={loadOffers}
              disabled={offersLoading}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: offersLoading ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: offersLoading ? "not-allowed" : "pointer",
              }}
            >
              {offersLoading ? "Loading…" : "Refresh Offers"}
            </button>
          </div>

          <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
            Tip: search your collection above (player/team/set), click “Use this card →”, then request the offer.
          </div>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontWeight: 900 }}>Active Offers</div>
            <div style={{ fontSize: 12, color: "#666" }}>
              Offers expire automatically. Accepting any quantity closes the offer immediately.
            </div>
          </div>

          {offersLoading ? (
            <div style={{ marginTop: 10 }}>Loading offers…</div>
          ) : offers.length === 0 ? (
            <div style={{ marginTop: 10, padding: 12, background: "#fafafa", borderRadius: 12, border: "1px solid #eee" }}>
              No active offers. Request one above.
            </div>
          ) : (
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {offers.map((o) => {
                const img = safeImgSrc(o.card?.frontImageUrl ?? null);
                const exp = new Date(o.expiresAt);
                const now = new Date();
                const minsLeft = Math.max(0, Math.floor((exp.getTime() - now.getTime()) / 60000));
                const hoursLeft = Math.floor(minsLeft / 60);
                const remMins = minsLeft % 60;

                return (
                  <div
                    key={o.id}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 14,
                      padding: 12,
                      background: "#fcfcfc",
                      display: "grid",
                      gridTemplateColumns: "64px 1fr",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 12,
                        overflow: "hidden",
                        border: "1px solid #ddd",
                        background: "white",
                      }}
                    >
                      {img ? (
                        <img src={img} alt="Card" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontSize: 11, color: "#777" }}>
                          No image
                        </div>
                      )}
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 900 }}>{fmtOfferLine(o)}</div>
                        <div style={{ fontSize: 12, color: "#555" }}>
                          Offer: <b>{pctBpsToText(o.offerBps)}</b>
                          {o.card ? (
                            <>
                              {" "}• Book: <b>${Number(o.card.bookValue ?? 0).toFixed(2)}</b>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div style={{ fontSize: 12, color: "#666" }}>
                        Expires in <b>{hoursLeft}h {remMins}m</b> • Offer ID: {o.id} • Card ID: {o.cardId}
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          value={String(sellQty[o.id] ?? 1)}
                          onChange={(e) => setSellQty((prev) => ({ ...prev, [o.id]: Number(e.target.value) }))}
                          style={{ width: 80, padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
                        />
                        <button
                          onClick={() => sellOffer(o.id)}
                          disabled={sellingOfferId === o.id}
                          style={{
                            padding: "9px 10px",
                            borderRadius: 10,
                            border: "1px solid #ccc",
                            background: sellingOfferId === o.id ? "#f2f2f2" : "white",
                            fontWeight: 900,
                            cursor: sellingOfferId === o.id ? "not-allowed" : "pointer",
                          }}
                        >
                          {sellingOfferId === o.id ? "Selling…" : "Sell to Shop"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Shop Inventory (Singles)</div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              value={invQ}
              onChange={(e) => setInvQ(e.target.value)}
              placeholder="Search shop inventory (player, team, card #, subset, set)…"
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ccc", minWidth: 320 }}
            />

            <select
              value={invSort}
              onChange={(e) => setInvSort(e.target.value as SinglesSortKey)}
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ccc" }}
            >
              <option value="default">Sort: Stock / newest</option>
              <option value="price_asc">Sort: Price (low → high)</option>
              <option value="price_desc">Sort: Price (high → low)</option>
            </select>

            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ddd",
                background: "#fafafa",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={onlyNeed}
                onChange={(e) => setOnlyNeed(e.target.checked)}
              />
              Only cards I need
            </label>

            <button
              onClick={() => loadInventory(1, invQ, invSort, onlyNeed)}
              disabled={invLoading}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: invLoading ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: invLoading ? "not-allowed" : "pointer",
              }}
            >
              {invLoading ? "Searching…" : "Search"}
            </button>

            <button
              onClick={() => {
                setInvQ("");
                setInvSort("default");
                setOnlyNeed(false);
                loadInventory(1, "", "default", false);
              }}
              disabled={invLoading}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: invLoading ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: invLoading ? "not-allowed" : "pointer",
              }}
            >
              Reset
            </button>

            <div style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>
              Showing <b>{invRows.length}</b> of <b>{invTotal}</b> • Page <b>{invPage}</b> / {invTotalPages}
            </div>

            <button
              onClick={() => {
                const next = Math.max(1, invPage - 1);
                loadInventory(next, invQ, invSort, onlyNeed);
              }}
              disabled={invLoading || invPage <= 1}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: invLoading || invPage <= 1 ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: invLoading || invPage <= 1 ? "not-allowed" : "pointer",
              }}
            >
              Prev
            </button>

            <button
              onClick={() => {
                const next = Math.min(invTotalPages, invPage + 1);
                loadInventory(next, invQ, invSort, onlyNeed);
              }}
              disabled={invLoading || invPage >= invTotalPages}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: invLoading || invPage >= invTotalPages ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: invLoading || invPage >= invTotalPages ? "not-allowed" : "pointer",
              }}
            >
              Next
            </button>
          </div>

          {invErr ? (
            <div style={{ marginTop: 12, padding: 12, background: "#fee", border: "1px solid #f99", borderRadius: 12 }}>
              {invErr}
            </div>
          ) : null}

          {invLoading ? (
            <div style={{ marginTop: 12 }}>Loading inventory…</div>
          ) : invRows.length === 0 ? (
            <div style={{ marginTop: 12, padding: 12, background: "#fafafa", borderRadius: 12, border: "1px solid #eee" }}>
              No shop inventory found.
            </div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {invRows.map((r) => {
                const img = safeImgSrc(r.card?.frontImageUrl ?? null);
                const priceCents = Math.round((Number(r.card.bookValue ?? 0) || 0) * 100);
                const detailsLine = compactMetaLine([r.card.team, r.card.subset, r.card.variant]);
                const setLine = formatFriendlyProductSetLabel(r.card);

                return (
                  <div
                    key={r.cardId}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 14,
                      padding: 12,
                      background: "#fcfcfc",
                      display: "grid",
                      gridTemplateColumns: "64px 1fr",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 12,
                        overflow: "hidden",
                        border: "1px solid #ddd",
                        background: "white",
                      }}
                    >
                      {img ? (
                        <img src={img} alt="Card" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontSize: 11, color: "#777" }}>
                          No image
                        </div>
                      )}
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 900 }}>
                          {r.card.player} {r.card.cardNumber ? `#${r.card.cardNumber}` : ""}
                          <span style={{ fontWeight: 600, color: "#666" }}> ({r.quantity} in stock)</span>
                        </div>

                        <div style={{ fontSize: 12, color: "#555" }}>
                          Price: <b>${centsToDollars(priceCents)}</b> • Card ID: {r.cardId}
                        </div>
                      </div>

                      <div style={{ fontSize: 12, color: "#666" }}>
                        {detailsLine || "—"}
                      </div>

                      <div style={{ fontSize: 12, color: "#444", fontWeight: 700 }}>
                        {setLine}
                      </div>

                      <div style={{ fontSize: 12, color: r.youOwnQty > 0 ? "#1f5133" : "#666", fontWeight: 800 }}>
                        You own: {r.youOwnQty}
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          value={String(buyQty[r.cardId] ?? 1)}
                          onChange={(e) => setBuyQty((prev) => ({ ...prev, [r.cardId]: Number(e.target.value) }))}
                          style={{ width: 80, padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
                        />
                        <button
                          onClick={() => buySingle(r.cardId)}
                          disabled={buyingCardId === r.cardId}
                          style={{
                            padding: "9px 10px",
                            borderRadius: 10,
                            border: "1px solid #ccc",
                            background: buyingCardId === r.cardId ? "#f2f2f2" : "white",
                            fontWeight: 900,
                            cursor: buyingCardId === r.cardId ? "not-allowed" : "pointer",
                          }}
                        >
                          {buyingCardId === r.cardId ? "Buying…" : "Buy"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** ---------------------------
 *  PAGE WITH TABS
 *  ------------------------- */
type ShopTab = "sealed" | "singles";

export default function ShopPage() {
  const [tab, setTab] = useState<ShopTab>("sealed");

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={() => setTab("sealed")} style={tabBtnStyle(tab === "sealed")}>
          Sealed (Packs/Boxes)
        </button>
        <button onClick={() => setTab("singles")} style={tabBtnStyle(tab === "singles")}>
          Singles
        </button>

        <div style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>
          Tip: Singles offers expire in 24 hours. Accepting closes the offer immediately.
        </div>
      </div>

      {tab === "sealed" ? <SealedShopTab /> : <SinglesShopTab />}
    </div>
  );
}