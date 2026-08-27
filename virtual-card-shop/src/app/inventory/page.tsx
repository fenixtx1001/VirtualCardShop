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

type SportFilter = "ALL" | "BASEBALL" | "BASKETBALL" | "FOOTBALL" | "HOCKEY" | "OTHER";
type SortMode = "recent" | "packs_desc" | "name_asc" | "price_desc";

const HIDE_ZERO_PACKS_STORAGE_KEY = "vcs.inventory.hideZeroPacks";

const colors = {
  bg: "#fbfaf7",
  card: "#ffffff",
  border: "#e7e3dc",
  borderStrong: "#d8cfc2",
  text: "#171717",
  subtext: "#5f5a52",
  muted: "#f2efe9",
  gold: "#b8923b",
  goldSoft: "#fff8e7",
  blue: "#244f9e",
  blueSoft: "#eef4ff",
  green: "#176239",
  greenSoft: "#eefbf3",
  shadow: "0 18px 50px rgba(48, 38, 23, 0.08)",
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

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function readHideZeroPacksPreference() {
  if (typeof window === "undefined") return true;
  const saved = window.localStorage.getItem(HIDE_ZERO_PACKS_STORAGE_KEY);

  if (saved === null) return true;

  return saved === "1";
}

function inferSport(row: InventoryRow): SportFilter {
  const name = formatFriendlyProductName(row.productId).toLowerCase();

  if (name.includes("baseball")) return "BASEBALL";
  if (name.includes("basketball")) return "BASKETBALL";
  if (name.includes("football")) return "FOOTBALL";
  if (name.includes("hockey")) return "HOCKEY";

  return "OTHER";
}

function sportLabel(sport: SportFilter) {
  if (sport === "BASEBALL") return "Baseball";
  if (sport === "BASKETBALL") return "Basketball";
  if (sport === "FOOTBALL") return "Football";
  if (sport === "HOCKEY") return "Hockey";
  if (sport === "OTHER") return "Other";
  return "All";
}

function sportEmoji(sport: SportFilter) {
  if (sport === "BASEBALL") return "⚾";
  if (sport === "BASKETBALL") return "🏀";
  if (sport === "FOOTBALL") return "🏈";
  if (sport === "HOCKEY") return "🏒";
  if (sport === "OTHER") return "✨";
  return "Vault";
}

function ProductImage({ row, name }: { row: InventoryRow; name: string }) {
  return (
    <div className="inventory-product-art">
      {row.packImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={row.packImageUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          className="inventory-product-img"
        />
      ) : (
        <div className="inventory-product-placeholder">
          <div className="inventory-placeholder-mark">VCS</div>
          <div>No pack image</div>
        </div>
      )}
    </div>
  );
}

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [hideZeroPacks, setHideZeroPacks] = useState(() => readHideZeroPacksPreference());
  const [query, setQuery] = useState("");
  const [sportFilter, setSportFilter] = useState<SportFilter>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("recent");

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

  const baseRows = useMemo(() => {
    const copy = [...rows];

    copy.sort((a, b) => {
      if (sortMode === "packs_desc") {
        return (b.packsOwned ?? 0) - (a.packsOwned ?? 0);
      }

      if (sortMode === "name_asc") {
        return formatFriendlyProductName(a.productId).localeCompare(formatFriendlyProductName(b.productId));
      }

      if (sortMode === "price_desc") {
        return (b.packPriceCents ?? 0) - (a.packPriceCents ?? 0);
      }

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return copy;
  }, [rows, sortMode]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return baseRows.filter((row) => {
      if (hideZeroPacks && (row.packsOwned ?? 0) <= 0) return false;

      if (sportFilter !== "ALL" && inferSport(row) !== sportFilter) return false;

      if (q) {
        const name = formatFriendlyProductName(row.productId).toLowerCase();
        if (!name.includes(q)) return false;
      }

      return true;
    });
  }, [baseRows, hideZeroPacks, query, sportFilter]);

  const unopenedRows = useMemo(() => rows.filter((r) => (r.packsOwned ?? 0) > 0), [rows]);

  const zeroPackCount = useMemo(() => {
    return rows.filter((r) => (r.packsOwned ?? 0) <= 0).length;
  }, [rows]);

  const totalPacks = useMemo(() => {
    return unopenedRows.reduce((sum, r) => sum + Math.max(0, r.packsOwned ?? 0), 0);
  }, [unopenedRows]);

  const totalSealedValueCents = useMemo(() => {
    return unopenedRows.reduce((sum, r) => {
      return sum + Math.max(0, r.packsOwned ?? 0) * Math.max(0, r.packPriceCents ?? 0);
    }, 0);
  }, [unopenedRows]);

  const averagePackPriceCents = useMemo(() => {
    if (totalPacks <= 0) return 0;
    return Math.round(totalSealedValueCents / totalPacks);
  }, [totalPacks, totalSealedValueCents]);

  const sportCounts = useMemo(() => {
    const counts: Record<SportFilter, number> = {
      ALL: unopenedRows.length,
      BASEBALL: 0,
      BASKETBALL: 0,
      FOOTBALL: 0,
      HOCKEY: 0,
      OTHER: 0,
    };

    for (const row of unopenedRows) {
      counts[inferSport(row)] += 1;
    }

    return counts;
  }, [unopenedRows]);

  function openRandomPack() {
    const candidates = visibleRows.filter((row) => (row.packsOwned ?? 0) > 0);
    if (candidates.length === 0) return;

    const next = candidates[Math.floor(Math.random() * candidates.length)];
    window.location.href = `/open-pack/${encodeURIComponent(next.productId)}`;
  }

  return (
    <main className="inventory-page">
      <style>{`
        .inventory-page {
          background:
            radial-gradient(circle at 8% 0%, rgba(199, 168, 90, 0.15), transparent 34%),
            radial-gradient(circle at 92% 12%, rgba(36, 79, 158, 0.10), transparent 30%),
            ${colors.bg};
          min-height: calc(100vh - 80px);
          padding: 22px;
          color: ${colors.text};
        }

        .inventory-shell {
          max-width: 1180px;
          margin: 0 auto;
        }

        .inventory-hero {
          border: 1px solid ${colors.border};
          border-radius: 26px;
          background:
            linear-gradient(135deg, rgba(255,255,255,0.96), rgba(255,250,239,0.94)),
            ${colors.card};
          box-shadow: ${colors.shadow};
          overflow: hidden;
          position: relative;
        }

        .inventory-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, rgba(184,146,59,0.18), transparent 34%, rgba(36,79,158,0.08));
          pointer-events: none;
        }

        .inventory-hero-inner {
          position: relative;
          z-index: 1;
          padding: 18px;
          display: grid;
          grid-template-columns: 1.35fr 1fr;
          gap: 16px;
          align-items: center;
        }

        .inventory-kicker {
          display: inline-flex;
          width: fit-content;
          align-items: center;
          gap: 7px;
          border: 1px solid rgba(184,146,59,0.38);
          background: ${colors.goldSoft};
          color: #6c4b09;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .inventory-title {
          margin: 9px 0 0;
          font-size: clamp(30px, 5vw, 50px);
          line-height: 0.97;
          letter-spacing: -0.05em;
          font-weight: 950;
        }

        .inventory-subtitle {
          margin-top: 9px;
          max-width: 650px;
          color: ${colors.subtext};
          font-size: 14px;
          line-height: 1.45;
          font-weight: 650;
        }

        .inventory-hero-actions {
          margin-top: 13px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .inventory-primary-btn,
        .inventory-secondary-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 42px;
          border-radius: 14px;
          padding: 10px 14px;
          font-weight: 900;
          text-decoration: none;
          border: 1px solid transparent;
          cursor: pointer;
          transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
        }

        .inventory-primary-btn {
          color: #fff;
          background: linear-gradient(135deg, #1f4f9b, #2f6fed);
          box-shadow: 0 14px 26px rgba(47,111,237,0.22);
        }

        .inventory-secondary-btn {
          color: ${colors.text};
          background: rgba(255,255,255,0.78);
          border-color: ${colors.borderStrong};
        }

        .inventory-primary-btn:hover,
        .inventory-secondary-btn:hover {
          transform: translateY(-1px);
        }

        .inventory-hero-panel {
          border: 1px solid rgba(184,146,59,0.26);
          border-radius: 18px;
          background:
            linear-gradient(160deg, rgba(255,255,255,0.94), rgba(255,248,231,0.90));
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          overflow: hidden;
        }

        .inventory-summary-cell {
          min-width: 0;
          padding: 11px 10px;
          border-left: 1px solid rgba(184,146,59,0.18);
        }

        .inventory-summary-cell:first-child {
          border-left: 0;
        }

        .inventory-big-stat {
          display: grid;
          gap: 2px;
        }

        .inventory-big-stat-label {
          color: ${colors.subtext};
          font-size: 12px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .inventory-big-stat-value {
          margin-top: 3px;
          font-size: 21px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: -0.035em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .inventory-stats-grid {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .inventory-stat-card {
          border: 1px solid ${colors.border};
          border-radius: 18px;
          background: rgba(255,255,255,0.82);
          box-shadow: 0 10px 30px rgba(48,38,23,0.045);
          padding: 13px;
          min-width: 0;
        }

        .inventory-stat-label {
          color: ${colors.subtext};
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          white-space: nowrap;
        }

        .inventory-stat-value {
          margin-top: 5px;
          font-size: 22px;
          font-weight: 950;
          letter-spacing: -0.04em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .inventory-toolbar {
          margin-top: 12px;
          border: 1px solid ${colors.border};
          border-radius: 18px;
          background: rgba(255,255,255,0.88);
          box-shadow: 0 8px 24px rgba(48,38,23,0.04);
          padding: 11px;
          display: grid;
          gap: 9px;
        }

        .inventory-search-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
          align-items: center;
        }

        .inventory-search {
          width: 100%;
          min-width: 0;
          border: 1px solid ${colors.borderStrong};
          border-radius: 12px;
          background: #fff;
          padding: 9px 10px;
          color: ${colors.text};
          font-weight: 800;
          font-size: 13px;
          outline: none;
        }

        .inventory-select {
          border: 1px solid ${colors.borderStrong};
          border-radius: 12px;
          background: #fff;
          padding: 9px 10px;
          color: ${colors.text};
          font-weight: 850;
          font-size: 13px;
          min-width: 158px;
        }

        .inventory-filter-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
        }

        .inventory-pills {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 5px;
          align-items: stretch;
          width: 100%;
        }

        .inventory-pill {
          min-width: 0;
          border: 1px solid ${colors.borderStrong};
          background: #fff;
          color: ${colors.text};
          border-radius: 11px;
          padding: 6px 7px;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .inventory-pill-active {
          border-color: rgba(184,146,59,0.58);
          background: ${colors.goldSoft};
          color: #6c4b09;
        }

        .inventory-toggle {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: ${colors.subtext};
          font-size: 11.5px;
          font-weight: 850;
          cursor: pointer;
          user-select: none;
        }

        .inventory-results-summary {
          color: ${colors.subtext};
          font-size: 12px;
          font-weight: 850;
        }

        .inventory-grid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(245px, 1fr));
          gap: 14px;
        }

        .inventory-card {
          border: 1px solid ${colors.border};
          border-radius: 20px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,247,241,0.95));
          box-shadow: 0 12px 36px rgba(48,38,23,0.06);
          overflow: hidden;
          min-width: 0;
          display: grid;
        }

        .inventory-card-art-wrap {
          padding: 12px 12px 0;
        }

        .inventory-product-art {
          height: 168px;
          border-radius: 18px;
          border: 1px solid ${colors.borderStrong};
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,0.92), transparent 48%),
            linear-gradient(135deg, #f7efe1, #ede3d1);
          display: grid;
          place-items: center;
          overflow: hidden;
          position: relative;
        }

        .inventory-product-art::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, rgba(255,255,255,0.26), transparent 42%, rgba(255,255,255,0.18));
          pointer-events: none;
        }

        .inventory-product-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 8px;
          filter: drop-shadow(0 12px 16px rgba(25,18,9,0.18));
        }

        .inventory-product-placeholder {
          display: grid;
          gap: 8px;
          place-items: center;
          color: ${colors.subtext};
          font-weight: 850;
          font-size: 12px;
          text-align: center;
        }

        .inventory-placeholder-mark {
          width: 46px;
          height: 46px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(184,146,59,0.38);
          background: ${colors.goldSoft};
          color: #6c4b09;
          font-weight: 950;
          letter-spacing: -0.06em;
        }

        .inventory-card-body {
          padding: 11px 12px 13px;
          display: grid;
          gap: 9px;
        }

        .inventory-card-title {
          min-height: 0;
          font-size: 16px;
          line-height: 1.18;
          font-weight: 950;
          letter-spacing: -0.03em;
        }

        .inventory-card-meta {
          display: grid;
          grid-template-columns: 0.7fr 0.9fr 0.9fr 1.4fr;
          border: 1px solid ${colors.border};
          border-radius: 12px;
          overflow: hidden;
          background: rgba(255,255,255,0.78);
        }

        .inventory-meta-item {
          min-width: 0;
          padding: 7px 8px;
          border-left: 1px solid ${colors.border};
          display: grid;
          gap: 2px;
        }

        .inventory-meta-item:first-child {
          border-left: 0;
        }

        .inventory-meta-item strong {
          min-width: 0;
          font-size: 12px;
          line-height: 1.1;
          font-weight: 950;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .inventory-mini-stat {
          border: 1px solid ${colors.border};
          border-radius: 14px;
          background: rgba(255,255,255,0.74);
          padding: 9px;
          min-width: 0;
        }

        .inventory-mini-label {
          color: ${colors.subtext};
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.055em;
        }

        .inventory-mini-value {
          margin-top: 3px;
          font-size: 15px;
          font-weight: 950;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .inventory-open-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 40px;
          border-radius: 13px;
          background: linear-gradient(135deg, #1f4f9b, #2f6fed);
          color: #fff;
          text-decoration: none;
          font-weight: 950;
          box-shadow: 0 14px 26px rgba(47,111,237,0.20);
        }

        .inventory-open-btn-disabled {
          background: ${colors.muted};
          color: ${colors.subtext};
          box-shadow: none;
          pointer-events: none;
        }

        .inventory-card-footer {
          color: ${colors.subtext};
          font-size: 11px;
          font-weight: 750;
          text-align: center;
        }

        .inventory-empty {
          margin-top: 16px;
          border: 1px dashed ${colors.borderStrong};
          border-radius: 22px;
          background: rgba(255,255,255,0.74);
          padding: 22px;
          color: ${colors.subtext};
          font-weight: 800;
          line-height: 1.5;
          text-align: center;
        }

        .inventory-error {
          margin-top: 14px;
          padding: 12px;
          background: #fff1f1;
          border: 1px solid #f3b7b7;
          border-radius: 16px;
          font-weight: 850;
          color: #7a1f1f;
        }

        .inventory-loading {
          margin-top: 16px;
          border: 1px solid ${colors.border};
          border-radius: 22px;
          background: rgba(255,255,255,0.74);
          padding: 22px;
          color: ${colors.subtext};
          font-weight: 850;
        }

        @media (max-width: 780px) {
          .inventory-page {
            width: 100%;
            max-width: 100vw;
            min-width: 0;
            padding: 12px;
            overflow-x: hidden;
          }

          .inventory-shell {
            width: 100%;
            min-width: 0;
          }

          .inventory-hero-inner {
            grid-template-columns: 1fr;
            padding: 13px;
            gap: 11px;
          }

          .inventory-title {
            font-size: 32px;
          }

          .inventory-subtitle {
            font-size: 12.5px;
            line-height: 1.4;
          }

          .inventory-hero-actions {
            display: grid;
            grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.8fr) auto;
            gap: 6px;
          }

          .inventory-primary-btn,
          .inventory-secondary-btn {
            width: 100%;
            min-height: 38px;
            padding: 8px 9px;
            border-radius: 11px;
            font-size: 12px;
          }

          .inventory-hero-panel {
            grid-template-columns: 0.75fr 0.8fr 0.9fr 1.45fr;
          }

          .inventory-summary-cell {
            padding: 8px 7px;
          }

          .inventory-big-stat-value {
            font-size: 15px;
          }

          .inventory-summary-value .inventory-big-stat-value {
            font-size: 13px;
          }

          .inventory-stats-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .inventory-search-row {
            grid-template-columns: minmax(0, 1fr) minmax(132px, 0.75fr);
            gap: 6px;
          }

          .inventory-select {
            width: 100%;
          }

          .inventory-filter-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            gap: 7px;
            width: 100%;
            min-width: 0;
            align-items: stretch;
          }

          .inventory-pills {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            width: 100%;
            max-width: 100%;
            min-width: 0;
            overflow: visible;
            gap: 5px;
            padding-bottom: 0;
          }

          .inventory-pill {
            min-width: 0;
            white-space: nowrap;
            font-size: 10.5px;
            padding: 6px 5px;
          }

          .inventory-toggle {
            width: 100%;
            justify-content: space-between;
            border-top: 1px solid ${colors.border};
            background: transparent;
            border-radius: 0;
            padding: 7px 2px 0;
          }

          .inventory-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .inventory-card {
            border-radius: 18px;
          }

          .inventory-card-art-wrap {
            padding: 10px 10px 0;
          }

          .inventory-product-art {
            height: 165px;
          }

          .inventory-card-title {
            min-height: 0;
            font-size: 16px;
          }

          .inventory-card-meta {
            grid-template-columns: 0.7fr 0.85fr 0.85fr 1.45fr;
          }

          .inventory-meta-item {
            padding: 6px 6px;
          }

          .inventory-meta-item strong {
            font-size: 11px;
          }

          .inventory-mini-label {
            font-size: 8.5px;
          }

          .inventory-open-btn {
            min-height: 40px;
            font-size: 13px;
          }
        }

        @media (min-width: 781px) {
          .inventory-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 18px 44px rgba(48,38,23,0.10);
          }

          .inventory-card {
            transition: transform 150ms ease, box-shadow 150ms ease;
          }
        }
      `}</style>

      <div className="inventory-shell">
        <section className="inventory-hero">
          <div className="inventory-hero-inner">
            <div>
              <div className="inventory-kicker">Collector&apos;s Vault</div>

              <h1 className="inventory-title">My Sealed Collection</h1>

              <div className="inventory-subtitle">
                Browse your sealed collection, pick a product, and rip when you&apos;re ready.
              </div>

              <div className="inventory-hero-actions">
                <button
                  type="button"
                  onClick={openRandomPack}
                  disabled={visibleRows.filter((row) => (row.packsOwned ?? 0) > 0).length === 0}
                  className="inventory-primary-btn"
                  style={{
                    opacity: visibleRows.filter((row) => (row.packsOwned ?? 0) > 0).length === 0 ? 0.55 : 1,
                    cursor: visibleRows.filter((row) => (row.packsOwned ?? 0) > 0).length === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  Rip a Random Pack →
                </button>

                <Link href="/shop" className="inventory-secondary-btn">
                  Visit Shop
                </Link>

                <button type="button" onClick={load} disabled={loading} className="inventory-secondary-btn">
                  {loading ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>

            <div className="inventory-hero-panel">
              <div className="inventory-summary-cell">
                <div className="inventory-big-stat-label">Packs</div>
                <div className="inventory-big-stat-value">{totalPacks.toLocaleString()}</div>
              </div>

              <div className="inventory-summary-cell">
                <div className="inventory-big-stat-label">Products</div>
                <div className="inventory-big-stat-value">{unopenedRows.length.toLocaleString()}</div>
              </div>

              <div className="inventory-summary-cell">
                <div className="inventory-big-stat-label">Avg pack</div>
                <div className="inventory-big-stat-value">{formatDollars(averagePackPriceCents)}</div>
              </div>

              <div className="inventory-summary-cell inventory-summary-value">
                <div className="inventory-big-stat-label">Sealed value</div>
                <div className="inventory-big-stat-value">{formatDollars(totalSealedValueCents)}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="inventory-toolbar">
          <div className="inventory-search-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sealed products…"
              className="inventory-search"
            />

            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="inventory-select"
            >
              <option value="recent">Recently updated</option>
              <option value="packs_desc">Most packs</option>
              <option value="name_asc">Product A-Z</option>
              <option value="price_desc">Highest pack price</option>
            </select>

          </div>

          <div className="inventory-results-summary">
            Showing {visibleRows.length.toLocaleString()} of {rows.length.toLocaleString()}
            {zeroPackCount > 0 ? ` • ${zeroPackCount.toLocaleString()} empty` : ""}
          </div>

          <div className="inventory-filter-row">
            <div className="inventory-pills">
              {(["ALL", "BASEBALL", "BASKETBALL", "FOOTBALL", "HOCKEY", "OTHER"] as SportFilter[]).map((sport) => {
                const count = sport === "ALL" ? unopenedRows.length : sportCounts[sport];

                if (sport !== "ALL" && count === 0) return null;

                return (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => setSportFilter(sport)}
                    className={`inventory-pill ${sportFilter === sport ? "inventory-pill-active" : ""}`}
                  >
                    {sportEmoji(sport)} {sportLabel(sport)} ({count})
                  </button>
                );
              })}
            </div>

            <label className="inventory-toggle">
              <span>Hide 0-pack products</span>
              <input
                type="checkbox"
                checked={hideZeroPacks}
                onChange={(e) => setHideZeroPacks(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
            </label>
          </div>
        </section>

        {err ? <div className="inventory-error">{err}</div> : null}

        {loading ? (
          <div className="inventory-loading">Loading sealed inventory…</div>
        ) : visibleRows.length === 0 ? (
          <div className="inventory-empty">
            {hideZeroPacks
              ? "No unopened packs match these filters. Try clearing search, switching sports, or showing 0-pack products."
              : "No products found. Head to the shop and start building your sealed collection."}
          </div>
        ) : (
          <section className="inventory-grid">
            {visibleRows.map((row) => {
              const friendlyName = formatFriendlyProductName(row.productId);
              const canOpen = (row.packsOwned ?? 0) > 0;

              return (
                <article key={row.productId} className="inventory-card">
                  <div className="inventory-card-art-wrap">
                    <ProductImage row={row} name={friendlyName} />
                  </div>

                  <div className="inventory-card-body">
                    <div>
                      <div className="inventory-kicker" style={{ padding: "5px 8px", fontSize: 10 }}>
                        {sportEmoji(inferSport(row))} {sportLabel(inferSport(row))}
                      </div>

                      <div className="inventory-card-title" style={{ marginTop: 9 }}>
                        {friendlyName}
                      </div>
                    </div>

                    <div className="inventory-card-meta">
                      <div className="inventory-meta-item">
                        <span className="inventory-mini-label">Packs</span>
                        <strong>{row.packsOwned.toLocaleString()}</strong>
                      </div>

                      <div className="inventory-meta-item">
                        <span className="inventory-mini-label">Price</span>
                        <strong>{formatDollars(row.packPriceCents)}</strong>
                      </div>

                      <div className="inventory-meta-item">
                        <span className="inventory-mini-label">Cards</span>
                        <strong>{row.cardsPerPack ?? "—"}/pack</strong>
                      </div>

                      <div className="inventory-meta-item inventory-meta-updated">
                        <span className="inventory-mini-label">Updated</span>
                        <strong>{formatDateTime(row.updatedAt)}</strong>
                      </div>
                    </div>

                    <Link
                      href={`/open-pack/${encodeURIComponent(row.productId)}`}
                      className={`inventory-open-btn ${canOpen ? "" : "inventory-open-btn-disabled"}`}
                      aria-disabled={!canOpen}
                    >
                      {canOpen ? "Open Pack →" : "No Packs"}
                    </Link>

                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
