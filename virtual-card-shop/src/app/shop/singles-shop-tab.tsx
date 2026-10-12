// src/app/shop/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { YourCardsPicker } from "./your-cards-picker";

const ECONOMY_CHANGED_EVENT = "vcs:economy-changed";

type SinglesSortKey = "default" | "price_asc" | "price_desc";

type OfferCard = {
  id: number;
  player: string;
  cardNumber: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  bookValue: number;
  frontImageUrl: string | null;
  productSetId: string | null;
};

type ShopOfferRow = {
  id: number;
  userId: string;
  cardId: number;
  offerBps: number;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  rejectedAt?: string | null;
  acceptedQty?: number | null;
  acceptedTotalCents?: number | null;
  card?: OfferCard;
};

type ShopInventoryCard = {
  id: number;
  player: string;
  team: string | null;
  cardNumber: string;
  subset: string | null;
  variant: string | null;
  bookValue: number;
  frontImageUrl: string | null;
  productSetId: string | null;
  friendlySetName?: string | null;
  friendlyProductLabel?: string | null;
  sport?: string | null;
  year?: number | null;
  isBase?: boolean | null;
};

type ShopInventoryRow = {
  cardId: number;
  quantity: number;
  updatedAt?: string;
  youOwnQty: number;
  pendingQty?: number;
  prestigeNextLevel?: number | null;
  neededForPrestige?: boolean;
  card: ShopInventoryCard;
};

type OfferSellBucket = {
  grade: number;
  gradeLabel: string;
  qtyOwned: number;
  perCardValueCents: number;
  rawBookValueCents: number;
  totalBucketValueCents: number;
};

function centsToDollars(cents: number | null | undefined) {
  const c = typeof cents === "number" ? cents : 0;
  return (c / 100).toFixed(2);
}

function safeImgSrc(url: string | null | undefined) {
  const u = (url ?? "").trim();
  return u.length ? u : null;
}

function formatFriendlyProductName(productId: string) {
  const s = String(productId || "").trim();
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function formatFriendlyProductSetLabel(card: ShopInventoryCard) {
  const setName = (card.friendlySetName ?? "").trim();
  const productLabel = (card.friendlyProductLabel ?? "").trim();

  if (setName && productLabel) return `${productLabel} • ${setName}`;
  if (setName) return setName;
  if (card.productSetId) return formatFriendlyProductName(card.productSetId);
  return "—";
}

function compactMetaLine(parts: Array<string | null | undefined>) {
  return parts.map((x) => (x ?? "").trim()).filter(Boolean).join(" • ");
}

function pctBpsToText(bps: number) {
  const pct = bps / 100;
  return `${pct.toFixed(2)}%`;
}

function fmtOfferLine(o: ShopOfferRow) {
  const player = o.card?.player ?? `Card #${o.cardId}`;
  const num = o.card?.cardNumber ? ` #${o.card.cardNumber}` : "";
  return `${player}${num}`;
}

export default function SinglesShopTab() {
  const [offers, setOffers] = useState<ShopOfferRow[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersErr, setOffersErr] = useState<string | null>(null);
  const [offersMsg, setOffersMsg] = useState<string | null>(null);
  const [singlesMode, setSinglesMode] = useState<"buy" | "sell">("buy");

  const [requestCardId, setRequestCardId] = useState<string>("");
  const [requesting, setRequesting] = useState(false);

  const [sellQty, setSellQty] = useState<Record<number, number>>({});
  const [sellGrade, setSellGrade] = useState<Record<number, number>>({});
  const [sellBuckets, setSellBuckets] = useState<Record<number, OfferSellBucket[]>>({});
  const [bucketLoading, setBucketLoading] = useState<Record<number, boolean>>({});
  const [sellingOfferId, setSellingOfferId] = useState<number | null>(null);
  const [rejectingOfferId, setRejectingOfferId] = useState<number | null>(null);

  const [invRows, setInvRows] = useState<ShopInventoryRow[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [invErr, setInvErr] = useState<string | null>(null);

  const [invQ, setInvQ] = useState("");
  const [invPage, setInvPage] = useState(1);
  const [invTotalPages, setInvTotalPages] = useState(1);
  const [invTotal, setInvTotal] = useState(0);
  const [invSort, setInvSort] = useState<SinglesSortKey | "recent" | "name">("default");
  const [onlyNeed, setOnlyNeed] = useState(false);
  const [invSport, setInvSport] = useState("");
  const [invYear, setInvYear] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [checkout, setCheckout] = useState<ShopInventoryRow | null>(null);
  const [checkoutQty, setCheckoutQty] = useState(1);
  const [buyingCardId, setBuyingCardId] = useState<number | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [selectedCardName, setSelectedCardName] = useState("");
  const [clock, setClock] = useState(Date.now());
  const requestSeq = useRef(0);
  const purchaseDialog = useRef<HTMLDialogElement>(null);

  async function loadOffers() {
    setOffersLoading(true);
    setOffersErr(null);
    setOffersMsg(null);
    try {
      const res = await fetch("/api/shop/singles/offers", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Failed to load offers (${res.status})`);
      setOffers(Array.isArray(j?.offers) ? (j.offers as ShopOfferRow[]) : []);
    } catch (e: any) {
      setOffersErr(e?.message ?? "Failed to load offers");
    } finally {
      setOffersLoading(false);
    }
  }


  async function loadInventory(
    page = 1, q = invQ, sort = invSort, needOnly = onlyNeed,
    sport = invSport, year = invYear, append = false
  ) {
    const seq = ++requestSeq.current;
    setInvLoading(true);
    setInvErr(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "24", sort });
      if (q.trim()) params.set("q", q.trim());
      if (needOnly) params.set("onlyNeed", "1");
      if (sport) params.set("sport", sport);
      if (/^\d{4}$/.test(year)) params.set("year", year);
      const res = await fetch("/api/shop/singles/inventory?" + params, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Couldn't load singles.");
      if (seq !== requestSeq.current) return;
      const next = Array.isArray(j.rows) ? j.rows as ShopInventoryRow[] : [];
      setInvRows(prev => append ? [...prev, ...next.filter(x => !prev.some(p => p.cardId === x.cardId))] : next);
      setInvPage(j.page ?? page);
      setInvTotalPages(j.totalPages ?? 1);
      setInvTotal(j.total ?? 0);
    } catch (error) {
      if (seq === requestSeq.current) setInvErr(error instanceof Error ? error.message : "Couldn't load singles.");
    } finally {
      if (seq === requestSeq.current) setInvLoading(false);
    }
  }

  useEffect(() => { void loadOffers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = setTimeout(() => { void loadInventory(1, invQ, invSort, onlyNeed, invSport, invYear); }, 280);
    return () => clearTimeout(timer);
  }, [invQ, invSort, onlyNeed, invSport, invYear]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (singlesMode !== "sell") return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [singlesMode]);
  useEffect(() => {
    const dialog = purchaseDialog.current;
    if (!dialog) return;
    if (checkout && !dialog.open) dialog.showModal();
    if (!checkout && dialog.open) dialog.close();
  }, [checkout]);

  useEffect(() => {
    for (const offer of offers) {
      if (!sellBuckets[offer.id] && !bucketLoading[offer.id]) {
        loadSellBucketsForOffer(offer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers]);

  async function requestOffer() {
    const cardId = Number(requestCardId);
    if (!Number.isFinite(cardId) || cardId <= 0) {
      setOffersErr("Enter a valid Card ID.");
      return;
    }

    setRequesting(true);
    setOffersErr(null);
    setOffersMsg(null);

    try {
      const res = await fetch("/api/shop/singles/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Non-JSON from offers (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Offer request failed (${res.status})`);

      setOffersMsg(j?.reused ? "Offer already active for that card (reused)." : "Offer created. Accept it, reject it, or let it expire; the card will be locked from new shop offers for 24 hours after a pass/expiry.");
      setRequestCardId("");
      await loadOffers();
    } catch (e: any) {
      setOffersErr(e?.message ?? "Offer request failed");
    } finally {
      setRequesting(false);
    }
  }

  async function loadSellBucketsForOffer(o: ShopOfferRow) {
    setBucketLoading((prev) => ({ ...prev, [o.id]: true }));

    try {
      const res = await fetch(`/api/shop/my-cards/${o.cardId}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok || j?.ok !== true) throw new Error(j?.error ?? "Failed to load sell buckets.");

      const rows = Array.isArray(j.rows) ? j.rows : [];
      const buckets: OfferSellBucket[] = rows
        .map((r: any) => ({
          grade: typeof r.grade === "number" ? r.grade : 0,
          gradeLabel: String(r.gradeLabel ?? (Number(r.grade) === 0 ? "Raw" : `VCS ${r.grade}`)),
          qtyOwned: Math.max(0, Math.floor(Number(r.qtyOwned ?? 0))),
          perCardValueCents: Math.max(0, Math.floor(Number(r.perCardValueCents ?? 0))),
          rawBookValueCents: Math.max(0, Math.floor(Number(r.rawBookValueCents ?? 0))),
          totalBucketValueCents: Math.max(0, Math.floor(Number(r.totalBucketValueCents ?? 0))),
        }))
        .filter((b: OfferSellBucket) => b.qtyOwned > 0)
        .sort((a: OfferSellBucket, b: OfferSellBucket) => a.grade - b.grade);

      setSellBuckets((prev) => ({ ...prev, [o.id]: buckets }));

      setSellGrade((prev) => {
        const current = prev[o.id];
        if (typeof current === "number" && buckets.some((b) => b.grade === current)) return prev;
        const raw = buckets.find((b) => b.grade === 0);
        const first = raw ?? buckets[0];
        if (!first) return prev;
        return { ...prev, [o.id]: first.grade };
      });
    } catch (e: any) {
      setOffersErr(e?.message ?? "Failed to load sell buckets.");
      setSellBuckets((prev) => ({ ...prev, [o.id]: [] }));
    } finally {
      setBucketLoading((prev) => ({ ...prev, [o.id]: false }));
    }
  }


  async function rejectOffer(offerId: number) {
    const ok = window.confirm("Reject this shop offer? You will not be able to request another offer for this card for 24 hours.");
    if (!ok) return;

    setRejectingOfferId(offerId);
    setOffersErr(null);
    setOffersMsg(null);

    try {
      const res = await fetch("/api/shop/singles/offers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, action: "reject" }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Non-JSON from reject (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Reject failed (${res.status})`);

      setOffersMsg("Offer rejected. This card is locked from new shop offers for 24 hours.");

      setSellBuckets((prev) => {
        const next = { ...prev };
        delete next[offerId];
        return next;
      });

      await loadOffers();
    } catch (e: any) {
      setOffersErr(e?.message ?? "Reject failed");
    } finally {
      setRejectingOfferId(null);
    }
  }

  async function sellOffer(offerId: number) {
    const q = Math.max(1, Math.floor(sellQty[offerId] ?? 1));
    const grade = typeof sellGrade[offerId] === "number" ? sellGrade[offerId] : 0;
    const offer = offers.find(o => o.id === offerId);
    const bucket = (sellBuckets[offerId] ?? []).find(b => b.grade === grade);
    if (!offer || !bucket || q > bucket.qtyOwned) {
      setOffersErr("Choose an available grade and quantity.");
      return;
    }
    const bps = offer.offerBps + (grade === 0 ? 0 : 1000);
    const expectedTotalCents = Math.round(bucket.perCardValueCents * q * bps / 10000);

    setSellingOfferId(offerId);
    setOffersErr(null);
    setOffersMsg(null);

    try {
      const res = await fetch("/api/shop/singles/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, quantity: q, grade, expectedTotalCents }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Non-JSON from sell (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Sell failed (${res.status})`);

      setOffersMsg(
        `Sold ${j.gradeLabel ?? (grade === 0 ? "Raw" : `VCS ${grade}`)} x${j.quantity} for $${centsToDollars(
          j.totalCents
        )} @ ${pctBpsToText(j.offerBps)}.`
      );

      window.dispatchEvent(new CustomEvent(ECONOMY_CHANGED_EVENT));

      setSellBuckets((prev) => {
        const next = { ...prev };
        delete next[offerId];
        return next;
      });

      await loadOffers();
      await loadInventory(1, invQ, invSort, onlyNeed, invSport, invYear);
    } catch (e: any) {
      setOffersErr(e?.message ?? "Sell failed");
    } finally {
      setSellingOfferId(null);
    }
  }


  async function buySingle(cardId: number, quantity: number, expectedUnitPriceCents: number) {
    if (buyingCardId !== null) return;
    setBuyingCardId(cardId);
    setCheckoutError(null);
    try {
      const res = await fetch("/api/shop/singles/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, quantity, expectedUnitPriceCents }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Purchase failed.");
      setOffersMsg("Added " + j.quantity + (j.quantity === 1 ? " card" : " cards") +
        " to your collection for $" + centsToDollars(j.totalCents) + ".");
      setCheckout(null);
      window.dispatchEvent(new CustomEvent(ECONOMY_CHANGED_EVENT));
      await loadInventory(1, invQ, invSort, onlyNeed, invSport, invYear);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Purchase failed.");
    } finally {
      setBuyingCardId(null);
    }
  }

  const checkoutPrice = checkout ? Math.round(Number(checkout.card.bookValue || 0) * 100) : 0;
  const checkoutMax = checkout ? checkout.quantity : 1;
  const checkoutValid = checkout !== null && Number.isInteger(checkoutQty) &&
    checkoutQty >= 1 && checkoutQty <= checkoutMax && checkoutPrice > 0;

  const activeCount = offers.length;

  return (
    <section className="singles-market">
      <div className="singles-topline">
        <span className="shop-eyebrow">THE COLLECTOR'S DISPLAY CASE</span>
        <h2>Singles</h2>
        <p>Find the missing piece. Buy at book value or sell through a 24-hour offer.</p>
      </div>
      <nav className="singles-mode-tabs" aria-label="Singles shop">
        <button type="button" aria-current={singlesMode === "buy" ? "page" : undefined}
          onClick={() => setSinglesMode("buy")}>Buy singles</button>
        <button type="button" aria-current={singlesMode === "sell" ? "page" : undefined}
          onClick={() => setSinglesMode("sell")}>
          Sell cards{activeCount > 0 ? <span className="singles-tab-count">{activeCount}</span> : null}
        </button>
      </nav>
      {offersMsg && <div role="status" className="singles-notice">
        <span>{offersMsg}</span><button type="button" onClick={() => setOffersMsg(null)} aria-label="Dismiss">×</button>
      </div>}

      {singlesMode === "buy" ? (
        <section className="singles-catalog" aria-labelledby="singles-catalog-title">
          <div className="singles-catalog-heading">
            <div><span className="shop-eyebrow">IN THE DISPLAY CASE</span>
              <h3 id="singles-catalog-title">Available singles</h3></div>
            <span className="singles-count">{invTotal.toLocaleString()} cards</span>
          </div>
          <div className="singles-searchbar">
            <label className="singles-search">
              <span aria-hidden="true" className="singles-search-icon">⌕</span>
              <input type="search" value={invQ} onChange={e => setInvQ(e.target.value)}
                placeholder="Search players, sets, teams, card #…" aria-label="Search shop singles" />
            </label>
            <button className="singles-filter-toggle" type="button" onClick={() => setFilterOpen(!filterOpen)}
              aria-expanded={filterOpen} aria-controls="singles-extra-filters">
              Filters{invSport || invYear ? " •" : ""}
              <span aria-hidden="true">{filterOpen ? "−" : "+"}</span>
            </button>
          </div>
          <div className="singles-quick-row">
            <div className="singles-pills" role="group" aria-label="Collection filters">
              <button type="button" className={!onlyNeed ? "is-active" : ""} aria-pressed={!onlyNeed}
                onClick={() => setOnlyNeed(false)}>All cards</button>
              <button type="button" className={onlyNeed ? "is-active" : ""} aria-pressed={onlyNeed}
                onClick={() => setOnlyNeed(true)}>Not owned</button>
            </div>
            <label className="singles-sort">Sort
              <select value={invSort} onChange={e => setInvSort(e.target.value as typeof invSort)}>
                <option value="default">Most available</option>
                <option value="recent">Recently stocked</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="name">Player A–Z</option>
              </select>
            </label>
          </div>
          {filterOpen && <div id="singles-extra-filters" className="singles-extra-filters">
            <label>Sport
              <select value={invSport} onChange={e => setInvSport(e.target.value)}>
                <option value="">All sports</option>
                <option>Baseball</option><option>Basketball</option><option>Football</option>
                <option>Hockey</option><option>Soccer</option>
              </select>
            </label>
            <label>Year
              <input type="text" inputMode="numeric" maxLength={4} value={invYear}
                onChange={e => setInvYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                placeholder="All years" />
            </label>
            <button type="button" className="singles-clear" onClick={() => {
              setInvQ(""); setOnlyNeed(false); setInvSort("default"); setInvSport(""); setInvYear("");
            }}>Clear all filters</button>
          </div>}

          {invErr && <div className="singles-notice singles-notice-error" role="alert">
            <span>{invErr}</span><button type="button" onClick={() => void loadInventory(1)} aria-label="Retry loading">Retry</button>
          </div>}
          {invLoading && invRows.length === 0 ? (
            <div className="singles-merch-grid" aria-label="Loading singles">
              {Array.from({ length: 6 }, (_, x) => <div key={x} className="single-skeleton" />)}
            </div>
          ) : invRows.length === 0 && !invErr ? (
            <div className="singles-empty"><h3>No matching singles</h3>
              <p>Try another player, a broader search, or clear your filters.</p>
              <button type="button" onClick={() => {
                setInvQ(""); setOnlyNeed(false); setInvSport(""); setInvYear("");
              }}>Clear filters</button></div>
          ) : (
            <>
              <div className="singles-merch-grid" aria-busy={invLoading}>
                {invRows.map(row => {
                  const card = row.card;
                  const img = safeImgSrc(card.frontImageUrl);
                  const price = Math.round((Number(card.bookValue) || 0) * 100);
                  const setLabel = card.friendlyProductLabel || card.friendlySetName || "Trading card";
                  const details = compactMetaLine([card.team, card.subset, card.variant]);
                  return <article key={row.cardId} className="single-merch-card">
                    <Link href={"/cards/" + row.cardId} className="single-merch-art"
                      aria-label={"View " + card.player + " card details"}>
                      {img ? <img src={img} alt={card.player + " card front"} loading="lazy" decoding="async" /> :
                        <span className="single-art-placeholder"><b>VCS</b><small>NO IMAGE</small></span>}
                    </Link>
                    <div className="single-merch-info">
                      <div className="single-merch-set" title={setLabel}>{setLabel}</div>
                      <Link className="single-merch-title" href={"/cards/" + row.cardId}>
                        {card.player}{card.cardNumber ? <small>{"#" + card.cardNumber}</small> : null}
                      </Link>
                      {card.friendlySetName && card.friendlyProductLabel &&
                        card.friendlySetName !== card.friendlyProductLabel &&
                        <div className="single-merch-subset" title={card.friendlySetName}>{card.friendlySetName}</div>}
                      {details && <div className="single-merch-meta" title={details}>{details}</div>}
                      <div className="single-merch-tags">
                        <span className={row.youOwnQty ? "single-tag single-tag-owned" : "single-tag"}>
                          {row.youOwnQty ? "Own " + row.youOwnQty : "Not owned"}
                        </span>
                        {row.neededForPrestige && row.prestigeNextLevel != null &&
                          <span className="single-tag single-tag-prestige">
                            Needed · Prestige {row.prestigeNextLevel}</span>}
                      </div>
                      <div className="single-merch-bottom">
                        <div className="single-merch-value">
                          <small>{row.quantity === 1 ? "Last copy" : row.quantity.toLocaleString() + " available"}</small>
                          <strong>{price > 0 ? "$" + centsToDollars(price) : "No price"}</strong>
                        </div>
                        <button type="button" className="single-merch-buy" disabled={price <= 0}
                          onClick={() => { setCheckout(row); setCheckoutQty(1); setCheckoutError(null); }}>
                          Buy <span aria-hidden="true">↗</span>
                        </button>
                      </div>
                    </div>
                  </article>;
                })}
              </div>
              <div className="singles-pagination">
                <span>Showing {invRows.length.toLocaleString()} of {invTotal.toLocaleString()}</span>
                {invPage < invTotalPages &&
                  <button type="button" disabled={invLoading} onClick={() =>
                    void loadInventory(invPage + 1, invQ, invSort, onlyNeed, invSport, invYear, true)}>
                    {invLoading ? "Loading…" : "Load more singles"}
                  </button>}
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="singles-sell-flow">
          <div className="singles-sell-heading">
            <span className="shop-eyebrow">SELL TO THE SHOP</span>
            <h3>Turn duplicates into cash.</h3>
            <p>Choose a card, request a quote, and decide whether to accept it. Quotes last 24 hours.</p>
          </div>
          {offersErr && <div className="singles-notice singles-notice-error" role="alert">
            {offersErr}<button type="button" onClick={() => setOffersErr(null)} aria-label="Dismiss">×</button>
          </div>}
          <div className="singles-sell-panel">
            <div className="singles-section-line">
              <span className="singles-step">01</span>
              <div><h4>Choose a card</h4><p>Search your collection and select a card.</p></div>
            </div>
            <YourCardsPicker onPick={(id, cardLabel) => {
              setRequestCardId(String(id)); setSelectedCardName(cardLabel || "Card #" + id);
              setOffersErr(null);
            }} disabled={requesting} />
            {requestCardId && <div className="singles-selected">
              <span><small>Selected for quote</small><strong>{selectedCardName || "Card #" + requestCardId}</strong></span>
              <button type="button" className="singles-primary" disabled={requesting} onClick={() => void requestOffer()}>
                {requesting ? "Requesting…" : "Get 24-hour offer →"}
              </button>
            </div>}
            <details className="singles-advanced"><summary>Enter card ID manually</summary>
              <div><input aria-label="Manual card ID" type="number" inputMode="numeric"
                value={requestCardId} onChange={e => { setRequestCardId(e.target.value); setSelectedCardName(""); }}
                placeholder="Card ID" />
                <button type="button" disabled={!requestCardId || requesting} onClick={() => void requestOffer()}>Get offer</button>
              </div>
            </details>
          </div>
          <div className="singles-sell-panel">
            <div className="singles-section-line">
              <span className="singles-step">02</span>
              <div><h4>Active offers <span className="singles-offer-count">{activeCount}</span></h4>
                <p>Check payouts and expiration. Rejecting or letting an offer expire locks that card for 24 hours.</p>
              </div>
              <button type="button" className="singles-refresh" onClick={() => void loadOffers()} disabled={offersLoading}>
                {offersLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            {offersLoading && !offers.length ? <p className="singles-muted">Loading offers…</p> :
              !offers.length ? <div className="singles-empty"><h4>No active offers</h4>
                <p>Select a card above to request a quote.</p></div> :
              <div className="singles-offers-list">
                {offers.map(offer => {
                  const buckets = sellBuckets[offer.id] ?? [];
                  const selectedGrade = sellGrade[offer.id] ?? buckets.find(b => b.grade === 0)?.grade ?? buckets[0]?.grade ?? 0;
                  const selected = buckets.find(b => b.grade === selectedGrade) ?? null;
                  const qty = sellQty[offer.id] ?? 1;
                  const validQty = Number.isInteger(qty) && qty > 0 && qty <= (selected?.qtyOwned ?? 0);
                  const bps = offer.offerBps + (selectedGrade === 0 ? 0 : 1000);
                  const payout = selected ? Math.round(selected.perCardValueCents * qty * bps / 10000) : 0;
                  const left = Math.max(0, new Date(offer.expiresAt).getTime() - clock);
                  const mins = Math.ceil(left / 60000);
                  const expires = left === 0 ? "Expired — refresh" :
                    Math.floor(mins / 60) + "h " + (mins % 60) + "m left";
                  return <article className="singles-offer-card" key={offer.id}>
                    <div className="singles-offer-header">
                      <Link href={"/cards/" + offer.cardId} className="singles-offer-art">
                        {offer.card?.frontImageUrl ?
                          <img src={offer.card.frontImageUrl} alt={(offer.card.player || "Card") + " front"} loading="lazy" /> :
                          <span>VCS</span>}
                      </Link>
                      <div className="singles-offer-identity">
                        <span className="singles-offer-status">{expires}</span>
                        <Link href={"/cards/" + offer.cardId}>{fmtOfferLine(offer)}</Link>
                        <p>{compactMetaLine([offer.card?.team, offer.card?.subset, offer.card?.variant])}</p>
                        <small>Quote: {pctBpsToText(offer.offerBps)}
                          {selectedGrade !== 0 ? " + 10% graded bonus" : ""}</small>
                      </div>
                    </div>
                    <div className="singles-offer-controls">
                      <label>Version
                        <select value={String(selectedGrade)} disabled={bucketLoading[offer.id] || !buckets.length}
                          onChange={e => {
                            setSellGrade(prev => ({...prev, [offer.id]: Number(e.target.value)}));
                            setSellQty(prev => ({...prev, [offer.id]: 1}));
                          }}>
                          {bucketLoading[offer.id] ? <option value="0">Loading…</option> :
                            !buckets.length ? <option value="0">No copies</option> :
                            buckets.map(b => <option key={b.grade} value={b.grade}>
                              {b.gradeLabel} · Own {b.qtyOwned}
                            </option>)}
                        </select>
                      </label>
                      <label>Quantity
                        <input type="number" inputMode="numeric" min={1} max={selected?.qtyOwned || 1}
                          value={qty} onChange={e => setSellQty(prev => ({
                            ...prev, [offer.id]: e.target.value === "" ? 0 : Number(e.target.value)
                          }))} />
                      </label>
                      <div className="singles-payout"><small>Estimated payout</small>
                        <strong>{selected && validQty ? "$" + centsToDollars(payout) : "—"}</strong>
                      </div>
                    </div>
                    {selected && <p className="singles-offer-math">
                      {selected.gradeLabel} value {"$" + centsToDollars(selected.perCardValueCents)} per card
                      {" · "}offer {pctBpsToText(bps)}
                    </p>}
                    <div className="singles-offer-actions">
                      <button type="button" className="singles-primary" disabled={!validQty || left === 0 ||
                        !!sellingOfferId || !!rejectingOfferId || bucketLoading[offer.id] || payout <= 0}
                        onClick={() => void sellOffer(offer.id)}>
                        {sellingOfferId === offer.id ? "Selling…" : "Accept offer · $" + centsToDollars(payout)}
                      </button>
                      <button type="button" className="singles-secondary" disabled={!!sellingOfferId || !!rejectingOfferId}
                        onClick={() => void rejectOffer(offer.id)}>
                        {rejectingOfferId === offer.id ? "Rejecting…" : "Reject"}
                      </button>
                    </div>
                  </article>;
                })}
              </div>}
          </div>
        </section>
      )}

      <dialog ref={purchaseDialog} className="singles-checkout-dialog" aria-labelledby="singles-checkout-title"
        onCancel={e => { if (buyingCardId !== null) e.preventDefault(); else setCheckout(null); }}
        onClick={e => { if (e.target === e.currentTarget && buyingCardId === null) setCheckout(null); }}>
        {checkout && <div className="singles-checkout-inner">
          <div className="singles-checkout-top">
            <span className="shop-eyebrow">REVIEW YOUR SINGLE</span>
            <button type="button" className="singles-close" onClick={() => setCheckout(null)}
              aria-label="Close checkout" disabled={buyingCardId !== null}>×</button>
          </div>
          <div className="singles-checkout-card">
            <div className="singles-checkout-art">
              {checkout.card.frontImageUrl ? <img src={checkout.card.frontImageUrl} alt="Card front" /> : <span>VCS</span>}
            </div>
            <div><h3 id="singles-checkout-title">{checkout.card.player}
              {checkout.card.cardNumber ? " #" + checkout.card.cardNumber : ""}</h3>
              <p>{checkout.card.friendlyProductLabel} · {checkout.card.friendlySetName}</p>
              <span>{checkout.quantity} in stock · {checkout.youOwnQty ? "Own " + checkout.youOwnQty : "Not owned"}</span>
              {checkout.neededForPrestige && <small className="singles-checkout-prestige">
                Needed for Prestige {checkout.prestigeNextLevel}</small>}
            </div>
          </div>
          <div className="singles-checkout-row">
            <span><small>Book price per card</small><strong>{"$" + centsToDollars(checkoutPrice)}</strong></span>
            <label>Quantity
              <span className="singles-stepper">
                <button type="button" aria-label="Decrease quantity" disabled={checkoutQty <= 1 || buyingCardId !== null}
                  onClick={() => setCheckoutQty(q => Math.max(1, q - 1))}>−</button>
                <input type="number" min="1" max={checkoutMax} inputMode="numeric"
                  aria-label="Purchase quantity" value={checkoutQty} disabled={buyingCardId !== null}
                  onChange={e => setCheckoutQty(e.target.value === "" ? 0 : Number(e.target.value))}/>
                <button type="button" aria-label="Increase quantity" disabled={checkoutQty >= checkoutMax || buyingCardId !== null}
                  onClick={() => setCheckoutQty(q => Math.min(checkoutMax, Math.max(0, q) + 1))}>+</button>
              </span>
            </label>
          </div>
          <div className="singles-checkout-total"><span>Total</span>
            <strong>{checkoutValid ? "$" + centsToDollars(checkoutPrice * checkoutQty) : "—"}</strong>
          </div>
          {checkoutError && <p className="singles-checkout-error" role="alert">{checkoutError}</p>}
          {!checkoutValid && <p className="singles-checkout-error" role="alert">
            Choose a valid quantity from 1 to {checkoutMax}.
          </p>}
          <button type="button" className="singles-primary singles-checkout-submit"
            disabled={!checkoutValid || buyingCardId !== null}
            onClick={() => void buySingle(checkout.cardId, checkoutQty, checkoutPrice)}>
            {buyingCardId ? "Adding to collection…" : "Confirm purchase"}
            <span>{checkoutValid ? "$" + centsToDollars(checkoutPrice * checkoutQty) : ""}</span>
          </button>
          <p className="singles-checkout-note">Purchased singles are added as Raw copies to your collection.</p>
        </div>}
      </dialog>
    </section>
  );
}
