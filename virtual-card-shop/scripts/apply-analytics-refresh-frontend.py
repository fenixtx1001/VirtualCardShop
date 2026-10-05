from pathlib import Path
from textwrap import dedent

ROOT = Path.cwd()


def write(rel: str, content: str):
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dedent(content).lstrip(), encoding="utf-8")
    print(f"WRITE {rel}")


def replace(rel: str, old: str, new: str):
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected patch target not found in {rel}:\n{old[:300]}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"PATCH {rel}")


write("src/components/analytics/AnalyticsTabs.tsx", r'''
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/analytics", label: "Overview" },
  { href: "/analytics/collection", label: "Collection" },
  { href: "/analytics/finances", label: "Finances" },
  { href: "/analytics/boxes", label: "Boxes" },
];

export default function AnalyticsTabs() {
  const pathname = usePathname();

  return (
    <nav className="analytics-tabs" aria-label="Analytics sections">
      {tabs.map((tab) => {
        const active =
          tab.href === "/analytics"
            ? pathname === "/analytics"
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="analytics-tab"
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
''')

write("src/app/analytics/layout.tsx", r'''
import "./analytics.css";

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
''')

write("src/app/analytics/analytics.css", r'''
.analytics-suite-page {
  min-height: calc(100vh - 80px);
  padding: 18px clamp(10px, 3vw, 22px) 36px;
  color: var(--text);
}

.analytics-suite-shell {
  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
}

.analytics-tabs {
  width: fit-content;
  max-width: 100%;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 16px;
  padding: 4px;
  border: 1px solid var(--border-2);
  border-radius: 14px;
  background: rgba(255,255,255,.72);
  box-shadow: var(--shadow-sm);
  overflow-x: auto;
  scrollbar-width: none;
}

.analytics-tabs::-webkit-scrollbar { display: none; }

.analytics-tab {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: 7px 13px;
  border-radius: 10px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1;
  font-weight: 900;
  text-decoration: none;
  white-space: nowrap;
}

.analytics-tab:hover {
  color: var(--text-strong);
  text-decoration: none;
  background: rgba(255,255,255,.9);
}

.analytics-tab[data-active="true"] {
  color: #f5efe1;
  background: linear-gradient(135deg,#20231f,#30352f);
  box-shadow: 0 5px 14px rgba(20,24,20,.16);
}

.analytics-masthead {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 14px;
}

.analytics-eyebrow {
  color: var(--gold-deep);
  font-size: 10px;
  line-height: 1;
  font-weight: 950;
  letter-spacing: .14em;
  text-transform: uppercase;
}

.analytics-heading {
  margin: 5px 0 0;
  color: var(--text-strong);
  font-size: clamp(30px,5vw,42px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.045em;
}

.analytics-subtitle {
  max-width: 700px;
  margin-top: 6px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
  font-weight: 700;
}

.analytics-range {
  display: inline-grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(48px,auto);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(255,255,255,.82);
}

.analytics-range button {
  min-height: 34px;
  padding: 7px 10px;
  border: 0;
  border-left: 1px solid var(--border);
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 950;
}

.analytics-range button:first-child { border-left: 0; }
.analytics-range button[data-active="true"] { color: #fff; background: #20231f; }

.analytics-panel {
  border: 1px solid var(--border-2);
  border-radius: 18px;
  background: rgba(255,255,255,.9);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.9),var(--shadow-md);
  overflow: hidden;
}

.analytics-panel-pad { padding: 15px; }

.analytics-hero-grid {
  display: grid;
  grid-template-columns: minmax(0,1.3fr) minmax(340px,.9fr);
  gap: 12px;
}

.analytics-portfolio-hero {
  min-height: 245px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  padding: 18px;
  border: 1px solid rgba(69,69,56,.22);
  border-radius: 20px;
  background:
    radial-gradient(circle at 88% 15%,rgba(215,187,126,.15),transparent 26%),
    linear-gradient(145deg,#1e211e,#2a2e29);
  color: #f4efe3;
  box-shadow: 0 18px 45px rgba(24,28,24,.18);
  overflow: hidden;
}

.analytics-hero-label {
  color: #bfc2b9;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .11em;
  text-transform: uppercase;
}

.analytics-hero-value {
  margin-top: 5px;
  color: #fffaf0;
  font-size: clamp(38px,7vw,58px);
  line-height: .95;
  font-weight: 1000;
  letter-spacing: -.055em;
}

.analytics-delta { margin-top: 8px; font-size: 14px; font-weight: 900; }
.analytics-positive { color: #2f855a; }
.analytics-negative { color: #a52a2a; }
.analytics-portfolio-hero .analytics-positive { color: #8fd4aa; }
.analytics-portfolio-hero .analytics-negative { color: #f3a0a0; }

.analytics-hero-composition {
  display: grid;
  grid-template-columns: repeat(3,minmax(0,1fr));
  gap: 1px;
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 13px;
  background: rgba(255,255,255,.1);
}

.analytics-hero-composition > div {
  min-width: 0;
  padding: 10px 11px;
  background: rgba(8,10,8,.2);
}

.analytics-mini-label {
  color: var(--muted-2);
  font-size: 9px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.analytics-portfolio-hero .analytics-mini-label { color: #aeb3a7; }

.analytics-mini-value {
  margin-top: 2px;
  overflow: hidden;
  color: var(--text-strong);
  font-size: 14px;
  font-weight: 1000;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analytics-portfolio-hero .analytics-mini-value { color: #fff8eb; }
.analytics-section { margin-top: 12px; }

.analytics-section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 9px;
}

.analytics-section-title {
  margin: 0;
  color: var(--text-strong);
  font-size: 17px;
  line-height: 1.1;
  font-weight: 1000;
}

.analytics-section-copy {
  margin-top: 3px;
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.35;
  font-weight: 700;
}

.analytics-stat-grid {
  display: grid;
  grid-template-columns: repeat(4,minmax(0,1fr));
  overflow: hidden;
  border: 1px solid var(--border-2);
  border-radius: 15px;
  background: rgba(255,255,255,.9);
}

.analytics-stat {
  min-width: 0;
  padding: 12px;
  border-left: 1px solid var(--border-2);
}
.analytics-stat:first-child { border-left: 0; }

.analytics-stat-value {
  margin-top: 3px;
  overflow: hidden;
  color: var(--text-strong);
  font-size: 18px;
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.035em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analytics-climb-head {
  padding: 14px 15px 10px;
  border-bottom: 1px solid var(--border-2);
  background: linear-gradient(90deg,rgba(185,147,61,.1),rgba(255,255,255,.9));
}

.analytics-climb-list { display: grid; }

.analytics-climb-row {
  display: grid;
  grid-template-columns: 32px minmax(0,1fr) auto;
  gap: 9px;
  align-items: center;
  padding: 11px 14px;
  border-top: 1px solid var(--border-2);
}
.analytics-climb-row:first-child { border-top: 0; }
.analytics-climb-row[data-me="true"] { background: rgba(43,108,176,.065); }

.analytics-rank {
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--bg-2);
  color: var(--muted);
  font-size: 11px;
  font-weight: 1000;
}
.analytics-climb-row:first-child .analytics-rank { background: var(--gold-soft); color: var(--gold-deep); }
.analytics-climb-name { color: var(--text-strong); font-size: 13px; font-weight: 950; }
.analytics-climb-meta { margin-top: 2px; color: var(--muted); font-size: 9.5px; font-weight: 750; }
.analytics-climb-value { text-align: right; font-size: 14px; font-weight: 1000; }
.analytics-climb-pct { margin-top: 2px; color: var(--muted); font-size: 9.5px; font-weight: 850; }
.analytics-chart { width: 100%; height: 170px; display: block; }

.analytics-link-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; }
.analytics-link-card {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--border-2);
  border-radius: 16px;
  background: rgba(255,255,255,.88);
  color: inherit;
  box-shadow: var(--shadow-sm);
  text-decoration: none;
}
.analytics-link-card:hover { border-color: var(--border-strong); background: #fff; text-decoration: none; transform: translateY(-1px); }
.analytics-link-title { color: var(--text-strong); font-size: 14px; font-weight: 1000; }
.analytics-link-copy { margin-top: 4px; color: var(--muted); font-size: 10.5px; line-height: 1.35; font-weight: 700; }

.analytics-two-col { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
.analytics-activity { display: grid; }
.analytics-activity-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border-2); }
.analytics-activity-row:first-child { border-top: 0; }
.analytics-activity-title { color: var(--text-strong); font-size: 12px; line-height: 1.3; font-weight: 850; }
.analytics-activity-meta { margin-top: 2px; color: var(--muted); font-size: 9.5px; font-weight: 700; }
.analytics-activity-value { font-size: 12px; font-weight: 1000; white-space: nowrap; }
.analytics-category-list { display: grid; gap: 7px; }
.analytics-category-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; align-items: center; padding: 8px 9px; border: 1px solid var(--border-2); border-radius: 11px; background: var(--bg); }
.analytics-category-name { overflow: hidden; font-size: 11px; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }
.analytics-category-value { font-size: 11px; font-weight: 1000; white-space: nowrap; }
.analytics-box-grid { display: grid; gap: 9px; }

.analytics-box-card {
  display: grid;
  grid-template-columns: 70px minmax(0,1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 11px;
  border: 1px solid var(--border-2);
  border-radius: 15px;
  background: #fff;
  color: inherit;
  text-decoration: none;
}
.analytics-box-card:hover { border-color: var(--border-strong); text-decoration: none; }
.analytics-box-art { width: 70px; height: 70px; display: grid; place-items: center; overflow: hidden; border: 1px solid var(--border-2); border-radius: 11px; background: var(--bg-2); }
.analytics-box-art img { width: 100%; height: 100%; object-fit: contain; }
.analytics-box-title { color: var(--text-strong); font-size: 13px; font-weight: 1000; }
.analytics-box-sub { margin-top: 3px; color: var(--muted); font-size: 10px; font-weight: 750; }
.analytics-box-metrics { display: grid; grid-auto-flow: column; gap: 18px; }
.analytics-progress { height: 6px; margin-top: 8px; overflow: hidden; border-radius: 999px; background: #ebe6db; }
.analytics-progress > span { height: 100%; display: block; border-radius: inherit; background: linear-gradient(90deg,#9b7a30,#d2b264); }
.analytics-product-list { display: grid; }
.analytics-product-row { display: grid; grid-template-columns: minmax(0,1.5fr) repeat(3,minmax(90px,.6fr)); gap: 12px; align-items: center; padding: 10px 12px; border-top: 1px solid var(--border-2); }
.analytics-product-row:first-child { border-top: 0; }
.analytics-empty { padding: 18px; color: var(--muted); font-size: 12px; font-weight: 750; text-align: center; }

@media (max-width: 760px) {
  .analytics-suite-page { padding: 10px 8px 24px; }
  .analytics-tabs { width: 100%; margin-bottom: 10px; }
  .analytics-tab { flex: 1 0 auto; min-width: 82px; padding: 7px 10px; font-size: 11px; }
  .analytics-masthead { display: grid; gap: 9px; margin-bottom: 10px; }
  .analytics-heading { font-size: 30px; }
  .analytics-subtitle { font-size: 11.5px; }
  .analytics-range { width: 100%; }
  .analytics-range button { min-width: 0; padding: 6px 5px; font-size: 10px; }
  .analytics-hero-grid,.analytics-two-col { grid-template-columns: 1fr; }
  .analytics-portfolio-hero { min-height: 215px; padding: 15px; }
  .analytics-hero-value { font-size: 39px; }
  .analytics-stat-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .analytics-stat { padding: 9px; }
  .analytics-stat:nth-child(3) { border-left: 0; border-top: 1px solid var(--border-2); }
  .analytics-stat:nth-child(4) { border-top: 1px solid var(--border-2); }
  .analytics-stat-value { font-size: 14px; }
  .analytics-link-grid { grid-template-columns: 1fr; gap: 7px; }
  .analytics-link-card { padding: 11px; }
  .analytics-chart { height: 135px; }
  .analytics-box-card { grid-template-columns: 54px minmax(0,1fr); gap: 9px; padding: 9px; }
  .analytics-box-art { width: 54px; height: 54px; }
  .analytics-box-metrics { grid-column: 1 / -1; grid-auto-flow: column; gap: 0; overflow: hidden; border: 1px solid var(--border-2); border-radius: 10px; }
  .analytics-box-metrics > div { padding: 7px; border-left: 1px solid var(--border-2); }
  .analytics-box-metrics > div:first-child { border-left: 0; }
  .analytics-product-row { grid-template-columns: minmax(0,1fr) repeat(2,minmax(70px,.55fr)); gap: 7px; padding: 9px; }
  .analytics-product-row > :nth-child(4) { display: none; }
}
''')

write("src/app/analytics/page.tsx", r'''
export const dynamic = "force-dynamic";

import AnalyticsOverviewClient from "./overview-client";

export default function AnalyticsPage() {
  return <AnalyticsOverviewClient />;
}
''')

write("src/app/analytics/overview-client.tsx", r'''
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
''')

write("src/app/analytics/collection/page.tsx", r'''
export const dynamic = "force-dynamic";

import AnalyticsClient from "../analytics-client";

export default function CollectionAnalyticsPage() {
  return <AnalyticsClient />;
}
''')

replace(
    "src/app/analytics/analytics-client.tsx",
    '''import { useEffect, useMemo, useState } from "react";''',
    '''import { useEffect, useMemo, useState } from "react";\nimport AnalyticsTabs from "@/components/analytics/AnalyticsTabs";'''
)

replace(
    "src/app/analytics/analytics-client.tsx",
    '''      <div className="analyticsShell">\n        <header className="analyticsHeader">''',
    '''      <div className="analyticsShell">\n        <AnalyticsTabs />\n        <header className="analyticsHeader">'''
)

replace(
    "src/app/analytics/analytics-client.tsx",
    '''            <h1 className="analyticsTitle">Analytics</h1>\n            <div className="analyticsSubtitle">\n              Understand your collection, compare ownership, and explore the VCS card universe.\n            </div>''',
    '''            <h1 className="analyticsTitle">Collection Analytics</h1>\n            <div className="analyticsSubtitle">\n              Explore your cards by player, team, set, brand, year, or sport and compare ownership across collectors.\n            </div>'''
)

write("src/app/analytics/finances/finances-client.tsx", r'''
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
''')

write("src/app/analytics/boxes/boxes-client.tsx", r'''
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AnalyticsTabs from "@/components/analytics/AnalyticsTabs";

type BoxRow = {
  id: number;
  productId: string;
  productName: string;
  product: { boxImageUrl: string | null; packImageUrl: string | null };
  purchasePriceCents: number;
  packsPurchased: number;
  packsOpened: number;
  isClosed: boolean;
  createdAt: string;
  totalPulledCards: number;
  totalPullValueCents: number;
  remainingInventoryValueCents: number;
  realizedCents: number;
  gradingFeeCents: number;
  totalPositionCents: number;
  profitCents: number;
  roiPct: number | null;
  breakEvenCents: number;
  topCard: null | { id: number; cardNumber: string; player: string; bookValueCents: number };
};

type ApiData = {
  ok: boolean;
  totals: {
    completedBoxes: number;
    activeBoxes: number;
    profitableBoxes: number;
    costCents: number;
    positionCents: number;
    profitCents: number;
    gradingFeeCents: number;
    roiPct: number | null;
    profitablePct: number | null;
    bestBox: null | { id: number; productName: string; roiPct: number | null; profitCents: number };
  };
  active: BoxRow[];
  completed: BoxRow[];
  productPerformance: {
    productId: string;
    productName: string;
    boxes: number;
    profitableBoxes: number;
    costCents: number;
    positionCents: number;
    profitCents: number;
    roiPct: number | null;
    profitablePct: number | null;
  }[];
};

type SortKey = "date" | "roi" | "profit" | "position" | "cost";

function money(cents: number) { return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }); }
function signedMoney(cents: number) { return `${cents > 0 ? "+" : ""}${money(cents)}`; }
function pct(value: number | null) { return value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`; }

function BoxCard({ box }: { box: BoxRow }) {
  const progress = box.packsPurchased > 0 ? Math.min(100, Math.round((box.packsOpened / box.packsPurchased) * 100)) : 0;
  const image = box.product.boxImageUrl || box.product.packImageUrl;

  return (
    <Link href={`/analytics/boxes/${box.id}`} className="analytics-box-card">
      <div className="analytics-box-art">{image ? <img src={image} alt="" /> : <strong>VCS</strong>}</div>
      <div>
        <div className="analytics-box-title">{box.productName}</div>
        <div className="analytics-box-sub">{box.packsOpened}/{box.packsPurchased} packs{box.topCard ? ` · Top pull: ${box.topCard.player} ${money(box.topCard.bookValueCents)}` : ""}</div>
        {!box.isClosed ? (
          <>
            <div className="analytics-progress"><span style={{ width: `${progress}%` }} /></div>
            <div className="analytics-box-sub">{box.breakEvenCents > 0 ? `${money(box.breakEvenCents)} to break even` : `${signedMoney(box.profitCents)} ahead of cost`}</div>
          </>
        ) : null}
      </div>
      <div className="analytics-box-metrics">
        <div><div className="analytics-mini-label">Cost</div><div className="analytics-mini-value">{money(box.purchasePriceCents)}</div></div>
        <div><div className="analytics-mini-label">Position</div><div className="analytics-mini-value">{money(box.totalPositionCents)}</div></div>
        <div><div className="analytics-mini-label">{box.isClosed ? "ROI" : "P/L"}</div><div className={`analytics-mini-value ${box.profitCents >= 0 ? "analytics-positive" : "analytics-negative"}`}>{box.isClosed ? pct(box.roiPct) : signedMoney(box.profitCents)}</div></div>
      </div>
    </Link>
  );
}

export default function BoxesClient() {
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("date");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/analytics/boxes", { cache: "no-store" });
        const json = await response.json();
        if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Couldn't load Box Portfolio.");
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load Box Portfolio.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const completed = useMemo(() => {
    const rows = [...(data?.completed ?? [])];
    rows.sort((a, b) => {
      if (sort === "roi") return (b.roiPct ?? -Infinity) - (a.roiPct ?? -Infinity);
      if (sort === "profit") return b.profitCents - a.profitCents;
      if (sort === "position") return b.totalPositionCents - a.totalPositionCents;
      if (sort === "cost") return b.purchasePriceCents - a.purchasePriceCents;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return rows;
  }, [data, sort]);

  return (
    <main className="analytics-suite-page">
      <div className="analytics-suite-shell">
        <AnalyticsTabs />

        <header className="analytics-masthead">
          <div>
            <div className="analytics-eyebrow">Rip Performance</div>
            <h1 className="analytics-heading">Box Portfolio</h1>
            <div className="analytics-subtitle">Follow active boxes separately from completed investments, then compare true position value, profit, ROI, and product performance.</div>
          </div>
          <Link href="/shop" className="vcs-button vcs-button-primary vcs-button-compact">Buy Boxes →</Link>
        </header>

        {error ? <div className="vcs-notice vcs-notice-danger">{error}</div> : null}

        {!data ? (
          <div className="vcs-state vcs-state-loading"><span className="vcs-state-mark" /><div className="vcs-state-body"><div className="vcs-state-title">Loading box portfolio</div></div></div>
        ) : (
          <>
            <section className="analytics-stat-grid">
              <div className="analytics-stat"><div className="analytics-mini-label">Completed</div><div className="analytics-stat-value">{data.totals.completedBoxes}</div></div>
              <div className="analytics-stat"><div className="analytics-mini-label">Cost</div><div className="analytics-stat-value">{money(data.totals.costCents)}</div></div>
              <div className="analytics-stat"><div className="analytics-mini-label">Position</div><div className="analytics-stat-value">{money(data.totals.positionCents)}</div></div>
              <div className="analytics-stat"><div className="analytics-mini-label">Profit / Loss</div><div className={`analytics-stat-value ${data.totals.profitCents >= 0 ? "analytics-positive" : "analytics-negative"}`}>{signedMoney(data.totals.profitCents)}</div></div>
            </section>

            <section className="analytics-section analytics-stat-grid">
              <div className="analytics-stat"><div className="analytics-mini-label">ROI</div><div className={`analytics-stat-value ${data.totals.profitCents >= 0 ? "analytics-positive" : "analytics-negative"}`}>{pct(data.totals.roiPct)}</div></div>
              <div className="analytics-stat"><div className="analytics-mini-label">Profitable Boxes</div><div className="analytics-stat-value">{data.totals.profitablePct == null ? "—" : `${data.totals.profitablePct.toFixed(0)}%`}</div></div>
              <div className="analytics-stat"><div className="analytics-mini-label">Active</div><div className="analytics-stat-value">{data.totals.activeBoxes}</div></div>
              <div className="analytics-stat"><div className="analytics-mini-label">Best Box</div><div className="analytics-stat-value" style={{ fontSize: 13 }}>{data.totals.bestBox ? pct(data.totals.bestBox.roiPct) : "—"}</div></div>
            </section>

            <section className="analytics-section analytics-panel analytics-panel-pad">
              <div className="analytics-section-head"><div><h2 className="analytics-section-title">Active Boxes</h2><div className="analytics-section-copy">Active boxes stay out of headline ROI until every pack has been opened.</div></div></div>
              <div className="analytics-box-grid">
                {data.active.map((box) => <BoxCard box={box} key={box.id} />)}
                {data.active.length === 0 ? <div className="analytics-empty">No active boxes right now.</div> : null}
              </div>
            </section>

            <section className="analytics-section analytics-panel analytics-panel-pad">
              <div className="analytics-section-head">
                <div><h2 className="analytics-section-title">Completed Boxes</h2><div className="analytics-section-copy">Position value equals realized proceeds plus remaining card inventory, less grading fees when calculating profit.</div></div>
                <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} style={{ minHeight: 34, padding: "6px 9px", fontSize: 11, fontWeight: 900 }}>
                  <option value="date">Newest</option><option value="roi">Best ROI</option><option value="profit">Best Profit</option><option value="position">Position Value</option><option value="cost">Cost</option>
                </select>
              </div>
              <div className="analytics-box-grid">
                {completed.map((box) => <BoxCard box={box} key={box.id} />)}
                {completed.length === 0 ? <div className="analytics-empty">Finish opening a box and its final performance will appear here.</div> : null}
              </div>
            </section>

            <section className="analytics-section analytics-panel">
              <div style={{ padding: "13px 14px 10px" }}><h2 className="analytics-section-title">Product Performance</h2><div className="analytics-section-copy">Completed-box results grouped by product.</div></div>
              <div className="analytics-product-list">
                {data.productPerformance.map((product) => (
                  <div className="analytics-product-row" key={product.productId}>
                    <div><div className="analytics-box-title">{product.productName}</div><div className="analytics-box-sub">{product.boxes} completed box{product.boxes === 1 ? "" : "es"}</div></div>
                    <div><div className="analytics-mini-label">ROI</div><div className={`analytics-mini-value ${product.profitCents >= 0 ? "analytics-positive" : "analytics-negative"}`}>{pct(product.roiPct)}</div></div>
                    <div><div className="analytics-mini-label">Profitable</div><div className="analytics-mini-value">{product.profitablePct == null ? "—" : `${product.profitablePct.toFixed(0)}%`}</div></div>
                    <div><div className="analytics-mini-label">P/L</div><div className={`analytics-mini-value ${product.profitCents >= 0 ? "analytics-positive" : "analytics-negative"}`}>{signedMoney(product.profitCents)}</div></div>
                  </div>
                ))}
                {data.productPerformance.length === 0 ? <div className="analytics-empty">Product results will appear after boxes are completed.</div> : null}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
''')

replace(
    "src/app/analytics/boxes/[boxId]/box-detail-client.tsx",
    '''import Link from "next/link";\nimport { useEffect, useMemo, useState } from "react";''',
    '''import Link from "next/link";\nimport { useEffect, useMemo, useState } from "react";\nimport AnalyticsTabs from "@/components/analytics/AnalyticsTabs";'''
)

replace(
    "src/app/analytics/boxes/[boxId]/box-detail-client.tsx",
    '''      <div className="boxDetailWrap">\n        <Link href="/analytics/boxes" className="vcs-back-link">''',
    '''      <div className="boxDetailWrap">\n        <AnalyticsTabs />\n        <Link href="/analytics/boxes" className="vcs-back-link">'''
)

print("Frontend analytics refresh prepared.")
