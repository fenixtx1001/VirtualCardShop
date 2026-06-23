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
  rejectedAt?: string | null;
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

type OfferSellBucket = {
  grade: number;
  gradeLabel: string;
  qtyOwned: number;
  perCardValueCents: number;
  rawBookValueCents: number;
  totalBucketValueCents: number;
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
    <div className="shop-vault">
      <style>{`
        .shop-vault {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #171717;
        }

        .shop-hero {
          border: 1px solid #e7e3dc;
          border-radius: 24px;
          padding: 18px;
          background:
            radial-gradient(circle at 10% 0%, rgba(199,168,90,0.16), transparent 36%),
            linear-gradient(135deg, rgba(255,255,255,0.98), rgba(255,250,239,0.94));
          box-shadow: 0 18px 50px rgba(48,38,23,0.08);
        }

        .shop-hero-top {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .shop-kicker {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: 1px solid rgba(184,146,59,0.38);
          background: #fff8e7;
          color: #6c4b09;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          width: fit-content;
        }

        .shop-title {
          margin: 10px 0 0;
          font-size: clamp(34px, 5vw, 52px);
          line-height: 0.95;
          letter-spacing: -0.055em;
          font-weight: 950;
        }

        .shop-subtitle {
          margin-top: 10px;
          max-width: 720px;
          color: #5f5a52;
          font-size: 14px;
          line-height: 1.5;
          font-weight: 650;
        }

        .shop-refresh {
          border: 1px solid #d8cfc2;
          background: rgba(255,255,255,0.8);
          border-radius: 14px;
          padding: 10px 13px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 8px 22px rgba(48,38,23,0.05);
        }

        .shop-toolbar {
          margin-top: 14px;
          border: 1px solid #e7e3dc;
          border-radius: 20px;
          background: rgba(255,255,255,0.88);
          padding: 12px;
          display: grid;
          gap: 10px;
          box-shadow: 0 10px 30px rgba(48,38,23,0.045);
          position: sticky;
          top: 86px;
          z-index: 20;
          backdrop-filter: blur(12px);
        }

        .shop-toolbar-row {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) auto auto auto;
          gap: 9px;
          align-items: center;
        }

        .shop-input,
        .shop-select {
          border: 1px solid #d8cfc2;
          border-radius: 14px;
          background: #fff;
          padding: 11px 12px;
          color: #171717;
          font-weight: 820;
          min-width: 0;
          outline: none;
        }

        .shop-select {
          min-width: 145px;
        }

        .shop-count {
          color: #5f5a52;
          font-size: 12px;
          font-weight: 850;
          white-space: nowrap;
        }

        .daily-deal-card {
          margin-top: 16px;
          border: 1px solid rgba(184,146,59,0.55);
          border-radius: 24px;
          overflow: hidden;
          background:
            radial-gradient(circle at 16% 0%, rgba(240,180,41,0.24), transparent 42%),
            linear-gradient(135deg, #fff8dc 0%, #fffdf4 45%, #ffffff 100%);
          box-shadow: 0 18px 42px rgba(184,146,59,0.18);
        }

        .daily-deal-inner {
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: 18px;
          align-items: center;
          padding: 18px;
        }

        .daily-image-wrap {
          position: relative;
          min-height: 220px;
          border-radius: 20px;
          border: 1px solid rgba(184,146,59,0.30);
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,0.90), transparent 46%),
            linear-gradient(135deg, #f5ecd7, #fffaf0);
          display: grid;
          place-items: center;
          overflow: hidden;
        }

        .daily-img,
        .shop-product-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
          filter: drop-shadow(0 14px 18px rgba(25,18,9,0.20));
        }

        .daily-img {
          max-width: 220px;
          max-height: 220px;
          padding: 12px;
        }

        .daily-copy {
          min-width: 0;
        }

        .daily-title-row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          align-items: flex-start;
        }

        .daily-title {
          font-size: clamp(24px, 3.5vw, 36px);
          line-height: 1.0;
          letter-spacing: -0.04em;
          font-weight: 950;
        }

        .daily-meta {
          margin-top: 8px;
          color: #5f5a52;
          font-size: 13px;
          font-weight: 750;
        }

        .deal-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 7px 11px;
          background: #111;
          color: white;
          font-size: 11px;
          font-weight: 950;
          white-space: nowrap;
        }

        .daily-price-grid {
          margin-top: 16px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .price-tile {
          border: 1px solid rgba(184,146,59,0.26);
          border-radius: 18px;
          background: rgba(255,255,255,0.78);
          padding: 12px;
          min-width: 0;
        }

        .price-label {
          color: #5f5a52;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .price-main {
          margin-top: 5px;
          font-size: 22px;
          font-weight: 950;
          letter-spacing: -0.04em;
        }

        .price-sub {
          margin-top: 3px;
          color: #7a5200;
          font-size: 12px;
          font-weight: 850;
        }

        .daily-actions {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .shop-buy-btn {
          border: 1px solid #d8cfc2;
          background: #fff;
          color: #171717;
          border-radius: 14px;
          min-height: 40px;
          padding: 9px 10px;
          font-weight: 950;
          cursor: pointer;
          box-shadow: 0 8px 20px rgba(48,38,23,0.045);
        }

        .shop-buy-btn-primary {
          border-color: #1f4f9b;
          background: linear-gradient(135deg, #1f4f9b, #2f6fed);
          color: #fff;
          box-shadow: 0 12px 24px rgba(47,111,237,0.20);
        }

        .shop-status {
          margin-top: 14px;
          padding: 12px;
          border-radius: 16px;
          font-weight: 850;
        }

        .shop-status-error {
          background: #fff1f1;
          border: 1px solid #f3b7b7;
          color: #7a1f1f;
        }

        .shop-status-success {
          background: #eefbf3;
          border: 1px solid #a7e7bd;
          color: #176239;
        }

        .shop-loading,
        .shop-empty {
          margin-top: 16px;
          border: 1px solid #e7e3dc;
          border-radius: 20px;
          background: rgba(255,255,255,0.78);
          padding: 18px;
          color: #5f5a52;
          font-weight: 850;
        }

        .shop-products-grid {
          margin-top: 16px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(215px, 1fr));
          gap: 12px;
        }

        .shop-product-card {
          border: 1px solid #e7e3dc;
          border-radius: 20px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,247,241,0.95));
          box-shadow: 0 12px 34px rgba(48,38,23,0.055);
          overflow: hidden;
          min-width: 0;
          transition: transform 150ms ease, box-shadow 150ms ease;
        }

        .shop-product-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 42px rgba(48,38,23,0.10);
        }

        .shop-product-card-deal {
          border-color: rgba(184,146,59,0.58);
          background:
            radial-gradient(circle at 20% 0%, rgba(240,180,41,0.14), transparent 38%),
            linear-gradient(180deg, #fffdf2, #ffffff 46%);
        }

        .shop-product-art {
          height: 150px;
          margin: 12px 12px 0;
          border: 1px solid #d8cfc2;
          border-radius: 16px;
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,0.92), transparent 48%),
            linear-gradient(135deg, #f5efe4, #eee4d2);
          display: grid;
          place-items: center;
          overflow: hidden;
          position: relative;
        }

        .shop-product-img {
          padding: 8px;
          max-height: 150px;
        }

        .shop-no-image {
          color: #5f5a52;
          font-size: 12px;
          font-weight: 850;
          text-align: center;
          display: grid;
          gap: 6px;
          place-items: center;
        }

        .shop-product-body {
          padding: 12px;
          display: grid;
          gap: 10px;
        }

        .shop-product-title {
          min-height: 40px;
          font-size: 14px;
          line-height: 1.18;
          font-weight: 950;
          letter-spacing: -0.025em;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .shop-product-meta {
          color: #5f5a52;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .shop-product-badges {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          min-height: 22px;
        }

        .shop-small-badge {
          border-radius: 999px;
          padding: 4px 7px;
          font-size: 10px;
          font-weight: 950;
          background: #f2efe9;
          color: #5f5a52;
        }

        .shop-small-badge-deal {
          background: #111;
          color: #fff;
        }

        .shop-small-badge-new {
          background: #fff8e7;
          color: #6c4b09;
          border: 1px solid rgba(184,146,59,0.26);
        }

        .shop-product-prices {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 7px;
        }

        .shop-compact-price {
          border: 1px solid #e7e3dc;
          border-radius: 13px;
          background: rgba(255,255,255,0.72);
          padding: 8px;
          min-width: 0;
        }

        .shop-compact-label {
          color: #5f5a52;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.055em;
        }

        .shop-compact-value {
          margin-top: 3px;
          font-size: 14px;
          font-weight: 950;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .shop-compact-standard {
          margin-top: 2px;
          color: #8a5a00;
          font-size: 10px;
          font-weight: 850;
          text-decoration: line-through;
        }

        .shop-product-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 7px;
        }

        .shop-action-block {
          display: grid;
          gap: 6px;
          min-width: 0;
        }

        .shop-qty {
          width: 100%;
          min-width: 0;
          border: 1px solid #d8cfc2;
          border-radius: 12px;
          padding: 8px;
          font-weight: 850;
          text-align: center;
          background: #fff;
        }

        .shop-compact-buy {
          border: 1px solid #d8cfc2;
          border-radius: 12px;
          background: #fff;
          min-height: 36px;
          padding: 8px 6px;
          font-size: 12px;
          font-weight: 950;
          cursor: pointer;
        }

        .shop-compact-buy-pack {
          background: linear-gradient(135deg, #1f4f9b, #2f6fed);
          color: #fff;
          border-color: #1f4f9b;
        }

        @media (max-width: 820px) {
          .shop-hero {
            border-radius: 22px;
            padding: 15px;
          }

          .shop-title {
            font-size: 38px;
          }

          .shop-toolbar {
            top: 76px;
            border-radius: 18px;
            padding: 10px;
          }

          .shop-toolbar-row {
            grid-template-columns: 1fr 1fr;
          }

          .shop-toolbar-row .shop-input {
            grid-column: 1 / -1;
          }

          .shop-select {
            min-width: 0;
            width: 100%;
          }

          .shop-count {
            grid-column: 1 / -1;
          }

          .daily-deal-inner {
            grid-template-columns: 1fr;
            padding: 14px;
          }

          .daily-image-wrap {
            min-height: 180px;
          }

          .daily-img {
            max-height: 178px;
          }

          .daily-price-grid,
          .daily-actions {
            grid-template-columns: 1fr 1fr;
          }

          .shop-products-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 9px;
          }

          .shop-product-card {
            border-radius: 17px;
          }

          .shop-product-art {
            height: 122px;
            margin: 9px 9px 0;
            border-radius: 14px;
          }

          .shop-product-img {
            max-height: 122px;
            padding: 6px;
          }

          .shop-product-body {
            padding: 9px;
            gap: 8px;
          }

          .shop-product-title {
            min-height: 38px;
            font-size: 13px;
          }

          .shop-product-meta {
            font-size: 10px;
          }

          .shop-product-prices {
            gap: 6px;
          }

          .shop-compact-price {
            padding: 7px;
          }

          .shop-compact-value {
            font-size: 13px;
          }

          .shop-product-actions {
            gap: 6px;
          }

          .shop-compact-buy {
            min-height: 34px;
            font-size: 11px;
          }
        }

        @media (max-width: 390px) {
          .shop-products-grid {
            grid-template-columns: 1fr;
          }

          .shop-product-art {
            height: 170px;
          }

          .shop-product-img {
            max-height: 170px;
          }
        }
      `}</style>

      <section className="shop-hero">
        <div className="shop-hero-top">
          <div>
            <div className="shop-kicker">Marketplace</div>
            <h1 className="shop-title">Shop</h1>
            <div className="shop-subtitle">
              Buy packs or discounted boxes. Boxes are priced at pack price × packs per box × 0.75, and one daily deal
              gets an extra 10% off packs and boxes until midnight.
            </div>
          </div>

          <button onClick={load} className="shop-refresh">
            Refresh
          </button>
        </div>
      </section>

      <section className="shop-toolbar">
        <div className="shop-toolbar-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products, brands, sports, years…"
            className="shop-input"
          />

          <select value={sport} onChange={(e) => setSport(e.target.value)} className="shop-select">
            {sportOptions.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All sports" : s}
              </option>
            ))}
          </select>

          <select value={year} onChange={(e) => setYear(e.target.value)} className="shop-select">
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y === "all" ? "All years" : y}
              </option>
            ))}
          </select>

          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="shop-select">
            <option value="name">Name</option>
            <option value="year_desc">Year: new to old</option>
            <option value="price_asc">Pack price: low</option>
            <option value="price_desc">Pack price: high</option>
          </select>

          <div className="shop-count">
            Showing <span style={{ fontWeight: 950 }}>{filteredSorted.length}</span> / {rows.length}
          </div>
        </div>
      </section>

      {dailyDeal ? (
        <section className="daily-deal-card">
          {(() => {
            const derivedBox =
              dailyDeal.packsPerBox && dailyDeal.packsPerBox > 0
                ? computeBoxPriceCents(dailyDeal.packPriceCents, dailyDeal.packsPerBox)
                : null;

            const packKey = `${dailyDeal.id}:pack`;
            const boxKey = `${dailyDeal.id}:box`;
            const dailyDealSrc = safeImgSrc(dailyDeal.displayBoxImageUrl ?? dailyDeal.boxImageUrl ?? dailyDeal.packImageUrl);

            return (
              <div className="daily-deal-inner">
                <div className="daily-image-wrap">
                  {dailyDeal.isNewProduct ? <NewProductBadge /> : null}
                  {dailyDealSrc ? (
                    <img src={dailyDealSrc} alt="Daily deal product" className="daily-img" />
                  ) : (
                    <div className="shop-no-image">No image</div>
                  )}
                </div>

                <div className="daily-copy">
                  <div className="daily-title-row">
                    <div>
                      <div className="shop-kicker">🔥 Daily Deal</div>
                      <div className="daily-title" style={{ marginTop: 9 }}>
                        {formatFriendlyProductName(dailyDeal.id)}
                      </div>
                      <div className="daily-meta">
                        {dailyDeal.year ?? "—"} • {dailyDeal.brand ?? "—"} • {dailyDeal.sport ?? "—"} • Changes at midnight
                      </div>
                    </div>

                    <div className="deal-badge">{dailyDealLabel(dailyDeal)}</div>
                  </div>

                  <div className="daily-price-grid">
                    <div className="price-tile">
                      <div className="price-label">Pack Deal</div>
                      <div className="price-main">${centsToDollars(effectivePackPrice(dailyDeal))}</div>
                      {standardPackPrice(dailyDeal) !== effectivePackPrice(dailyDeal) ? (
                        <div className="price-sub">was ${centsToDollars(standardPackPrice(dailyDeal))}</div>
                      ) : null}
                    </div>

                    <div className="price-tile">
                      <div className="price-label">Box Deal</div>
                      <div className="price-main">${centsToDollars(effectiveBoxPrice(dailyDeal, derivedBox))}</div>
                      <div className="price-sub">
                        {dailyDeal.packsPerBox ? `${dailyDeal.packsPerBox} packs/box` : "box pricing"}
                      </div>
                    </div>
                  </div>

                  <div className="daily-actions">
                    <button
                      onClick={() => buy(dailyDeal.id, "pack")}
                      disabled={buyingKey === packKey}
                      className="shop-buy-btn shop-buy-btn-primary"
                    >
                      {buyingKey === packKey ? "Buying…" : "Buy Deal Pack"}
                    </button>

                    <button
                      onClick={() => buy(dailyDeal.id, "box")}
                      disabled={buyingKey === boxKey}
                      className="shop-buy-btn"
                    >
                      {buyingKey === boxKey ? "Buying…" : "Buy Deal Box"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </section>
      ) : null}

      {err ? <div className="shop-status shop-status-error">{err}</div> : null}

      {msg ? <div className="shop-status shop-status-success">{msg}</div> : null}

      {loading ? (
        <div className="shop-loading">Loading shop products…</div>
      ) : filteredSorted.length === 0 ? (
        <div className="shop-empty">No matching products. Try clearing filters.</div>
      ) : (
        <section className="shop-products-grid">
          {filteredSorted.map((p) => {
            const packKey = `${p.id}:pack`;
            const boxKey = `${p.id}:box`;
            const packBuying = buyingKey === packKey;
            const boxBuying = buyingKey === boxKey;

            const displayName = formatFriendlyProductName(p.id);
            const productSrc = safeImgSrc(p.displayBoxImageUrl ?? p.boxImageUrl ?? p.packImageUrl);

            const derivedBox =
              p.packsPerBox && p.packsPerBox > 0 ? computeBoxPriceCents(p.packPriceCents, p.packsPerBox) : null;

            const boxPriceCents = effectiveBoxPrice(p, derivedBox);
            const originalBoxPriceCents = standardBoxPrice(p, derivedBox);
            const packPriceCents = effectivePackPrice(p);
            const originalPackPriceCents = standardPackPrice(p);
            const isDeal = p.isDailyDeal === true;

            return (
              <article
                key={p.id}
                className={`shop-product-card ${isDeal ? "shop-product-card-deal" : ""}`}
              >
                <div className="shop-product-art">
                  {p.isNewProduct ? <NewProductBadge /> : null}
                  {productSrc ? (
                    <img src={productSrc} alt={displayName} className="shop-product-img" />
                  ) : (
                    <div className="shop-no-image">
                      <span style={{ fontWeight: 950 }}>VCS</span>
                      <span>No image</span>
                    </div>
                  )}
                </div>

                <div className="shop-product-body">
                  <div>
                    <div className="shop-product-badges">
                      {isDeal ? <span className="shop-small-badge shop-small-badge-deal">🔥 Deal</span> : null}
                      {p.isNewProduct ? <span className="shop-small-badge shop-small-badge-new">New</span> : null}
                      <span className="shop-small-badge">{p.sport ?? "Product"}</span>
                    </div>

                    <div className="shop-product-title" title={displayName}>
                      {displayName}
                    </div>

                    <div className="shop-product-meta">
                      {(p.year ?? "—")} • {(p.brand ?? "—")} • Sets: {p.productSetsCount}
                    </div>
                  </div>

                  <div className="shop-product-prices">
                    <div className="shop-compact-price">
                      <div className="shop-compact-label">Pack</div>
                      <div className="shop-compact-value">${centsToDollars(packPriceCents)}</div>
                      {isDeal && originalPackPriceCents !== packPriceCents ? (
                        <div className="shop-compact-standard">${centsToDollars(originalPackPriceCents)}</div>
                      ) : null}
                    </div>

                    <div className="shop-compact-price">
                      <div className="shop-compact-label">Box</div>
                      <div className="shop-compact-value">${centsToDollars(boxPriceCents)}</div>
                      {isDeal && originalBoxPriceCents !== boxPriceCents ? (
                        <div className="shop-compact-standard">${centsToDollars(originalBoxPriceCents)}</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="shop-product-actions">
                    <div className="shop-action-block">
                      <input
                        value={String(qty[packKey] ?? 1)}
                        onChange={(e) => setQty((prev) => ({ ...prev, [packKey]: Number(e.target.value) }))}
                        className="shop-qty"
                        inputMode="numeric"
                      />
                      <button
                        onClick={() => buy(p.id, "pack")}
                        disabled={packBuying}
                        className="shop-compact-buy shop-compact-buy-pack"
                      >
                        {packBuying ? "Buying…" : "Pack"}
                      </button>
                    </div>

                    <div className="shop-action-block">
                      <input
                        value={String(qty[boxKey] ?? 1)}
                        onChange={(e) => setQty((prev) => ({ ...prev, [boxKey]: Number(e.target.value) }))}
                        className="shop-qty"
                        inputMode="numeric"
                      />
                      <button
                        onClick={() => buy(p.id, "box")}
                        disabled={boxBuying}
                        className="shop-compact-buy"
                      >
                        {boxBuying ? "Buying…" : "Box"}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
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
  const [sellGrade, setSellGrade] = useState<Record<number, number>>({});
  const [sellBuckets, setSellBuckets] = useState<Record<number, OfferSellBucket[]>>({});
  const [bucketLoading, setBucketLoading] = useState<Record<number, boolean>>({});
  const [sellingOfferId, setSellingOfferId] = useState<number | null>(null);
  const [rejectingOfferId, setRejectingOfferId] = useState<number | null>(null);

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

  useEffect(() => {
    for (const offer of offers) {
      if (!sellBuckets[offer.id] && !bucketLoading[offer.id]) {
        loadSellBucketsForOffer(offer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers]);

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

      setOffersMsg(j?.reused ? "Offer already active for that card (reused)." : "Offer created. Accept it, reject it, or let it expire; the card will be locked from new shop offers for 24 hours after a pass/expiry.");
      setRequestCardId("");
      await loadOffers();
    } catch (e: any) {
      setOffersErr(e?.message ?? "Offer request failed");
    } finally {
      setRequesting(false);
    }
  }

  async function loadSellBucketsForOffer(o: ShopOfferRow) {
    setBucketLoading((prev) => ({ ...prev, [o.id]: true }));

    try {
      const res = await fetch(`/api/shop/my-cards/${o.cardId}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok || j?.ok !== true) throw new Error(j?.error ?? "Failed to load sell buckets.");

      const rows = Array.isArray(j.rows) ? j.rows : [];
      const buckets: OfferSellBucket[] = rows
        .map((r: any) => ({
          grade: typeof r.grade === "number" ? r.grade : 0,
          gradeLabel: String(r.gradeLabel ?? (Number(r.grade) === 0 ? "Raw" : `VCS ${r.grade}`)),
          qtyOwned: Math.max(0, Math.floor(Number(r.qtyOwned ?? 0))),
          perCardValueCents: Math.max(0, Math.floor(Number(r.perCardValueCents ?? 0))),
          rawBookValueCents: Math.max(0, Math.floor(Number(r.rawBookValueCents ?? 0))),
          totalBucketValueCents: Math.max(0, Math.floor(Number(r.totalBucketValueCents ?? 0))),
        }))
        .filter((b: OfferSellBucket) => b.qtyOwned > 0)
        .sort((a: OfferSellBucket, b: OfferSellBucket) => a.grade - b.grade);

      setSellBuckets((prev) => ({ ...prev, [o.id]: buckets }));

      setSellGrade((prev) => {
        const current = prev[o.id];
        if (typeof current === "number" && buckets.some((b) => b.grade === current)) return prev;
        const raw = buckets.find((b) => b.grade === 0);
        const first = raw ?? buckets[0];
        if (!first) return prev;
        return { ...prev, [o.id]: first.grade };
      });
    } catch (e: any) {
      setOffersErr(e?.message ?? "Failed to load sell buckets.");
      setSellBuckets((prev) => ({ ...prev, [o.id]: [] }));
    } finally {
      setBucketLoading((prev) => ({ ...prev, [o.id]: false }));
    }
  }


  async function rejectOffer(offerId: number) {
    const ok = window.confirm("Reject this shop offer? You will not be able to request another offer for this card for 24 hours.");
    if (!ok) return;

    setRejectingOfferId(offerId);
    setOffersErr(null);
    setOffersMsg(null);

    try {
      const res = await fetch("/api/shop/singles/offers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, action: "reject" }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Non-JSON from reject (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Reject failed (${res.status})`);

      setOffersMsg("Offer rejected. This card is locked from new shop offers for 24 hours.");

      setSellBuckets((prev) => {
        const next = { ...prev };
        delete next[offerId];
        return next;
      });

      await loadOffers();
    } catch (e: any) {
      setOffersErr(e?.message ?? "Reject failed");
    } finally {
      setRejectingOfferId(null);
    }
  }

  async function sellOffer(offerId: number) {
    const q = Math.max(1, Math.floor(sellQty[offerId] ?? 1));
    const grade = typeof sellGrade[offerId] === "number" ? sellGrade[offerId] : 0;

    setSellingOfferId(offerId);
    setOffersErr(null);
    setOffersMsg(null);

    try {
      const res = await fetch("/api/shop/singles/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, quantity: q, grade }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Non-JSON from sell (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Sell failed (${res.status})`);

      setOffersMsg(
        `Sold ${j.gradeLabel ?? (grade === 0 ? "Raw" : `VCS ${grade}`)} x${j.quantity} for $${centsToDollars(
          j.totalCents
        )} @ ${pctBpsToText(j.offerBps)}.`
      );

      window.dispatchEvent(new CustomEvent(ECONOMY_CHANGED_EVENT));

      setSellBuckets((prev) => {
        const next = { ...prev };
        delete next[offerId];
        return next;
      });

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
        Sell cards to the shop via 24h offers. Accept for immediate cash, reject to pass, or let an offer expire.
        Passing or expiring locks that specific card from new shop offers for <b>24 hours</b>. Buy singles from shop inventory at{" "}
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
            Active offers: <b>{activeCount}</b> • No global offer cap
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
              Accept for instant cash, or reject to clear the offer and start the 24-hour card lockout.
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
                const buckets = sellBuckets[o.id] ?? [];
                const selectedGrade =
                  typeof sellGrade[o.id] === "number"
                    ? sellGrade[o.id]
                    : buckets.find((b) => b.grade === 0)?.grade ?? buckets[0]?.grade ?? 0;
                const selectedBucket = buckets.find((b) => b.grade === selectedGrade) ?? buckets[0] ?? null;
                const selectedQty = Math.max(1, Math.floor(sellQty[o.id] ?? 1));
                const effectiveBps = selectedGrade === 0 ? o.offerBps : o.offerBps + 1000;
                const estimatedTotal =
                  selectedBucket && selectedBucket.perCardValueCents > 0
                    ? Math.round((selectedBucket.perCardValueCents * selectedQty * effectiveBps) / 10000)
                    : null;

                return (
                  <div
                    key={o.id}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 14,
                      padding: 12,
                      background: selectedGrade === 0 ? "linear-gradient(135deg, #ffffff, #fafafa)" : "linear-gradient(135deg, #fffdf3, #fff8dd)",
                      boxShadow: "0 10px 26px rgba(15, 23, 42, 0.05)",
                      display: "grid",
                      gridTemplateColumns: "72px 1fr",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 72,
                        height: 72,
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
                          {selectedGrade !== 0 ? <span style={{ fontWeight: 900, color: "#8a5a00" }}> • VCS bonus: +10%</span> : null}
                          {o.card ? (
                            <>
                              {" "}• Raw Book: <b>${Number(o.card.bookValue ?? 0).toFixed(2)}</b>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div style={{ fontSize: 12, color: "#666" }}>
                        Expires in <b>{hoursLeft}h {remMins}m</b> • Offer ID: {o.id} • Card ID: {o.cardId}
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <select
                          value={String(selectedGrade)}
                          onChange={(e) => {
                            const grade = Number(e.target.value);
                            setSellGrade((prev) => ({ ...prev, [o.id]: grade }));
                          }}
                          disabled={bucketLoading[o.id] || buckets.length === 0 || sellingOfferId === o.id}
                          style={{ padding: 8, borderRadius: 10, border: "1px solid #ccc", minWidth: 150 }}
                          title="Choose which version to sell"
                        >
                          {bucketLoading[o.id] ? (
                            <option value="0">Loading grades…</option>
                          ) : buckets.length === 0 ? (
                            <option value="0">No owned copies</option>
                          ) : (
                            buckets.map((b) => (
                              <option key={`${o.id}:${b.grade}`} value={String(b.grade)}>
                                {b.gradeLabel} • Own {b.qtyOwned} • ${centsToDollars(b.perCardValueCents)}
                              </option>
                            ))
                          )}
                        </select>

                        <input
                          value={String(sellQty[o.id] ?? 1)}
                          onChange={(e) => setSellQty((prev) => ({ ...prev, [o.id]: Number(e.target.value) }))}
                          style={{ width: 80, padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
                        />

                        {selectedBucket ? (
                          <div style={{ fontSize: 12, color: "#555", fontWeight: 800 }}>
                            Value: ${centsToDollars(selectedBucket.perCardValueCents)}
                            {selectedGrade !== 0 ? " • Offer +10%" : ""}
                            {estimatedTotal !== null ? ` • Est. $${centsToDollars(estimatedTotal)}` : ""}
                          </div>
                        ) : null}

                        <button
                          onClick={() => sellOffer(o.id)}
                          disabled={sellingOfferId === o.id || bucketLoading[o.id] || buckets.length === 0 || rejectingOfferId === o.id}
                          style={{
                            padding: "9px 12px",
                            borderRadius: 10,
                            border: "1px solid #14532d",
                            background:
                              sellingOfferId === o.id || bucketLoading[o.id] || buckets.length === 0 || rejectingOfferId === o.id
                                ? "#f2f2f2"
                                : "#dcfce7",
                            color: "#14532d",
                            fontWeight: 1000,
                            cursor:
                              sellingOfferId === o.id || bucketLoading[o.id] || buckets.length === 0 || rejectingOfferId === o.id
                                ? "not-allowed"
                                : "pointer",
                          }}
                        >
                          {sellingOfferId === o.id ? "Selling…" : "Accept / Sell"}
                        </button>

                        <button
                          onClick={() => rejectOffer(o.id)}
                          disabled={rejectingOfferId === o.id || sellingOfferId === o.id}
                          style={{
                            padding: "9px 12px",
                            borderRadius: 10,
                            border: "1px solid #fecaca",
                            background: rejectingOfferId === o.id || sellingOfferId === o.id ? "#f2f2f2" : "#fff7f7",
                            color: "#991b1b",
                            fontWeight: 950,
                            cursor: rejectingOfferId === o.id || sellingOfferId === o.id ? "not-allowed" : "pointer",
                          }}
                          title="Reject this offer and lock this card from new shop offers for 24 hours"
                        >
                          {rejectingOfferId === o.id ? "Rejecting…" : "Reject"}
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
