"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type AuctionView = "mine" | "house";
type AuctionSort =
  | "endingSoonest"
  | "newest"
  | "highestBid"
  | "lowestBid"
  | "highestValue"
  | "bestDeal"
  | "hottest";

type AuctionSummary = {
  view: AuctionView;
  total: number;
  active: number;
  ended: number;
  readyToCollect: number;
  currentBidTotalCents: number;
  winningCount: number;
};

type AuctionRow = {
  id: number;
  sellerUserId: string;
  sellerName: string;
  winnerUserId: string | null;
  winnerName: string | null;
  cardId: number;
  grade: number;
  gradeLabel: string;
  isSlab: boolean;
  status: "ACTIVE" | "ENDED" | "COLLECTED" | "CANCELLED";
  startingBidCents: number;
  currentBidCents: number;
  valueBasisCents: number;
  percentOfValueBps: number;
  tier: "COLD" | "SOFT" | "NORMAL" | "STRONG" | "HOT" | "BIDDING_WAR";
  tierLabel: string;
  minimumNextBidCents: number;
  highBidder: string | null;
  isWinning: boolean;
  hasEnded: boolean;
  canCollect: boolean;
  createdAt: string;
  endsAt: string;
  endedAt: string | null;
  collectedAt: string | null;
  timeLeftLabel: string;
  card: {
    id: number;
    player: string;
    cardNumber: string;
    team: string | null;
    subset: string | null;
    variant: string | null;
    frontImageUrl: string | null;
    backImageUrl: string | null;
    set: {
      id: string;
      year: number | null;
      brand: string | null;
      sport: string | null;
    };
    productSet: {
      id: string;
      name: string | null;
      product: {
        id: string;
        year: number | null;
        brand: string | null;
        sport: string | null;
      } | null;
    } | null;
  };
};

type AuctionsResponse = {
  summary: AuctionSummary;
  auctions: AuctionRow[];
};

const SORT_OPTIONS: { value: AuctionSort; label: string }[] = [
  { value: "endingSoonest", label: "Ending soonest" },
  { value: "newest", label: "Newest listed" },
  { value: "highestBid", label: "Highest bid" },
  { value: "lowestBid", label: "Lowest bid" },
  { value: "highestValue", label: "Highest value" },
  { value: "bestDeal", label: "Best deal" },
  { value: "hottest", label: "Hottest" },
];

const GRADE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "0", label: "Raw" },
  { value: "6", label: "VCS 6" },
  { value: "7", label: "VCS 7" },
  { value: "8", label: "VCS 8" },
  { value: "9", label: "VCS 9" },
  { value: "10", label: "VCS 10" },
];

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((Number.isFinite(cents) ? cents : 0) / 100);
}

function percent(bps: number) {
  const safe = Number.isFinite(bps) ? bps : 0;
  return `${(safe / 100).toFixed(safe % 100 === 0 ? 0 : 1)}%`;
}

function tierClass(tier: AuctionRow["tier"]) {
  switch (tier) {
    case "COLD":
      return "tier tierCold";
    case "SOFT":
      return "tier tierSoft";
    case "NORMAL":
      return "tier tierNormal";
    case "STRONG":
      return "tier tierStrong";
    case "HOT":
      return "tier tierHot";
    case "BIDDING_WAR":
      return "tier tierWar";
  }
}


function cardTierClass(tier: AuctionRow["tier"]) {
  switch (tier) {
    case "COLD":
      return "auctionCard heatCold";
    case "SOFT":
      return "auctionCard heatSoft";
    case "NORMAL":
      return "auctionCard heatNormal";
    case "STRONG":
      return "auctionCard heatStrong";
    case "HOT":
      return "auctionCard heatHot";
    case "BIDDING_WAR":
      return "auctionCard heatWar";
  }
}

function cardTitle(card: AuctionRow["card"]) {
  const detail = [card.team, card.subset, card.variant].filter(Boolean).join(" · ");
  return detail ? `${card.player} · ${detail}` : card.player;
}

function setLine(card: AuctionRow["card"]) {
  const product = card.productSet?.product;
  const year = product?.year ?? card.set.year;
  const brand = product?.brand ?? card.set.brand;
  const setName = card.productSet?.name;

  return [year, brand, setName, `#${card.cardNumber}`].filter(Boolean).join(" · ");
}

export default function AuctionsClient() {
  const [view, setView] = useState<AuctionView>("mine");
  const [sort, setSort] = useState<AuctionSort>("endingSoonest");
  const [search, setSearch] = useState("");
  const [sport, setSport] = useState("");
  const [grade, setGrade] = useState("all");
  const [data, setData] = useState<AuctionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("view", view);
    params.set("sort", sort);
    params.set("limit", "72");
    if (search.trim()) params.set("search", search.trim());
    if (sport.trim()) params.set("sport", sport.trim());
    if (grade !== "all") params.set("grade", grade);
    return params.toString();
  }, [view, sort, search, sport, grade]);

  const loadAuctions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/auctions?${query}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Unable to load auctions.");
      }

      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load auctions.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    loadAuctions();
  }, [loadAuctions]);

  async function collectAuction(auctionId: number) {
    setBusyId(auctionId);
    setError(null);

    try {
      const res = await fetch(`/api/auctions/${auctionId}/collect`, {
        method: "POST",
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Unable to collect auction.");
      }

      await loadAuctions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to collect auction.");
    } finally {
      setBusyId(null);
    }
  }

  const summary = data?.summary ?? {
    view,
    total: 0,
    active: 0,
    ended: 0,
    readyToCollect: 0,
    currentBidTotalCents: 0,
    winningCount: 0,
  };

  return (
    <main className="page">
      <section className="hero">
        <div>
          <Link href="/" className="backLink">
            ← Home
          </Link>
          <div className="eyebrow">Marketplace</div>
          <h1>🏛️ Auction House</h1>
          <p>
            List cards, watch bids climb, collect payouts, and hunt for deals across the VCS
            marketplace.
          </p>
        </div>

        <button className="refreshButton" onClick={loadAuctions} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </section>

      <section className="tabs">
        <button
          className={view === "mine" ? "tab activeTab" : "tab"}
          onClick={() => setView("mine")}
        >
          <span>My Auctions</span>
          <small>{summary.readyToCollect} collect</small>
        </button>
        <button
          className={view === "house" ? "tab activeTab" : "tab"}
          onClick={() => setView("house")}
        >
          <span>Auction House</span>
          <small>{summary.winningCount} winning</small>
        </button>
      </section>

      <section className="summaryGrid">
        <div className="summaryCard">
          <span className="summaryLabel">Active</span>
          <strong>{summary.active}</strong>
        </div>
        <div className="summaryCard">
          <span className="summaryLabel">
            {view === "mine" ? "Ready to Collect" : "You're Winning"}
          </span>
          <strong>{view === "mine" ? summary.readyToCollect : summary.winningCount}</strong>
        </div>
        <div className="summaryCard">
          <span className="summaryLabel">Current Bid Value</span>
          <strong>{money(summary.currentBidTotalCents)}</strong>
        </div>
      </section>

      <section className="controls">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player, team, set, card #..."
          className="search"
        />

        <input
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          placeholder="Sport"
          className="sport"
        />

        <select value={grade} onChange={(e) => setGrade(e.target.value)} className="select">
          {GRADE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select value={sort} onChange={(e) => setSort(e.target.value as AuctionSort)} className="select">
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </section>

      {error ? <div className="error">{error}</div> : null}

      {loading ? (
        <section className="empty">
          <div className="spinner" />
          <h2>Loading auctions...</h2>
          <p>Checking for fresh bids and recently ended auctions.</p>
        </section>
      ) : data && data.auctions.length > 0 ? (
        <section className="grid">
          {data.auctions.map((auction) => (
            <article key={auction.id} className={cardTierClass(auction.tier)}>
              <div className="imageWrap">
                {auction.card.frontImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={auction.card.frontImageUrl} alt={auction.card.player} />
                ) : (
                  <div className="imageFallback">No Image</div>
                )}

                <div className="badges">
                  <span className={tierClass(auction.tier)}>{auction.tierLabel}</span>
                  <span className="gradeBadge">{auction.gradeLabel}</span>
                </div>
              </div>

              <div className="cardBody">
                <div>
                  <h2>{cardTitle(auction.card)}</h2>
                  <p className="setLine">{setLine(auction.card)}</p>
                </div>

                <div className="bidPanel">
                  <div>
                    <span>Current Bid</span>
                    <strong>{money(auction.currentBidCents)}</strong>
                  </div>
                  <div>
                    <span>Value Basis</span>
                    <strong>{money(auction.valueBasisCents)}</strong>
                  </div>
                  <div>
                    <span>Bid %</span>
                    <strong>{percent(auction.percentOfValueBps)}</strong>
                  </div>
                </div>

                <div className="metaGrid">
                  <div>
                    <span>Time</span>
                    <strong>{auction.timeLeftLabel}</strong>
                  </div>
                  <div>
                    <span>High Bidder</span>
                    <strong>{auction.highBidder || "No bids yet"}</strong>
                  </div>
                </div>

                <div className="actions">
                  <Link href={`/cards/${auction.cardId}`} className="secondaryButton">
                    Card Details
                  </Link>

                  {view === "mine" && auction.canCollect ? (
                    <button
                      className="primaryButton"
                      onClick={() => collectAuction(auction.id)}
                      disabled={busyId === auction.id}
                    >
                      {busyId === auction.id ? "Collecting..." : "Collect Cash"}
                    </button>
                  ) : view === "house" && auction.status === "ACTIVE" ? (
                    <Link href={`/auctions/${auction.id}`} className="primaryButton">
                      Bid
                    </Link>
                  ) : (
                    <Link href={`/auctions/${auction.id}`} className="primaryButton">
                      View
                    </Link>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="empty">
          <div className="emptyIcon">🏛️</div>
          <h2>{view === "mine" ? "No auctions listed yet" : "No active auctions found"}</h2>
          <p>
            {view === "mine"
              ? "Once you list cards or slabs for auction, you’ll track bids and collect payouts here."
              : "Try changing your search or filters, or check back after other collectors list cards."}
          </p>
        </section>
      )}

      <style jsx>{`
        .page {
          min-height: 100vh;
          padding: 22px;
          background:
            radial-gradient(circle at top left, rgba(245, 158, 11, 0.22), transparent 34%),
            radial-gradient(circle at top right, rgba(79, 70, 229, 0.18), transparent 30%),
            linear-gradient(135deg, #0f172a 0%, #111827 52%, #1f2937 100%);
          color: #f8fafc;
        }

        .hero {
          max-width: 1180px;
          margin: 0 auto 18px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
        }

        .backLink {
          display: inline-flex;
          margin-bottom: 18px;
          color: rgba(248, 250, 252, 0.72);
          text-decoration: none;
          font-size: 13px;
          font-weight: 800;
        }

        .eyebrow {
          color: #fbbf24;
          font-size: 12px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          font-weight: 900;
          margin-bottom: 8px;
        }

        h1 {
          margin: 0;
          font-size: clamp(34px, 7vw, 64px);
          letter-spacing: -0.06em;
          line-height: 0.95;
        }

        .hero p {
          max-width: 680px;
          margin: 14px 0 0;
          color: rgba(248, 250, 252, 0.72);
          font-size: 15px;
          line-height: 1.55;
        }

        .refreshButton,
        .primaryButton,
        .secondaryButton,
        .tab,
        .select,
        .search,
        .sport {
          font: inherit;
        }

        .refreshButton {
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          border-radius: 999px;
          padding: 11px 16px;
          font-weight: 900;
          cursor: pointer;
        }

        .tabs,
        .summaryGrid,
        .controls,
        .grid,
        .empty,
        .error {
          max-width: 1180px;
          margin-left: auto;
          margin-right: auto;
        }

        .tabs {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }

        .tab {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(248, 250, 252, 0.76);
          border-radius: 22px;
          padding: 14px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          font-weight: 950;
        }

        .tab small {
          color: rgba(248, 250, 252, 0.55);
          font-weight: 900;
        }

        .activeTab {
          color: #111827;
          background: linear-gradient(135deg, #fbbf24, #f97316);
          border-color: rgba(251, 191, 36, 0.72);
          box-shadow: 0 18px 42px rgba(245, 158, 11, 0.24);
        }

        .activeTab small {
          color: rgba(17, 24, 39, 0.72);
        }

        .summaryGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }

        .summaryCard {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 16px;
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.18);
        }

        .summaryLabel {
          display: block;
          color: rgba(248, 250, 252, 0.6);
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.09em;
          margin-bottom: 8px;
        }

        .summaryCard strong {
          font-size: 24px;
          letter-spacing: -0.04em;
        }

        .controls {
          display: grid;
          grid-template-columns: minmax(0, 1.8fr) minmax(110px, 0.6fr) minmax(110px, 0.6fr) minmax(170px, 0.9fr);
          gap: 10px;
          margin-bottom: 18px;
        }

        .search,
        .sport,
        .select {
          width: 100%;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(15, 23, 42, 0.82);
          color: #fff;
          border-radius: 16px;
          padding: 12px 13px;
          outline: none;
          font-weight: 800;
        }

        .search::placeholder,
        .sport::placeholder {
          color: rgba(248, 250, 252, 0.42);
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .auctionCard {
          position: relative;
          overflow: hidden;
          border-radius: 28px;
          background: rgba(255, 255, 255, 0.96);
          color: #0f172a;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
          border: 1px solid rgba(255, 255, 255, 0.3);
        }

        .auctionCard::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.95;
          border-radius: inherit;
          border-left: 8px solid transparent;
          z-index: 2;
        }

        .heatCold {
          box-shadow: 0 24px 70px rgba(2, 132, 199, 0.18);
        }

        .heatCold::before {
          border-left-color: #38bdf8;
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.16), transparent 34%);
        }

        .heatSoft::before {
          border-left-color: #94a3b8;
          background: linear-gradient(135deg, rgba(148, 163, 184, 0.16), transparent 34%);
        }

        .heatNormal {
          box-shadow: 0 24px 70px rgba(16, 185, 129, 0.18);
        }

        .heatNormal::before {
          border-left-color: #34d399;
          background: linear-gradient(135deg, rgba(52, 211, 153, 0.18), transparent 34%);
        }

        .heatStrong {
          box-shadow: 0 26px 74px rgba(245, 158, 11, 0.24);
        }

        .heatStrong::before {
          border-left-color: #f59e0b;
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.22), transparent 38%);
        }

        .heatHot {
          box-shadow: 0 28px 82px rgba(249, 115, 22, 0.34);
        }

        .heatHot::before {
          border-left-color: #f97316;
          background: linear-gradient(135deg, rgba(249, 115, 22, 0.28), transparent 42%);
        }

        .heatWar {
          box-shadow:
            0 30px 88px rgba(192, 38, 211, 0.36),
            0 0 0 1px rgba(217, 70, 239, 0.35);
        }

        .heatWar::before {
          border-left-color: #d946ef;
          background:
            radial-gradient(circle at top left, rgba(217, 70, 239, 0.3), transparent 42%),
            linear-gradient(135deg, rgba(244, 114, 182, 0.18), transparent 48%);
        }

        .imageWrap {
          position: relative;
          height: 310px;
          background:
            radial-gradient(circle at top, rgba(251, 191, 36, 0.32), transparent 36%),
            linear-gradient(135deg, #e5e7eb, #f8fafc);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
        }

        .imageWrap img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 18px 24px rgba(15, 23, 42, 0.22));
          border-radius: 12px;
        }

        .imageFallback {
          width: 160px;
          height: 220px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          background: rgba(15, 23, 42, 0.08);
          color: rgba(15, 23, 42, 0.45);
          font-weight: 950;
        }

        .badges {
          position: absolute;
          top: 14px;
          left: 14px;
          right: 14px;
          display: flex;
          justify-content: space-between;
          gap: 8px;
          z-index: 3;
        }

        .tier,
        .gradeBadge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 1000;
          border: 1px solid transparent;
          box-shadow: 0 10px 22px rgba(15, 23, 42, 0.16);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .gradeBadge {
          background: rgba(15, 23, 42, 0.92);
          color: #fff;
        }

        .tierCold {
          background: linear-gradient(135deg, #e0f2fe, #bae6fd);
          color: #075985;
          border-color: #7dd3fc;
        }

        .tierSoft {
          background: linear-gradient(135deg, #f8fafc, #e2e8f0);
          color: #475569;
          border-color: #cbd5e1;
        }

        .tierNormal {
          background: linear-gradient(135deg, #dcfce7, #bbf7d0);
          color: #166534;
          border-color: #86efac;
        }

        .tierStrong {
          background: linear-gradient(135deg, #fef3c7, #fcd34d);
          color: #92400e;
          border-color: #f59e0b;
        }

        .tierHot {
          background: linear-gradient(135deg, #ffedd5, #fb923c);
          color: #7c2d12;
          border-color: #f97316;
        }

        .tierWar {
          background: linear-gradient(135deg, #fae8ff, #f0abfc);
          color: #86198f;
          border-color: #d946ef;
        }

        .cardBody {
          padding: 18px;
        }

        .cardBody h2 {
          margin: 0;
          font-size: 20px;
          line-height: 1.1;
          letter-spacing: -0.04em;
        }

        .setLine {
          margin: 7px 0 0;
          color: #64748b;
          font-size: 13px;
          font-weight: 800;
        }

        .bidPanel {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin: 16px 0 10px;
        }

        .bidPanel div,
        .metaGrid div {
          border-radius: 16px;
          background: #f8fafc;
          padding: 11px;
          border: 1px solid #e5e7eb;
        }

        .bidPanel span,
        .metaGrid span {
          display: block;
          font-size: 11px;
          font-weight: 950;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 5px;
        }

        .bidPanel strong,
        .metaGrid strong {
          display: block;
          font-size: 14px;
          letter-spacing: -0.03em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .metaGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
          margin-top: 14px;
        }

        .primaryButton,
        .secondaryButton {
          display: inline-flex;
          justify-content: center;
          align-items: center;
          text-decoration: none;
          border-radius: 16px;
          padding: 12px 10px;
          font-weight: 950;
          border: 0;
          cursor: pointer;
        }

        .primaryButton {
          background: linear-gradient(135deg, #111827, #334155);
          color: #fff;
        }

        .secondaryButton {
          background: #f1f5f9;
          color: #0f172a;
          border: 1px solid #e2e8f0;
        }

        .primaryButton:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .empty {
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 28px;
          background: rgba(255, 255, 255, 0.08);
          padding: 44px 20px;
          text-align: center;
        }

        .emptyIcon {
          font-size: 44px;
          margin-bottom: 10px;
        }

        .empty h2 {
          margin: 0;
          font-size: 24px;
        }

        .empty p {
          margin: 10px auto 0;
          max-width: 520px;
          color: rgba(248, 250, 252, 0.65);
        }

        .spinner {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 4px solid rgba(255, 255, 255, 0.16);
          border-top-color: #fbbf24;
          margin: 0 auto 14px;
          animation: spin 0.85s linear infinite;
        }

        .error {
          border: 1px solid rgba(248, 113, 113, 0.35);
          background: rgba(127, 29, 29, 0.35);
          color: #fecaca;
          border-radius: 18px;
          padding: 12px 14px;
          margin-bottom: 14px;
          font-weight: 850;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 980px) {
          .grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .controls {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 640px) {
          .page {
            padding: 14px;
          }

          .hero {
            display: block;
          }

          .refreshButton {
            margin-top: 14px;
            width: 100%;
          }

          .tabs,
          .summaryGrid,
          .controls,
          .grid {
            grid-template-columns: 1fr;
          }

          .auctionCard {
            border-radius: 24px;
          }

          .imageWrap {
            height: 270px;
          }

          .bidPanel {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}