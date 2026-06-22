// src/app/cards/[cardId]/card-detail-client.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SubmitForGradingButton from "@/components/grading/SubmitForGradingButton";
import VcsSlab from "@/components/grading/VcsSlab";
import { RequestShopOfferButton } from "@/app/checklist/request-shop-offer-button";

type GradeBreakdownRow = {
  grade: number;
  label: string;
  quantity: number;
  valueCents: number;
};

type SlabRow = {
  grade: number;
  label: string;
  quantity: number;
  valueCents: number;
};

type OwnerRow = {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  quantity: number;
  rawQuantity?: number;
  gradedQuantity?: number;
  pendingGradingQuantity?: number;
  totalQuantity?: number;
  totalValueCents?: number;
  gradeBreakdown?: GradeBreakdownRow[];
  slabs?: SlabRow[];
};

type CardDetailResponse = {
  ok: boolean;
  card: {
    id: number;
    player: string;
    cardNumber: string;
    team: string | null;
    subset: string | null;
    variant: string | null;
    bookValue: number;
    gradeability?: "COMMON" | "GREAT" | "ICONIC";
    gradeabilityLabel?: string;
    productId: string | null;
    productYear: number | null;
    productBrand: string | null;
    productSport: string | null;
    productSetId: string | null;
    productSetName: string | null;
    productSetIsBase: boolean | null;
    frontImageUrl: string | null;
    backImageUrl: string | null;
  };
  population: {
    uniqueOwners: number;
    totalOwned: number;
    totalOwnedIncludingPending?: number;
    raw?: number;
    graded?: number;
    pendingGrading?: number;
    totalValueCents?: number;
  };
  myOwnership?: OwnerRow | null;
  owners: OwnerRow[];
};

type MarketRange = "7D" | "30D" | "90D" | "ALL";

type MarketSaleRow = {
  id: number;
  grade: number;
  label: string;
  saleType: "SHOP" | "AUCTION";
  buyerType: "SHOP" | "DUMMY" | "HUMAN";
  salePriceCents: number;
  valueBasisCents: number;
  percentOfValueBps: number;
  auctionId: number | null;
  shopTransactionId: number | null;
  createdAt: string;
};

type MarketGraphPoint = {
  date: string;
  salesCount: number;
  totalCents: number;
  averageSaleCents: number;
  highSaleCents: number;
  lowSaleCents: number;
};

type MarketGradeRow = {
  grade: number;
  label: string;
  salesCount: number;
  lastSaleCents: number;
  lastSaleAt: string | null;
  averageSaleCents: number;
  highestSaleCents: number;
  lowestSaleCents: number;
  trendBps: number;
  graphData: MarketGraphPoint[];
  recentSales: MarketSaleRow[];
};

type MarketResponse = {
  ok: boolean;
  card: {
    id: number;
    player: string;
    cardNumber: string;
    bookValue: number;
  };
  range: MarketRange;
  availableRanges: MarketRange[];
  grades: MarketGradeRow[];
  overall: {
    salesCount: number;
    lastSaleCents: number;
    lastSaleAt: string | null;
    averageSaleCents: number;
    highestSaleCents: number;
    lowestSaleCents: number;
    trendBps: number;
    recentSales: MarketSaleRow[];
  };
};

type ImageSide = "front" | "back";
type ViewMode = "card" | "slab";

const MARKET_GRADES = [0, 6, 7, 8, 9, 10];

function safeUrl(u: string | null | undefined) {
  const s = (u ?? "").trim();
  return s.length ? s : null;
}

function safeNum(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatDollarsFromCents(cents: number) {
  const safe = Number.isFinite(cents) ? cents : 0;
  return (safe / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatBookValue(v: number | null | undefined) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return `$${n.toFixed(2)}`;
}

function formatProductName(card: CardDetailResponse["card"]) {
  const year = card.productYear;
  const brand = card.productBrand?.trim();

  if (year && brand) return `${year} ${brand}`;
  if (brand) return brand;
  if (card.productId) return card.productId.replaceAll("_", " ");
  return "—";
}

function getGradeSortValue(grade: number) {
  return grade === 0 ? -1 : grade;
}

function normalizeBreakdown(owner: OwnerRow | null | undefined): GradeBreakdownRow[] {
  if (!owner) return [];
  const rows = Array.isArray(owner.gradeBreakdown) ? owner.gradeBreakdown : [];
  return [...rows].sort((a, b) => getGradeSortValue(a.grade) - getGradeSortValue(b.grade));
}

function normalizeSlabs(owner: OwnerRow | null | undefined): SlabRow[] {
  if (!owner) return [];
  const rows = Array.isArray(owner.slabs) ? owner.slabs : [];
  return [...rows].sort((a, b) => b.grade - a.grade);
}

function marketGradeLabel(grade: number) {
  if (grade === 0) return "Raw";
  return `VCS ${grade}`;
}

function formatDateShort(input: string | null | undefined) {
  if (!input) return "—";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatTrend(trendBps: number) {
  if (!Number.isFinite(trendBps) || trendBps === 0) return "Flat";
  const pct = Math.abs(trendBps) / 100;
  return `${trendBps > 0 ? "▲" : "▼"} ${pct.toFixed(1)}%`;
}

function trendColor(trendBps: number) {
  if (!Number.isFinite(trendBps) || trendBps === 0) return "#555";
  return trendBps > 0 ? "#126b3a" : "#9b1c1c";
}

function saleTypeLabel(sale: MarketSaleRow) {
  if (sale.saleType === "AUCTION") return sale.buyerType === "DUMMY" ? "Auction • VCS buyer" : "Auction";
  return "Shop sale";
}

function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "blue" | "gold" | "green";
}) {
  const bg =
    tone === "blue"
      ? "#f3f8ff"
      : tone === "gold"
        ? "#fff8e8"
        : tone === "green"
          ? "#f1fbf5"
          : "#fff";
  const border =
    tone === "blue"
      ? "#cfe4ff"
      : tone === "gold"
        ? "#f0d28a"
        : tone === "green"
          ? "#bfe9ce"
          : "#e5e5e5";
  const color =
    tone === "blue"
      ? "#16477d"
      : tone === "gold"
        ? "#7a5200"
        : tone === "green"
          ? "#126b3a"
          : "#222";

  return (
    <div
      style={{
        border: `1px solid ${border}`,
        borderRadius: 16,
        padding: 12,
        background: bg,
        minWidth: 0,
        width: "100%",
        boxSizing: "border-box",
        flex: "1 1 142px",
        boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
      }}
    >
      <div style={{ color: "#666", fontSize: 12, fontWeight: 900, letterSpacing: 0.2 }}>
        {label}
      </div>
      <div style={{ marginTop: 4, fontSize: 22, lineHeight: 1.05, fontWeight: 1000, color }}>
        {value}
      </div>
      {sub ? (
        <div style={{ marginTop: 5, color: "#666", fontSize: 12, fontWeight: 800 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function SalesSparkline({ points }: { points: MarketGraphPoint[] }) {
  const clean = points.filter((p) => Number.isFinite(p.averageSaleCents));

  if (clean.length < 2) {
    return (
      <div
        style={{
          height: 120,
          borderRadius: 16,
          border: "1px dashed #d8d8d8",
          background: "linear-gradient(180deg, #fafafa, #fff)",
          display: "grid",
          placeItems: "center",
          color: "#777",
          fontWeight: 900,
          textAlign: "center",
          padding: 12,
        }}
      >
        More sales needed to draw a trend.
      </div>
    );
  }

  const width = 520;
  const height = 140;
  const pad = 16;
  const values = clean.map((p) => p.averageSaleCents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);

  const coords = clean.map((p, idx) => {
    const x = pad + (idx / Math.max(1, clean.length - 1)) * (width - pad * 2);
    const y = height - pad - ((p.averageSaleCents - min) / spread) * (height - pad * 2);
    return `${x},${y}`;
  });

  const last = clean[clean.length - 1];
  const first = clean[0];

  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 16,
        background: "linear-gradient(180deg, #ffffff, #f8fbff)",
        padding: 10,
      }}
    >
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 140, display: "block" }}>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#e5e5e5" strokeWidth="2" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#eeeeee" strokeWidth="2" />
        <polyline points={coords.join(" ")} fill="none" stroke="#16477d" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {clean.map((p, idx) => {
          const [x, y] = coords[idx].split(",").map(Number);
          return <circle key={`${p.date}-${idx}`} cx={x} cy={y} r="4" fill="#16477d" />;
        })}
      </svg>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: "#666", fontSize: 12, fontWeight: 850 }}>
        <span>
          {formatDateShort(first.date)} • {formatDollarsFromCents(first.averageSaleCents)}
        </span>
        <span>
          {formatDateShort(last.date)} • {formatDollarsFromCents(last.averageSaleCents)}
        </span>
      </div>
    </div>
  );
}

function GradePill({ row }: { row: GradeBreakdownRow }) {
  const isRaw = row.grade === 0;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 8px",
        borderRadius: 999,
        border: "1px solid #ddd",
        background: isRaw ? "#f7f7f7" : "#eef6ff",
        color: isRaw ? "#333" : "#16477d",
        fontSize: 12,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
      title={`${row.label} quantity`}
    >
      {row.label}
      <span style={{ color: "#555" }}>×{row.quantity}</span>
      <span style={{ color: "#555" }}>{formatDollarsFromCents(row.valueCents)}</span>
    </span>
  );
}

function PendingPill({ quantity }: { quantity: number }) {
  if (quantity <= 0) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 8px",
        borderRadius: 999,
        border: "1px solid #f0d28a",
        background: "#fff8e8",
        color: "#7a5200",
        fontSize: 12,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
      title="Submitted to VCS grading but not revealed yet"
    >
      Pending VCS ×{quantity}
    </span>
  );
}

function MarketActivityCard({
  market,
  loading,
  error,
  selectedGrade,
  setSelectedGrade,
  range,
  setRange,
  isMobile,
}: {
  market: MarketResponse | null;
  loading: boolean;
  error: string | null;
  selectedGrade: number;
  setSelectedGrade: (grade: number) => void;
  range: MarketRange;
  setRange: (range: MarketRange) => void;
  isMobile: boolean;
}) {
  const selected =
    market?.grades.find((row) => row.grade === selectedGrade) ??
    market?.grades.find((row) => row.grade === 0) ??
    null;

  const recentSales = selected?.recentSales ?? [];
  const ranges: MarketRange[] = market?.availableRanges?.length ? market.availableRanges : ["7D", "30D", "90D", "ALL"];

  return (
    <section
      style={{
        marginTop: 18,
        border: "1px solid #dbe7f5",
        borderRadius: 22,
        background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 52%, #ffffff 100%)",
        boxShadow: "0 12px 30px rgba(22, 71, 125, 0.08)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: isMobile ? 12 : 16,
          borderBottom: "1px solid #e4edf8",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "#16477d", fontWeight: 1000, letterSpacing: 1, textTransform: "uppercase" }}>
            Market Activity
          </div>
          <div style={{ marginTop: 3, fontSize: 20, fontWeight: 1000, color: "#111" }}>
            Sales history and comps
          </div>
          <div style={{ marginTop: 4, color: "#5b6470", fontSize: 13, fontWeight: 750, maxWidth: 720 }}>
            Static book value stays unchanged. These are observed VCS sales from shop offers and completed auctions.
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: "7px 10px",
                borderRadius: 999,
                border: r === range ? "1px solid #16477d" : "1px solid #d8d8d8",
                background: r === range ? "#16477d" : "#fff",
                color: r === range ? "#fff" : "#333",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: isMobile ? 12 : 16 }}>
        {loading ? (
          <div style={{ color: "#666", fontWeight: 900 }}>Loading market history…</div>
        ) : error ? (
          <div
            style={{
              border: "1px solid #f3b5b5",
              background: "#fff5f5",
              color: "#9b1c1c",
              borderRadius: 14,
              padding: 12,
              fontWeight: 850,
            }}
          >
            {error}
          </div>
        ) : !market || !selected ? (
          <div
            style={{
              border: "1px dashed #d6d6d6",
              background: "#fafafa",
              color: "#666",
              borderRadius: 16,
              padding: 14,
              fontWeight: 850,
            }}
          >
            No market history yet. Future shop sales and collected auctions will appear here.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {MARKET_GRADES.map((grade) => {
                const row = market.grades.find((g) => g.grade === grade);
                const isSelected = selectedGrade === grade;
                const count = row?.salesCount ?? 0;

                return (
                  <button
                    key={grade}
                    onClick={() => setSelectedGrade(grade)}
                    style={{
                      padding: "8px 11px",
                      borderRadius: 999,
                      border: isSelected ? "1px solid #16477d" : "1px solid #d8d8d8",
                      background: isSelected ? "#eef6ff" : "#fff",
                      color: isSelected ? "#16477d" : "#333",
                      fontWeight: 1000,
                      cursor: "pointer",
                      boxShadow: isSelected ? "0 2px 8px rgba(22,71,125,0.12)" : "none",
                    }}
                  >
                    {marketGradeLabel(grade)}
                    <span style={{ marginLeft: 6, color: isSelected ? "#16477d" : "#777", fontWeight: 900 }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <StatCard
                label="Last sale"
                value={selected.lastSaleCents > 0 ? formatDollarsFromCents(selected.lastSaleCents) : "—"}
                sub={selected.lastSaleAt ? formatDateShort(selected.lastSaleAt) : "No recorded sale"}
                tone="blue"
              />
              <StatCard
                label="Average sale"
                value={selected.averageSaleCents > 0 ? formatDollarsFromCents(selected.averageSaleCents) : "—"}
                sub={`${selected.salesCount} recorded ${selected.salesCount === 1 ? "sale" : "sales"}`}
                tone="green"
              />
              <StatCard
                label="High sale"
                value={selected.highestSaleCents > 0 ? formatDollarsFromCents(selected.highestSaleCents) : "—"}
                sub={selected.salesCount > 0 ? "Best comp" : "No comp yet"}
                tone="gold"
              />
              <StatCard
                label="Low sale"
                value={selected.lowestSaleCents > 0 ? formatDollarsFromCents(selected.lowestSaleCents) : "—"}
                sub={selected.salesCount > 0 ? "Floor comp" : "No comp yet"}
              />
              <StatCard
                label="Trend"
                value={formatTrend(selected.trendBps)}
                sub="Recent vs older sales"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.35fr) minmax(280px, 0.9fr)", gap: 14 }}>
              <div>
                <div style={{ fontWeight: 1000, marginBottom: 8 }}>Sales trend</div>
                <SalesSparkline points={selected.graphData} />
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div style={{ fontWeight: 1000 }}>Recent sales</div>
                  <div style={{ color: trendColor(selected.trendBps), fontSize: 12, fontWeight: 1000 }}>
                    {selected.salesCount} total
                  </div>
                </div>

                {recentSales.length === 0 ? (
                  <div
                    style={{
                      border: "1px dashed #d6d6d6",
                      background: "#fafafa",
                      color: "#666",
                      borderRadius: 16,
                      padding: 14,
                      fontWeight: 850,
                    }}
                  >
                    No {selected.label.toLowerCase()} sales in this range.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {recentSales.slice(0, 5).map((sale) => (
                      <div
                        key={sale.id}
                        style={{
                          border: "1px solid #e8e8e8",
                          borderRadius: 14,
                          background: "#fff",
                          padding: "10px 11px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 1000 }}>{formatDollarsFromCents(sale.salePriceCents)}</div>
                          <div style={{ color: "#666", fontSize: 12, fontWeight: 850 }}>
                            {formatDateShort(sale.createdAt)} • {saleTypeLabel(sale)}
                          </div>
                        </div>
                        <div
                          style={{
                            borderRadius: 999,
                            border: "1px solid #d8d8d8",
                            padding: "5px 8px",
                            color: sale.grade === 0 ? "#333" : "#16477d",
                            background: sale.grade === 0 ? "#f7f7f7" : "#eef6ff",
                            fontSize: 12,
                            fontWeight: 1000,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {sale.label}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                borderTop: "1px solid #edf2f7",
                paddingTop: 10,
                color: "#69717d",
                fontSize: 12,
                fontWeight: 750,
                lineHeight: 1.45,
              }}
            >
              This is market history only. It does not automatically change book value or grading values.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function CreateAuctionButton({
  cardId,
  grade,
  label,
  quantity,
  onCreated,
}: {
  cardId: number;
  grade: number;
  label: string;
  quantity: number;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function createAuction() {
    setBusy(true);
    setErr(null);

    try {
      const res = await fetch("/api/auctions/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cardId,
          grade,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Unable to create auction.");
      }

      onCreated();
      window.location.href = `/auctions/${json.auction.id}`;
    } catch (e: any) {
      setErr(e?.message ?? "Unable to create auction.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <button
        onClick={createAuction}
        disabled={busy || quantity <= 0}
        style={{
          padding: "8px 10px",
          borderRadius: 12,
          border: "1px solid #f0d28a",
          background: "#fff8e8",
          color: "#7a5200",
          fontWeight: 1000,
          cursor: busy || quantity <= 0 ? "not-allowed" : "pointer",
          opacity: busy || quantity <= 0 ? 0.55 : 1,
        }}
        title="Start a 24-hour auction for one copy"
      >
        {busy ? "Creating..." : `Auction ${label}`}
      </button>
      {err ? <div style={{ color: "#b00020", fontSize: 12, fontWeight: 800 }}>{err}</div> : null}
    </div>
  );
}

export default function CardDetailClient({ cardId }: { cardId: number }) {
  const [data, setData] = useState<CardDetailResponse | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketErr, setMarketErr] = useState<string | null>(null);
  const [selectedMarketGrade, setSelectedMarketGrade] = useState(0);
  const [marketRange, setMarketRange] = useState<MarketRange>("ALL");

  const [side, setSide] = useState<ImageSide>("front");
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [selectedSlabIndex, setSelectedSlabIndex] = useState(0);

  const [imgErrorFront, setImgErrorFront] = useState(false);
  const [imgErrorBack, setImgErrorBack] = useState(false);

  async function loadMarket(nextRange = marketRange) {
    setMarketLoading(true);
    setMarketErr(null);

    try {
      const res = await fetch(
        `/api/cards/${encodeURIComponent(String(cardId))}/market?range=${encodeURIComponent(nextRange)}`,
        {
          cache: "no-store",
        }
      );

      const raw = await res.text();

      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Market data returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      setMarket(j as MarketResponse);
    } catch (e: any) {
      setMarketErr(e?.message ?? "Failed to load market history");
      setMarket(null);
    } finally {
      setMarketLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`/api/cards/${encodeURIComponent(String(cardId))}/population`, {
        cache: "no-store",
      });

      const raw = await res.text();

      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Card detail returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      setData(j as CardDetailResponse);
      setImgErrorFront(false);
      setImgErrorBack(false);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load card detail");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  useEffect(() => {
    loadMarket(marketRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, marketRange]);

  const c = data?.card;

  const setLabel = c
    ? c.productSetName?.trim()
      ? c.productSetName.trim()
      : c.productSetIsBase == null
        ? "—"
        : c.productSetIsBase
          ? "Base"
          : "Insert"
    : "";

  const setTypePrefix =
    c?.productSetIsBase == null ? "" : c.productSetIsBase ? "Base — " : "Insert — ";

  const slabSetName = c ? [c.productYear, c.productBrand, setLabel].filter(Boolean).join(" ") : "";

  const frontUrl = useMemo(() => safeUrl(c?.frontImageUrl), [c?.frontImageUrl]);
  const backUrl = useMemo(() => safeUrl(c?.backImageUrl), [c?.backImageUrl]);

  const myOwnership = data?.myOwnership ?? null;
  const myOwnershipBreakdown = useMemo(() => normalizeBreakdown(myOwnership), [myOwnership]);
  const myOwnershipSlabs = useMemo(() => normalizeSlabs(myOwnership), [myOwnership]);

  const auctionableRows = useMemo(() => {
    return myOwnershipBreakdown.filter((row) => row.quantity > 0 && [0, 6, 7, 8, 9, 10].includes(row.grade));
  }, [myOwnershipBreakdown]);

  useEffect(() => {
    if (side === "back" && !backUrl) setSide("front");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backUrl]);

  useEffect(() => {
    setSelectedSlabIndex((prev) => {
      if (myOwnershipSlabs.length === 0) return 0;
      return Math.max(0, Math.min(prev, myOwnershipSlabs.length - 1));
    });

    if (myOwnershipSlabs.length === 0 && viewMode === "slab") {
      setViewMode("card");
    }
  }, [myOwnershipSlabs.length, viewMode]);

  const showFront = side === "front";
  const activeUrl = showFront ? frontUrl : backUrl;
  const activeErrored = showFront ? imgErrorFront : imgErrorBack;

  const hasAnyImage = Boolean(frontUrl || backUrl);
  const selectedSlab = myOwnershipSlabs[selectedSlabIndex] ?? myOwnershipSlabs[0] ?? null;

  const refreshAll = () => {
    load();
    loadMarket(marketRange);
  };

  return (
    <div
      style={{
        fontFamily: "system-ui",
        padding: isMobile ? 10 : 16,
        background: "#f6f7fb",
        minHeight: "100vh",
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1280,
          minWidth: 0,
          margin: "0 auto",
          display: "grid",
          gap: isMobile ? 12 : 16,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/collection" style={{ textDecoration: "underline", fontWeight: 900, color: "#16477d" }}>
            ← Collection
          </Link>

          <div style={{ fontWeight: 1000, fontSize: isMobile ? 20 : 24 }}>Card Details</div>

          <button
            onClick={refreshAll}
            disabled={loading || marketLoading}
            style={{
              padding: "7px 11px",
              borderRadius: 12,
              border: "1px solid #d8d8d8",
              background: "#fff",
              fontWeight: 900,
              cursor: loading || marketLoading ? "not-allowed" : "pointer",
            }}
          >
            Refresh
          </button>
        </div>

        {err && (
          <div style={{ padding: 12, background: "#fee", border: "1px solid #f99", borderRadius: 14, fontWeight: 850 }}>
            {err}
          </div>
        )}

        {loading ? (
          <div>Loading…</div>
        ) : !data || !c ? (
          <div>No data.</div>
        ) : (
          <>
            <section
              style={{
                border: "1px solid #e2e2e2",
                borderRadius: 22,
                background: "#fff",
                boxShadow: "0 12px 30px rgba(0,0,0,0.06)",
                padding: isMobile ? 12 : 16,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(360px, 0.95fr)",
                  gap: isMobile ? 14 : 18,
                  alignItems: "start",
                  width: "100%",
                  minWidth: 0,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#16477d", fontSize: 12, fontWeight: 1000, letterSpacing: 1, textTransform: "uppercase" }}>
                    {formatProductName(c)}
                  </div>
                  <div style={{ marginTop: 4, fontSize: isMobile ? 28 : 30, lineHeight: 1.03, fontWeight: 1000, color: "#111" }}>
                    {c.player}
                  </div>
                  <div style={{ marginTop: 8, fontWeight: 900, color: "#3f4650" }}>
                    Card #{c.cardNumber} {c.team ? `• ${c.team}` : ""}
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      display: "grid",
                      gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))",
                      gap: 10,
                    }}
                  >
                    <StatCard label="Book value" value={formatBookValue(c.bookValue)} sub="Static baseline" tone="blue" />
                    <StatCard
                      label="Population"
                      value={String(safeNum(data.population.totalOwnedIncludingPending, data.population.totalOwned))}
                      sub={`${data.population.uniqueOwners} unique owners`}
                      tone="gold"
                    />
                    <div style={{ gridColumn: isMobile ? "1 / -1" : "auto" }}>
                      <StatCard
                        label="Your total"
                        value={String(safeNum(myOwnership?.totalQuantity, myOwnership?.quantity ?? 0))}
                        sub={`${safeNum(myOwnership?.rawQuantity)} raw • ${safeNum(myOwnership?.gradedQuantity)} graded`}
                        tone="green"
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 14, color: "#444", display: "grid", gap: 4, fontWeight: 750 }}>
                    <div>
                      <span style={{ fontWeight: 1000 }}>Set:</span> {setTypePrefix}
                      {setLabel}
                    </div>
                    <div>
                      <span style={{ fontWeight: 1000 }}>Subset/Variant:</span> {c.subset ?? "—"} / {c.variant ?? "—"}
                    </div>
                    <div>
                      <span style={{ fontWeight: 1000 }}>Gradeability:</span> {c.gradeabilityLabel ?? c.gradeability ?? "Common"}
                    </div>
                  </div>
                </div>

                <div style={{ minWidth: 0, width: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 18, fontWeight: 1000 }}>{viewMode === "slab" ? "VCS slab" : "Card images"}</div>

                    <div style={{ display: "flex", gap: 6, marginLeft: isMobile ? 0 : "auto", flexWrap: "wrap" }}>
                      <button
                        onClick={() => setViewMode("card")}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          fontWeight: 900,
                          background: viewMode === "card" ? "#eef6ff" : "#fff",
                          cursor: "pointer",
                        }}
                      >
                        Card
                      </button>

                      <button
                        onClick={() => setViewMode("slab")}
                        disabled={myOwnershipSlabs.length === 0}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          fontWeight: 900,
                          opacity: myOwnershipSlabs.length === 0 ? 0.5 : 1,
                          background: viewMode === "slab" ? "#eef6ff" : "#fff",
                          cursor: myOwnershipSlabs.length === 0 ? "not-allowed" : "pointer",
                        }}
                        title={myOwnershipSlabs.length === 0 ? "No revealed graded copies yet" : "View VCS slab"}
                      >
                        Slab
                      </button>

                      {viewMode === "card" && hasAnyImage ? (
                        <>
                          <button
                            onClick={() => setSide("front")}
                            disabled={!frontUrl}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 10,
                              border: "1px solid #ddd",
                              fontWeight: 900,
                              opacity: !frontUrl ? 0.5 : 1,
                              background: side === "front" ? "#eef6ff" : "#fff",
                              cursor: !frontUrl ? "not-allowed" : "pointer",
                            }}
                          >
                            Front
                          </button>
                          <button
                            onClick={() => setSide("back")}
                            disabled={!backUrl}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 10,
                              border: "1px solid #ddd",
                              fontWeight: 900,
                              opacity: !backUrl ? 0.5 : 1,
                              background: side === "back" ? "#eef6ff" : "#fff",
                              cursor: !backUrl ? "not-allowed" : "pointer",
                            }}
                          >
                            Back
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {viewMode === "slab" && selectedSlab ? (
                    <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
                      {myOwnershipSlabs.length > 1 ? (
                        <select
                          value={selectedSlabIndex}
                          onChange={(e) => setSelectedSlabIndex(Number(e.target.value))}
                          style={{
                            width: "100%",
                            maxWidth: 390,
                            padding: "8px 10px",
                            border: "1px solid #ddd",
                            borderRadius: 10,
                            fontWeight: 900,
                          }}
                        >
                          {myOwnershipSlabs.map((slab, idx) => (
                            <option key={`${slab.grade}-${idx}`} value={idx}>
                              {slab.label} ×{slab.quantity}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      <VcsSlab
                        player={c.player}
                        cardNumber={c.cardNumber}
                        setName={slabSetName}
                        team={c.team}
                        grade={selectedSlab.grade}
                        gradeability={c.gradeability}
                        gradeabilityLabel={c.gradeabilityLabel}
                        valueCents={selectedSlab.valueCents}
                        quantity={selectedSlab.quantity}
                        imageUrl={frontUrl}
                      />
                    </div>
                  ) : !hasAnyImage ? (
                    <div
                      style={{
                        border: "1px dashed #ccc",
                        borderRadius: 16,
                        padding: 16,
                        color: "#666",
                        background: "#fafafa",
                        fontWeight: 850,
                      }}
                    >
                      No images uploaded for this card yet.
                    </div>
                  ) : activeUrl && !activeErrored ? (
                    <div
                      style={{
                        border: "1px solid #ddd",
                        borderRadius: 18,
                        padding: 10,
                        background: "#fff",
                      }}
                    >
                      <img
                        src={activeUrl}
                        alt={showFront ? "Front of card" : "Back of card"}
                        style={{
                          width: "100%",
                          maxWidth: isMobile ? "100%" : 520,
                          height: "auto",
                          display: "block",
                          borderRadius: 12,
                          border: "1px solid #eee",
                          objectFit: "contain",
                          margin: "0 auto",
                        }}
                        onError={() => {
                          if (showFront) setImgErrorFront(true);
                          else setImgErrorBack(true);
                        }}
                      />

                      <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
                        <div style={{ color: "#666", fontWeight: 800 }}>Showing: {showFront ? "Front" : "Back"}</div>
                        <a
                          href={activeUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ marginLeft: "auto", textDecoration: "underline", fontWeight: 900, color: "#16477d" }}
                        >
                          Open image
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        border: "1px dashed #ccc",
                        borderRadius: 16,
                        padding: 16,
                        color: "#666",
                        background: "#fafafa",
                        fontWeight: 850,
                      }}
                    >
                      Image failed to load. (Broken URL or blocked host)
                    </div>
                  )}
                </div>
              </div>
            </section>

            <MarketActivityCard
              market={market}
              loading={marketLoading}
              error={marketErr}
              selectedGrade={selectedMarketGrade}
              setSelectedGrade={setSelectedMarketGrade}
              range={marketRange}
              setRange={setMarketRange}
              isMobile={isMobile}
            />

            {myOwnership ? (
              <section
                style={{
                  border: "1px solid #e2e2e2",
                  borderRadius: 22,
                  padding: 16,
                  background: "#fff",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.045)",
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 1000, marginBottom: 10 }}>Your Ownership</div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <StatCard label="Raw" value={String(safeNum(myOwnership.rawQuantity))} />
                  <StatCard label="Pending VCS" value={String(safeNum(myOwnership.pendingGradingQuantity))} tone="gold" />
                  <StatCard label="Graded" value={String(safeNum(myOwnership.gradedQuantity))} tone="blue" />
                  <StatCard
                    label="Total value"
                    value={formatDollarsFromCents(safeNum(myOwnership.totalValueCents))}
                    sub="Including pending"
                    tone="green"
                  />
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {myOwnershipBreakdown.map((row) => (
                    <GradePill key={row.grade} row={row} />
                  ))}
                  <PendingPill quantity={safeNum(myOwnership.pendingGradingQuantity)} />
                </div>

                <div style={{ marginTop: 14 }}>
                  <SubmitForGradingButton
                    cardId={c.id}
                    rawQuantity={safeNum(myOwnership.rawQuantity)}
                    bookValue={c.bookValue}
                    player={c.player}
                    cardNumber={c.cardNumber}
                    onSubmitted={refreshAll}
                  />
                </div>


                <div style={{ marginTop: 14 }}>
                  <RequestShopOfferButton cardId={c.id} />
                </div>

                {auctionableRows.length > 0 ? (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 14,
                      borderRadius: 18,
                      border: "1px solid #f0d28a",
                      background: "#fffdf5",
                    }}
                  >
                    <div style={{ fontWeight: 1000, color: "#7a5200", marginBottom: 6 }}>
                      Auction House
                    </div>
                    <div style={{ color: "#7a5200", fontSize: 13, fontWeight: 800, marginBottom: 10 }}>
                      Start a 24-hour auction for one owned copy. VCS will lock the card while bids come in.
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {auctionableRows.map((row) => (
                        <CreateAuctionButton
                          key={row.grade}
                          cardId={c.id}
                          grade={row.grade}
                          label={row.label}
                          quantity={row.quantity}
                          onCreated={refreshAll}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section
              style={{
                border: "1px solid #e2e2e2",
                borderRadius: 22,
                padding: 16,
                background: "#fff",
                boxShadow: "0 8px 24px rgba(0,0,0,0.045)",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 1000, marginBottom: 10 }}>Population report</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                <StatCard label="Unique owners" value={String(data.population.uniqueOwners)} />
                <StatCard label="Total owned" value={String(data.population.totalOwned)} tone="blue" />
                <StatCard
                  label="Incl. pending"
                  value={String(safeNum(data.population.totalOwnedIncludingPending, data.population.totalOwned))}
                  tone="gold"
                />
                <StatCard
                  label="Population value"
                  value={formatDollarsFromCents(safeNum(data.population.totalValueCents))}
                  sub="Including pending"
                  tone="green"
                />
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 5, color: "#444", fontWeight: 800 }}>
                <div>Raw: {safeNum(data.population.raw)}</div>
                <div>Pending VCS: {safeNum(data.population.pendingGrading)}</div>
                <div>Graded: {safeNum(data.population.graded)}</div>
              </div>
            </section>

            <section
              style={{
                border: "1px solid #e2e2e2",
                borderRadius: 22,
                padding: 16,
                background: "#fff",
                boxShadow: "0 8px 24px rgba(0,0,0,0.045)",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 1000, marginBottom: 10 }}>Owners</div>

              {data.owners.length === 0 ? (
                <div style={{ color: "#666", fontWeight: 850 }}>No one owns this yet.</div>
              ) : isMobile ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {data.owners.map((o, idx) => (
                    <div
                      key={`${o.userId}-${idx}`}
                      style={{
                        border: "1px solid #e2e2e2",
                        borderRadius: 16,
                        background: idx % 2 === 0 ? "#fff" : "#fcfcfc",
                        padding: 12,
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 1000, color: "#111", overflowWrap: "anywhere" }}>
                          {o.name?.trim() ? o.name.trim() : o.email ?? o.userId}
                        </div>
                        <div style={{ marginTop: 2, color: "#666", fontSize: 12, fontWeight: 750, overflowWrap: "anywhere" }}>
                          {o.email ?? "—"}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                          gap: 8,
                        }}
                      >
                        <StatCard label="Raw" value={String(safeNum(o.rawQuantity))} />
                        <StatCard label="Pending" value={String(safeNum(o.pendingGradingQuantity))} tone="gold" />
                        <StatCard label="Graded" value={String(safeNum(o.gradedQuantity))} tone="blue" />
                        <StatCard label="Total" value={String(safeNum(o.totalQuantity, o.quantity))} tone="green" />
                      </div>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {normalizeBreakdown(o).map((row) => (
                          <GradePill key={row.grade} row={row} />
                        ))}
                        <PendingPill quantity={safeNum(o.pendingGradingQuantity)} />
                      </div>

                      <div
                        style={{
                          borderTop: "1px solid #eeeeee",
                          paddingTop: 8,
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          color: "#444",
                          fontWeight: 900,
                        }}
                      >
                        <span>Total value</span>
                        <span>{formatDollarsFromCents(safeNum(o.totalValueCents))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 16 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                    <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
                      <tr>
                        {["User", "Email", "Raw", "Pending", "Graded", "Total", "Breakdown", "Value"].map((h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: "left",
                              padding: 10,
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
                      {data.owners.map((o, idx) => (
                        <tr key={`${o.userId}-${idx}`} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                          <td style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                            {o.name?.trim() ? o.name.trim() : o.email ?? o.userId}
                          </td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{o.email ?? "—"}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 900 }}>{safeNum(o.rawQuantity)}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                            {safeNum(o.pendingGradingQuantity)}
                          </td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                            {safeNum(o.gradedQuantity)}
                          </td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                            {safeNum(o.totalQuantity, o.quantity)}
                          </td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {normalizeBreakdown(o).map((row) => (
                                <GradePill key={row.grade} row={row} />
                              ))}
                              <PendingPill quantity={safeNum(o.pendingGradingQuantity)} />
                            </div>
                          </td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                            {formatDollarsFromCents(safeNum(o.totalValueCents))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}