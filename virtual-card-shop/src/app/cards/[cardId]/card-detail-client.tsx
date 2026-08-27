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

type PopulationBreakdownRow = {
  grade: number;
  label: string;
  quantity: number;
  percentage: number;
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
    gradeBreakdown: PopulationBreakdownRow[];
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

function formatPopulationPercentage(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.0%";
  if (value < 0.1) return "<0.1%";
  return `${value.toFixed(1)}%`;
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
      ? "#f5f9ff"
      : tone === "gold"
        ? "#fffaf0"
        : tone === "green"
          ? "#f4fbf6"
          : "#fff";
  const border =
    tone === "blue"
      ? "#d7e7fb"
      : tone === "gold"
        ? "#edd79c"
        : tone === "green"
          ? "#cbe8d5"
          : "#e6e6e6";
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
        borderRadius: 13,
        padding: "9px 10px",
        background: bg,
        minWidth: 0,
        width: "100%",
        boxSizing: "border-box",
        boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
      }}
    >
      <div style={{ color: "#6a6a6a", fontSize: 10.5, fontWeight: 950, letterSpacing: 0.15 }}>
        {label}
      </div>
      <div style={{ marginTop: 2, fontSize: 18, lineHeight: 1.05, fontWeight: 1000, color }}>
        {value}
      </div>
      {sub ? (
        <div style={{ marginTop: 3, color: "#707070", fontSize: 10.5, fontWeight: 800, lineHeight: 1.25 }}>
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

function SectionHeading({
  eyebrow,
  title,
  copy,
  accent,
}: {
  eyebrow: string;
  title: string;
  copy?: string;
  accent: "blue" | "green" | "gold" | "slate";
}) {
  const palette =
    accent === "blue"
      ? { color: "#16477d", line: "#cfe4ff", bg: "#f7fbff" }
      : accent === "green"
        ? { color: "#126b3a", line: "#cbe8d5", bg: "#f7fcf8" }
        : accent === "gold"
          ? { color: "#7a5200", line: "#edd79c", bg: "#fffaf0" }
          : { color: "#45505d", line: "#dfe4ea", bg: "#f8fafc" };

  return (
    <div
      style={{
        margin: "-1px -1px 0",
        padding: "10px 12px",
        borderBottom: `1px solid ${palette.line}`,
        background: palette.bg,
      }}
    >
      <div
        style={{
          color: palette.color,
          fontSize: 10.5,
          fontWeight: 1000,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </div>
      <div style={{ marginTop: 2, color: "#111", fontSize: 18, lineHeight: 1.08, fontWeight: 1000 }}>
        {title}
      </div>
      {copy ? (
        <div style={{ marginTop: 3, color: "#68717c", fontSize: 11.5, lineHeight: 1.35, fontWeight: 750 }}>
          {copy}
        </div>
      ) : null}
    </div>
  );
}

function SummaryStrip({
  items,
}: {
  items: Array<{
    label: string;
    value: string;
    sub?: string;
    tone?: "neutral" | "blue" | "gold" | "green";
  }>;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        border: "1px solid #e2e5e9",
        borderRadius: 13,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      {items.map((item, index) => {
        const color =
          item.tone === "blue"
            ? "#16477d"
            : item.tone === "gold"
              ? "#7a5200"
              : item.tone === "green"
                ? "#126b3a"
                : "#222";

        return (
          <div
            key={`${item.label}-${index}`}
            style={{
              minWidth: 0,
              padding: "8px 7px",
              borderLeft: index === 0 ? "none" : "1px solid #e7e9ec",
            }}
          >
            <div
              style={{
                color: "#727982",
                fontSize: 9.5,
                lineHeight: 1,
                fontWeight: 950,
                textTransform: "uppercase",
                letterSpacing: 0.35,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                marginTop: 3,
                color,
                fontSize: 16,
                lineHeight: 1,
                fontWeight: 1000,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {item.value}
            </div>
            {item.sub ? (
              <div
                style={{
                  marginTop: 3,
                  color: "#747b84",
                  fontSize: 9.5,
                  lineHeight: 1.15,
                  fontWeight: 800,
                }}
              >
                {item.sub}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function GradeBreakdownTable({
  rows,
  pendingQuantity = 0,
}: {
  rows: GradeBreakdownRow[];
  pendingQuantity?: number;
}) {
  const visible = rows.filter((row) => row.quantity > 0);

  return (
    <div
      style={{
        border: "1px solid #e2e5e9",
        borderRadius: 13,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      {visible.map((row, index) => (
        <div
          key={row.grade}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(76px, 1fr) auto auto",
            gap: 8,
            alignItems: "center",
            padding: "7px 9px",
            borderBottom:
              index === visible.length - 1 && pendingQuantity <= 0 ? "none" : "1px solid #edf0f2",
          }}
        >
          <div
            style={{
              color: row.grade === 10 ? "#7a5200" : row.grade === 0 ? "#333" : "#16477d",
              fontSize: 12,
              fontWeight: 1000,
            }}
          >
            {row.label}
          </div>
          <div style={{ color: "#555", fontSize: 11.5, fontWeight: 900 }}>×{row.quantity}</div>
          <div style={{ color: "#333", fontSize: 11.5, fontWeight: 950, textAlign: "right" }}>
            {formatDollarsFromCents(row.valueCents)}
          </div>
        </div>
      ))}

      {pendingQuantity > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 8,
            alignItems: "center",
            padding: "7px 9px",
            background: "#fffaf0",
          }}
        >
          <div style={{ color: "#7a5200", fontSize: 12, fontWeight: 1000 }}>Pending VCS</div>
          <div style={{ color: "#7a5200", fontSize: 11.5, fontWeight: 950 }}>×{pendingQuantity}</div>
        </div>
      ) : null}
    </div>
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
  const ranges: MarketRange[] = market?.availableRanges?.length
    ? market.availableRanges
    : ["7D", "30D", "90D", "ALL"];

  return (
    <section
      className="vcs-panel"
      style={{
        marginTop: 0,
        borderColor: "#cfe4ff",
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <SectionHeading
        eyebrow="Market Activity"
        title="Sales history & comps"
        copy="Observed VCS shop sales and completed auctions. Book value remains static."
        accent="blue"
      />

      <div style={{ padding: isMobile ? 10 : 14, display: "grid", gap: 9 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(4, minmax(0, 1fr))" : "repeat(4, auto)",
            gap: 5,
          }}
        >
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                minWidth: 0,
                padding: "6px 7px",
                borderRadius: 10,
                border: r === range ? "1px solid #16477d" : "1px solid #dfe4e9",
                background: r === range ? "#16477d" : "#fff",
                color: r === range ? "#fff" : "#3f4650",
                fontSize: 11.5,
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              {r}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="vcs-state vcs-state-loading" role="status" aria-live="polite">
            <div className="vcs-state-mark" aria-hidden="true" />
            <div className="vcs-state-body">
              <div className="vcs-state-title">Loading market activity</div>
              <div className="vcs-state-copy">Checking recent VCS sales and auction comps…</div>
            </div>
          </div>
        ) : error ? (
          <div className="vcs-state vcs-state-error" role="alert">
            <div className="vcs-state-mark" aria-hidden="true">!</div>
            <div className="vcs-state-body">
              <div className="vcs-state-title">Market activity couldn’t load</div>
              <div className="vcs-state-copy">{error}</div>
            </div>
          </div>
        ) : !market || !selected ? (
          <div className="vcs-state vcs-state-empty">
            <div className="vcs-state-mark" aria-hidden="true">—</div>
            <div className="vcs-state-body">
              <div className="vcs-state-title">No market history yet</div>
              <div className="vcs-state-copy">Future shop sales and completed auctions will appear here.</div>
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "repeat(3, minmax(0, 1fr))" : "repeat(6, minmax(0, 1fr))",
                gap: 5,
              }}
            >
              {MARKET_GRADES.map((grade) => {
                const row = market.grades.find((g) => g.grade === grade);
                const isSelected = selectedGrade === grade;
                const count = row?.salesCount ?? 0;

                return (
                  <button
                    key={grade}
                    onClick={() => setSelectedGrade(grade)}
                    style={{
                      minWidth: 0,
                      padding: "6px 4px",
                      borderRadius: 10,
                      border: isSelected ? "1px solid #16477d" : "1px solid #dfe4e9",
                      background: isSelected ? "#eef6ff" : "#fff",
                      color: isSelected ? "#16477d" : "#333",
                      fontSize: 11,
                      lineHeight: 1.05,
                      fontWeight: 1000,
                      cursor: "pointer",
                    }}
                  >
                    <div>{marketGradeLabel(grade)}</div>
                    <div style={{ marginTop: 2, color: isSelected ? "#16477d" : "#777", fontSize: 10 }}>
                      {count}
                    </div>
                  </button>
                );
              })}
            </div>

            {selected.salesCount <= 0 ? (
              <div
                style={{
                  border: "1px dashed #cbd8e7",
                  borderRadius: 12,
                  background: "#f8fbff",
                  padding: "11px 12px",
                  color: "#5d6875",
                  fontSize: 12,
                  lineHeight: 1.35,
                  fontWeight: 850,
                }}
              >
                No {selected.label.toLowerCase()} sales in this range.
              </div>
            ) : (
              <>
                <SummaryStrip
                  items={[
                    {
                      label: "Last",
                      value: formatDollarsFromCents(selected.lastSaleCents),
                      sub: selected.lastSaleAt ? formatDateShort(selected.lastSaleAt) : undefined,
                      tone: "blue",
                    },
                    {
                      label: "Average",
                      value: formatDollarsFromCents(selected.averageSaleCents),
                      sub: `${selected.salesCount} sales`,
                      tone: "green",
                    },
                    {
                      label: "High",
                      value: formatDollarsFromCents(selected.highestSaleCents),
                      tone: "gold",
                    },
                    {
                      label: "Low",
                      value: formatDollarsFromCents(selected.lowestSaleCents),
                    },
                    {
                      label: "Trend",
                      value: formatTrend(selected.trendBps),
                    },
                  ]}
                />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.3fr) minmax(260px, 0.8fr)",
                    gap: 10,
                  }}
                >
                  {selected.graphData.length >= 2 ? (
                    <div>
                      <div style={{ marginBottom: 5, color: "#303841", fontSize: 12, fontWeight: 1000 }}>
                        Sales trend
                      </div>
                      <SalesSparkline points={selected.graphData} />
                    </div>
                  ) : null}

                  <div>
                    <div
                      style={{
                        marginBottom: 5,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ color: "#303841", fontSize: 12, fontWeight: 1000 }}>Recent sales</div>
                      <div style={{ color: trendColor(selected.trendBps), fontSize: 10.5, fontWeight: 950 }}>
                        {selected.salesCount} total
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 5 }}>
                      {recentSales.slice(0, 5).map((sale) => (
                        <div
                          key={sale.id}
                          style={{
                            border: "1px solid #e5e9ed",
                            borderRadius: 10,
                            background: "#fff",
                            padding: "7px 8px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 1000 }}>
                              {formatDollarsFromCents(sale.salePriceCents)}
                            </div>
                            <div style={{ color: "#6b737c", fontSize: 10.5, fontWeight: 800 }}>
                              {formatDateShort(sale.createdAt)} • {saleTypeLabel(sale)}
                            </div>
                          </div>
                          <div
                            style={{
                              borderRadius: 8,
                              border: "1px solid #dde2e8",
                              padding: "4px 6px",
                              color: sale.grade === 0 ? "#333" : "#16477d",
                              background: sale.grade === 0 ? "#f7f7f7" : "#eef6ff",
                              fontSize: 10.5,
                              fontWeight: 1000,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {sale.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
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
    <div style={{ display: "grid", gap: 3 }}>
      <button
        onClick={createAuction}
        disabled={busy || quantity <= 0}
        style={{
          minHeight: 34,
          padding: "6px 8px",
          borderRadius: 10,
          border: "1px solid #e6c96e",
          background: "#fffaf0",
          color: "#7a5200",
          fontSize: 11.5,
          fontWeight: 1000,
          cursor: busy || quantity <= 0 ? "not-allowed" : "pointer",
          opacity: busy || quantity <= 0 ? 0.55 : 1,
        }}
        title="Start a 24-hour auction for one copy"
      >
        {busy ? "Creating…" : label}
      </button>
      {err ? <div style={{ color: "#b00020", fontSize: 10.5, fontWeight: 800 }}>{err}</div> : null}
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

  const slabSetName = c ? setLabel : "";

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
      className="vcs-page-shell"
      style={{
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden",
      }}
    >
      <div
        className="vcs-page vcs-page-wide"
        style={{
          minWidth: 0,
          display: "grid",
          gap: isMobile ? 12 : 16,
        }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/collection" className="vcs-back-link">
            ← Collection
          </Link>

          <div style={{ fontWeight: 1000, fontSize: isMobile ? 20 : 24 }}>Card Details</div>

          <button
            onClick={refreshAll}
            disabled={loading || marketLoading}
            className="vcs-button vcs-button-soft vcs-button-compact"
          >
            Refresh
          </button>
        </div>

        {err ? (
          <div className="vcs-state vcs-state-error" role="alert">
            <div className="vcs-state-mark" aria-hidden="true">
              !
            </div>

            <div className="vcs-state-body">
              <div className="vcs-state-title">
                Card details couldn’t load
              </div>
              <div className="vcs-state-copy">
                {err}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div
            className="vcs-state vcs-state-loading"
            role="status"
            aria-live="polite"
          >
            <div className="vcs-state-mark" aria-hidden="true" />

            <div className="vcs-state-body">
              <div className="vcs-state-title">
                Loading card details
              </div>
              <div className="vcs-state-copy">
                Fetching card information, ownership, population, and market data…
              </div>
            </div>
          </div>
        ) : !data || !c ? (
          <div className="vcs-state vcs-state-empty">
            <div className="vcs-state-mark" aria-hidden="true">
              —
            </div>

            <div className="vcs-state-body">
              <div className="vcs-state-title">
                Card unavailable
              </div>
              <div className="vcs-state-copy">
                VCS couldn’t find information for this card.
              </div>
            </div>
          </div>
        ) : (
          <>
            <section
              className="vcs-panel"
              style={{
                padding: isMobile ? 10 : 16,
                overflow: "hidden",
                borderColor: "#dfe4ea",
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 0.9fr) minmax(360px, 1.05fr)",
                  gap: isMobile ? 12 : 18,
                  alignItems: "start",
                  minWidth: 0,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: "#16477d",
                      fontSize: 10.5,
                      fontWeight: 1000,
                      letterSpacing: 0.9,
                      textTransform: "uppercase",
                    }}
                  >
                    {formatProductName(c)}
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: isMobile ? 25 : 30,
                      lineHeight: 1.02,
                      fontWeight: 1000,
                      color: "#111",
                    }}
                  >
                    {c.player}
                  </div>
                  <div style={{ marginTop: 5, color: "#4a525d", fontSize: 13, fontWeight: 900 }}>
                    #{c.cardNumber}
                    {c.team ? ` • ${c.team}` : ""}
                    {c.variant ? ` • ${c.variant}` : ""}
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <SummaryStrip
                      items={[
                        {
                          label: "Book value",
                          value: formatBookValue(c.bookValue),
                          sub: "Static",
                          tone: "blue",
                        },
                        {
                          label: "Population",
                          value: String(
                            safeNum(
                              data.population.totalOwnedIncludingPending,
                              data.population.totalOwned
                            )
                          ),
                          sub: `${data.population.uniqueOwners} owners`,
                          tone: "gold",
                        },
                        {
                          label: "You own",
                          value: String(
                            safeNum(myOwnership?.totalQuantity, myOwnership?.quantity ?? 0)
                          ),
                          sub: `${safeNum(myOwnership?.rawQuantity)} raw • ${safeNum(
                            myOwnership?.gradedQuantity
                          )} graded`,
                          tone: "green",
                        },
                      ]}
                    />
                  </div>

                  <div
                    style={{
                      marginTop: 9,
                      borderTop: "1px solid #edf0f2",
                      paddingTop: 8,
                      color: "#59616b",
                      fontSize: 11.5,
                      fontWeight: 800,
                      lineHeight: 1.35,
                    }}
                  >
                    <div>
                      <span style={{ color: "#333", fontWeight: 1000 }}>Set:</span>{" "}
                      {setTypePrefix}
                      {setLabel}
                    </div>
                    {c.subset || c.variant ? (
                      <div style={{ marginTop: 2 }}>
                        <span style={{ color: "#333", fontWeight: 1000 }}>Subset / Variant:</span>{" "}
                        {c.subset ?? "—"} / {c.variant ?? "—"}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div style={{ minWidth: 0, width: "100%" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ color: "#4c5560", fontSize: 11, fontWeight: 1000, marginRight: 2 }}>
                      View
                    </div>

                    <button
                      onClick={() => setViewMode("card")}
                      style={{
                        padding: "5px 8px",
                        borderRadius: 9,
                        border: "1px solid #dfe3e7",
                        color: viewMode === "card" ? "#16477d" : "#444",
                        fontSize: 11.5,
                        fontWeight: 950,
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
                        padding: "5px 8px",
                        borderRadius: 9,
                        border: "1px solid #dfe3e7",
                        color: viewMode === "slab" ? "#16477d" : "#444",
                        fontSize: 11.5,
                        fontWeight: 950,
                        opacity: myOwnershipSlabs.length === 0 ? 0.45 : 1,
                        background: viewMode === "slab" ? "#eef6ff" : "#fff",
                        cursor: myOwnershipSlabs.length === 0 ? "not-allowed" : "pointer",
                      }}
                      title={myOwnershipSlabs.length === 0 ? "No revealed graded copies yet" : "View VCS slab"}
                    >
                      Slab
                    </button>

                    {viewMode === "card" && hasAnyImage ? (
                      <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
                        <button
                          onClick={() => setSide("front")}
                          disabled={!frontUrl}
                          style={{
                            padding: "5px 7px",
                            borderRadius: 9,
                            border: "1px solid #dfe3e7",
                            color: side === "front" ? "#16477d" : "#555",
                            fontSize: 10.5,
                            fontWeight: 950,
                            opacity: !frontUrl ? 0.45 : 1,
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
                            padding: "5px 7px",
                            borderRadius: 9,
                            border: "1px solid #dfe3e7",
                            color: side === "back" ? "#16477d" : "#555",
                            fontSize: 10.5,
                            fontWeight: 950,
                            opacity: !backUrl ? 0.45 : 1,
                            background: side === "back" ? "#eef6ff" : "#fff",
                            cursor: !backUrl ? "not-allowed" : "pointer",
                          }}
                        >
                          Back
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {viewMode === "slab" && selectedSlab ? (
                    <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
                      {myOwnershipSlabs.length > 1 ? (
                        <select
                          value={selectedSlabIndex}
                          onChange={(e) => setSelectedSlabIndex(Number(e.target.value))}
                          style={{
                            width: "100%",
                            maxWidth: 390,
                            padding: "7px 9px",
                            border: "1px solid #dfe3e7",
                            borderRadius: 9,
                            fontSize: 11.5,
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
                        border: "1px dashed #d8dde2",
                        borderRadius: 12,
                        padding: 12,
                        color: "#69717b",
                        background: "#fafbfc",
                        fontSize: 11.5,
                        fontWeight: 850,
                      }}
                    >
                      No images uploaded for this card yet.
                    </div>
                  ) : activeUrl && !activeErrored ? (
                    <div
                      style={{
                        border: "1px solid #e0e3e6",
                        borderRadius: 13,
                        padding: 7,
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
                          borderRadius: 9,
                          border: "1px solid #eee",
                          objectFit: "contain",
                          margin: "0 auto",
                        }}
                        onError={() => {
                          if (showFront) setImgErrorFront(true);
                          else setImgErrorBack(true);
                        }}
                      />
                      <div
                        style={{
                          marginTop: 5,
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          color: "#707780",
                          fontSize: 10.5,
                          fontWeight: 800,
                        }}
                      >
                        <span>{showFront ? "Front" : "Back"}</span>
                        <a
                          href={activeUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            marginLeft: "auto",
                            textDecoration: "underline",
                            fontWeight: 900,
                            color: "#16477d",
                          }}
                        >
                          Open image
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        border: "1px dashed #d8dde2",
                        borderRadius: 12,
                        padding: 12,
                        color: "#69717b",
                        background: "#fafbfc",
                        fontSize: 11.5,
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
                className="vcs-panel"
                style={{
                  padding: 0,
                  overflow: "hidden",
                  borderColor: "#cbe8d5",
                  background: "#fff",
                }}
              >
                <SectionHeading
                  eyebrow="Your Collection"
                  title="Your ownership"
                  copy="Your copies, grading mix, selling tools, and auction options."
                  accent="green"
                />

                <div style={{ padding: isMobile ? 10 : 14, display: "grid", gap: 9 }}>
                  <SummaryStrip
                    items={[
                      {
                        label: "Raw",
                        value: String(safeNum(myOwnership.rawQuantity)),
                      },
                      {
                        label: "Pending",
                        value: String(safeNum(myOwnership.pendingGradingQuantity)),
                        tone: "gold",
                      },
                      {
                        label: "Graded",
                        value: String(safeNum(myOwnership.gradedQuantity)),
                        tone: "blue",
                      },
                      {
                        label: "Value",
                        value: formatDollarsFromCents(safeNum(myOwnership.totalValueCents)),
                        tone: "green",
                      },
                    ]}
                  />

                  <GradeBreakdownTable
                    rows={myOwnershipBreakdown}
                    pendingQuantity={safeNum(myOwnership.pendingGradingQuantity)}
                  />

                  <SubmitForGradingButton
                    cardId={c.id}
                    rawQuantity={safeNum(myOwnership.rawQuantity)}
                    bookValue={c.bookValue}
                    player={c.player}
                    cardNumber={c.cardNumber}
                    onSubmitted={refreshAll}
                  />

                  <div
                    style={{
                      borderTop: "1px solid #edf0f2",
                      paddingTop: 9,
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <div style={{ color: "#126b3a", fontSize: 10.5, fontWeight: 1000, textTransform: "uppercase", letterSpacing: 0.6 }}>
                      Sell or auction
                    </div>

                    <RequestShopOfferButton cardId={c.id} />

                    {auctionableRows.length > 0 ? (
                      <div
                        style={{
                          border: "1px solid #edd79c",
                          borderRadius: 12,
                          background: "#fffdf7",
                          padding: 9,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                            alignItems: "baseline",
                          }}
                        >
                          <div style={{ color: "#7a5200", fontSize: 12, fontWeight: 1000 }}>
                            Auction House
                          </div>
                          <div style={{ color: "#8a733d", fontSize: 10, fontWeight: 800 }}>
                            24-hour auction
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: 7,
                            display: "grid",
                            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                            gap: 6,
                          }}
                        >
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
                  </div>
                </div>
              </section>
            ) : null}

            <section
              className="vcs-panel"
              style={{
                padding: 0,
                overflow: "hidden",
                borderColor: "#edd79c",
                background: "#fff",
              }}
            >
              <SectionHeading
                eyebrow="Population"
                title="Population report"
                copy="How many copies exist across VCS and how the revealed grades are distributed."
                accent="gold"
              />

              <div style={{ padding: isMobile ? 10 : 14, display: "grid", gap: 9 }}>
                <SummaryStrip
                  items={[
                    {
                      label: "Owners",
                      value: String(data.population.uniqueOwners),
                    },
                    {
                      label: "Owned",
                      value: String(data.population.totalOwned),
                      tone: "blue",
                    },
                    {
                      label: "Incl. pending",
                      value: String(
                        safeNum(
                          data.population.totalOwnedIncludingPending,
                          data.population.totalOwned
                        )
                      ),
                      tone: "gold",
                    },
                    {
                      label: "Value",
                      value: formatDollarsFromCents(safeNum(data.population.totalValueCents)),
                      tone: "green",
                    },
                  ]}
                />

                <div
                  style={{
                    border: "1px solid #e0e4e8",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(85px, 1.2fr) minmax(68px, 0.8fr) minmax(68px, 0.8fr)",
                      gap: 8,
                      padding: "7px 9px",
                      background: "#f7f9fc",
                      borderBottom: "1px solid #dfe5ec",
                      color: "#66707b",
                      fontSize: 10,
                      fontWeight: 1000,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    <div>Grade</div>
                    <div style={{ textAlign: "right" }}>Population</div>
                    <div style={{ textAlign: "right" }}>Share</div>
                  </div>

                  {data.population.gradeBreakdown.map((row, index) => (
                    <div
                      key={row.grade}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(85px, 1.2fr) minmax(68px, 0.8fr) minmax(68px, 0.8fr)",
                        gap: 8,
                        alignItems: "center",
                        padding: "7px 9px",
                        borderBottom:
                          index === data.population.gradeBreakdown.length - 1
                            ? "none"
                            : "1px solid #edf0f4",
                        background: index % 2 === 0 ? "#fff" : "#fcfdff",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11.5,
                          fontWeight: 1000,
                          color:
                            row.grade === 10
                              ? "#7a5200"
                              : row.grade === 0
                                ? "#333"
                                : "#16477d",
                        }}
                      >
                        {row.label}
                      </div>
                      <div style={{ textAlign: "right", fontSize: 11.5, fontWeight: 1000 }}>
                        {safeNum(row.quantity)}
                      </div>
                      <div style={{ textAlign: "right", color: "#5f6872", fontSize: 11.5, fontWeight: 900 }}>
                        {formatPopulationPercentage(safeNum(row.percentage))}
                      </div>
                    </div>
                  ))}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(85px, 1.2fr) minmax(68px, 0.8fr) minmax(68px, 0.8fr)",
                      gap: 8,
                      padding: "7px 9px",
                      borderTop: "1px solid #dfe5ec",
                      background: "#f7f9fc",
                      fontSize: 11.5,
                      fontWeight: 1000,
                    }}
                  >
                    <div>Total</div>
                    <div style={{ textAlign: "right" }}>{data.population.totalOwned}</div>
                    <div style={{ textAlign: "right" }}>
                      {data.population.totalOwned > 0 ? "100.0%" : "0.0%"}
                    </div>
                  </div>
                </div>

                <div style={{ color: "#707780", fontSize: 10.5, fontWeight: 750 }}>
                  Pending VCS cards are excluded from grade percentages until their grades are revealed.
                </div>
              </div>
            </section>

            <section
              className="vcs-panel"
              style={{
                padding: 0,
                overflow: "hidden",
                borderColor: "#dfe4ea",
                background: "#fff",
              }}
            >
              <SectionHeading
                eyebrow="Collectors"
                title="Owners"
                copy="Who owns this card and how their copies are distributed."
                accent="slate"
              />

              <div style={{ padding: isMobile ? 10 : 14 }}>
                {data.owners.length === 0 ? (
                  <div style={{ color: "#666", fontSize: 12, fontWeight: 850 }}>
                    No one owns this yet.
                  </div>
                ) : isMobile ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {data.owners.map((o, idx) => {
                      const ownerBreakdown = normalizeBreakdown(o);
                      const totalQty = safeNum(o.totalQuantity, o.quantity);

                      return (
                        <div
                          key={`${o.userId}-${idx}`}
                          style={{
                            border: "1px solid #e1e5e9",
                            borderRadius: 13,
                            background: idx % 2 === 0 ? "#fff" : "#fbfcfd",
                            padding: 9,
                            display: "grid",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                              alignItems: "flex-start",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  color: "#111",
                                  fontSize: 13.5,
                                  lineHeight: 1.1,
                                  fontWeight: 1000,
                                  overflowWrap: "anywhere",
                                }}
                              >
                                {o.name?.trim() ? o.name.trim() : o.email ?? o.userId}
                              </div>
                              <div
                                style={{
                                  marginTop: 2,
                                  color: "#707780",
                                  fontSize: 10.5,
                                  fontWeight: 750,
                                  overflowWrap: "anywhere",
                                }}
                              >
                                {o.email ?? "—"}
                              </div>
                            </div>

                            <div style={{ textAlign: "right", flex: "0 0 auto" }}>
                              <div style={{ color: "#45505d", fontSize: 10, fontWeight: 900 }}>
                                {totalQty} cards
                              </div>
                              <div style={{ marginTop: 2, color: "#126b3a", fontSize: 13, fontWeight: 1000 }}>
                                {formatDollarsFromCents(safeNum(o.totalValueCents))}
                              </div>
                            </div>
                          </div>

                          <SummaryStrip
                            items={[
                              {
                                label: "Raw",
                                value: String(safeNum(o.rawQuantity)),
                              },
                              {
                                label: "Pending",
                                value: String(safeNum(o.pendingGradingQuantity)),
                                tone: "gold",
                              },
                              {
                                label: "Graded",
                                value: String(safeNum(o.gradedQuantity)),
                                tone: "blue",
                              },
                              {
                                label: "Total",
                                value: String(totalQty),
                                tone: "green",
                              },
                            ]}
                          />

                          <GradeBreakdownTable
                            rows={ownerBreakdown}
                            pendingQuantity={safeNum(o.pendingGradingQuantity)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 13 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                      <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
                        <tr>
                          {["User", "Email", "Raw", "Pending", "Graded", "Total", "Breakdown", "Value"].map((h) => (
                            <th
                              key={h}
                              style={{
                                textAlign: "left",
                                padding: 8,
                                borderBottom: "1px solid #ddd",
                                whiteSpace: "nowrap",
                                fontSize: 11,
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
                            <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                              {o.name?.trim() ? o.name.trim() : o.email ?? o.userId}
                            </td>
                            <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{o.email ?? "—"}</td>
                            <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>{safeNum(o.rawQuantity)}</td>
                            <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                              {safeNum(o.pendingGradingQuantity)}
                            </td>
                            <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                              {safeNum(o.gradedQuantity)}
                            </td>
                            <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                              {safeNum(o.totalQuantity, o.quantity)}
                            </td>
                            <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                                {normalizeBreakdown(o).map((row) => (
                                  <GradePill key={row.grade} row={row} />
                                ))}
                                <PendingPill quantity={safeNum(o.pendingGradingQuantity)} />
                              </div>
                            </td>
                            <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                              {formatDollarsFromCents(safeNum(o.totalValueCents))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}