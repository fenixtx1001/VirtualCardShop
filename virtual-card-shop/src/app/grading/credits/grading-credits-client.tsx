"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type SetBalance = {
  productSetId: string;
  productId: string | null;
  productName: string;
  setName: string;
  prestigeLevel: number;
  creditsEarned: number;
  creditsSpent: number;
  creditsAvailable: number;
};
type Wallet = {
  ok: boolean;
  summary: {
    totalAvailable: number;
    totalEarned: number;
    totalSpent: number;
    setsWithCredits: number;
    totalTrackedSets: number;
  };
  sets: SetBalance[];
};
type SortBy = "balance" | "prestige" | "name";
const PAGE_SIZE = 20;
function dollarCredits(n: number) {
  return "$" + Math.max(0, n).toLocaleString("en-US");
}

export default function GradingCreditsClient() {
  const [data, setData] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortBy>("balance");
  const [showExhausted, setShowExhausted] = useState(false);
  const [page, setPage] = useState(1);

  const refresh = useCallback(() => setReload(v => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/grading/credits/summary", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || !body?.ok) throw new Error(body?.error || "Unable to load credits.");
        setData(body);
      })
      .catch(e => { if (!controller.signal.aborted) setError(String(e?.message || e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  const rows = useMemo(() => {
    const q = query.toLowerCase().trim();
    const result = (data?.sets ?? []).filter(row =>
      (showExhausted || row.creditsAvailable > 0) &&
      (!q || (row.productName + " " + row.setName).toLowerCase().includes(q)),
    );
    result.sort((a, b) => sort === "name"
      ? a.productName.localeCompare(b.productName) || a.setName.localeCompare(b.setName)
      : sort === "prestige"
      ? b.prestigeLevel - a.prestigeLevel || b.creditsAvailable - a.creditsAvailable
      : b.creditsAvailable - a.creditsAvailable || b.prestigeLevel - a.prestigeLevel);
    return result;
  }, [data, query, showExhausted, sort]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(page, pageCount));
  const visible = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const changeFilter = (f: () => void) => { f(); setPage(1); };
  const total = data?.summary.totalAvailable ?? 0;

  return <main className="vcs-credit-wallet">
    <div className="vcs-credit-wallet-inner">
      <nav className="vcs-credit-backlinks" aria-label="Grading credit navigation">
        <Link href="/grading">← Grading Desk</Link>
        <Link href="/showcase?tab=prestige">Prestige overview ↗</Link>
      </nav>
      <header className="vcs-credit-header">
        <div>
          <span className="vcs-credit-eyebrow">VCS · COLLECTOR REWARDS</span>
          <h1>Grading Credits</h1>
          <p>All your Prestige-earned grading credits, organized by the exact product sets where you can spend them.</p>
        </div>
        <button type="button" onClick={refresh} disabled={loading} aria-label="Refresh grading credit balances">↻ Refresh</button>
      </header>
      {error && <p role="alert" className="vcs-credit-error">{error}</p>}
      {loading && !data ? <p role="status">Loading your grading-credit balances…</p> : null}
      {data && <section className="vcs-credit-stats" aria-label="Your grading credit balances">
        <div className="vcs-credit-primary"><small>AVAILABLE TO GRADE</small><strong>{dollarCredits(total)}</strong><span>{total.toLocaleString("en-US")} set-locked $1 credits</span></div>
        <div><small>SETS WITH CREDITS</small><strong>{data.summary.setsWithCredits}</strong><span>Eligible product sets</span></div>
        <div><small>CREDITS USED</small><strong>{dollarCredits(data.summary.totalSpent)}</strong><span>Lifetime grading discounts</span></div>
        <div><small>CREDITS EARNED</small><strong>{dollarCredits(data.summary.totalEarned)}</strong><span>From historical Prestige levels</span></div>
      </section>}
      {data && <section className="vcs-credit-inventory" aria-label="Credit balances by product set">
        <div className="vcs-credit-inventory-heading">
          <div>
            <span className="vcs-credit-eyebrow">YOUR CREDIT INVENTORY</span>
            <h2>Where can I use my credits?</h2>
          </div>
          <span>{rows.length.toLocaleString("en-US")} matching sets</span>
        </div>
        <div className="vcs-credit-controls">
          <label>Find a set
            <input type="search" value={query} onChange={e => changeFilter(() => setQuery(e.target.value))}
              placeholder="Search year, brand, sport, or insert…" />
          </label>
          <label>Sort
            <select value={sort} onChange={e => changeFilter(() => setSort(e.target.value as SortBy))}>
              <option value="balance">Most credits first</option>
              <option value="prestige">Highest Prestige</option>
              <option value="name">Product name A–Z</option>
            </select>
          </label>
          <label className="vcs-credit-show-exhausted">
            <input type="checkbox" checked={showExhausted}
              onChange={e => changeFilter(() => setShowExhausted(e.target.checked))} />
            Include exhausted balances
          </label>
        </div>
        <div className="vcs-credit-set-list">
          {visible.map(row => <article className="vcs-credit-set" key={row.productSetId}>
            <div className="vcs-credit-set-info">
              <strong>{row.productName}</strong>
              <span>{row.setName} · Prestige {row.prestigeLevel}×</span>
              <div className="vcs-credit-set-links">
                {row.productId && <Link href={"/checklist/" + encodeURIComponent(row.productId) + "?productSetId=" + encodeURIComponent(row.productSetId)}>Find cards to grade ↗</Link>}
                <Link href={"/registry/" + encodeURIComponent(row.productSetId)}>Graded Registry ↗</Link>
              </div>
            </div>
            <div className="vcs-credit-set-balance">
              <strong>{dollarCredits(row.creditsAvailable)}</strong>
              <span>{row.creditsAvailable} credit{row.creditsAvailable === 1 ? "" : "s"}</span>
            </div>
          </article>)}
          {!rows.length && <div className="vcs-credit-empty">
            {query ? "No matching product sets. Try another search." :
              showExhausted ? "No grading credits have been earned yet." :
              "No unspent credits right now. Each new Prestige level earns one $1 credit for that set."}
          </div>}
        </div>
        {pageCount > 1 && <nav className="vcs-credit-pages" aria-label="Credit inventory pages">
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage(v => Math.max(1, v - 1))}>← Previous</button>
          <span>Page {currentPage} of {pageCount}</span>
          <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(v => Math.min(pageCount, v + 1))}>Next →</button>
        </nav>}
      </section>}
      <aside className="vcs-credit-explainer">
        <strong>How credits work</strong>
        <p>Each completed Prestige level earns a $1 grading credit for that specific product set. Credits never expire and cannot be transferred or exchanged for cash. Grade a card from an eligible set to apply one credit per copy (up to $1 off each grading fee); you can opt to save your credits at checkout.</p>
      </aside>
    </div>
  </main>;
}
