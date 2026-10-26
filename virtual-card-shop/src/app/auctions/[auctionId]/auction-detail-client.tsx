"use client";

import Link from "next/link";
import "./auction-detail.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type BidRow = {
  id: number;
  bidderType: "HUMAN" | "DUMMY";
  bidderName: string;
  isMine: boolean;
  amountCents: number;
  maxBidCents: number | null;
  createdAt: string;
};

type AuctionDetail = {
  id: number;
  sellerUserId: string;
  sellerName: string;
  isMine: boolean;
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
  canBid: boolean;
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
    bookValue: number;
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
  bids: BidRow[];
};

type AuctionResponse = {
  auction: AuctionDetail;
};

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

function centsFromDollarInput(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;

  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;

  return Math.round(n * 100);
}

function dateLabel(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function tierClass(tier: AuctionDetail["tier"]) {
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

function cardTitle(card: AuctionDetail["card"]) {
  const detail = [card.team, card.subset, card.variant].filter(Boolean).join(" · ");
  return detail ? `${card.player} · ${detail}` : card.player;
}

function setLine(card: AuctionDetail["card"]) {
  const product = card.productSet?.product;
  const year = product?.year ?? card.set.year;
  const brand = product?.brand ?? card.set.brand;
  const setName = card.productSet?.name;

  return [year, brand, setName, `#${card.cardNumber}`].filter(Boolean).join(" · ");
}

export default function AuctionDetailClient() {
  const params = useParams<{ auctionId?: string }>();
  const auctionId = params?.auctionId;
  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidInput, setBidInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bidCents = useMemo(() => centsFromDollarInput(bidInput), [bidInput]);

  const loadAuction = useCallback(async () => {
    if (!auctionId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/auctions/${auctionId}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as AuctionResponse | { error?: string };

      if (!res.ok || !("auction" in json)) {
        throw new Error("error" in json ? json.error || "Unable to load auction." : "Unable to load auction.");
      }

      setAuction(json.auction);
      setBidInput((current) => current || (json.auction.minimumNextBidCents / 100).toFixed(2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load auction.");
    } finally {
      setLoading(false);
    }
  }, [auctionId]);

  useEffect(() => {
    loadAuction();
  }, [loadAuction]);

  async function placeBid() {
    if (!auction || !bidCents) return;

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/auctions/${auction.id}/bid`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          maxBidCents: bidCents,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Unable to place bid.");
      }

      setMessage("Bid placed. The auction has been refreshed.");
      await loadAuction();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to place bid.");
    } finally {
      setBusy(false);
    }
  }

  async function collectAuction() {
    if (!auction) return;

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/auctions/${auction.id}/collect`, {
        method: "POST",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Unable to collect auction.");
      }

      setMessage(`Collected ${money(json?.auction?.salePriceCents ?? 0)}.`);
      await loadAuction();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to collect auction.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="page auction-detail">
        <section className="empty">
          <div className="spinner" />
          <h1>Loading auction...</h1>
          <p>Checking for fresh bids and updated auction status.</p>
        </section>
        <Styles />
      </main>
    );
  }

  if (!auction) {
    return (
      <main className="page auction-detail">
        <section className="empty">
          <h1>Auction not found</h1>
          <p>This auction may have been removed or is unavailable.</p>
          <Link href="/auctions" className="primaryButton">
            Back to Auction House
          </Link>
        </section>
        <Styles />
      </main>
    );
  }

  return (
    <main className="page auction-detail">
      <section className="hero">
        <div>
          <Link href="/auctions" className="backLink">
            ← Auction House
          </Link>
          <div className="eyebrow">Live Auction</div>
          <h1>{auction.card.player}</h1>
          <p>{setLine(auction.card)}</p>
        </div>

        <button className="refreshButton" onClick={loadAuction} disabled={busy || loading}>
          Refresh
        </button>
      </section>

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <section className="layout">
        <article className="itemCard">
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

          <div className="itemBody">
            <h2>{cardTitle(auction.card)}</h2>
            <p>{setLine(auction.card)}</p>

            <div className="itemActions">
              <Link href={`/cards/${auction.cardId}`} className="secondaryButton">
                Card Details
              </Link>
              <Link href="/auctions" className="secondaryButton">
                Browse Auctions
              </Link>
            </div>
          </div>
        </article>

        <section className="auctionPanel">
          <div className="statusRow">
            <span className={tierClass(auction.tier)}>{auction.tierLabel}</span>
            <span className="statusPill">{auction.status}</span>
          </div>

          <div className="currentBid">
            <span>Current Bid</span>
            <strong>{money(auction.currentBidCents)}</strong>
            <p>
              {percent(auction.percentOfValueBps)} of value basis · {auction.timeLeftLabel}
            </p>
          </div>

          <div className="statsGrid">
            <div>
              <span>Value Basis</span>
              <strong>{money(auction.valueBasisCents)}</strong>
            </div>
            <div>
              <span>Minimum Next Bid</span>
              <strong>{money(auction.minimumNextBidCents)}</strong>
            </div>
            <div>
              <span>High Bidder</span>
              <strong>{auction.highBidder || "No bids yet"}</strong>
            </div>
            <div>
              <span>Seller</span>
              <strong>{auction.sellerName}</strong>
            </div>
          </div>

          {auction.canBid ? (
            <div className="bidBox">
              <label htmlFor="bidInput">Your Maximum Bid</label>
              <div className="bidInputRow">
                <input
                  id="bidInput"
                  value={bidInput}
                  onChange={(e) => setBidInput(e.target.value)}
                  inputMode="decimal"
                  placeholder={(auction.minimumNextBidCents / 100).toFixed(2)}
                />
                <button
                  className="primaryButton"
                  onClick={placeBid}
                  disabled={busy || !bidCents || bidCents < auction.minimumNextBidCents}
                >
                  {busy ? "Placing..." : "Place Bid"}
                </button>
              </div>
              <p>
                Proxy bidding is enabled. Enter the most you’re willing to pay and VCS will only
                raise you as needed.
              </p>
            </div>
          ) : auction.canCollect ? (
            <div className="bidBox">
              <label>Ready to Collect</label>
              <p>This auction has ended. Collect to receive your cash and finalize the sale.</p>
              <button className="primaryButton fullButton" onClick={collectAuction} disabled={busy}>
                {busy ? "Collecting..." : `Collect ${money(auction.currentBidCents)}`}
              </button>
            </div>
          ) : (
            <div className="bidBox mutedBox">
              <label>{auction.isMine ? "Your Auction" : "Auction Status"}</label>
              <p>
                {auction.status === "ACTIVE"
                  ? auction.isMine
                    ? "You listed this card. Watch the bids climb until the auction ends."
                    : "Bidding is not currently available."
                  : auction.status === "COLLECTED"
                    ? "This auction has been collected and finalized."
                    : "This auction has ended."}
              </p>
            </div>
          )}
        </section>

        <details className="history">
          <summary className="historyHeader">
            <h2>Bid History</h2>
            <span>{auction.bids.length} bids</span>
          </summary>

          {auction.bids.length ? (
            <div className="timeline">
              {auction.bids.map((bid) => (
                <div key={bid.id} className={bid.isMine ? "timelineItem myBid" : "timelineItem"}>
                  <div>
                    <strong>{bid.bidderName}</strong>
                    <span>
                      {bid.bidderType === "DUMMY" ? "Computer bidder" : bid.isMine ? "Your bid" : "Collector"}
                    </span>
                  </div>
                  <div className="timelineAmount">
                    <strong>{money(bid.amountCents)}</strong>
                    <span>{dateLabel(bid.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="noBids">
              <h3>No bids yet</h3>
              <p>This auction is waiting for its first bid.</p>
            </div>
          )}
        </details>
      </section>
    </main>
  );
}

