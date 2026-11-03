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
  personalBestCents: number;
  collectorCount: number;
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
          <stop offset="0%" stopColor="rgba(215,187,126,.20)" />
          <stop offset="100%" stopColor="rgba(215,187,126,0)" />
        </linearGradient>
      </defs>
      <path d={`${path} L ${coords.at(-1)!.x} ${height - pad} L ${coords[0].x} ${height - pad} Z`} fill="url(#overview-fill)" />
      <path d={path} fill="none" stroke="#d7bb7e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AnalyticsOverviewClient() {
  const [finance, setFinance] = useState<FinanceResponse | null>(null);
  const [climb, setClimb] = useState<ClimbResponse | null>(null);
  const [error, setError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");

      try {
        const res = await fetch("/api/analytics/pulse", { cache: "no-store" });
        const pulse = await res.json();
        if (!res.ok || !pulse?.ok) {
          throw new Error(pulse?.error ?? "Couldn't load Collector Pulse.");
        }
        const p = pulse.portfolio;
        const c = pulse.challenge;
        const financeJson = {
          ok: true,
          summary: {
            balanceCents: p.balanceCents,
            collectionValueCents: p.collectionValueCents,
            sealedValueCents: p.sealedValueCents,
            netWorthCents: p.netWorthCents,
            netWorthChangeCents: p.sevenDayChangeCents,
            netWorthChangePct: p.sevenDayChangePct,
          },
          snapshots: pulse.trend.map((point: { dateKey: string; value: number }) => ({
            dateKey: point.dateKey,
            netWorthCents: point.value,
            closingNetWorthCents: point.value,
          })),
        };
        const climbJson = {
          ok: true,
          rows: [{
            userId: "self", label: "You", rank: 0, isMe: true,
            netWorthCents: p.netWorthCents,
            gainCents: c.myGainCents, gainPct: c.myGainPct,
            monthlyWins: c.myMonthlyWins, winStreak: c.myWinStreak,
          }],
          personalBestCents: c.personalBestCents,
          collectorCount: c.collectorCount,
          yesterdayWinner: c.yesterdayWinner,
        };

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
  }, [reloadVersion]);

  async function refreshMyPortfolio() {
    setRefreshBusy(true);
    setRefreshNotice("");
    try {
      const res = await fetch("/api/analytics/refresh", {
        method: "POST",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Unable to refresh portfolio.");
      }
      setRefreshNotice(
        json.refreshed
          ? "Your portfolio has been revalued."
          : "Your values were updated less than a minute ago."
      );
      setReloadVersion((version) => version + 1);
    } catch (err) {
      setRefreshNotice(err instanceof Error ? err.message : "Unable to refresh portfolio.");
    } finally {
      setRefreshBusy(false);
    }
  }

  const me = climb?.rows.find((row) => row.isMe) ?? null;
  const selfTargetCents = climb && me
    ? Math.max(1, climb.personalBestCents - me.gainCents + 1)
    : 0;
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
            <div className="analytics-eyebrow">Your collecting season</div>
            <h1 className="analytics-heading">Collector Pulse</h1>
            <div className="analytics-subtitle">
              Chase your own best day, then see who won tomorrow. Rival scores and rankings
              remain hidden until the contest ends so nobody can snipe a known target.
            </div>
            <div className="analytics-refresh-controls">
              <button
                type="button"
                className="analytics-refresh-button"
                onClick={() => void refreshMyPortfolio()}
                disabled={refreshBusy}
              >
                {refreshBusy ? "Revaluing…" : "Revalue my collection"}
              </button>
              {refreshNotice && <span role="status" className="analytics-refresh-notice">{refreshNotice}</span>}
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
                  <div className="analytics-section-title" style={{ marginTop: 4 }}>The Daily Climb</div>
                  <div className="analytics-section-copy">Blind competition · Midnight to midnight Central Time</div>
                </div>

                <div className="analytics-climb-list">
                  <div className="analytics-climb-row" data-me="true">
                    <div className="analytics-rank">YOU</div>
                    <div>
                      <div className="analytics-climb-name">Your daily score</div>
                      <div className="analytics-climb-meta">Only you can see this until the contest closes</div>
                    </div>
                    <div className="analytics-climb-value">
                      <div className={(me?.gainCents ?? 0) >= 0 ? "analytics-positive" : "analytics-negative"}>
                        {signedMoney(me?.gainCents ?? 0)}
                      </div>
                      <div className="analytics-climb-pct">{pct(me?.gainPct ?? null)}</div>
                    </div>
                  </div>
                  <div className="analytics-climb-row">
                    <div className="analytics-rank">?</div>
                    <div>
                      <div className="analytics-climb-name">Rival scores hidden</div>
                      <div className="analytics-climb-meta">No live totals, ranking, or amount to pass</div>
                    </div>
                    <div className="analytics-climb-value">Sealed</div>
                  </div>
                </div>

                <div style={{ padding: "9px 14px", borderTop: "1px solid var(--border-2)", color: "var(--muted)", fontSize: 10, fontWeight: 750 }}>
                  {climb.yesterdayWinner
                    ? `Yesterday: ${climb.yesterdayWinner.label} won with ${signedMoney(climb.yesterdayWinner.gainCents)}.`
                    : "No positive winner was recorded yesterday."}
                </div>
              </div>
            </section>

            <section className="analytics-section analytics-pulse-grid" aria-label="Your collecting challenges">
              <div className="analytics-panel analytics-pulse-card">
                <div className="analytics-eyebrow">Beat your best week</div>
                <div className="analytics-pulse-value">{money(selfTargetCents)} <span>to go</span></div>
                <div className="analytics-section-copy">
                  Your best completed day from the past week was {money(climb.personalBestCents)}.
                </div>
              </div>
              <div className="analytics-panel analytics-pulse-card">
                <div className="analytics-eyebrow">Win streak</div>
                <div className="analytics-pulse-value">{me?.winStreak ?? 0} <span>days</span></div>
                <div className="analytics-section-copy">
                  {me?.monthlyWins ?? 0} completed wins this month.
                </div>
              </div>
              <div className="analytics-panel analytics-pulse-card">
                <div className="analytics-eyebrow">Daily score reveal</div>
                <div className="analytics-pulse-rival">Midnight Central</div>
                <div className="analytics-section-copy">
                  1 a.m. Eastern. Everyone's score stays sealed until the same deadline.
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
                  <div className="analytics-link-title">Hunt the collection →</div>
                  <div className="analytics-link-copy">Find your strongest players, sets, and cards. Compare a rival when you're ready.</div>
                </Link>
                <Link href="/analytics/finances" className="analytics-link-card">
                  <div className="analytics-link-title">Follow your fortune →</div>
                  <div className="analytics-link-copy">See how your portfolio and cash flow evolve without guessing where the value went.</div>
                </Link>
                <Link href="/analytics/boxes" className="analytics-link-card">
                  <div className="analytics-link-title">Relive your best boxes →</div>
                  <div className="analytics-link-copy">Track wins, losses, and the cards that made a rip memorable.</div>
                </Link>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
