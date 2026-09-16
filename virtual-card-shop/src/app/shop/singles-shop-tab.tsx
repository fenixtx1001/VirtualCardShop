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
    <div style={{ fontFamily: "system-ui" }}>
      <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 6px" }}>Singles</h2>
      <div style={{ color: "#444", marginBottom: 12 }}>
        Sell cards to the shop via 24h offers. Accept for immediate cash, reject to pass, or let an offer expire.
        Passing or expiring locks that specific card from new shop offers for <b>24 hours</b>. Buy singles from shop inventory at{" "}
        <b>100% book</b>.
      </div>

      {offersErr ? (
        <div style={{ marginBottom: 12, padding: 12, background: "#fee", border: "1px solid #f99", borderRadius: 12 }}>
          {offersErr}
        </div>
      ) : null}

      {offersMsg ? (
        <div style={{ marginBottom: 12, padding: 12, background: "#efe", border: "1px solid #9f9", borderRadius: 12 }}>
          {offersMsg}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12, background: "#fafafa" }}>
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

        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontWeight: 900 }}>Active Offers</div>
            <div style={{ fontSize: 12, color: "#666" }}>
              Accept for instant cash, or reject to clear the offer and start the 24-hour card lockout.
            </div>
          </div>

          {offersLoading ? (
            <div style={{ marginTop: 10 }}>Loading offers…</div>
          ) : offers.length === 0 ? (
            <div style={{ marginTop: 10, padding: 12, background: "#fafafa", borderRadius: 12, border: "1px solid #eee" }}>
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

        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Shop Inventory (Singles)</div>

          <div
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
              placeholder="Search shop inventory (player, team, card #, subset, set)…"
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ccc", minWidth: 320 }}
            />

            <select
              value={invSort}
              onChange={(e) => setInvSort(e.target.value as SinglesSortKey)}
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
                onChange={(e) => setOnlyNeed(e.target.checked)}
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
            <div style={{ marginTop: 12, padding: 12, background: "#fee", border: "1px solid #f99", borderRadius: 12 }}>
              {invErr}
            </div>
          ) : null}

          {invLoading ? (
            <div style={{ marginTop: 12 }}>Loading inventory…</div>
          ) : invRows.length === 0 ? (
            <div style={{ marginTop: 12, padding: 12, background: "#fafafa", borderRadius: 12, border: "1px solid #eee" }}>
              No shop inventory found.
            </div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {invRows.map((r) => {
                const img = safeImgSrc(r.card?.frontImageUrl ?? null);
                const priceCents = Math.round((Number(r.card.bookValue ?? 0) || 0) * 100);
                const detailsLine = compactMetaLine([r.card.team, r.card.subset, r.card.variant]);
                const setLine = formatFriendlyProductSetLabel(r.card);

                return (
                  <div
                    key={r.cardId}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 14,
                      padding: 12,
                      background: "#fcfcfc",
                      display: "grid",
                      gridTemplateColumns: "64px 1fr",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
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
                        <div style={{ fontWeight: 900 }}>
                          {r.card.player} {r.card.cardNumber ? `#${r.card.cardNumber}` : ""}
                          <span style={{ fontWeight: 600, color: "#666" }}> ({r.quantity} in stock)</span>
                        </div>

                        <div style={{ fontSize: 12, color: "#555" }}>
                          Price: <b>${centsToDollars(priceCents)}</b> • Card ID: {r.cardId}
                        </div>
                      </div>

                      <div style={{ fontSize: 12, color: "#666" }}>
                        {detailsLine || "—"}
                      </div>

                      <div style={{ fontSize: 12, color: "#444", fontWeight: 700 }}>
                        {setLine}
                      </div>

                      <div style={{ fontSize: 12, color: r.youOwnQty > 0 ? "#1f5133" : "#666", fontWeight: 800 }}>
                        You own: {r.youOwnQty}
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          value={String(buyQty[r.cardId] ?? 1)}
                          onChange={(e) => setBuyQty((prev) => ({ ...prev, [r.cardId]: Number(e.target.value) }))}
                          style={{ width: 80, padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
                        />
                        <button
                          onClick={() => buySingle(r.cardId)}
                          disabled={buyingCardId === r.cardId}
                          style={{
                            padding: "9px 10px",
                            borderRadius: 10,
                            border: "1px solid #ccc",
                            background: buyingCardId === r.cardId ? "#f2f2f2" : "white",
                            fontWeight: 900,
                            cursor: buyingCardId === r.cardId ? "not-allowed" : "pointer",
                          }}
                        >
                          {buyingCardId === r.cardId ? "Buying…" : "Buy"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

