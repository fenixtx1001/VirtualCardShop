"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./auction-house.css";

type AuctionView = "mine" | "house";
type AuctionDisplayMode = "cards" | "table";
type AuctionSection = "live" | "completed";

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
  globalReadyToCollect?: number;
  globalReadyPayoutCents?: number;
  globalUnsoldCount?: number;
  truncatedSort?: boolean;
  completedTotals?: null | { count: number; totalCents: number; averageCents: number; highCents: number };
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

type RecentActivityRow = {
  id: number;
  auctionId: number;
  cardId: number;
  amountCents: number;
  maxBidCents: number | null;
  percentOfValueBps: number;
  tier: AuctionRow["tier"];
  tierLabel: string;
  bidderType: "HUMAN" | "DUMMY";
  bidderName: string;
  isMine: boolean;
  createdAt: string;
  auctionStatus: "ACTIVE" | "ENDED" | "COLLECTED" | "CANCELLED";
  timeLeftLabel: string;
  grade: number;
  gradeLabel: string;
  card: {
    id: number;
    title: string;
    player: string;
    cardNumber: string;
    frontImageUrl: string | null;
    set: {
      year: number | null;
      brand: string | null;
      sport: string | null;
      name: string | null;
    };
  };
};

type AuctionsResponse = {
  summary: AuctionSummary;
  auctions: AuctionRow[];
  recentActivity?: RecentActivityRow[];
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

function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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

function activityTierClass(tier: AuctionRow["tier"]) {
  switch (tier) {
    case "COLD":
      return "activityTier activityCold";
    case "SOFT":
      return "activityTier activitySoft";
    case "NORMAL":
      return "activityTier activityNormal";
    case "STRONG":
      return "activityTier activityStrong";
    case "HOT":
      return "activityTier activityHot";
    case "BIDDING_WAR":
      return "activityTier activityWar";
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
  const [section, setSection] = useState<AuctionSection>("live");
  const [view, setView] = useState<AuctionView>("mine");
  const [sort, setSort] = useState<AuctionSort>("endingSoonest");
  const [search, setSearch] = useState("");
  const [sport, setSport] = useState("");
  const [grade, setGrade] = useState("all");
  const [data, setData] = useState<AuctionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<AuctionDisplayMode>("cards");
  const [activityOpen, setActivityOpen] = useState(false);
  const [mineStatus, setMineStatus] = useState<"active" | "ready">("active");
  const [historyView, setHistoryView] = useState<AuctionView>("mine");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [collectingAll, setCollectingAll] = useState(false);
  const [collectProgress, setCollectProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(48);
  const collectingRef = useRef(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => { const id = setTimeout(() => setDebouncedSearch(search.trim()), 300); return () => clearTimeout(id); }, [search]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("view", section === "completed" ? historyView : view);
    params.set("sort", sort);
    params.set("limit", String(visibleLimit));
    params.set("status", section === "completed" ? "COLLECTED" : view === "house" ? "ACTIVE" : mineStatus === "ready" ? "ENDED" : "ACTIVE");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sport.trim()) params.set("sport", sport.trim());
    if (grade !== "all") params.set("grade", grade);
    return params.toString();
  }, [section, view, historyView, mineStatus, sort, debouncedSearch, sport, grade, visibleLimit]);

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

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("vcs-auction-display-mode");
      if (saved === "cards" || saved === "table") setDisplayMode(saved);
    } catch {
      // Ignore localStorage failures.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("vcs-auction-display-mode", displayMode);
    } catch {
      // Ignore localStorage failures.
    }
  }, [displayMode]);

  async function collectAuction(auctionId: number) {
    if (collectingRef.current) return;
    collectingRef.current = true;
    setBusyId(auctionId);
    setNotice(null);
    setError(null);

    try {
      const res = await fetch(`/api/auctions/${auctionId}/collect`, {
        method: "POST",
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Unable to collect auction.");
      }

      setNotice("Auction collected successfully.");
      window.dispatchEvent(new Event("vcs:economy-changed"));
      window.dispatchEvent(new Event("vcs:collection-changed"));
      await loadAuctions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to collect auction.");
    } finally {
      setBusyId(null);
      collectingRef.current = false;
    }
  }

  async function collectAll() {
    if (collectingRef.current) return;
    collectingRef.current = true;
    setCollectingAll(true);
    setCollectProgress(0);
    setNotice(null);
    setError(null);
    let afterId = 0;
    let collected = 0;
    let payoutCents = 0;
    let unsold = 0;
    let failed = 0;
    const issues: string[] = [];
    try {
      for (let round = 0; round < 150; round += 1) {
        const res = await fetch("/api/auctions/collect-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ afterId }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "Collection batch failed.");
        collected += json.settled ?? 0;
        payoutCents += json.payoutCents ?? 0;
        unsold += json.unsoldReturned ?? 0;
        failed += json.failed ?? 0;
        setCollectProgress(collected);
        for (const row of json.results ?? []) {
          if (!row.ok && issues.length < 3) issues.push(
            "#" + row.auctionId + ": " + (row.error || "Collection failed")
          );
        }
        if (!json.hasMore) break;
        if (!Number.isSafeInteger(json.nextCursor) || json.nextCursor <= afterId)
          throw new Error("Collection progress stopped unexpectedly.");
        afterId = json.nextCursor;
      }
      setNotice(collected + " auctions collected · " + money(payoutCents) +
        " credited" + (unsold ? " · " + unsold + " unsold cards returned" : ""));
      if (issues.length) setError(failed + " auctions need attention: " + issues.join("; "));
      if (collected) {
        window.dispatchEvent(new Event("vcs:economy-changed"));
        window.dispatchEvent(new Event("vcs:collection-changed"));
      }
    } catch (e) {
      setError((e instanceof Error ? e.message : "Unable to finish collecting.") +
        (collected ? " " + collected + " auctions were already collected successfully." : ""));
    } finally {
      collectingRef.current = false;
      setCollectingAll(false);
      await loadAuctions();
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

  const auctions = data?.auctions ?? [];
  const recentActivity = data?.recentActivity ?? [];

  const completedTotalCents = summary.completedTotals?.totalCents ?? 0;
  const completedAverageCents = summary.completedTotals?.averageCents ?? 0;
  const completedHighCents = summary.completedTotals?.highCents ?? 0;
  return (
    <main className="page auction-house">
      <section className="hero">
        <div>
          <Link href="/" className="backLink">
            ← Home
          </Link>
          <div className="eyebrow">Marketplace</div>
          <h1>🏛️ Auction House</h1>
          <p>
            {section === "completed"
              ? "Review collected auction sales, compare final prices, and keep completed listings out of the live marketplace."
              : "List cards, watch bids climb, collect payouts, and hunt for deals across the VCS marketplace."}
          </p>
        </div>

        <button className="refreshButton" onClick={loadAuctions} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </section>

      <nav className="auctionPrimaryNav" aria-label="Auction House views">
        <button type="button" className={section === "live" && view === "mine" ? "auctionNavActive" : ""} onClick={() => {setSection("live");setView("mine");setVisibleLimit(48);}}>My Auctions</button>
        <button type="button" className={section === "live" && view === "house" ? "auctionNavActive" : ""} onClick={() => {setSection("live");setView("house");setVisibleLimit(48);}}>Browse</button>
        <button type="button" className={section === "completed" ? "auctionNavActive" : ""} onClick={() => {setSection("completed");setVisibleLimit(48);}}>History</button>
      </nav>
      {section === "live" && view === "mine" ? <div className="auctionSubnav">
        <button aria-pressed={mineStatus === "active"} onClick={() => {setMineStatus("active");setVisibleLimit(48);}}>Active</button>
        <button aria-pressed={mineStatus === "ready"} onClick={() => {setMineStatus("ready");setVisibleLimit(48);}}>Ready to Collect ({data?.summary.globalReadyToCollect ?? 0})</button>
      </div> : section === "completed" ? <div className="auctionSubnav">
        <button aria-pressed={historyView === "mine"} onClick={() => {setHistoryView("mine");setVisibleLimit(48);}}>My Sales</button>
        <button aria-pressed={historyView === "house"} onClick={() => {setHistoryView("house");setVisibleLimit(48);}}>Market Comps</button>
      </div> : null}
      {section === "live" && view === "mine" && (data?.summary.globalReadyToCollect ?? 0) > 0 && <section className="auctionPayoutPanel">
        <div><span className="auctionPayoutEyebrow">AUCTIONS COMPLETE</span><strong>{data?.summary.globalReadyToCollect} to collect</strong>
          <p>{money(data?.summary.globalReadyPayoutCents ?? 0)} estimated payout
            {(data?.summary.globalUnsoldCount ?? 0) > 0 ? " · " + data?.summary.globalUnsoldCount + " possibly unsold" : ""}</p></div>
        <button type="button" className="auctionCollectAll" disabled={collectingAll || busyId !== null} onClick={collectAll}>
          {collectingAll ? "Collecting… " + collectProgress : "Collect All"}
        </button>
      </section>}
      {notice && <div className="auctionSuccessNotice" role="status">{notice}</div>}

      {section === "completed" ? (
        <section className="summaryGrid">
          <div className="summaryCard">
            <span className="summaryLabel">Completed</span>
            <strong>{summary.total}</strong>
          </div>
          <div className="summaryCard">
            <span className="summaryLabel">Final Sales</span>
            <strong>{money(completedTotalCents)}</strong>
          </div>
          <div className="summaryCard">
            <span className="summaryLabel">Average Sale</span>
            <strong>{money(completedAverageCents)}</strong>
          </div>
          <div className="summaryCard">
            <span className="summaryLabel">High Sale</span>
            <strong>{money(completedHighCents)}</strong>
          </div>
        </section>
      ) : (
        <section className="summaryGrid">
          <div className="summaryCard">
            <span className="summaryLabel">{view === "mine" && mineStatus === "ready" ? "Completed" : "Active"}</span>
            <strong>{view === "mine" && mineStatus === "ready" ? summary.ended : summary.active}</strong>
          </div>
          <div className="summaryCard">
            <span className="summaryLabel">
              {view === "mine" ? "Ready to Collect" : "You're Winning"}
            </span>
            <strong>{view === "mine" ? summary.globalReadyToCollect ?? summary.readyToCollect : summary.winningCount}</strong>
          </div>
          <div className="summaryCard">
            <span className="summaryLabel">Current Bid Value</span>
            <strong>{money(summary.currentBidTotalCents)}</strong>
          </div>
        </section>
      )}

      <section className="viewToolbar">
        <div>
          <strong>{displayMode === "cards" ? "Card View" : "Table View"}</strong>
          <span>
            {section === "completed"
              ? displayMode === "cards"
                ? "Browse collected sales and completed comps."
                : "Scan completed auction prices quickly."
              : displayMode === "cards"
                ? "Best for browsing and enjoying the cards."
                : "Best for quickly scanning larger auction batches."}
          </span>
        </div>
        <div className="viewToggle">
          <button className={displayMode === "cards" ? "toggleButton activeToggle" : "toggleButton"} onClick={() => setDisplayMode("cards")}>
            Cards
          </button>
          <button className={displayMode === "table" ? "toggleButton activeToggle" : "toggleButton"} onClick={() => setDisplayMode("table")}>
            Table
          </button>
        </div>
      </section>

      <section className={filtersOpen ? "controls auctionFiltersOpen" : "controls"}>
        <button type="button" className="auctionFiltersButton" aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(v => !v)}>☷ Filters {grade !== "all" || sport ? "•" : ""}</button>
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
          className="sport auctionExtraFilter"
        />

        <select value={grade} onChange={(e) => setGrade(e.target.value)} className="select auctionExtraFilter">
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

      {error ? <div className="error" role="alert">{error}</div> : null}

      {loading ? (
        <section className="empty">
          <div className="spinner" />
          <h2>Loading auctions...</h2>
          <p>Checking for fresh bids and recently ended auctions.</p>
        </section>
      ) : data && data.auctions.length > 0 ? (
        displayMode === "table" ? (
          <section className="tableShell">
            <table className="auctionTable">
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Grade</th>
                  <th>{section === "completed" ? "Final Price" : "Current Bid"}</th>
                  <th>Bid %</th>
                  <th>Tier</th>
                  <th>{section === "completed" ? "Winner" : "High Bidder"}</th>
                  <th>{section === "completed" ? "Collected" : "Time"}</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.auctions.map((auction) => (
                  <tr key={auction.id} className={`tableRow ${auction.tier.toLowerCase()}`}>
                    <td>
                      <div className="tableCardCell">
                        <div className="tableThumb">
                          {auction.card.frontImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={auction.card.frontImageUrl} alt={auction.card.player} />
                          ) : (
                            <span>🏛️</span>
                          )}
                        </div>
                        <div>
                          <strong>{cardTitle(auction.card)}</strong>
                          <span>{setLine(auction.card)}</span>
                        </div>
                      </div>
                    </td>
                    <td>{auction.gradeLabel}</td>
                    <td className="moneyCell">{money(auction.currentBidCents)}</td>
                    <td>{percent(auction.percentOfValueBps)}</td>
                    <td><span className={tierClass(auction.tier)}>{auction.tierLabel}</span></td>
                    <td>{section === "completed" ? auction.winnerName || auction.highBidder || "VCS buyer" : auction.highBidder || "No bids yet"}</td>
                    <td>{section === "completed" ? timeAgo(auction.collectedAt ?? auction.endedAt ?? auction.endsAt) : auction.timeLeftLabel}</td>
                    <td>
                      <div className="tableActions">
                        <Link href={`/cards/${auction.cardId}`} className="miniButton secondaryMini">Card</Link>
                        {view === "mine" && auction.canCollect ? (
                          <button className="miniButton primaryMini" onClick={() => collectAuction(auction.id)} disabled={collectingAll || busyId !== null}>
                            {busyId === auction.id ? "..." : "Collect"}
                          </button>
                        ) : view === "house" && auction.status === "ACTIVE" ? (
                          <Link href={`/auctions/${auction.id}`} className="miniButton primaryMini">Bid</Link>
                        ) : (
                          <Link href={`/auctions/${auction.id}`} className="miniButton primaryMini">View</Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
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
                      <span>{section === "completed" ? "Final Price" : "Current Bid"}</span>
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
                      <span>{section === "completed" ? "Collected" : "Time"}</span>
                      <strong>{section === "completed" ? timeAgo(auction.collectedAt ?? auction.endedAt ?? auction.endsAt) : auction.timeLeftLabel}</strong>
                    </div>
                    <div>
                      <span>{section === "completed" ? "Winner" : "High Bidder"}</span>
                      <strong>{section === "completed" ? auction.winnerName || auction.highBidder || "VCS buyer" : auction.highBidder || "No bids yet"}</strong>
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
                        disabled={collectingAll || busyId !== null}
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
        )
      ) : (
        <section className="empty">
          <div className="emptyIcon">🏛️</div>
          <h2>
            {section === "completed"
              ? view === "mine"
                ? "No completed auctions yet"
                : "No completed marketplace sales found"
              : view === "mine"
                ? "No auctions listed yet"
                : "No active auctions found"}
          </h2>
          <p>
            {section === "completed"
              ? view === "mine"
                ? "Collected auction sales will move here automatically after you collect the payout."
                : "Completed marketplace sales will appear here as collected auctions create comps."
              : view === "mine"
                ? "Once you list cards or slabs for auction, you’ll track bids and collect payouts here."
                : "Try changing your search or filters, or check back after other collectors list cards."}
          </p>
        </section>
      )}
      {!loading && data && summary.total > data.auctions.length &&
        <div className="auctionLoadMore">
          <span>Showing {data.auctions.length} of {summary.total}</span>
          <button disabled={visibleLimit >= 240 || loading} onClick={() => setVisibleLimit(v => Math.min(240, v + 48))}>
            {visibleLimit >= 240 ? "Refine filters" : "Show More"}
          </button>
        </div>}
      {summary.truncatedSort ? <p className="auctionHint">Percentage-based sort covers the first 2,000 matching auctions. Narrow filters for older listings.</p> : null}

      <section className={activityOpen ? "activityPanel openActivity" : "activityPanel"}>
        <button className="activityHeader" onClick={() => setActivityOpen((current) => !current)}>
          <span>
            <strong>Recent Activity</strong>
            <small>
              {recentActivity.length
                ? section === "completed"
                  ? `${recentActivity.length} final bid records from collected auctions`
                  : `${recentActivity.length} latest bids across ${view === "mine" ? "your listings" : "the marketplace"}`
                : section === "completed"
                  ? "No completed bid history yet"
                  : "No recent bids yet"}
            </small>
          </span>
          <span className="chevron">{activityOpen ? "Collapse" : "Expand"}</span>
        </button>

        {activityOpen ? (
          recentActivity.length ? (
            <div className="activityList">
              {recentActivity.slice(0, 10).map((activity) => (
                <Link key={activity.id} href={`/auctions/${activity.auctionId}`} className="activityItem">
                  <div className="activityThumb">
                    {activity.card.frontImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={activity.card.frontImageUrl} alt={activity.card.player} />
                    ) : (
                      <span>🏛️</span>
                    )}
                  </div>
                  <div className="activityCopy">
                    <div className="activityLead">
                      <strong>{activity.bidderName}</strong>
                      <span>bid {money(activity.amountCents)}</span>
                    </div>
                    <div className="activityCardLine">{activity.card.title}</div>
                    <div className="activityMetaLine">
                      <span className={activityTierClass(activity.tier)}>{activity.tierLabel}</span>
                      <span>{activity.gradeLabel}</span>
                      <span>{percent(activity.percentOfValueBps)} of value</span>
                      <span>{timeAgo(activity.createdAt)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="activityEmpty">No bids have landed here yet. Check back after the next refresh.</div>
          )
        ) : null}
      </section>


    </main>
  );
}