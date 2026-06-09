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
  card: "#ffffff",
  border: "#e7ddcf",
  dark: "#08111f",
  dark2: "#101827",
  green: "#15803d",
  greenSoft: "#dcfce7",
  red: "#b91c1c",
  redSoft: "#fee2e2",
  blue: "#16477d",
  gold: "#b7791f",
};

function dollars(cents: number) {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
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

  const maxNetWorth = useMemo(() => {
    const values = data?.snapshots.map((s) => s.netWorthCents) ?? [];
    return Math.max(1, ...values);
  }, [data]);

  const minNetWorth = useMemo(() => {
    const values = data?.snapshots.map((s) => s.netWorthCents) ?? [];
    return Math.min(0, ...values);
  }, [data]);

  return (
    <main
      style={{
        minHeight: "calc(100vh - 80px)",
        background:
          "radial-gradient(circle at top left, rgba(22,71,125,0.16), transparent 32%), radial-gradient(circle at 80% 20%, rgba(183,121,31,0.16), transparent 28%), #f6f1e8",
        color: colors.text,
        fontFamily: "system-ui",
        padding: 16,
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <Link href="/analytics" style={{ color: colors.blue, fontWeight: 900, fontSize: 13 }}>
              ← Analytics
            </Link>
            <h1 style={{ margin: "8px 0 4px", fontSize: 36, fontWeight: 1000 }}>
              My Finances
            </h1>
            <div style={{ color: colors.muted, fontWeight: 750, lineHeight: 1.45 }}>
              Track your card business: cashflow, net worth, collection value, and financial activity.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              background: "rgba(255,255,255,0.72)",
              border: `1px solid ${colors.border}`,
              borderRadius: 999,
              padding: 5,
              boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
            }}
          >
            {(["TODAY", "7D", "30D", "90D", "ALL"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "8px 11px",
                  background: range === r ? colors.dark : "transparent",
                  color: range === r ? "#fff" : colors.text,
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                {rangeLabel(r)}
              </button>
            ))}
          </div>
        </div>

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
                gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
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
                gridTemplateColumns: "minmax(0, 1.35fr) minmax(300px, 0.65fr)",
                gap: 14,
              }}
            >
              <Panel title="Net Worth Trend" subtitle="Daily snapshots begin from this feature launch.">
                <LineChart
                  points={data.snapshots.map((s) => ({
                    label: shortDate(s.dateKey),
                    value: s.netWorthCents,
                  }))}
                  min={minNetWorth}
                  max={maxNetWorth}
                />
              </Panel>

              <Panel title="Business Scorecard" subtitle="Cash profitability for selected range.">
                <div style={{ display: "grid", gap: 10 }}>
                  <ScoreRow label="Income" value={dollars(data.summary.totalIncomeCents)} tone="green" />
                  <ScoreRow label="Expenses" value={dollars(data.summary.totalExpenseCents)} tone="red" />
                  <ScoreRow
                    label="Net"
                    value={signedDollars(data.summary.netCashflowCents)}
                    tone={data.summary.netCashflowCents >= 0 ? "green" : "red"}
                  />
                  <ScoreRow
                    label="ROI"
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
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
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
                    <div
                      key={txn.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 10,
                        alignItems: "center",
                        padding: 12,
                        border: `1px solid ${colors.border}`,
                        borderRadius: 14,
                        background: "#fffdf8",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 950 }}>{txn.description ?? txn.category}</div>
                        <div style={{ marginTop: 3, color: colors.muted, fontSize: 12, fontWeight: 800 }}>
                          {new Date(txn.createdAt).toLocaleString()} • {txn.category.replaceAll("_", " ")}
                        </div>
                      </div>
                      <div
                        style={{
                          fontWeight: 1000,
                          color: txn.amountCents >= 0 ? colors.green : colors.red,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {signedDollars(txn.amountCents)}
                      </div>
                    </div>
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

function HeroCard({
  title,
  value,
  subtitle,
  dark = false,
  positive,
}: {
  title: string;
  value: string;
  subtitle: string;
  dark?: boolean;
  positive?: boolean;
}) {
  return (
    <div
      style={{
        background: dark
          ? "linear-gradient(135deg, #08111f, #172033)"
          : "rgba(255,255,255,0.86)",
        color: dark ? "#fff" : colors.text,
        border: dark ? "1px solid rgba(255,255,255,0.14)" : `1px solid ${colors.border}`,
        borderRadius: 22,
        padding: 18,
        boxShadow: dark ? "0 24px 70px rgba(8,17,31,0.28)" : "0 16px 45px rgba(0,0,0,0.07)",
      }}
    >
      <div style={{ color: dark ? "rgba(255,255,255,0.68)" : colors.muted, fontSize: 12, fontWeight: 950 }}>
        {title}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 28,
          fontWeight: 1000,
          color: positive == null ? undefined : positive ? colors.green : colors.red,
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: 6, color: dark ? "rgba(255,255,255,0.68)" : colors.muted, fontSize: 12, fontWeight: 800 }}>
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
        background: "rgba(255,255,255,0.88)",
        border: `1px solid ${colors.border}`,
        borderRadius: 22,
        padding: 16,
        boxShadow: "0 16px 45px rgba(0,0,0,0.06)",
        minWidth: 0,
        ...style,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 1000 }}>{title}</h2>
          {subtitle ? (
            <div style={{ marginTop: 4, color: colors.muted, fontSize: 12, fontWeight: 750 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
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
      <span>{value}</span>
    </div>
  );
}

function LineChart({
  points,
  min,
  max,
}: {
  points: { label: string; value: number }[];
  min: number;
  max: number;
}) {
  const width = 720;
  const height = 230;
  const pad = 18;
  const range = Math.max(1, max - min);

  const coords = points.map((p, i) => {
    const x = points.length <= 1 ? width / 2 : pad + (i / (points.length - 1)) * (width - pad * 2);
    const y = height - pad - ((p.value - min) / range) * (height - pad * 2);
    return { ...p, x, y };
  });

  const path = coords.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", minWidth: 520, height: 240 }}>
        <defs>
          <linearGradient id="netWorthLine" x1="0" x2="1">
            <stop offset="0%" stopColor="#16477d" />
            <stop offset="100%" stopColor="#b7791f" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={width} height={height} rx="18" fill="#fbf7ef" />
        <path d={path} fill="none" stroke="url(#netWorthLine)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((p, i) => (
          <g key={`${p.label}-${i}`}>
            <circle cx={p.x} cy={p.y} r="5" fill="#08111f" />
            {i === 0 || i === coords.length - 1 || i % Math.ceil(coords.length / 5) === 0 ? (
              <text x={p.x} y={height - 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#6b7280">
                {p.label}
              </text>
            ) : null}
          </g>
        ))}
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
    <div style={{ display: "flex", alignItems: "end", gap: 6, minHeight: 220, overflowX: "auto", paddingBottom: 8 }}>
      {days.map((day) => {
        const isPositive = day.netCents >= 0;
        const height = Math.max(6, Math.round((Math.abs(day.netCents) / max) * 170));

        return (
          <div key={day.dateKey} style={{ minWidth: 28, display: "grid", justifyItems: "center", gap: 6 }}>
            <div
              title={`${day.dateKey}: ${signedDollars(day.netCents)}`}
              style={{
                width: 18,
                height,
                borderRadius: 999,
                background: isPositive ? colors.green : colors.red,
                opacity: day.netCents === 0 ? 0.25 : 0.9,
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
  const max = Math.max(1, ...items.map((item) => (mode === "income" ? item.incomeCents : item.expenseCents)));

  return (
    <div>
      <div style={{ fontWeight: 1000, marginBottom: 8 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ color: colors.muted, fontWeight: 800, fontSize: 13 }}>No activity yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((item) => {
            const value = mode === "income" ? item.incomeCents : item.expenseCents;
            const pct = Math.max(4, Math.round((value / max) * 100));

            return (
              <div key={item.category}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, fontWeight: 900 }}>
                  <span>{item.label}</span>
                  <span style={{ color: mode === "income" ? colors.green : colors.red }}>{dollars(value)}</span>
                </div>
                <div style={{ marginTop: 5, height: 9, borderRadius: 999, background: "#efe7db", overflow: "hidden" }}>
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