// src/app/analytics/finances/finances-client.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type RangeKey = "TODAY" | "7D" | "30D" | "90D" | "ALL";

type FinanceResponse = {
  ok: boolean;
  range: RangeKey;
  summary: {
    balanceCents: number;
    collectionValueCents: number;
    netWorthCents: number;
    totalIncomeCents: number;
    totalExpenseCents: number;
    netCashflowCents: number;
    roiPct: number | null;
    startingNetWorthCents: number;
    endingNetWorthCents: number;
    netWorthChangeCents: number;
    netWorthChangePct: number | null;
  };
  dailyCashflow: {
    dateKey: string;
    incomeCents: number;
    expenseCents: number;
    netCents: number;
  }[];
  snapshots: {
    dateKey: string;
    balanceCents: number;
    collectionValueCents: number;
    netWorthCents: number;
  }[];
  incomeCategories: {
    category: string;
    label: string;
    incomeCents: number;
    expenseCents: number;
    netCents: number;
  }[];
  expenseCategories: {
    category: string;
    label: string;
    incomeCents: number;
    expenseCents: number;
    netCents: number;
  }[];
  recentTransactions: {
    id: number;
    category: string;
    direction: string;
    amountCents: number;
    description: string | null;
    balanceAfterCents: number | null;
    createdAt: string;
  }[];
};

const colors = {
  text: "#111827",
  muted: "#6b7280",
  border: "#e7ddcf",
  dark: "#08111f",
  green: "#15803d",
  greenSoft: "#ecfdf3",
  red: "#b91c1c",
  redSoft: "#fff1f2",
  blue: "#16477d",
  blueSoft: "#eef5fb",
  gold: "#9a6700",
  goldSoft: "#fff8e8",
};

function dollars(cents: number) {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function compactDollars(cents: number) {
  const abs = Math.abs(cents / 100);
  const sign = cents < 0 ? "-" : "";

  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;

  return `${sign}$${abs.toFixed(0)}`;
}

function signedDollars(cents: number) {
  const prefix = cents > 0 ? "+" : "";
  return `${prefix}${dollars(cents)}`;
}

function shortDate(dateKey: string) {
  const [, month, day] = dateKey.split("-");
  return `${month}/${day}`;
}

function rangeLabel(range: RangeKey) {
  return range === "TODAY" ? "Today" : range;
}

function pctLabel(pct: number | null) {
  if (pct == null) return "—";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function FinancesClient() {
  const [range, setRange] = useState<RangeKey>("TODAY");
  const [data, setData] = useState<FinanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load(nextRange = range) {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`/api/analytics/finances?range=${nextRange}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Failed to load finances");
      }

      setData(json);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load finances");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const maxCashflow = useMemo(() => {
    const values = data?.dailyCashflow.map((d) => Math.abs(d.netCents)) ?? [];
    return Math.max(1, ...values);
  }, [data]);

  const netWorthTrend = useMemo(() => {
    const snapshots = data?.snapshots ?? [];
    const values = snapshots.map((s) => s.netWorthCents);

    if (values.length === 0) {
      return { min: 0, max: 1, paddedMin: 0, paddedMax: 1 };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const rawRange = Math.max(1, max - min);
    const minimumVisualRange = Math.max(
      5000,
      Math.round((data?.summary.netWorthCents ?? max) * 0.015)
    );
    const visualRange = Math.max(rawRange, minimumVisualRange);
    const center = (min + max) / 2;
    const paddedMin = Math.max(0, Math.round(center - visualRange / 2));
    const paddedMax = Math.round(center + visualRange / 2);

    return { min, max, paddedMin, paddedMax };
  }, [data]);

  return (
    <main className="financePage">
      <style>{`
        .financePage {
          min-height: calc(100vh - 80px);
          padding: 12px clamp(10px, 3vw, 22px) 28px;
          color: ${colors.text};
          background:
            radial-gradient(circle at top left, rgba(22,71,125,0.11), transparent 28%),
            radial-gradient(circle at 82% 18%, rgba(183,121,31,0.10), transparent 24%),
            #f6f1e8;
        }

        .financeShell {
          max-width: 1240px;
          margin: 0 auto;
        }

        .financeHeader {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 12px;
          flex-wrap: wrap;
        }

        .financeTitle {
          margin: 7px 0 3px;
          font-size: clamp(30px, 7vw, 42px);
          line-height: 1;
          letter-spacing: -0.045em;
          font-weight: 1000;
        }

        .financeSubtitle {
          color: ${colors.muted};
          font-size: 12.5px;
          line-height: 1.4;
          font-weight: 750;
          max-width: 720px;
        }

        .financeRange {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          border: 1px solid ${colors.border};
          border-radius: 13px;
          overflow: hidden;
          background: rgba(255,255,255,.82);
        }

        .financeRange button {
          min-height: 36px;
          border: 0;
          border-left: 1px solid ${colors.border};
          background: transparent;
          color: ${colors.text};
          padding: 7px 10px;
          font-size: 11.5px;
          font-weight: 950;
          cursor: pointer;
        }

        .financeRange button:first-child {
          border-left: 0;
        }

        .financeRange button[data-active="true"] {
          background: ${colors.dark};
          color: #fff;
        }

        .financeSummary {
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1.45fr 1fr 1fr 1fr;
          border: 1px solid ${colors.border};
          border-radius: 16px;
          overflow: hidden;
          background: rgba(255,255,255,.91);
          box-shadow: 0 8px 24px rgba(0,0,0,.035);
        }

        .financeSummaryCell {
          min-width: 0;
          padding: 11px 12px;
          border-left: 1px solid ${colors.border};
        }

        .financeSummaryCell:first-child {
          border-left: 0;
        }

        .financeEyebrow {
          color: ${colors.muted};
          font-size: 9.5px;
          font-weight: 950;
          letter-spacing: .04em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .financeSummaryValue {
          margin-top: 3px;
          font-size: 20px;
          line-height: 1.05;
          font-weight: 1000;
          letter-spacing: -.035em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .financeSummarySub {
          margin-top: 3px;
          color: ${colors.muted};
          font-size: 10px;
          line-height: 1.2;
          font-weight: 800;
        }

        .financeSection {
          margin-top: 12px;
          border: 1px solid ${colors.border};
          border-radius: 17px;
          background: rgba(255,255,255,.92);
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0,0,0,.04);
        }

        .financeSectionHeader {
          padding: 11px 13px 9px;
          border-bottom: 1px solid ${colors.border};
        }

        .financeSectionHeader.blue {
          background: linear-gradient(90deg, ${colors.blueSoft}, rgba(255,255,255,.94));
          border-bottom-color: #d7e4f1;
        }

        .financeSectionHeader.green {
          background: linear-gradient(90deg, ${colors.greenSoft}, rgba(255,255,255,.94));
          border-bottom-color: #d4edda;
        }

        .financeSectionHeader.gold {
          background: linear-gradient(90deg, ${colors.goldSoft}, rgba(255,255,255,.94));
          border-bottom-color: #eedca6;
        }

        .financeSectionTitle {
          margin: 0;
          font-size: 17px;
          line-height: 1.1;
          font-weight: 1000;
        }

        .financeSectionSub {
          margin-top: 3px;
          color: ${colors.muted};
          font-size: 10.5px;
          line-height: 1.3;
          font-weight: 750;
        }

        .financeSectionBody {
          padding: 11px 12px 12px;
        }

        .financeTrendMetrics {
          margin-top: 8px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border: 1px solid ${colors.border};
          border-radius: 12px;
          overflow: hidden;
        }

        .financeTrendMetric {
          min-width: 0;
          padding: 7px 8px;
          border-left: 1px solid ${colors.border};
        }

        .financeTrendMetric:first-child {
          border-left: 0;
        }

        .financeTrendMetricValue {
          margin-top: 2px;
          font-size: 12px;
          line-height: 1.1;
          font-weight: 1000;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .financeScore {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border: 1px solid ${colors.border};
          border-radius: 12px;
          overflow: hidden;
        }

        .financeScoreCell {
          min-width: 0;
          padding: 8px 9px;
          border-left: 1px solid ${colors.border};
          background: #fff;
        }

        .financeScoreCell:first-child {
          border-left: 0;
        }

        .financeScoreValue {
          margin-top: 2px;
          font-size: 13px;
          font-weight: 1000;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .financeTwoCol {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          align-items: start;
        }

        .financeTransactions {
          display: grid;
          gap: 6px;
        }

        @media (max-width: 760px) {
          .financePage {
            padding: 10px 8px 22px;
          }

          .financeHeader {
            display: grid;
            gap: 8px;
          }

          .financeTitle {
            font-size: 30px;
          }

          .financeSubtitle {
            font-size: 11.5px;
          }

          .financeRange {
            width: 100%;
          }

          .financeRange button {
            padding: 6px 4px;
            min-height: 34px;
            font-size: 10.5px;
          }

          .financeSummary {
            grid-template-columns: 1.35fr .9fr .95fr 1fr;
            margin-top: 9px;
          }

          .financeSummaryCell {
            padding: 8px 7px;
          }

          .financeSummaryValue {
            font-size: 13px;
          }

          .financeSummaryCell:first-child .financeSummaryValue {
            font-size: 15px;
          }

          .financeSummarySub {
            display: none;
          }

          .financeEyebrow {
            font-size: 8px;
          }

          .financeSection {
            margin-top: 9px;
            border-radius: 14px;
          }

          .financeSectionHeader {
            padding: 9px 10px 8px;
          }

          .financeSectionTitle {
            font-size: 15px;
          }

          .financeSectionSub {
            font-size: 9.5px;
          }

          .financeSectionBody {
            padding: 9px 9px 10px;
          }

          .financeTrendMetrics {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }

          .financeTrendMetric {
            padding: 6px 5px;
          }

          .financeTrendMetricValue {
            font-size: 10.5px;
          }

          .financeScore {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .financeScoreCell:nth-child(3) {
            border-left: 0;
            border-top: 1px solid ${colors.border};
          }

          .financeScoreCell:nth-child(4) {
            border-top: 1px solid ${colors.border};
          }

          .financeScoreValue {
            font-size: 12px;
          }

          .financeTwoCol {
            grid-template-columns: 1fr;
            gap: 9px;
            margin-top: 9px;
          }
        }
      `}</style>

      <div className="financeShell">
        <header className="financeHeader">
          <div>
            <Link href="/analytics" className="vcs-back-link">
              ← Analytics
            </Link>
            <h1 className="financeTitle">My Finances</h1>
            <div className="financeSubtitle">
              Net worth, cash flow, spending, and activity in one portfolio view.
            </div>
          </div>

          <RangePicker range={range} setRange={setRange} />
        </header>

        {err ? (
          <div
            style={{
              marginTop: 10,
              background: colors.redSoft,
              color: colors.red,
              border: "1px solid #fecaca",
              borderRadius: 12,
              padding: 10,
              fontWeight: 900,
              fontSize: 12,
            }}
          >
            {err}
          </div>
        ) : null}

        {loading ? (
          <div style={{ marginTop: 14, fontWeight: 900, color: colors.muted }}>
            Loading financial dashboard…
          </div>
        ) : data ? (
          <>
            <section className="financeSummary">
              <SummaryCell
                label="Net Worth"
                value={dollars(data.summary.netWorthCents)}
                sub="Bank + collection"
              />
              <SummaryCell
                label="Bank"
                value={dollars(data.summary.balanceCents)}
                sub="Available cash"
              />
              <SummaryCell
                label="Collection"
                value={dollars(data.summary.collectionValueCents)}
                sub="Raw + slabs"
              />
              <SummaryCell
                label={`${rangeLabel(range)} Change`}
                value={signedDollars(data.summary.netWorthChangeCents)}
                sub={pctLabel(data.summary.netWorthChangePct)}
                tone={data.summary.netWorthChangeCents >= 0 ? "green" : "red"}
              />
            </section>

            <FinanceSection
              tone="blue"
              title="Net Worth Trend"
              subtitle="Portfolio value across the selected range."
            >
              <NetWorthChart
                points={data.snapshots.map((s) => ({
                  label: shortDate(s.dateKey),
                  dateKey: s.dateKey,
                  value: s.netWorthCents,
                }))}
                min={netWorthTrend.paddedMin}
                max={netWorthTrend.paddedMax}
              />

              <div className="financeTrendMetrics">
                <TrendMetric label="Start" value={dollars(data.summary.startingNetWorthCents)} />
                <TrendMetric label="End" value={dollars(data.summary.endingNetWorthCents)} />
                <TrendMetric
                  label="Change"
                  value={signedDollars(data.summary.netWorthChangeCents)}
                  tone={data.summary.netWorthChangeCents >= 0 ? "green" : "red"}
                />
                <TrendMetric
                  label="Move"
                  value={pctLabel(data.summary.netWorthChangePct)}
                  tone={data.summary.netWorthChangeCents >= 0 ? "green" : "red"}
                />
              </div>
            </FinanceSection>

            <FinanceSection
              tone="green"
              title={`${rangeLabel(range)} Cash Flow`}
              subtitle="Cash profitability for the selected range."
            >
              <div className="financeScore">
                <ScoreCell
                  label="Income"
                  value={dollars(data.summary.totalIncomeCents)}
                  tone="green"
                />
                <ScoreCell
                  label="Expenses"
                  value={dollars(data.summary.totalExpenseCents)}
                  tone="red"
                />
                <ScoreCell
                  label="Net"
                  value={signedDollars(data.summary.netCashflowCents)}
                  tone={data.summary.netCashflowCents >= 0 ? "green" : "red"}
                />
                <ScoreCell
                  label="Cash ROI"
                  value={data.summary.roiPct == null ? "—" : `${data.summary.roiPct}%`}
                  tone={(data.summary.roiPct ?? 0) >= 0 ? "green" : "red"}
                />
              </div>
            </FinanceSection>

            <div className="financeTwoCol">
              <FinanceSection
                tone="gold"
                title="Daily Cash Flow"
                subtitle="Green days add cash; red days deploy it."
                flush
              >
                <CashflowBars days={data.dailyCashflow} max={maxCashflow} />
              </FinanceSection>

              <FinanceSection
                tone="gold"
                title="Income & Spending"
                subtitle="Where money is coming from and going."
                flush
              >
                <div style={{ display: "grid", gap: 13 }}>
                  <CategoryList
                    title="Income Sources"
                    items={data.incomeCategories}
                    mode="income"
                  />
                  <CategoryList
                    title="Spending Sources"
                    items={data.expenseCategories}
                    mode="expense"
                  />
                </div>
              </FinanceSection>
            </div>

            <FinanceSection
              tone="blue"
              title="Recent Financial Activity"
              subtitle="Logged money movement from this feature launch forward."
            >
              <div className="financeTransactions">
                {data.recentTransactions.length === 0 ? (
                  <div
                    style={{
                      color: colors.muted,
                      fontWeight: 850,
                      padding: 10,
                      background: "#faf7f0",
                      border: `1px solid ${colors.border}`,
                      borderRadius: 11,
                      fontSize: 12,
                    }}
                  >
                    No financial activity logged yet.
                  </div>
                ) : (
                  data.recentTransactions.map((txn) => (
                    <TransactionRow key={txn.id} txn={txn} />
                  ))
                )}
              </div>
            </FinanceSection>
          </>
        ) : null}
      </div>
    </main>
  );
}

function RangePicker({
  range,
  setRange,
}: {
  range: RangeKey;
  setRange: (range: RangeKey) => void;
}) {
  return (
    <div className="financeRange">
      {(["TODAY", "7D", "30D", "90D", "ALL"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setRange(option)}
          data-active={range === option}
        >
          {rangeLabel(option)}
        </button>
      ))}
    </div>
  );
}

function SummaryCell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="financeSummaryCell">
      <div className="financeEyebrow">{label}</div>
      <div
        className="financeSummaryValue"
        style={{
          color: tone === "green" ? colors.green : tone === "red" ? colors.red : colors.text,
        }}
      >
        {value}
      </div>
      <div className="financeSummarySub">{sub}</div>
    </div>
  );
}

function FinanceSection({
  title,
  subtitle,
  tone,
  children,
  flush = false,
}: {
  title: string;
  subtitle?: string;
  tone: "blue" | "green" | "gold";
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="financeSection" style={flush ? { marginTop: 0 } : undefined}>
      <div className={`financeSectionHeader ${tone}`}>
        <h2 className="financeSectionTitle">{title}</h2>
        {subtitle ? <div className="financeSectionSub">{subtitle}</div> : null}
      </div>
      <div className="financeSectionBody">{children}</div>
    </section>
  );
}

function TrendMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="financeTrendMetric">
      <div className="financeEyebrow">{label}</div>
      <div
        className="financeTrendMetricValue"
        style={{
          color: tone === "green" ? colors.green : tone === "red" ? colors.red : colors.text,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ScoreCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "red";
}) {
  return (
    <div
      className="financeScoreCell"
      style={{ background: tone === "green" ? colors.greenSoft : colors.redSoft }}
    >
      <div
        className="financeEyebrow"
        style={{ color: tone === "green" ? colors.green : colors.red }}
      >
        {label}
      </div>
      <div
        className="financeScoreValue"
        style={{ color: tone === "green" ? colors.green : colors.red }}
      >
        {value}
      </div>
    </div>
  );
}

function NetWorthChart({
  points,
  min,
  max,
}: {
  points: { label: string; dateKey: string; value: number }[];
  min: number;
  max: number;
}) {
  const width = 760;
  const height = 250;
  const leftPad = 70;
  const rightPad = 16;
  const topPad = 18;
  const bottomPad = 34;
  const range = Math.max(1, max - min);
  const zeroY = height - bottomPad;

  const coords = points.map((point, index) => {
    const x =
      points.length <= 1
        ? leftPad + (width - leftPad - rightPad) / 2
        : leftPad + (index / (points.length - 1)) * (width - leftPad - rightPad);

    const y =
      height -
      bottomPad -
      ((point.value - min) / range) * (height - topPad - bottomPad);

    return { ...point, x, y: clamp(y, topPad, height - bottomPad) };
  });

  const path =
    coords.length === 0
      ? ""
      : coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  const areaPath =
    coords.length === 0
      ? ""
      : `${path} L ${coords[coords.length - 1].x} ${zeroY} L ${coords[0].x} ${zeroY} Z`;

  const ticks = [max, Math.round((max + min) / 2), min];

  return (
    <div style={{ width: "100%", overflow: "hidden" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <defs>
          <linearGradient id="netWorthLine" x1="0" x2="1">
            <stop offset="0%" stopColor="#16477d" />
            <stop offset="100%" stopColor="#b7791f" />
          </linearGradient>
          <linearGradient id="netWorthArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#16477d" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#16477d" stopOpacity="0" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={width} height={height} rx="16" fill="#fbf9f5" />

        {ticks.map((tick, index) => {
          const y =
            height -
            bottomPad -
            ((tick - min) / range) * (height - topPad - bottomPad);

          return (
            <g key={`${tick}-${index}`}>
              <line
                x1={leftPad}
                x2={width - rightPad}
                y1={y}
                y2={y}
                stroke="#eadfce"
                strokeDasharray={index === 1 ? "4 5" : "none"}
              />
              <text
                x={leftPad - 9}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fontWeight="900"
                fill="#6b7280"
              >
                {compactDollars(tick)}
              </text>
            </g>
          );
        })}

        {areaPath ? <path d={areaPath} fill="url(#netWorthArea)" /> : null}

        {path ? (
          <path
            d={path}
            fill="none"
            stroke="url(#netWorthLine)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {coords.map((point, index) => {
          const showLabel =
            index === 0 ||
            index === coords.length - 1 ||
            index % Math.max(1, Math.ceil(coords.length / 5)) === 0;

          return (
            <g key={`${point.dateKey}-${index}`}>
              <circle cx={point.x} cy={point.y} r="4.5" fill="#08111f" />
              <circle cx={point.x} cy={point.y} r="9" fill="#08111f" opacity="0.07" />
              {showLabel ? (
                <text
                  x={point.x}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="850"
                  fill="#6b7280"
                >
                  {point.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {coords.length === 1 ? (
          <text
            x={width / 2}
            y={height / 2 + 40}
            textAnchor="middle"
            fontSize="11"
            fontWeight="850"
            fill="#6b7280"
          >
            More snapshots will build the trend over time.
          </text>
        ) : null}
      </svg>
    </div>
  );
}

function CashflowBars({
  days,
  max,
}: {
  days: FinanceResponse["dailyCashflow"];
  max: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "end",
        gap: 6,
        minHeight: 170,
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        paddingBottom: 6,
      }}
    >
      {days.map((day) => {
        const isPositive = day.netCents >= 0;
        const height = Math.max(6, Math.round((Math.abs(day.netCents) / max) * 125));

        return (
          <div
            key={day.dateKey}
            style={{ minWidth: 27, display: "grid", justifyItems: "center", gap: 5 }}
          >
            <div
              title={`${day.dateKey}: ${signedDollars(day.netCents)}`}
              style={{
                width: 16,
                height,
                borderRadius: 999,
                background: isPositive ? colors.green : colors.red,
                opacity: day.netCents === 0 ? 0.22 : 0.9,
              }}
            />
            <div
              style={{
                color: colors.muted,
                fontSize: 9,
                fontWeight: 850,
                transform: "rotate(-35deg)",
              }}
            >
              {shortDate(day.dateKey)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CategoryList({
  title,
  items,
  mode,
}: {
  title: string;
  items: FinanceResponse["incomeCategories"];
  mode: "income" | "expense";
}) {
  const max = Math.max(
    1,
    ...items.map((item) => (mode === "income" ? item.incomeCents : item.expenseCents))
  );

  return (
    <div>
      <div style={{ fontWeight: 1000, marginBottom: 7, fontSize: 13 }}>{title}</div>

      {items.length === 0 ? (
        <div style={{ color: colors.muted, fontWeight: 800, fontSize: 11.5 }}>
          No activity yet.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 7 }}>
          {items.map((item) => {
            const value = mode === "income" ? item.incomeCents : item.expenseCents;
            const pct = Math.max(4, Math.round((value / max) * 100));

            return (
              <div key={item.category}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    fontSize: 11.5,
                    fontWeight: 900,
                  }}
                >
                  <span>{item.label}</span>
                  <span style={{ color: mode === "income" ? colors.green : colors.red }}>
                    {dollars(value)}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 4,
                    height: 7,
                    borderRadius: 999,
                    background: "#efe7db",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: mode === "income" ? colors.green : colors.red,
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TransactionRow({
  txn,
}: {
  txn: FinanceResponse["recentTransactions"][number];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 8,
        alignItems: "center",
        padding: "8px 9px",
        border: `1px solid ${colors.border}`,
        borderRadius: 11,
        background: "#fffdf9",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 950,
            fontSize: 12,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {txn.description ?? txn.category}
        </div>

        <div
          style={{
            marginTop: 2,
            color: colors.muted,
            fontSize: 9.5,
            fontWeight: 800,
            lineHeight: 1.25,
          }}
        >
          {new Date(txn.createdAt).toLocaleString()} · {txn.category.replaceAll("_", " ")}
        </div>
      </div>

      <div
        style={{
          fontWeight: 1000,
          color: txn.amountCents >= 0 ? colors.green : colors.red,
          whiteSpace: "nowrap",
          fontSize: 12,
        }}
      >
        {signedDollars(txn.amountCents)}
      </div>
    </div>
  );
}
