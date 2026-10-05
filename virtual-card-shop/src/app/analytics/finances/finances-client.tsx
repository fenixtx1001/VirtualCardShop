"use client";

import { useEffect, useMemo, useState } from "react";
import AnalyticsTabs from "@/components/analytics/AnalyticsTabs";

type RangeKey = "TODAY" | "7D" | "30D" | "90D" | "ALL";

type FinanceData = {
  ok: boolean;
  range: RangeKey;
  summary: {
    balanceCents: number;
    collectionValueCents: number;
    sealedValueCents: number;
    netWorthCents: number;
    totalIncomeCents: number;
    totalExpenseCents: number;
    netCashflowCents: number;
    startingNetWorthCents: number;
    endingNetWorthCents: number;
    netWorthChangeCents: number;
    netWorthChangePct: number | null;
  };
  snapshots: {
    dateKey: string;
    balanceCents: number;
    collectionValueCents: number;
    sealedValueCents: number;
    openingNetWorthCents: number;
    closingNetWorthCents: number;
    netWorthCents: number;
  }[];
  incomeCategories: { category: string; label: string; incomeCents: number; expenseCents: number; netCents: number }[];
  expenseCategories: { category: string; label: string; incomeCents: number; expenseCents: number; netCents: number }[];
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

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
function signedMoney(cents: number) { return `${cents > 0 ? "+" : ""}${money(cents)}`; }
function pct(value: number | null) { return value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`; }

function Trend({ snapshots }: { snapshots: FinanceData["snapshots"] }) {
  const width = 760;
  const height = 190;
  const pad = 12;

  if (snapshots.length < 2) return <div className="analytics-empty">More history is needed to draw this range.</div>;

  const values = snapshots.map((snapshot) => snapshot.closingNetWorthCents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  const coordinates = values.map((value, index) => ({
    x: pad + (index / Math.max(1, values.length - 1)) * (width - pad * 2),
    y: height - pad - ((value - min) / spread) * (height - pad * 2),
  }));
  const d = coordinates.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

  return (
    <svg className="analytics-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Net worth trend">
      <path d={d} fill="none" stroke="#2b6cb0" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FinancesClient() {
  const [range, setRange] = useState<RangeKey>("TODAY");
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError("");
      try {
        const response = await fetch(`/api/analytics/finances?range=${range}`, { cache: "no-store" });
        const json = await response.json();
        if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Couldn't load finances.");
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load finances.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [range]);

  const compositionTotal = Math.max(
    1,
    (data?.summary.balanceCents ?? 0) + (data?.summary.collectionValueCents ?? 0) + (data?.summary.sealedValueCents ?? 0)
  );

  const composition = useMemo(() => ({
    cash: ((data?.summary.balanceCents ?? 0) / compositionTotal) * 100,
    cards: ((data?.summary.collectionValueCents ?? 0) / compositionTotal) * 100,
    sealed: ((data?.summary.sealedValueCents ?? 0) / compositionTotal) * 100,
  }), [data, compositionTotal]);

  return (
    <main className="analytics-suite-page">
      <div className="analytics-suite-shell">
        <AnalyticsTabs />

        <header className="analytics-masthead">
          <div>
            <div className="analytics-eyebrow">Portfolio Ledger</div>
            <h1 className="analytics-heading">Finances</h1>
            <div className="analytics-subtitle">Net worth, cash, cards, sealed inventory, cash flow, and transaction activity.</div>
          </div>

          <div className="analytics-range">
            {(["TODAY", "7D", "30D", "90D", "ALL"] as RangeKey[]).map((option) => (
              <button key={option} data-active={range === option} onClick={() => setRange(option)}>{option === "TODAY" ? "1D" : option}</button>
            ))}
          </div>
        </header>

        {error ? <div className="vcs-notice vcs-notice-danger">{error}</div> : null}

        {!data ? (
          <div className="vcs-state vcs-state-loading"><span className="vcs-state-mark" /><div className="vcs-state-body"><div className="vcs-state-title">Loading finances</div></div></div>
        ) : (
          <>
            <section className="analytics-hero-grid">
              <div className="analytics-portfolio-hero">
                <div>
                  <div className="analytics-hero-label">Net Worth</div>
                  <div className="analytics-hero-value">{money(data.summary.netWorthCents)}</div>
                  <div className={`analytics-delta ${data.summary.netWorthChangeCents >= 0 ? "analytics-positive" : "analytics-negative"}`}>
                    {signedMoney(data.summary.netWorthChangeCents)}{data.summary.netWorthChangePct != null ? ` · ${pct(data.summary.netWorthChangePct)}` : ""} · {range === "TODAY" ? "today" : range.toLowerCase()}
                  </div>
                </div>
                <div />
                <div className="analytics-hero-composition">
                  <div><div className="analytics-mini-label">Cash</div><div className="analytics-mini-value">{money(data.summary.balanceCents)}</div></div>
                  <div><div className="analytics-mini-label">Cards</div><div className="analytics-mini-value">{money(data.summary.collectionValueCents)}</div></div>
                  <div><div className="analytics-mini-label">Sealed</div><div className="analytics-mini-value">{money(data.summary.sealedValueCents)}</div></div>
                </div>
              </div>

              <div className="analytics-panel analytics-panel-pad">
                <div className="analytics-eyebrow">Portfolio Mix</div>
                <h2 className="analytics-section-title" style={{ marginTop: 5 }}>Where Your Value Lives</h2>
                <div style={{ height: 18, marginTop: 20, display: "flex", overflow: "hidden", borderRadius: 999, background: "var(--bg-2)" }}>
                  <span style={{ width: `${composition.cash}%`, background: "#2b6cb0" }} />
                  <span style={{ width: `${composition.cards}%`, background: "#b9933d" }} />
                  <span style={{ width: `${composition.sealed}%`, background: "#62705f" }} />
                </div>
                <div style={{ marginTop: 18, display: "grid", gap: 9 }}>
                  {[
                    ["Cash", data.summary.balanceCents, composition.cash],
                    ["Cards", data.summary.collectionValueCents, composition.cards],
                    ["Sealed", data.summary.sealedValueCents, composition.sealed],
                  ].map(([label, cents, percentage]) => (
                    <div key={String(label)} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
                      <div><div style={{ fontSize: 11, fontWeight: 900 }}>{label}</div><div style={{ color: "var(--muted)", fontSize: 9.5, fontWeight: 750 }}>{Number(percentage).toFixed(1)}% of portfolio</div></div>
                      <div style={{ fontSize: 12, fontWeight: 1000 }}>{money(Number(cents))}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="analytics-section">
              <div className="analytics-stat-grid">
                <div className="analytics-stat"><div className="analytics-mini-label">Net Worth Change</div><div className={`analytics-stat-value ${data.summary.netWorthChangeCents >= 0 ? "analytics-positive" : "analytics-negative"}`}>{signedMoney(data.summary.netWorthChangeCents)}</div></div>
                <div className="analytics-stat"><div className="analytics-mini-label">Income</div><div className="analytics-stat-value analytics-positive">{money(data.summary.totalIncomeCents)}</div></div>
                <div className="analytics-stat"><div className="analytics-mini-label">Spending</div><div className="analytics-stat-value">{money(data.summary.totalExpenseCents)}</div></div>
                <div className="analytics-stat"><div className="analytics-mini-label">Net Cash Flow</div><div className={`analytics-stat-value ${data.summary.netCashflowCents >= 0 ? "analytics-positive" : "analytics-negative"}`}>{signedMoney(data.summary.netCashflowCents)}</div></div>
              </div>
            </section>

            <section className="analytics-section analytics-panel">
              <div className="analytics-section-head" style={{ padding: "13px 15px 0" }}>
                <div><h2 className="analytics-section-title">Net Worth</h2><div className="analytics-section-copy">Portfolio value through the selected period.</div></div>
              </div>
              <div style={{ padding: "2px 12px 10px" }}><Trend snapshots={data.snapshots} /></div>
            </section>

            <section className="analytics-section analytics-two-col">
              <div className="analytics-panel analytics-panel-pad">
                <h2 className="analytics-section-title">Money In</h2>
                <div className="analytics-section-copy">Largest income sources for this period.</div>
                <div className="analytics-category-list" style={{ marginTop: 10 }}>
                  {data.incomeCategories.slice(0, 6).map((category) => (
                    <div className="analytics-category-row" key={category.category}><div className="analytics-category-name">{category.label}</div><div className="analytics-category-value analytics-positive">{money(category.incomeCents)}</div></div>
                  ))}
                  {data.incomeCategories.length === 0 ? <div className="analytics-empty">No income in this range.</div> : null}
                </div>
              </div>

              <div className="analytics-panel analytics-panel-pad">
                <h2 className="analytics-section-title">Money Out</h2>
                <div className="analytics-section-copy">Largest spending categories for this period.</div>
                <div className="analytics-category-list" style={{ marginTop: 10 }}>
                  {data.expenseCategories.slice(0, 6).map((category) => (
                    <div className="analytics-category-row" key={category.category}><div className="analytics-category-name">{category.label}</div><div className="analytics-category-value">{money(category.expenseCents)}</div></div>
                  ))}
                  {data.expenseCategories.length === 0 ? <div className="analytics-empty">No spending in this range.</div> : null}
                </div>
              </div>
            </section>

            <section className="analytics-section analytics-panel analytics-panel-pad">
              <h2 className="analytics-section-title">Activity</h2>
              <div className="analytics-section-copy">Recent VCS financial activity.</div>
              <div className="analytics-activity" style={{ marginTop: 8 }}>
                {data.recentTransactions.map((transaction) => {
                  const expense = transaction.direction.toUpperCase() === "EXPENSE";
                  const amount = expense ? -Math.abs(transaction.amountCents) : Math.abs(transaction.amountCents);
                  return (
                    <div className="analytics-activity-row" key={transaction.id}>
                      <div><div className="analytics-activity-title">{transaction.description || transaction.category}</div><div className="analytics-activity-meta">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(transaction.createdAt))}</div></div>
                      <div className={`analytics-activity-value ${amount >= 0 ? "analytics-positive" : "analytics-negative"}`}>{signedMoney(amount)}</div>
                    </div>
                  );
                })}
                {data.recentTransactions.length === 0 ? <div className="analytics-empty">No financial activity in this range.</div> : null}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
