"use client";

import Link from "next/link";
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
      <main className="page">
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
      <main className="page">
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
    <main className="page">
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

        <section className="history">
          <div className="historyHeader">
            <h2>Bid History</h2>
            <span>{auction.bids.length} bids</span>
          </div>

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
        </section>
      </section>

      <Styles />
    </main>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .page {
        min-height: 100vh;
        padding: 22px;
        background:
          radial-gradient(circle at top left, rgba(245, 158, 11, 0.22), transparent 34%),
          radial-gradient(circle at top right, rgba(79, 70, 229, 0.18), transparent 30%),
          linear-gradient(135deg, #0f172a 0%, #111827 52%, #1f2937 100%);
        color: #f8fafc;
      }

      .hero,
      .layout,
      .notice,
      .empty {
        max-width: 1180px;
        margin-left: auto;
        margin-right: auto;
      }

      .hero {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
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
      input {
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

      .layout {
        display: grid;
        grid-template-columns: minmax(280px, 0.82fr) minmax(320px, 1fr);
        gap: 16px;
      }

      .itemCard,
      .auctionPanel,
      .history {
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.95);
        color: #0f172a;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
        overflow: hidden;
      }

      .itemCard {
        align-self: start;
      }

      .imageWrap {
        position: relative;
        height: 430px;
        background:
          radial-gradient(circle at top, rgba(251, 191, 36, 0.32), transparent 36%),
          linear-gradient(135deg, #e5e7eb, #f8fafc);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 22px;
      }

      .imageWrap img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 18px 24px rgba(15, 23, 42, 0.22));
        border-radius: 12px;
      }

      .imageFallback {
        width: 180px;
        height: 250px;
        border-radius: 20px;
        display: grid;
        place-items: center;
        background: rgba(15, 23, 42, 0.08);
        color: rgba(15, 23, 42, 0.45);
        font-weight: 950;
      }

      .badges,
      .statusRow {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }

      .badges {
        position: absolute;
        top: 14px;
        left: 14px;
        right: 14px;
      }

      .tier,
      .gradeBadge,
      .statusPill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 7px 10px;
        font-size: 12px;
        font-weight: 950;
        border: 1px solid transparent;
        box-shadow: 0 10px 22px rgba(15, 23, 42, 0.12);
      }

      .gradeBadge,
      .statusPill {
        background: rgba(15, 23, 42, 0.9);
        color: #fff;
      }

      .tierCold {
        background: #e0f2fe;
        color: #0369a1;
        border-color: #bae6fd;
      }

      .tierSoft {
        background: #f1f5f9;
        color: #475569;
        border-color: #cbd5e1;
      }

      .tierNormal {
        background: #dcfce7;
        color: #15803d;
        border-color: #bbf7d0;
      }

      .tierStrong {
        background: #fef3c7;
        color: #b45309;
        border-color: #fde68a;
      }

      .tierHot {
        background: #ffedd5;
        color: #c2410c;
        border-color: #fed7aa;
      }

      .tierWar {
        background: #fae8ff;
        color: #a21caf;
        border-color: #f5d0fe;
      }

      .itemBody {
        padding: 18px;
      }

      .itemBody h2,
      .historyHeader h2 {
        margin: 0;
        font-size: 22px;
        line-height: 1.1;
        letter-spacing: -0.04em;
      }

      .itemBody p {
        margin: 8px 0 0;
        color: #64748b;
        font-size: 13px;
        font-weight: 800;
      }

      .itemActions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 9px;
        margin-top: 16px;
      }

      .auctionPanel {
        padding: 18px;
      }

      .currentBid {
        margin: 20px 0 16px;
      }

      .currentBid span {
        display: block;
        color: #64748b;
        font-size: 12px;
        font-weight: 950;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .currentBid strong {
        display: block;
        font-size: clamp(42px, 9vw, 74px);
        letter-spacing: -0.08em;
        line-height: 0.98;
        margin-top: 6px;
      }

      .currentBid p {
        color: #64748b;
        font-weight: 850;
        margin: 10px 0 0;
      }

      .statsGrid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 9px;
      }

      .statsGrid div {
        border-radius: 17px;
        background: #f8fafc;
        border: 1px solid #e5e7eb;
        padding: 13px;
      }

      .statsGrid span {
        display: block;
        font-size: 11px;
        color: #94a3b8;
        font-weight: 950;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 5px;
      }

      .statsGrid strong {
        display: block;
        font-size: 15px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .bidBox {
        margin-top: 14px;
        border-radius: 20px;
        border: 1px solid #e5e7eb;
        background: #f8fafc;
        padding: 15px;
      }

      .bidBox label {
        display: block;
        font-size: 12px;
        font-weight: 950;
        color: #334155;
        margin-bottom: 9px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .bidBox p {
        margin: 10px 0 0;
        color: #64748b;
        font-size: 13px;
        line-height: 1.45;
        font-weight: 750;
      }

      .bidInputRow {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 9px;
      }

      input {
        width: 100%;
        min-width: 0;
        border: 1px solid #cbd5e1;
        border-radius: 16px;
        padding: 12px 13px;
        outline: none;
        font-weight: 950;
        color: #0f172a;
        background: #fff;
      }

      .primaryButton,
      .secondaryButton {
        display: inline-flex;
        justify-content: center;
        align-items: center;
        text-decoration: none;
        border-radius: 16px;
        padding: 12px 13px;
        font-weight: 950;
        border: 0;
        cursor: pointer;
        white-space: nowrap;
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
        opacity: 0.6;
        cursor: not-allowed;
      }

      .fullButton {
        width: 100%;
        margin-top: 12px;
      }

      .mutedBox {
        background: #f1f5f9;
      }

      .history {
        grid-column: 1 / -1;
        padding: 18px;
      }

      .historyHeader {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }

      .historyHeader span {
        color: #64748b;
        font-weight: 900;
      }

      .timeline {
        display: grid;
        gap: 8px;
      }

      .timelineItem {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        border: 1px solid #e5e7eb;
        background: #f8fafc;
        border-radius: 17px;
        padding: 12px;
      }

      .myBid {
        border-color: #fde68a;
        background: #fffbeb;
      }

      .timelineItem strong,
      .timelineItem span {
        display: block;
      }

      .timelineItem span {
        color: #64748b;
        font-size: 12px;
        font-weight: 800;
        margin-top: 3px;
      }

      .timelineAmount {
        text-align: right;
      }

      .noBids {
        border-radius: 18px;
        background: #f8fafc;
        border: 1px solid #e5e7eb;
        padding: 20px;
        text-align: center;
      }

      .noBids h3 {
        margin: 0;
      }

      .noBids p {
        margin: 8px 0 0;
        color: #64748b;
      }

      .notice {
        border-radius: 18px;
        padding: 12px 14px;
        margin-bottom: 14px;
        font-weight: 850;
      }

      .error {
        border: 1px solid rgba(248, 113, 113, 0.35);
        background: rgba(127, 29, 29, 0.35);
        color: #fecaca;
      }

      .success {
        border: 1px solid rgba(52, 211, 153, 0.35);
        background: rgba(6, 78, 59, 0.35);
        color: #bbf7d0;
      }

      .empty {
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.08);
        padding: 44px 20px;
        text-align: center;
      }

      .empty h1 {
        font-size: 32px;
      }

      .empty p {
        color: rgba(248, 250, 252, 0.68);
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

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (max-width: 860px) {
        .layout {
          grid-template-columns: 1fr;
        }

        .imageWrap {
          height: 360px;
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
          width: 100%;
          margin-top: 14px;
        }

        .statsGrid,
        .itemActions,
        .bidInputRow {
          grid-template-columns: 1fr;
        }

        .imageWrap {
          height: 300px;
        }

        .timelineItem {
          align-items: flex-start;
        }
      }
    `}</style>
  );
}