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
