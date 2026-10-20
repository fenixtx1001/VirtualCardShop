"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Dialog from "./Dialog";
import {
  availableCopies,
  gradeLabel,
  money,
  postJson,
  requestJson,
  saleImpact,
  type CardDetails,
  type CollectorContext,
  type OfferStatus,
} from "@/lib/card-details/model";
import {
  bookValueToCents,
  calculateGradingFeeCents,
  GRADING_FEE_BPS,
  MIN_GRADING_FEE_CENTS,
} from "@/lib/grading";
import { calcShopSellQuote } from "@/lib/shop-offers";
import {
  AUCTION_DURATION_MS,
  calculateAuctionValueBasisCents,
  calculateStartingBidCents,
} from "@/lib/auctions";
export default function ActionSheet({
  mode,
  data,
  context,
  initialGrade,
  onClose,
  onChanged,
}: {
  mode: "grade" | "sell";
  data: CardDetails;
  context: CollectorContext | null;
  initialGrade: number;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const rows = data.myOwnership.gradeBreakdown.filter(
    (r) => availableCopies(r) > 0,
  );
  const [method, setMethod] = useState<"shop" | "auction">("shop");
  const [grade, setGrade] = useState(
    mode === "grade"
      ? 0
      : (rows.find((r) => r.grade === initialGrade)?.grade ??
          rows[0]?.grade ??
          0),
  );
  const [quantity, setQuantity] = useState("1");
  const [status, setStatus] = useState<OfferStatus | null>(null);
  const [checking, setChecking] = useState(mode === "sell");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [auctionId, setAuctionId] = useState<number | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [creditQuote, setCreditQuote] = useState<{
    creditCount: number;
    creditPerCopyCents: number;
    productSetId: string | null;
    productSetName: string | null;
    productName: string;
    prestigeLevel: number;
  } | null>(null);
  const [useSetCredits, setUseSetCredits] = useState(true);
  const [creditLoading, setCreditLoading] = useState(mode === "grade");
  const [creditError, setCreditError] = useState("");
  const [creditRefresh, setCreditRefresh] = useState(0);
  const inFlight = useRef(false);
  const row = rows.find((r) => r.grade === grade);
  const available = availableCopies(row);
  const qty = method === "auction" && mode === "sell" ? 1 : Number(quantity);
  const valid = Number.isSafeInteger(qty) && qty > 0 && qty <= available;
  const rawCents = bookValueToCents(data.card.bookValue);
  const fee = calculateGradingFeeCents(rawCents);
  const quotedQuantity = valid ? qty : 0;
  const creditCopies = useSetCredits && creditQuote
    ? Math.min(quotedQuantity, creditQuote.creditCount) : 0;
  const creditSavings = creditCopies * Math.min(fee, creditQuote?.creditPerCopyCents ?? 100);
  const cashDueCents = Math.max(0, fee * quotedQuantity - creditSavings);
  const active = status?.activeOffer;
  const expired = !!active && Date.parse(active.expiresAt) <= clock;
  const quote = active
    ? calcShopSellQuote({
        rawBookValueCents: rawCents,
        quantity: valid ? qty : 1,
        baseOfferBps: active.offerBps,
        grade,
        gradeability: "COMMON",
      })
    : null;
  const auctionBasis = calculateAuctionValueBasisCents({
    rawBookValueCents: rawCents,
    grade,
    cardOverride: null,
    productSetDefault: null,
  });
  const startBid = calculateStartingBidCents(
    Math.max(1, auctionBasis.valueBasisCents),
  );
  const impact = valid
    ? saleImpact(data.myOwnership.totalQuantity, qty, context?.progress ?? null)
    : null;
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (mode !== "grade") return;
    const controller = new AbortController();
    setCreditLoading(true);
    setCreditQuote(null);
    setCreditError("");
    fetch("/api/grading/credits?cardId=" + encodeURIComponent(String(data.card.id)), {
      cache: "no-store",
      signal: controller.signal,
    }).then(async response => {
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Unable to check grading credits");
      }
      return payload;
    }).then(payload => {
      if (!controller.signal.aborted) {
        setCreditQuote({
          creditCount: payload.creditCount ?? 0,
          creditPerCopyCents: payload.creditPerCopyCents ?? 100,
          productSetId: payload.productSetId ?? null,
          productSetName: payload.productSetName ?? null,
          productName: payload.productName ?? "",
          prestigeLevel: payload.prestigeLevel ?? 0,
        });
      }
    }).catch(error => {
      if (!controller.signal.aborted) setCreditError(error instanceof Error ? error.message : "Unable to check grading credits");
    }).finally(() => {
      if (!controller.signal.aborted) setCreditLoading(false);
    });
    return () => controller.abort();
  }, [mode, data.card.id, creditRefresh]);

  useEffect(() => {
    if (mode !== "sell") return;
    const abort = new AbortController();
    requestJson<OfferStatus>(
      `/api/shop/singles/offers?cardId=${data.card.id}`,
      { signal: abort.signal },
    )
      .then(setStatus)
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setChecking(false);
      });
    return () => abort.abort();
  }, [data.card.id, mode]);
  async function act(kind: "request" | "grade" | "sell" | "auction") {
    if (inFlight.current || success) return;
    if (kind === "grade" && (creditLoading || creditError || !creditQuote)) {
      setError("Grading credits are still being checked. Please retry the credit lookup.");
      return;
    }
    if (kind !== "request" && !valid) {
      setError("Choose a whole number within your available copies.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (kind === "request") {
        await postJson("/api/shop/singles/offers", { cardId: data.card.id });
        setStatus(
          await requestJson<OfferStatus>(
            `/api/shop/singles/offers?cardId=${data.card.id}`,
          ),
        );
      } else {
        if (kind === "grade") {
          const result = await postJson<{
            totalFeeCents: number; cashFeeCents: number;
            creditAppliedCents: number; creditsUsed: number;
          }>(
            "/api/grading/submit",
            {
              cardId: data.card.id,
              quantity: qty,
              expectedFeeCents: fee * qty,
              useSetCredits,
            },
          );
          setSuccess(
            `Submitted ${qty} ${qty === 1 ? "copy" : "copies"} for grading. Cash paid: ${money(result.cashFeeCents)}${result.creditsUsed ? ` · ${result.creditsUsed} set credit(s) used` : ""}.`,
          );
        } else if (kind === "auction") {
          const result = await postJson<{ auction: { id: number } }>(
            "/api/auctions/create",
            { cardId: data.card.id, grade, expectedStartingBidCents: startBid },
          );
          setAuctionId(result.auction.id);
          setSuccess(
            `${gradeLabel(grade)} listed for auction. One copy is now reserved.`,
          );
        } else {
          if (!active || !quote || expired)
            throw new Error(
              "This offer is no longer available. Please reload its status.",
            );
          const result = await postJson<{ totalCents: number }>(
            "/api/shop/sell",
            {
              offerId: active.id,
              grade,
              quantity: qty,
              expectedTotalCents: quote.totalCents,
            },
          );
          setSuccess(
            `Sold ${qty} ${qty === 1 ? "copy" : "copies"} for ${money(result.totalCents)}.`,
          );
        }
        window.dispatchEvent(new Event("vcs:economy-changed"));
        window.dispatchEvent(new Event("vcs:collection-changed"));
        try {
          await onChanged();
        } catch {
          setRefreshFailed(true);
        }
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete this action.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={mode === "grade" ? "Send to VCS grading" : "Sell or auction"}
      onClose={onClose}
      busy={busy}
    >
      <div className="cd-sheet-body">
        <div className="cd-sheet-identity">
          <span>
            {data.card.productYear} {data.card.productBrand} · #
            {data.card.cardNumber}
          </span>
          <h3>{data.card.player}</h3>
        </div>
        {success ? (
          <div className="cd-success" role="status">
            <h3>All set.</h3>
            <p>{success}</p>
            {refreshFailed && (
              <p>
                Completed successfully. Refresh Card Details to update your
                counts.
              </p>
            )}
            <div className="cd-inline-actions">
              {mode === "grade" && (
                <Link href="/grading">View grading orders ↗</Link>
              )}
              {auctionId && (
                <Link href={`/auctions/${auctionId}`}>View auction ↗</Link>
              )}
              <button className="cd-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {mode === "sell" && (
              <div
                className="cd-segmented"
                role="group"
                aria-label="Selling method"
              >
                <button
                  disabled={busy}
                  aria-pressed={method === "shop"}
                  onClick={() => {
                    setMethod("shop");
                    setError("");
                  }}
                >
                  Shop offer
                </button>
                <button
                  disabled={busy}
                  aria-pressed={method === "auction"}
                  onClick={() => {
                    setMethod("auction");
                    setError("");
                  }}
                >
                  Auction
                </button>
              </div>
            )}
            <div className="cd-form-grid">
              {mode === "sell" && (
                <label>
                  Grade
                  <select
                    value={grade}
                    disabled={busy}
                    onChange={(e) => {
                      setGrade(Number(e.target.value));
                      setQuantity("1");
                    }}
                  >
                    {rows.length ? (
                      rows.map((r) => (
                        <option key={r.grade} value={r.grade}>
                          {r.label} · {availableCopies(r)} available
                        </option>
                      ))
                    ) : (
                      <option value={0}>No available copies</option>
                    )}
                  </select>
                </label>
              )}
              {!(mode === "sell" && method === "auction") && (
                <label>
                  Quantity
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={available}
                    step={1}
                    value={quantity}
                    disabled={busy}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </label>
              )}
            </div>
            <p className="cd-muted">
              {available} {gradeLabel(grade).toLowerCase()}{" "}
              {available === 1 ? "copy" : "copies"} available · Auction-listed
              copies are reserved.
            </p>
            {mode === "grade" ? (
              <>
                <dl className="cd-facts">
                  <div>
                    <dt>Fee per copy</dt>
                    <dd>{money(fee)}</dd>
                  </div>
                  <div>
                    <dt>Standard grading fee</dt>
                    <dd>{money(fee * quotedQuantity)}</dd>
                  </div>
                  <div>
                    <dt>Set credits applied</dt>
                    <dd className="cd-credit-savings">-{money(creditSavings)} ({creditCopies} credits)</dd>
                  </div>
                  <div className="cd-credit-due">
                    <dt>Cash due now</dt>
                    <dd>{creditLoading ? "Calculating…" : money(cashDueCents)}</dd>
                  </div>
                  <div>
                    <dt>Reveal</dt>
                    <dd>After 24 hours</dd>
                  </div>
                </dl>
                <div className="cd-credit-panel">
                  {creditLoading ? <p role="status">Checking available set grading credits…</p> :
                    creditError ? <div role="alert">
                      <p>Unable to load your set credits: {creditError}</p>
                      <button type="button" onClick={() => setCreditRefresh(value => value + 1)}>Retry credit lookup</button>
                    </div> : creditQuote ? <>
                      <strong>{creditQuote.creditCount} grading credit{creditQuote.creditCount === 1 ? "" : "s"} available</strong>
                      <small>{creditQuote.productName || "Unknown product"} · {creditQuote.productSetName || "Unassigned set"} · Prestige {creditQuote.prestigeLevel}</small>
                      {creditQuote.creditCount > 0 ?
                        <label className="cd-credit-toggle">
                          <input type="checkbox" checked={useSetCredits} disabled={busy} onChange={e => setUseSetCredits(e.target.checked)} />
                          Apply available set grading credits
                        </label> :
                        <p>No credits are available for this exact product set. Credits earned in other sets cannot be transferred.</p>}
                    </> : null}
                </div>
                <p className="cd-muted">
                  {GRADING_FEE_BPS / 100}% of raw book value, with a{" "}
                  {money(MIN_GRADING_FEE_CENTS)} minimum per copy. Grading
                  retains your set progress.
                </p>
                <button
                  className="cd-primary cd-full"
                  disabled={busy || !valid || creditLoading || Boolean(creditError) || !creditQuote}
                  onClick={() => act("grade")}
                >
                  {busy
                    ? "Submitting…"
                    : `Submit for grading · ${money(cashDueCents)} cash`}
                </button>
              </>
            ) : method === "auction" ? (
              <>
                <dl className="cd-facts">
                  <div>
                    <dt>Listing</dt>
                    <dd>1 {gradeLabel(grade)} copy</dd>
                  </div>
                  <div>
                    <dt>Starting bid</dt>
                    <dd>{money(startBid)}</dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>{AUCTION_DURATION_MS / 3600000} hours</dd>
                  </div>
                </dl>
                <p className="cd-muted">
                  This copy will remain in your collection, reserved until the
                  auction is settled. Final proceeds depend on bidding.
                </p>
                {impact && <p className="cd-caution">If it sells: {impact}</p>}
                <button
                  className="cd-primary cd-full"
                  disabled={busy || !valid}
                  onClick={() => act("auction")}
                >
                  {busy ? "Creating…" : "Create auction"}
                </button>
              </>
            ) : checking ? (
              <p role="status">Checking shop offer…</p>
            ) : active && !expired ? (
              <>
                <dl className="cd-facts">
                  <div>
                    <dt>Offer per copy</dt>
                    <dd>
                      {money(
                        calcShopSellQuote({
                          rawBookValueCents: rawCents,
                          quantity: 1,
                          baseOfferBps: active.offerBps,
                          grade,
                          gradeability: "COMMON",
                        }).totalCents,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Total payout</dt>
                    <dd>{money(quote?.totalCents ?? 0)}</dd>
                  </div>
                  <div>
                    <dt>Expires</dt>
                    <dd>{new Date(active.expiresAt).toLocaleString()}</dd>
                  </div>
                </dl>
                {impact && <p className="cd-caution">{impact}</p>}
                <p className="cd-muted">
                  Accepting uses this offer for the chosen quantity and grade.
                </p>
                <button
                  className="cd-primary cd-full"
                  disabled={busy || !valid || !quote?.totalCents}
                  onClick={() => act("sell")}
                >
                  {busy
                    ? "Selling…"
                    : `Sell ${valid ? qty : 0} ${gradeLabel(grade)} · ${money(quote?.totalCents ?? 0)}`}
                </button>
              </>
            ) : (
              <>
                <p className="cd-muted">
                  {expired
                    ? "This offer has expired. Reload to check when another quote is available."
                    : status?.message ||
                      "Request a quote without committing to a sale. Offers are valid for 24 hours."}
                </p>
                {status?.lockedUntil && (
                  <p>
                    Available after{" "}
                    {new Date(status.lockedUntil).toLocaleString()}
                  </p>
                )}
                <button
                  className="cd-primary cd-full"
                  disabled={busy || !available || status?.available === false}
                  onClick={() => act("request")}
                >
                  {busy ? "Requesting…" : "Request shop offer"}
                </button>
                {(!status || expired || status.reason === "LOCKED") && (
                  <button
                    className="cd-text-button"
                    disabled={busy}
                    onClick={async () => {
                      setChecking(true);
                      setError("");
                      try {
                        setStatus(
                          await requestJson<OfferStatus>(
                            `/api/shop/singles/offers?cardId=${data.card.id}`,
                          ),
                        );
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Unable to load offer.",
                        );
                      } finally {
                        setChecking(false);
                      }
                    }}
                  >
                    Reload offer status
                  </button>
                )}
              </>
            )}
            {error && (
              <div className="cd-message" role="alert">
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
