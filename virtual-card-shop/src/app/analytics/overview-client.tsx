"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AnalyticsTabs from "@/components/analytics/AnalyticsTabs";

type FinanceResponse = {
  ok: boolean;
  summary: {
    balanceCents: number;
    collectionValueCents: number;
    sealedValueCents: number;
    netWorthCents: number;
    netWorthChangeCents: number;
    netWorthChangePct: number | null;
  };
  snapshots: {
    dateKey: string;
    netWorthCents: number;
    closingNetWorthCents: number;
  }[];
};

type ClimbResponse = {
  ok: boolean;
  dateKey: string;
  yesterdayWinner: null | { userId: string; label: string; gainCents: number };
  rows: {
    rank: number;
    userId: string;
    label: string;
    isMe: boolean;
    netWorthCents: number;
    gainCents: number;
    gainPct: number | null;
    monthlyWins: number;
    winStreak: number;
  }[];
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function signedMoney(cents: number) {
  return `${cents > 0 ? "+" : ""}${money(cents)}`;
}

function pct(value: number | null) {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function Trend({ points }: { points: { dateKey: string; value: number }[] }) {
  const width = 620;
  const height = 170;
  const pad = 12;

  if (points.length < 2) {
    return <div className="analytics-empty">Trend history will build automatically as you play.</div>;
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);

  const coords = points.map((point, index) => ({
    x: pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2),
    y: height - pad - ((point.value - min) / spread) * (height - pad * 2),
  }));

  const path = coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  return (
    <svg className="analytics-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Seven day net worth trend" preserveAspectRatio="none">
      <defs>
        <linearGradient id="overview-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(43,108,176,.23)" />
          <stop offset="100%" stopColor="rgba(43,108,176,0)" />
        </linearGradient>
      </defs>
      <path d={`${path} L ${coords.at(-1)!.x} ${height - pad} L ${coords[0].x} ${height - pad} Z`} fill="url(#overview-fill)" />
      <path d={path} fill="none" stroke="#2b6cb0" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AnalyticsOverviewClient() {
  const [finance, setFinance] = useState<FinanceResponse | null>(null);
  const [climb, setClimb] = useState<ClimbResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");

      try {
        const [financeRes, climbRes] = await Promise.all([
          fetch("/api/analytics/finances?range=7D", { cache: "no-store" }),
          fetch("/api/analytics/daily-climb", { cache: "no-store" }),
        ]);

        const [financeJson, climbJson] = await Promise.all([
          financeRes.json(),
          climbRes.json(),
        ]);

        if (!financeRes.ok || !financeJson?.ok) {
          throw new Error(financeJson?.error ?? "Couldn't load portfolio analytics.");
        }

        if (!climbRes.ok || !climbJson?.ok) {
          throw new Error(climbJson?.error ?? "Couldn't load Daily Climb.");
        }

        if (cancelled) return;
        setFinance(financeJson);
        setClimb(climbJson);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn't load Analytics.");
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const me = climb?.rows.find((row) => row.isMe) ?? null;
  const trend = useMemo(
    () => (finance?.snapshots ?? []).map((snapshot) => ({
      dateKey: snapshot.dateKey,
      value: snapshot.closingNetWorthCents ?? snapshot.netWorthCents,
    })),
    [finance]
  );

  return (
    <main className="analytics-suite-page">
      <div className="analytics-suite-shell">
        <AnalyticsTabs />

        <header className="analytics-masthead">
          <div>
            <div className="analytics-eyebrow">Portfolio Intelligence</div>
            <h1 className="analytics-heading">Analytics</h1>
            <div className="analytics-subtitle">
              Your VCS portfolio, competition, collection analysis, finances, and box performance in one place.
            </div>
          </div>
        </header>

        {error ? <div className="vcs-notice vcs-notice-danger">{error}</div> : null}

        {!finance || !climb ? (
          <div className="vcs-state vcs-state-loading">
            <span className="vcs-state-mark" />
            <div className="vcs-state-body">
              <div className="vcs-state-title">Building your portfolio view</div>
              <div className="vcs-state-copy">Valuing cash, cards, grading inventory, and sealed products.</div>
            </div>
          </div>
        ) : (
          <>
            <section className="analytics-hero-grid">
              <div className="analytics-portfolio-hero">
                <div>
                  <div className="analytics-hero-label">Portfolio Value</div>
                  <div className="analytics-hero-value">{money(finance.summary.netWorthCents)}</div>
                  <div className={`analytics-delta ${(me?.gainCents ?? 0) >= 0 ? "analytics-positive" : "analytics-negative"}`}>
                    {signedMoney(me?.gainCents ?? 0)} today{me?.gainPct != null ? ` · ${pct(me.gainPct)}` : ""}
                  </div>
                </div>
                <div />
                <div className="analytics-hero-composition">
                  <div><div className="analytics-mini-label">Cash</div><div className="analytics-mini-value">{money(finance.summary.balanceCents)}</div></div>
                  <div><div className="analytics-mini-label">Cards</div><div className="analytics-mini-value">{money(finance.summary.collectionValueCents)}</div></div>
                  <div><div className="analytics-mini-label">Sealed</div><div className="analytics-mini-value">{money(finance.summary.sealedValueCents)}</div></div>
                </div>
              </div>

              <div className="analytics-panel">
                <div className="analytics-climb-head">
                  <div className="analytics-eyebrow">Today's Climb</div>
                  <div className="analytics-section-title" style={{ marginTop: 4 }}>Daily Net Worth Challenge</div>
                  <div className="analytics-section-copy">Midnight to midnight · Central Time</div>
                </div>

                <div className="analytics-climb-list">
                  {climb.rows.map((row) => (
                    <div className="analytics-climb-row" data-me={row.isMe} key={row.userId}>
                      <div className="analytics-rank">{row.rank}</div>
                      <div>
                        <div className="analytics-climb-name">{row.label}{row.isMe ? " · You" : ""}</div>
                        <div className="analytics-climb-meta">
                          {row.monthlyWins} win{row.monthlyWins === 1 ? "" : "s"} this month{row.winStreak > 0 ? ` · ${row.winStreak}-day streak` : ""}
                        </div>
                      </div>
                      <div className="analytics-climb-value">
                        <div className={row.gainCents >= 0 ? "analytics-positive" : "analytics-negative"}>{signedMoney(row.gainCents)}</div>
                        <div className="analytics-climb-pct">{pct(row.gainPct)}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: "9px 14px", borderTop: "1px solid var(--border-2)", color: "var(--muted)", fontSize: 10, fontWeight: 750 }}>
                  {climb.yesterdayWinner
                    ? `Yesterday: ${climb.yesterdayWinner.label} won with ${signedMoney(climb.yesterdayWinner.gainCents)}.`
                    : "No positive winner was recorded yesterday."}
                </div>
              </div>
            </section>

            <section className="analytics-section analytics-panel">
              <div className="analytics-section-head" style={{ padding: "13px 15px 0" }}>
                <div>
                  <h2 className="analytics-section-title">7-Day Portfolio Trend</h2>
                  <div className="analytics-section-copy">Net worth includes cash, cards, grading inventory, and sealed acquisition cost.</div>
                </div>
                <div className={finance.summary.netWorthChangeCents >= 0 ? "analytics-positive" : "analytics-negative"} style={{ fontWeight: 1000, fontSize: 13 }}>
                  {signedMoney(finance.summary.netWorthChangeCents)}{finance.summary.netWorthChangePct != null ? ` · ${pct(finance.summary.netWorthChangePct)}` : ""}
                </div>
              </div>
              <div style={{ padding: "2px 12px 10px" }}><Trend points={trend} /></div>
            </section>

            <section className="analytics-section">
              <div className="analytics-link-grid">
                <Link href="/analytics/collection" className="analytics-link-card">
                  <div className="analytics-link-title">Collection Analytics →</div>
                  <div className="analytics-link-copy">Explore value and ownership by player, team, set, brand, year, or sport and compare collectors.</div>
                </Link>
                <Link href="/analytics/finances" className="analytics-link-card">
                  <div className="analytics-link-title">Finances →</div>
                  <div className="analytics-link-copy">Follow portfolio growth, cash flow, spending categories, and transaction activity.</div>
                </Link>
                <Link href="/analytics/boxes" className="analytics-link-card">
                  <div className="analytics-link-title">Box Portfolio →</div>
                  <div className="analytics-link-copy">Track active rips, completed box ROI, profit, and product performance.</div>
                </Link>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
