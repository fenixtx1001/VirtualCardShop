// src/app/shop/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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
};

type ShopInventoryRow = {
  cardId: number;
  quantity: number;
  updatedAt?: string;
  youOwnQty: number;
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
  const [invSort, setInvSort] = useState<SinglesSortKey>("default");
  const [onlyNeed, setOnlyNeed] = useState(false);

  const [buyQty, setBuyQty] = useState<Record<number, number>>({});
  const [buyingCardId, setBuyingCardId] = useState<number | null>(null);

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
    page = invPage,
    q = invQ,
    sort = invSort,
    needOnly = onlyNeed
  ) {
    setInvLoading(true);
    setInvErr(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      params.set("page", String(page));
      params.set("pageSize", "30");
      params.set("sort", sort);
      if (needOnly) params.set("onlyNeed", "1");

      const res = await fetch(`/api/shop/singles/inventory?${params.toString()}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Failed to load inventory (${res.status})`);

      setInvRows(Array.isArray(j?.rows) ? (j.rows as ShopInventoryRow[]) : []);
      setInvTotalPages(typeof j?.totalPages === "number" ? j.totalPages : 1);
      setInvPage(typeof j?.page === "number" ? j.page : page);
      setInvTotal(typeof j?.total === "number" ? j.total : 0);
    } catch (e: any) {
      setInvErr(e?.message ?? "Failed to load shop inventory");
    } finally {
      setInvLoading(false);
    }
  }

  useEffect(() => {
    loadOffers();
    loadInventory(1, "", "default", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    setSellingOfferId(offerId);
    setOffersErr(null);
    setOffersMsg(null);

    try {
      const res = await fetch("/api/shop/singles/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, quantity: q, grade }),
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
      await loadInventory(invPage, invQ, invSort, onlyNeed);
    } catch (e: any) {
      setOffersErr(e?.message ?? "Sell failed");
    } finally {
      setSellingOfferId(null);
    }
  }

  async function buySingle(cardId: number) {
    const q = Math.max(1, Math.floor(buyQty[cardId] ?? 1));
    setBuyingCardId(cardId);
    setInvErr(null);
    setOffersMsg(null);

    try {
      const res = await fetch("/api/shop/singles/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, quantity: q }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Non-JSON from buy single (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Buy failed (${res.status})`);

      setOffersMsg(`Bought x${j.quantity} for $${centsToDollars(j.totalCents)}.`);
      window.dispatchEvent(new CustomEvent(ECONOMY_CHANGED_EVENT));
      await loadInventory(invPage, invQ, invSort, onlyNeed);
    } catch (e: any) {
      setInvErr(e?.message ?? "Buy failed");
    } finally {
      setBuyingCardId(null);
    }
  }

  const activeCount = offers.length;

  return (
    <div className={`singles-market singles-${singlesMode}`}>
      <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 6px" }}>Singles</h2>
      <div className="singles-intro">
        Buy cards at book value or sell from your collection through 24-hour shop offers.
      </div>

      <nav className="singles-mode-tabs" aria-label="Singles shop">
        <button
          aria-current={singlesMode === "buy" ? "page" : undefined}
          onClick={() => setSinglesMode("buy")}
        >
          Buy singles
        </button>
        <button
          aria-current={singlesMode === "sell" ? "page" : undefined}
          onClick={() => setSinglesMode("sell")}
        >
          Sell cards
        </button>
      </nav>

      {singlesMode === "sell" && offersErr ? (
        <div className="singles-alert singles-alert-error" style={{ marginBottom: 12, padding: 12, background: "#fee", border: "1px solid #f99", borderRadius: 12 }}>
          {offersErr}
        </div>
      ) : null}

      {offersMsg ? (
        <div className="singles-alert singles-alert-success" style={{ marginBottom: 12, padding: 12, background: "#efe", border: "1px solid #9f9", borderRadius: 12 }}>
          {offersMsg}
        </div>
      ) : null}

      <div className="singles-layout" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        <div className="singles-panel singles-sell-request" style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12, background: "#fafafa" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Request an offer</div>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>
            Active offers: <b>{activeCount}</b> • No global offer cap
          </div>

          <YourCardsPicker
            onPick={(id) => {
              setRequestCardId(String(id));
              setOffersMsg(`Selected Card ID ${id}. Now click “Get Offer (24h)”.`);
              setOffersErr(null);
            }}
            disabled={requesting}
          />

          <div style={{ height: 10 }} />

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={requestCardId}
              onChange={(e) => setRequestCardId(e.target.value)}
              placeholder="Card ID (auto-filled above, or type manually)"
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ccc", width: 320 }}
            />
            <button
              onClick={requestOffer}
              disabled={requesting}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: requesting ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: requesting ? "not-allowed" : "pointer",
              }}
            >
              {requesting ? "Requesting…" : "Get Offer (24h)"}
            </button>

            <button
              onClick={loadOffers}
              disabled={offersLoading}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: offersLoading ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: offersLoading ? "not-allowed" : "pointer",
              }}
            >
              {offersLoading ? "Loading…" : "Refresh Offers"}
            </button>
          </div>

          <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
            Tip: search your collection above (player/team/set), click “Use this card →”, then request the offer.
          </div>
        </div>

        <div className="singles-panel singles-active-offers" style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontWeight: 900 }}>Active Offers</div>
            <div style={{ fontSize: 12, color: "#666" }}>
              Accept for instant cash, or reject to clear the offer and start the 24-hour card lockout.
            </div>
          </div>

          {offersLoading ? (
            <div style={{ marginTop: 10 }}>Loading offers…</div>
          ) : offers.length === 0 ? (
            <div className="singles-empty" style={{ marginTop: 10, padding: 12, background: "#fafafa", borderRadius: 12, border: "1px solid #eee" }}>
              No active offers. Request one above.
            </div>
          ) : (
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {offers.map((o) => {
                const img = safeImgSrc(o.card?.frontImageUrl ?? null);
                const exp = new Date(o.expiresAt);
                const now = new Date();
                const minsLeft = Math.max(0, Math.floor((exp.getTime() - now.getTime()) / 60000));
                const hoursLeft = Math.floor(minsLeft / 60);
                const remMins = minsLeft % 60;
                const buckets = sellBuckets[o.id] ?? [];
                const selectedGrade =
                  typeof sellGrade[o.id] === "number"
                    ? sellGrade[o.id]
                    : buckets.find((b) => b.grade === 0)?.grade ?? buckets[0]?.grade ?? 0;
                const selectedBucket = buckets.find((b) => b.grade === selectedGrade) ?? buckets[0] ?? null;
                const selectedQty = Math.max(1, Math.floor(sellQty[o.id] ?? 1));
                const effectiveBps = selectedGrade === 0 ? o.offerBps : o.offerBps + 1000;
                const estimatedTotal =
                  selectedBucket && selectedBucket.perCardValueCents > 0
                    ? Math.round((selectedBucket.perCardValueCents * selectedQty * effectiveBps) / 10000)
                    : null;

                return (
                  <div
                    key={o.id}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 14,
                      padding: 12,
                      background: selectedGrade === 0 ? "linear-gradient(135deg, #ffffff, #fafafa)" : "linear-gradient(135deg, #fffdf3, #fff8dd)",
                      boxShadow: "0 10px 26px rgba(15, 23, 42, 0.05)",
                      display: "grid",
                      gridTemplateColumns: "72px 1fr",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 12,
                        overflow: "hidden",
                        border: "1px solid #ddd",
                        background: "white",
                      }}
                    >
                      {img ? (
                        <img src={img} alt="Card" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontSize: 11, color: "#777" }}>
                          No image
                        </div>
                      )}
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 900 }}>{fmtOfferLine(o)}</div>
                        <div style={{ fontSize: 12, color: "#555" }}>
                          Offer: <b>{pctBpsToText(o.offerBps)}</b>
                          {selectedGrade !== 0 ? <span style={{ fontWeight: 900, color: "#8a5a00" }}> • VCS bonus: +10%</span> : null}
                          {o.card ? (
                            <>
                              {" "}• Raw Book: <b>${Number(o.card.bookValue ?? 0).toFixed(2)}</b>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div style={{ fontSize: 12, color: "#666" }}>
                        Expires in <b>{hoursLeft}h {remMins}m</b> • Offer ID: {o.id} • Card ID: {o.cardId}
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <select
                          value={String(selectedGrade)}
                          onChange={(e) => {
                            const grade = Number(e.target.value);
                            setSellGrade((prev) => ({ ...prev, [o.id]: grade }));
                          }}
                          disabled={bucketLoading[o.id] || buckets.length === 0 || sellingOfferId === o.id}
                          style={{ padding: 8, borderRadius: 10, border: "1px solid #ccc", minWidth: 150 }}
                          title="Choose which version to sell"
                        >
                          {bucketLoading[o.id] ? (
                            <option value="0">Loading grades…</option>
                          ) : buckets.length === 0 ? (
                            <option value="0">No owned copies</option>
                          ) : (
                            buckets.map((b) => (
                              <option key={`${o.id}:${b.grade}`} value={String(b.grade)}>
                                {b.gradeLabel} • Own {b.qtyOwned} • ${centsToDollars(b.perCardValueCents)}
                              </option>
                            ))
                          )}
                        </select>

                        <input
                          value={String(sellQty[o.id] ?? 1)}
                          onChange={(e) => setSellQty((prev) => ({ ...prev, [o.id]: Number(e.target.value) }))}
                          style={{ width: 80, padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
                        />

                        {selectedBucket ? (
                          <div style={{ fontSize: 12, color: "#555", fontWeight: 800 }}>
                            Value: ${centsToDollars(selectedBucket.perCardValueCents)}
                            {selectedGrade !== 0 ? " • Offer +10%" : ""}
                            {estimatedTotal !== null ? ` • Est. $${centsToDollars(estimatedTotal)}` : ""}
                          </div>
                        ) : null}

                        <button
                          onClick={() => sellOffer(o.id)}
                          disabled={sellingOfferId === o.id || bucketLoading[o.id] || buckets.length === 0 || rejectingOfferId === o.id}
                          style={{
                            padding: "9px 12px",
                            borderRadius: 10,
                            border: "1px solid #14532d",
                            background:
                              sellingOfferId === o.id || bucketLoading[o.id] || buckets.length === 0 || rejectingOfferId === o.id
                                ? "#f2f2f2"
                                : "#dcfce7",
                            color: "#14532d",
                            fontWeight: 1000,
                            cursor:
                              sellingOfferId === o.id || bucketLoading[o.id] || buckets.length === 0 || rejectingOfferId === o.id
                                ? "not-allowed"
                                : "pointer",
                          }}
                        >
                          {sellingOfferId === o.id ? "Selling…" : "Accept / Sell"}
                        </button>

                        <button
                          onClick={() => rejectOffer(o.id)}
                          disabled={rejectingOfferId === o.id || sellingOfferId === o.id}
                          style={{
                            padding: "9px 12px",
                            borderRadius: 10,
                            border: "1px solid #fecaca",
                            background: rejectingOfferId === o.id || sellingOfferId === o.id ? "#f2f2f2" : "#fff7f7",
                            color: "#991b1b",
                            fontWeight: 950,
                            cursor: rejectingOfferId === o.id || sellingOfferId === o.id ? "not-allowed" : "pointer",
                          }}
                          title="Reject this offer and lock this card from new shop offers for 24 hours"
                        >
                          {rejectingOfferId === o.id ? "Rejecting…" : "Reject"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="singles-panel singles-buy-inventory" style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12 }}>
          <div className="singles-inventory-heading">
            <div>
              <span className="shop-eyebrow">IN THE DISPLAY CASE</span>
              <h3>Singles in the shop</h3>
            </div>
            <span className="singles-inventory-count">
              {invTotal.toLocaleString()} {invTotal === 1 ? "card" : "cards"} available
            </span>
          </div>

          <div
            className="singles-inventory-tools"
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              value={invQ}
              onChange={(e) => setInvQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void loadInventory(1, invQ, invSort, onlyNeed);
              }}
              placeholder="Search players, teams, sets, card numbers…"
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ccc", minWidth: 320 }}
            />

            <select
              value={invSort}
              onChange={(e) => {
                const next = e.target.value as SinglesSortKey;
                setInvSort(next);
                void loadInventory(1, invQ, next, onlyNeed);
              }}
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ccc" }}
            >
              <option value="default">Sort: Stock / newest</option>
              <option value="price_asc">Sort: Price (low → high)</option>
              <option value="price_desc">Sort: Price (high → low)</option>
            </select>

            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ddd",
                background: "#fafafa",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={onlyNeed}
                onChange={(e) => {
                  const next = e.target.checked;
                  setOnlyNeed(next);
                  void loadInventory(1, invQ, invSort, next);
                }}
              />
              Only cards I need
            </label>

            <button
              onClick={() => loadInventory(1, invQ, invSort, onlyNeed)}
              disabled={invLoading}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: invLoading ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: invLoading ? "not-allowed" : "pointer",
              }}
            >
              {invLoading ? "Searching…" : "Search"}
            </button>

            <button
              onClick={() => {
                setInvQ("");
                setInvSort("default");
                setOnlyNeed(false);
                loadInventory(1, "", "default", false);
              }}
              disabled={invLoading}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: invLoading ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: invLoading ? "not-allowed" : "pointer",
              }}
            >
              Reset
            </button>

            <div style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>
              Showing <b>{invRows.length}</b> of <b>{invTotal}</b> • Page <b>{invPage}</b> / {invTotalPages}
            </div>

            <button
              onClick={() => {
                const next = Math.max(1, invPage - 1);
                loadInventory(next, invQ, invSort, onlyNeed);
              }}
              disabled={invLoading || invPage <= 1}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: invLoading || invPage <= 1 ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: invLoading || invPage <= 1 ? "not-allowed" : "pointer",
              }}
            >
              Prev
            </button>

            <button
              onClick={() => {
                const next = Math.min(invTotalPages, invPage + 1);
                loadInventory(next, invQ, invSort, onlyNeed);
              }}
              disabled={invLoading || invPage >= invTotalPages}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: invLoading || invPage >= invTotalPages ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: invLoading || invPage >= invTotalPages ? "not-allowed" : "pointer",
              }}
            >
              Next
            </button>
          </div>

          {invErr ? (
            <div className="singles-alert singles-alert-error" style={{ marginTop: 12, padding: 12, background: "#fee", border: "1px solid #f99", borderRadius: 12 }}>
              {invErr}
            </div>
          ) : null}

          {invLoading ? (
            <div className="singles-merch-grid singles-merch-loading" aria-label="Loading singles">
              {Array.from({ length: 10 }).map((_, index) => (
                <div className="single-merch-skeleton" key={index}>
                  <div />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : invErr ? null : invRows.length === 0 ? (
            <div className="singles-empty singles-inventory-empty">
              No cards found in the shop.
            </div>
          ) : (
            <div className="singles-merch-grid">
              {invRows.map((r) => {
                const img = safeImgSrc(r.card?.frontImageUrl ?? null);
                const priceCents = Math.round((Number(r.card.bookValue ?? 0) || 0) * 100);
                const detailsLine = compactMetaLine([r.card.team, r.card.subset, r.card.variant]);
                const setLine = formatFriendlyProductSetLabel(r.card);
                const requestedQty = buyQty[r.cardId] ?? 1;
                const selectedQty = Number.isFinite(requestedQty)
                  ? Math.max(1, Math.min(r.quantity, Math.floor(requestedQty)))
                  : 1;
                const totalCents = priceCents * selectedQty;

                return (
                  <article className="single-merch-card" key={r.cardId}>
                    <div className="single-merch-art">
                      {img ? (
                        <img
                          src={img}
                          alt={`${r.card.player}${r.card.cardNumber ? ` #${r.card.cardNumber}` : ""}`}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="single-merch-placeholder">
                          <span>VCS</span>
                          <small>IMAGE UNAVAILABLE</small>
                        </div>
                      )}

                      {r.youOwnQty > 0 ? (
                        <span className="single-owned-badge">YOU OWN {r.youOwnQty}</span>
                      ) : null}

                      <span className={`single-stock-badge ${r.quantity === 1 ? "single-stock-last" : ""}`}>
                        {r.quantity === 1 ? "LAST COPY" : `${r.quantity} AVAILABLE`}
                      </span>
                    </div>

                    <div className="single-merch-body">
                      <div className="single-merch-set" title={setLine}>
                        {setLine}
                      </div>

                      <h3>
                        {r.card.player}
                        {r.card.cardNumber ? <small>#{r.card.cardNumber}</small> : null}
                      </h3>

                      {detailsLine ? <p>{detailsLine}</p> : <p className="single-merch-spacer">&nbsp;</p>}

                      <div className="single-merch-purchase">
                        <div className="single-merch-price">
                          <small>Book price</small>
                          <strong>${centsToDollars(priceCents)}</strong>
                        </div>

                        {r.quantity > 1 ? (
                          <label className="single-merch-qty">
                            <span>Qty</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="1"
                              max={r.quantity}
                              value={String(buyQty[r.cardId] ?? 1)}
                              onChange={(e) =>
                                setBuyQty((prev) => ({
                                  ...prev,
                                  [r.cardId]: Number(e.target.value),
                                }))
                              }
                              aria-label={`Quantity of ${r.card.player}`}
                            />
                          </label>
                        ) : (
                          <span className="single-merch-one-copy">1 copy</span>
                        )}
                      </div>

                      <button
                        className="single-merch-buy"
                        onClick={() => buySingle(r.cardId)}
                        disabled={buyingCardId === r.cardId}
                      >
                        <span>{buyingCardId === r.cardId ? "Buying…" : "Buy now"}</span>
                        <strong>${centsToDollars(totalCents)}</strong>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

