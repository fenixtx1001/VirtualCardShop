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
  page: "#f6f1e8",
  text: "#111827",
  muted: "#6b7280",
  border: "#e7ddcf",
  dark: "#08111f",
  green: "#15803d",
  greenSoft: "#dcfce7",
  red: "#b91c1c",
  redSoft: "#fee2e2",
  blue: "#16477d",
  gold: "#b7791f",
  goldSoft: "#fef3c7",
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

function signedCompactDollars(cents: number) {
  const prefix = cents > 0 ? "+" : "";
  return `${prefix}${compactDollars(cents)}`;
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
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load finances");
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
      return {
        min: 0,
        max: 1,
        paddedMin: 0,
        paddedMax: 1,
      };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const rawRange = Math.max(1, max - min);
    const minimumVisualRange = Math.max(5000, Math.round((data?.summary.netWorthCents ?? max) * 0.015));
    const visualRange = Math.max(rawRange, minimumVisualRange);
    const center = (min + max) / 2;
    const paddedMin = Math.max(0, Math.round(center - visualRange / 2));
    const paddedMax = Math.round(center + visualRange / 2);

    return {
      min,
      max,
      paddedMin,
      paddedMax,
    };
  }, [data]);

  return (
    <main
      style={{
        minHeight: "calc(100vh - 80px)",
        background:
          "radial-gradient(circle at top left, rgba(22,71,125,0.16), transparent 32%), radial-gradient(circle at 80% 20%, rgba(183,121,31,0.16), transparent 28%), #f6f1e8",
        color: colors.text,
        fontFamily: "system-ui",
        padding: "14px clamp(12px, 3vw, 22px)",
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <header
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: 14,
            alignItems: "start",
          }}
        >
          <div>
            <Link href="/analytics" style={{ color: colors.blue, fontWeight: 900, fontSize: 13 }}>
              ← Analytics
            </Link>
            <h1
              style={{
                margin: "8px 0 4px",
                fontSize: "clamp(30px, 7vw, 44px)",
                letterSpacing: "-0.05em",
                fontWeight: 1000,
              }}
            >
              My Finances
            </h1>
            <div style={{ color: colors.muted, fontWeight: 750, lineHeight: 1.45, maxWidth: 760 }}>
              Track your card business like a portfolio: net worth, cashflow, spending, rewards, and recent financial activity.
            </div>
          </div>

          <RangePicker range={range} setRange={setRange} />
        </header>

        {err ? (
          <div
            style={{
              marginTop: 16,
              background: colors.redSoft,
              color: colors.red,
              border: "1px solid #fecaca",
              borderRadius: 14,
              padding: 12,
              fontWeight: 900,
            }}
          >
            {err}
          </div>
        ) : null}

        {loading ? (
          <div style={{ marginTop: 18, fontWeight: 900, color: colors.muted }}>
            Loading financial dashboard…
          </div>
        ) : data ? (
          <>
            <section
              style={{
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
                gap: 12,
              }}
            >
              <HeroCard
                title="Net Worth"
                value={dollars(data.summary.netWorthCents)}
                subtitle="Bank + collection value"
                dark
              />
              <HeroCard
                title={`${rangeLabel(range)} Net Worth Change`}
                value={signedDollars(data.summary.netWorthChangeCents)}
                subtitle={`${pctLabel(data.summary.netWorthChangePct)} • ${dollars(
                  data.summary.startingNetWorthCents
                )} → ${dollars(data.summary.endingNetWorthCents)}`}
                positive={data.summary.netWorthChangeCents >= 0}
                accent
              />
              <HeroCard
                title="Bank Balance"
                value={dollars(data.summary.balanceCents)}
                subtitle="Cash available"
              />
              <HeroCard
                title="Collection Value"
                value={dollars(data.summary.collectionValueCents)}
                subtitle="Raw + grading + slabs"
              />
              <HeroCard
                title={`${rangeLabel(range)} Net Cashflow`}
                value={signedDollars(data.summary.netCashflowCents)}
                subtitle={`Income ${dollars(data.summary.totalIncomeCents)} • Expenses ${dollars(
                  data.summary.totalExpenseCents
                )}`}
                positive={data.summary.netCashflowCents >= 0}
              />
            </section>

            <section
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.35fr) minmax(min(100%, 320px), 0.65fr)",
                gap: 14,
                alignItems: "stretch",
              }}
            >
              <Panel
                title="Net Worth Trend"
                subtitle="Scaled to the selected range so small changes are visible."
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

                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
                    gap: 8,
                  }}
                >
                  <MiniMetric label="Start" value={dollars(data.summary.startingNetWorthCents)} />
                  <MiniMetric label="End" value={dollars(data.summary.endingNetWorthCents)} />
                  <MiniMetric
                    label="Change"
                    value={signedDollars(data.summary.netWorthChangeCents)}
                    tone={data.summary.netWorthChangeCents >= 0 ? "green" : "red"}
                  />
                  <MiniMetric
                    label="Move"
                    value={pctLabel(data.summary.netWorthChangePct)}
                    tone={data.summary.netWorthChangeCents >= 0 ? "green" : "red"}
                  />
                </div>
              </Panel>

              <Panel title="Business Scorecard" subtitle="Cash profitability for selected range.">
                <div style={{ display: "grid", gap: 10 }}>
                  <ScoreRow label="Income" value={dollars(data.summary.totalIncomeCents)} tone="green" />
                  <ScoreRow label="Expenses" value={dollars(data.summary.totalExpenseCents)} tone="red" />
                  <ScoreRow
                    label="Net Cashflow"
                    value={signedDollars(data.summary.netCashflowCents)}
                    tone={data.summary.netCashflowCents >= 0 ? "green" : "red"}
                  />
                  <ScoreRow
                    label="Cash ROI"
                    value={data.summary.roiPct == null ? "—" : `${data.summary.roiPct}%`}
                    tone={(data.summary.roiPct ?? 0) >= 0 ? "green" : "red"}
                  />
                </div>
              </Panel>
            </section>

            <section
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
                gap: 14,
              }}
            >
              <Panel title="Daily Cashflow" subtitle="Green days build the bankroll. Red days are investment days.">
                <CashflowBars days={data.dailyCashflow} max={maxCashflow} />
              </Panel>

              <Panel title="Income vs. Spending" subtitle="Where your money is coming from and going.">
                <div style={{ display: "grid", gap: 14 }}>
                  <CategoryList title="Income Sources" items={data.incomeCategories} mode="income" />
                  <CategoryList title="Spending Sources" items={data.expenseCategories} mode="expense" />
                </div>
              </Panel>
            </section>

            <Panel
              title="Recent Financial Activity"
              subtitle="Every logged money movement from this feature launch forward."
              style={{ marginTop: 14 }}
            >
              <div style={{ display: "grid", gap: 8 }}>
                {data.recentTransactions.length === 0 ? (
                  <div
                    style={{
                      color: colors.muted,
                      fontWeight: 850,
                      padding: 12,
                      background: "#faf7f0",
                      border: `1px solid ${colors.border}`,
                      borderRadius: 14,
                    }}
                  >
                    No financial activity logged yet. Buy packs, grade cards, sell cards, or claim rewards to start building your finance history.
                  </div>
                ) : (
                  data.recentTransactions.map((txn) => (
                    <TransactionRow key={txn.id} txn={txn} />
                  ))
                )}
              </div>
            </Panel>
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
    <div
      style={{
        display: "flex",
        gap: 7,
        background: "rgba(255,255,255,0.74)",
        border: `1px solid ${colors.border}`,
        borderRadius: 999,
        padding: 5,
        boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
        overflowX: "auto",
        maxWidth: "100%",
        width: "fit-content",
      }}
    >
      {(["TODAY", "7D", "30D", "90D", "ALL"] as const).map((r) => (
        <button
          key={r}
          onClick={() => setRange(r)}
          style={{
            border: "none",
            borderRadius: 999,
            padding: "9px 12px",
            background: range === r ? colors.dark : "transparent",
            color: range === r ? "#fff" : colors.text,
            fontWeight: 950,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {rangeLabel(r)}
        </button>
      ))}
    </div>
  );
}

function HeroCard({
  title,
  value,
  subtitle,
  dark = false,
  positive,
  accent = false,
}: {
  title: string;
  value: string;
  subtitle: string;
  dark?: boolean;
  positive?: boolean;
  accent?: boolean;
}) {
  const valueColor =
    positive == null ? undefined : positive ? colors.green : colors.red;

  return (
    <div
      style={{
        background: dark
          ? "linear-gradient(135deg, #08111f, #172033)"
          : accent
            ? "linear-gradient(135deg, rgba(255,255,255,0.93), #fff7df)"
            : "rgba(255,255,255,0.88)",
        color: dark ? "#fff" : colors.text,
        border: dark ? "1px solid rgba(255,255,255,0.14)" : `1px solid ${colors.border}`,
        borderRadius: 22,
        padding: 18,
        boxShadow: dark ? "0 24px 70px rgba(8,17,31,0.28)" : "0 16px 45px rgba(0,0,0,0.07)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: dark ? "rgba(255,255,255,0.68)" : colors.muted,
          fontSize: 12,
          fontWeight: 950,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: "clamp(24px, 6vw, 32px)",
          letterSpacing: "-0.04em",
          fontWeight: 1000,
          color: valueColor,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 6,
          color: dark ? "rgba(255,255,255,0.68)" : colors.muted,
          fontSize: 12,
          lineHeight: 1.35,
          fontWeight: 800,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  style,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section
      style={{
        background: "rgba(255,255,255,0.89)",
        border: `1px solid ${colors.border}`,
        borderRadius: 22,
        padding: "clamp(13px, 3vw, 17px)",
        boxShadow: "0 16px 45px rgba(0,0,0,0.06)",
        minWidth: 0,
        ...style,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 1000 }}>{title}</h2>
          {subtitle ? (
            <div style={{ marginTop: 4, color: colors.muted, fontSize: 12, fontWeight: 750, lineHeight: 1.4 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  );
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        background: "#fffdf8",
        borderRadius: 16,
        padding: 11,
        minWidth: 0,
      }}
    >
      <div style={{ color: colors.muted, fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 5,
          fontSize: 15,
          fontWeight: 1000,
          color: tone === "green" ? colors.green : tone === "red" ? colors.red : colors.text,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ScoreRow({ label, value, tone }: { label: string; value: string; tone: "green" | "red" }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: 12,
        borderRadius: 16,
        background: tone === "green" ? colors.greenSoft : colors.redSoft,
        color: tone === "green" ? colors.green : colors.red,
        fontWeight: 950,
      }}
    >
      <span>{label}</span>
      <span style={{ textAlign: "right" }}>{value}</span>
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
  const height = 285;
  const leftPad = 78;
  const rightPad = 18;
  const topPad = 22;
  const bottomPad = 38;
  const range = Math.max(1, max - min);
  const zeroY = height - bottomPad;

  const coords = points.map((p, i) => {
    const x =
      points.length <= 1
        ? leftPad + (width - leftPad - rightPad) / 2
        : leftPad + (i / (points.length - 1)) * (width - leftPad - rightPad);

    const y =
      height -
      bottomPad -
      ((p.value - min) / range) * (height - topPad - bottomPad);

    return { ...p, x, y: clamp(y, topPad, height - bottomPad) };
  });

  const path =
    coords.length === 0
      ? ""
      : coords.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const areaPath =
    coords.length === 0
      ? ""
      : `${path} L ${coords[coords.length - 1].x} ${zeroY} L ${coords[0].x} ${zeroY} Z`;

  const ticks = [max, Math.round((max + min) / 2), min];

  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", minWidth: 560, height: 300, display: "block" }}
      >
        <defs>
          <linearGradient id="netWorthLine" x1="0" x2="1">
            <stop offset="0%" stopColor="#16477d" />
            <stop offset="100%" stopColor="#b7791f" />
          </linearGradient>
          <linearGradient id="netWorthArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#16477d" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#16477d" stopOpacity="0" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={width} height={height} rx="20" fill="#fbf7ef" />

        {ticks.map((tick, i) => {
          const y =
            height -
            bottomPad -
            ((tick - min) / range) * (height - topPad - bottomPad);

          return (
            <g key={`${tick}-${i}`}>
              <line
                x1={leftPad}
                x2={width - rightPad}
                y1={y}
                y2={y}
                stroke="#eadfce"
                strokeDasharray={i === 1 ? "4 5" : "none"}
              />
              <text
                x={leftPad - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
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

        {coords.map((p, i) => {
          const showLabel =
            i === 0 || i === coords.length - 1 || i % Math.max(1, Math.ceil(coords.length / 5)) === 0;

          return (
            <g key={`${p.dateKey}-${i}`}>
              <circle cx={p.x} cy={p.y} r="5" fill="#08111f" />
              <circle cx={p.x} cy={p.y} r="10" fill="#08111f" opacity="0.08" />
              {showLabel ? (
                <text
                  x={p.x}
                  y={height - 12}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="850"
                  fill="#6b7280"
                >
                  {p.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {coords.length === 1 ? (
          <text
            x={width / 2}
            y={height / 2 + 44}
            textAnchor="middle"
            fontSize="12"
            fontWeight="850"
            fill="#6b7280"
          >
            More daily snapshots will build the trend over time.
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
        gap: 7,
        minHeight: 220,
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        paddingBottom: 8,
      }}
    >
      {days.map((day) => {
        const isPositive = day.netCents >= 0;
        const height = Math.max(7, Math.round((Math.abs(day.netCents) / max) * 170));

        return (
          <div key={day.dateKey} style={{ minWidth: 30, display: "grid", justifyItems: "center", gap: 6 }}>
            <div
              title={`${day.dateKey}: ${signedDollars(day.netCents)}`}
              style={{
                width: 19,
                height,
                borderRadius: 999,
                background: isPositive ? colors.green : colors.red,
                opacity: day.netCents === 0 ? 0.25 : 0.92,
                boxShadow: day.netCents === 0 ? "none" : "0 8px 18px rgba(0,0,0,0.12)",
              }}
            />
            <div style={{ color: colors.muted, fontSize: 10, fontWeight: 850, transform: "rotate(-35deg)" }}>
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
      <div style={{ fontWeight: 1000, marginBottom: 8 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ color: colors.muted, fontWeight: 800, fontSize: 13 }}>No activity yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 9 }}>
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
                    fontSize: 13,
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
                    marginTop: 5,
                    height: 10,
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
        gap: 10,
        alignItems: "center",
        padding: 12,
        border: `1px solid ${colors.border}`,
        borderRadius: 14,
        background: "#fffdf8",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 950, overflowWrap: "anywhere" }}>
          {txn.description ?? txn.category}
        </div>
        <div
          style={{
            marginTop: 3,
            color: colors.muted,
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1.35,
          }}
        >
          {new Date(txn.createdAt).toLocaleString()} • {txn.category.replaceAll("_", " ")}
        </div>
      </div>
      <div
        style={{
          fontWeight: 1000,
          color: txn.amountCents >= 0 ? colors.green : colors.red,
          whiteSpace: "nowrap",
          fontSize: 14,
        }}
      >
        {signedDollars(txn.amountCents)}
      </div>
    </div>
  );
}