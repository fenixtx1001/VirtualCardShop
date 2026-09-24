"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import VcsSlab from "@/components/grading/VcsSlab";
import Dialog from "@/components/card-details/Dialog";
import ActionSheet from "@/components/card-details/ActionSheet";
import MarketPanel from "@/components/card-details/MarketPanel";
import { readTrail, type CardTrail } from "@/lib/card-details/browsing";
import {
  availableCopies,
  dateLabel,
  gradeLabel,
  money,
  postJson,
  requestJson,
  type CardDetails,
  type CollectorContext,
} from "@/lib/card-details/model";
import "./card-details.css";

type Tab = "overview" | "market" | "population";
function RawImage({
  src,
  alt,
  onInspect,
}: {
  src: string | null;
  alt: string;
  onInspect?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const content =
    src && !failed ? (
      <img
        src={src}
        alt={alt}
        decoding="async"
        onError={() => setFailed(true)}
      />
    ) : (
      <div className="cd-art-empty">
        <span>VCS</span>
        <p>{failed ? "Image unavailable" : "No scan available"}</p>
      </div>
    );
  return onInspect ? (
    <button
      className="cd-art-button"
      onClick={onInspect}
      aria-label={`Inspect ${alt}`}
    >
      {content}
    </button>
  ) : (
    content
  );
}
export default function CardDetailClient({ cardId }: { cardId: number }) {
  const router = useRouter();
  const [data, setData] = useState<CardDetails | null>(null);
  const [context, setContext] = useState<CollectorContext | null>(null);
  const [error, setError] = useState("");
  const [contextError, setContextError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [marketOpened, setMarketOpened] = useState(false);
  const [grade, setGrade] = useState(0);
  const [slab, setSlab] = useState(false);
  const [back, setBack] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [sheet, setSheet] = useState<"grade" | "sell" | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [trail, setTrail] = useState<CardTrail | null>(null);
  const [clock, setClock] = useState(Date.now());
  const request = useRef(0);
  const tabArea = useRef<HTMLDivElement>(null);
  const rawImage = data?.card.frontImageUrl;
  useEffect(() => {
    if (
      data?.card.id === cardId &&
      !data.card.frontImageUrl &&
      data.card.backImageUrl
    )
      setBack(true);
  }, [
    data?.card.id,
    data?.card.frontImageUrl,
    data?.card.backImageUrl,
    cardId,
  ]);
  const backImage = data?.card.backImageUrl;
  const current = data?.card.id === cardId ? data : null;
  const collector = context?.cardId === cardId ? context : null;
  const refresh = useCallback(async () => {
    const ticket = ++request.current;
    setRefreshing(true);
    setError("");
    setContextError("");
    const results = await Promise.allSettled([
      requestJson<CardDetails>(`/api/cards/${cardId}/population`),
      requestJson<CollectorContext>(`/api/cards/${cardId}/collector`),
    ]);
    if (ticket !== request.current) return;
    setRefreshing(false);
    if (results[0].status === "fulfilled") setData(results[0].value);
    else
      setError(
        results[0].reason instanceof Error
          ? results[0].reason.message
          : "Card details could not load.",
      );
    if (results[1].status === "fulfilled") setContext(results[1].value);
    else {
      setContext(null);
      setContextError("Collecting progress and activity could not load.");
    }
    if (results[0].status === "rejected") throw results[0].reason;
  }, [cardId]);
  useEffect(() => {
    void refresh().catch(() => {});
    return () => {
      request.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const selected = Number(
      new URLSearchParams(location.search).get("grade") || 0,
    );
    setGrade([6, 7, 8, 9, 10].includes(selected) ? selected : 0);
    setSlab([6, 7, 8, 9, 10].includes(selected));
    setBack(false);
    setTab("overview");
    setSheet(null);
    setInspect(false);
    setNotice("");
    const saved = readTrail();
    setTrail(saved?.items.some((r) => r.cardId === cardId) ? saved : null);
  }, [cardId]);
  useEffect(() => {
    if (
      current &&
      !current.myOwnership.slabs.some((r) => r.grade === grade) &&
      slab
    ) {
      setSlab(false);
      setGrade(0);
    }
  }, [current, grade, slab]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const index =
    trail?.items.findIndex(
      (r) => r.cardId === cardId && (r.grade ?? 0) === grade,
    ) ?? -1;
  const trailIndex =
    index >= 0
      ? index
      : (trail?.items.findIndex((r) => r.cardId === cardId) ?? -1);
  const previous = trail && trailIndex > 0 ? trail.items[trailIndex - 1] : null;
  const next = trail && trailIndex >= 0 ? trail.items[trailIndex + 1] : null;
  const cardHref = (item: { cardId: number; grade?: number }) =>
    `/cards/${item.cardId}${item.grade ? `?grade=${item.grade}` : ""}`;
  useEffect(() => {
    function key(event: globalThis.KeyboardEvent) {
      if (
        inspect ||
        sheet ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      const element = event.target as HTMLElement;
      if (
        element.closest(
          'input,select,textarea,button,a,[role="tab"],[contenteditable="true"]',
        )
      )
        return;
      const item =
        event.key === "ArrowLeft"
          ? previous
          : event.key === "ArrowRight"
            ? next
            : null;
      if (item) {
        event.preventDefault();
        router.replace(cardHref(item));
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [previous, next, inspect, sheet, router]);
  function selectTab(value: Tab, scroll = false) {
    setTab(value);
    if (value === "market") setMarketOpened(true);
    if (scroll)
      requestAnimationFrame(() =>
        tabArea.current?.scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
          block: "start",
        }),
      );
  }
  function tabKeys(event: KeyboardEvent<HTMLButtonElement>, value: Tab) {
    const tabs: Tab[] = ["overview", "market", "population"];
    let i = tabs.indexOf(value);
    if (event.key === "ArrowRight") i = (i + 1) % 3;
    else if (event.key === "ArrowLeft") i = (i + 2) % 3;
    else if (event.key === "Home") i = 0;
    else if (event.key === "End") i = 2;
    else return;
    event.preventDefault();
    setTab(tabs[i]);
    if (tabs[i] === "market") setMarketOpened(true);
    document.getElementById(`cd-tab-${tabs[i]}`)?.focus();
  }
  async function favorite() {
    if (!collector || favoriteBusy) return;
    setFavoriteBusy(true);
    setNotice("");
    try {
      const result = await postJson<{ favorited: boolean }>(
        "/api/favorites/toggle",
        { cardId },
      );
      setContext((c) => (c ? { ...c, favorited: result.favorited } : c));
      setNotice(
        result.favorited
          ? "Added to your Showcase favorites."
          : "Removed from favorites.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not update favorite.");
    } finally {
      setFavoriteBusy(false);
    }
  }
  const backHref = trail?.source ?? "/collection";
  if (!current)
    return (
      <div className="cd-shell">
        <Link href={backHref} className="cd-back">
          ← {trail?.label ?? "Collection"}
        </Link>
        {error ? (
          <div className="cd-message" role="alert">
            <h1>Card details couldn’t load</h1>
            <p>{error}</p>
            <button
              className="cd-primary"
              onClick={() => void refresh().catch(() => {})}
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="cd-loading" role="status">
            <div />
            <div />
            <p>Opening your card…</p>
          </div>
        )}
      </div>
    );
  const { card, population, myOwnership: owned } = current;
  const best = owned.slabs[0];
  const selectedSlab = owned.slabs.find((r) => r.grade === grade) ?? best;
  const rawAvailable = availableCopies(
    owned.gradeBreakdown.find((r) => r.grade === 0),
  );
  const available = owned.gradeBreakdown.reduce(
    (sum, r) => sum + availableCopies(r),
    0,
  );
  const listed = owned.gradeBreakdown.reduce(
    (sum, r) => sum + (r.auctionLockedQuantity ?? 0),
    0,
  );
  const pending = collector?.pendingOrders ?? [];
  const ready = pending.reduce(
    (sum, p) =>
      sum + (p.readyAt && Date.parse(p.readyAt) <= clock ? p.quantity : 0),
    0,
  );
  const product =
    [card.productYear, card.productBrand].filter(Boolean).join(" ") ||
    card.productId?.replaceAll("_", " ") ||
    "Trading card";
  const setName =
    card.productSetName || (card.productSetIsBase ? "Base set" : "Card set");
  const activeImage = back ? backImage || null : rawImage || backImage || null;
  const slabView = slab && selectedSlab;
  const progress = collector?.progress;
  const art = () =>
    slabView ? (
      <VcsSlab
        player={card.player}
        cardNumber={card.cardNumber}
        setName={`${product} · ${setName}`}
        team={card.team}
        grade={selectedSlab.grade}
        valueCents={selectedSlab.valueCents}
        quantity={selectedSlab.quantity}
        imageUrl={rawImage}
        backImageUrl={backImage}
        flipped={back}
        onFlip={() => setBack((v) => !v)}
        registry={{
          cardId,
          atGrade:
            population.gradeBreakdown.find(
              (r) => r.grade === selectedSlab.grade,
            )?.quantity ?? 0,
          totalGraded: population.graded,
          totalOwned: population.totalOwned,
        }}
      />
    ) : (
      <RawImage
        src={activeImage}
        alt={`${card.player}, ${product}, #${card.cardNumber}, ${back ? "back" : "front"}`}
        onInspect={() => {
          setZoom(1);
          setInspect(true);
        }}
      />
    );
  return (
    <div className="cd-shell">
      <nav className="cd-breadcrumb" aria-label="Card navigation">
        <Link href={backHref} className="cd-back">
          ← {trail?.label ?? "Collection"}
        </Link>
        <div className="cd-trail">
          {trail && (
            <span>
              {trailIndex + 1} of {trail.items.length} on this page
            </span>
          )}
          {previous ? (
            <Link replace href={cardHref(previous)} aria-label="Previous card">
              ‹
            </Link>
          ) : trail ? (
            <button disabled aria-label="Previous card">
              ‹
            </button>
          ) : null}
          {next ? (
            <Link replace href={cardHref(next)} aria-label="Next card">
              ›
            </Link>
          ) : trail ? (
            <button disabled aria-label="Next card">
              ›
            </button>
          ) : null}
          <button
            className="cd-icon-button"
            aria-label="Refresh card details"
            disabled={refreshing}
            onClick={() => void refresh().catch(() => {})}
          >
            ↻
          </button>
        </div>
      </nav>
      <div className="cd-layout">
        <header className="cd-identity">
          <div className="cd-eyebrow">{product}</div>
          <h1>{card.player}</h1>
          <p>
            #{card.cardNumber}
            {card.team ? ` · ${card.team}` : ""}
            {card.variant ? ` · ${card.variant}` : ""}
          </p>
          <div className="cd-identity-footer">
            <span>
              {card.productSetIsBase ? "Base" : "Insert"} · {setName}
            </span>
            <button
              className="cd-favorite"
              aria-pressed={!!collector?.favorited}
              disabled={!collector || favoriteBusy}
              onClick={favorite}
            >
              {collector?.favorited ? "★ Favorited" : "☆ Favorite"}
            </button>
          </div>
        </header>
        <section className="cd-viewer" aria-label="Card viewer">
          <div className="cd-viewer-toolbar">
            <div
              className="cd-segmented"
              role="group"
              aria-label="Card presentation"
            >
              <button
                aria-pressed={!slab}
                onClick={() => {
                  setSlab(false);
                  setGrade(0);
                }}
              >
                Raw scan
              </button>
              {best && (
                <button
                  aria-pressed={slab}
                  onClick={() => {
                    setSlab(true);
                    setGrade(best.grade);
                  }}
                >
                  Your slab
                </button>
              )}
            </div>
            <button
              className="cd-text-button"
              onClick={() => {
                setZoom(1);
                setInspect(true);
              }}
            >
              Inspect ↗
            </button>
          </div>
          <div className={`cd-stage ${slabView ? "cd-stage-slab" : ""}`}>
            {art()}
          </div>
          <div className="cd-viewer-footer">
            <div className="cd-segmented" role="group" aria-label="Card side">
              <button
                aria-pressed={!back}
                disabled={!rawImage && !slabView}
                onClick={() => setBack(false)}
              >
                Front
              </button>
              <button
                aria-pressed={back}
                disabled={!backImage && !slabView}
                onClick={() => setBack(true)}
              >
                Back
              </button>
            </div>
            {slabView && owned.slabs.length > 1 ? (
              <label className="cd-slab-picker">
                <span className="cd-sr-only">Displayed slab grade</span>
                <select
                  value={grade}
                  onChange={(e) => setGrade(Number(e.target.value))}
                >
                  {owned.slabs.map((s) => (
                    <option value={s.grade} key={s.grade}>
                      {s.label} ×{s.quantity}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="cd-muted">
                {slabView ? "VCS certified" : "Original card scan"}
              </span>
            )}
          </div>
          {slabView && (
            <div className="cd-display-value">
              <span>{selectedSlab.label} book value</span>
              <strong>
                {money(selectedSlab.valueCents)} <small>each</small>
              </strong>
            </div>
          )}
        </section>
        <div className="cd-content">
          {notice && (
            <p className="cd-notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="cd-message" role="alert">
              {error} Your last loaded details remain visible.
            </p>
          )}
          <div className="cd-metrics cd-summary">
            <div>
              <span>Raw book value</span>
              <strong>{money(Math.round(card.bookValue * 100))}</strong>
              <small>Per copy</small>
            </div>
            <button onClick={() => selectTab("overview", true)}>
              <span>You own</span>
              <strong>{owned.totalQuantity}</strong>
              <small>
                {owned.pendingGradingQuantity > 0
                  ? `${owned.pendingGradingQuantity} in grading`
                  : `${owned.rawQuantity} raw · ${owned.gradedQuantity} graded`}
              </small>
            </button>
            <button onClick={() => selectTab("population", true)}>
              <span>VCS population</span>
              <strong>{population.totalOwnedIncludingPending}</strong>
              <small>Includes {population.pendingGrading} pending</small>
            </button>
          </div>
          {owned.totalQuantity > 0 && (
            <div className="cd-action-dock">
              <div>
                <span>{available} available</span>
                <small>
                  {listed ? `${listed} listed · ` : ""}
                  {owned.pendingGradingQuantity} in grading
                </small>
              </div>
              {rawAvailable > 0 && (
                <button
                  className="cd-secondary"
                  disabled={refreshing || !!error}
                  onClick={() => setSheet("grade")}
                >
                  Grade
                </button>
              )}
              <button
                className="cd-primary"
                disabled={!available || refreshing || !!error}
                onClick={() => setSheet("sell")}
              >
                Sell / auction
              </button>
            </div>
          )}
          <div ref={tabArea} className="cd-tab-area">
            <div
              className="cd-tabs"
              role="tablist"
              aria-label="Card information"
            >
              {(["overview", "market", "population"] as const).map((t) => (
                <button
                  id={`cd-tab-${t}`}
                  role="tab"
                  key={t}
                  aria-selected={tab === t}
                  aria-controls={`cd-panel-${t}`}
                  tabIndex={tab === t ? 0 : -1}
                  onKeyDown={(e) => tabKeys(e, t)}
                  onClick={() => selectTab(t)}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div
              id="cd-panel-overview"
              role="tabpanel"
              aria-labelledby="cd-tab-overview"
              hidden={tab !== "overview"}
            >
              <section>
                <div className="cd-section-heading">
                  <h2>Your collection</h2>
                  <span>{money(owned.totalValueCents)} total book value</span>
                </div>
                {owned.totalQuantity === 0 ? (
                  <div className="cd-empty">
                    <h3>A spot in your collection is waiting.</h3>
                    <p>You don’t own this card yet.</p>
                    <Link href="/shop?tab=singles">Browse singles ↗</Link>
                  </div>
                ) : (
                  <>
                    <div className="cd-copy-head">
                      <span>Grade / copies</span>
                      <span>Value each</span>
                      <span>Total</span>
                    </div>
                    <div className="cd-copies">
                      {owned.gradeBreakdown.map((row) => (
                        <button
                          key={row.grade}
                          aria-pressed={grade === row.grade}
                          onClick={() => {
                            setGrade(row.grade);
                            setSlab(row.grade !== 0);
                            setBack(false);
                          }}
                        >
                          <span>
                            <strong>
                              {row.label} <b>×{row.quantity}</b>
                            </strong>
                            <small>
                              {availableCopies(row)} available
                              {row.auctionLockedQuantity
                                ? ` · ${row.auctionLockedQuantity} listed`
                                : ""}
                            </small>
                          </span>
                          <span>{money(row.valueCents)}</span>
                          <span>{money(row.valueCents * row.quantity)}</span>
                        </button>
                      ))}
                    </div>
                    {owned.pendingGradingQuantity > 0 && (
                      <Link href="/grading" className="cd-pending">
                        <span>
                          {ready > 0
                            ? `${ready} ${ready === 1 ? "copy is" : "copies are"} ready to reveal`
                            : `${owned.pendingGradingQuantity} in grading`}
                          <small>
                            {ready
                              ? "See your results in Grading"
                              : pending.find((p) => p.readyAt)?.readyAt
                                ? `Next reveal ${new Date(pending.filter((p) => p.readyAt).sort((a, b) => Date.parse(a.readyAt!) - Date.parse(b.readyAt!))[0].readyAt!).toLocaleString()}`
                                : "Grading orders count toward set progress"}
                          </small>
                        </span>
                        <span>View ↗</span>
                      </Link>
                    )}
                    <div className="cd-collection-footer">
                      <span>
                        {best ? `Your best: ${best.label}` : "Raw collection"}
                        {listed ? ` · ${listed} reserved at auction` : ""}
                      </span>
                      <Link href="/showcase">Showcase ↗</Link>
                    </div>
                  </>
                )}
              </section>
              {contextError && (
                <div className="cd-message" role="alert">
                  {contextError}
                  <button onClick={() => void refresh().catch(() => {})}>
                    Retry
                  </button>
                </div>
              )}
              {progress && (
                <section className="cd-progress">
                  <div className="cd-section-heading">
                    <div>
                      <span className="cd-eyebrow">{setName}</span>
                      <h2>Prestige {progress.level}</h2>
                    </div>
                    <span>
                      {progress.cardsAtNext} / {progress.totalCards} at level{" "}
                      {progress.nextLevel}
                    </span>
                  </div>
                  <div
                    className="cd-progress-track"
                    role="progressbar"
                    aria-label={`Progress to prestige ${progress.nextLevel}`}
                    aria-valuenow={progress.cardsAtNext}
                    aria-valuemin={0}
                    aria-valuemax={progress.totalCards}
                  >
                    <div
                      style={{
                        width: `${progress.totalCards ? (progress.cardsAtNext / progress.totalCards) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <p>
                    {progress.thisCardNeeded > 0
                      ? `You need ${progress.thisCardNeeded} more ${progress.thisCardNeeded === 1 ? "copy" : "copies"} of this card for prestige ${progress.nextLevel}.`
                      : `This card is covered for prestige ${progress.nextLevel}.`}
                  </p>
                  <div className="cd-collection-footer">
                    <span>
                      {progress.missingCopies} copies to next prestige across
                      this set
                    </span>
                    {card.productId && (
                      <Link
                        href={`/checklist/${encodeURIComponent(card.productId)}`}
                      >
                        Checklist ↗
                      </Link>
                    )}
                  </div>
                  <p className="cd-muted">
                    Current set: {progress.ownedCards} of {progress.totalCards}{" "}
                    cards collected. Graded and unrevealed copies count.
                  </p>
                </section>
              )}
              <details className="cd-disclosure">
                <summary>Card information</summary>
                <dl className="cd-facts">
                  <div>
                    <dt>Product</dt>
                    <dd>{product}</dd>
                  </div>
                  <div>
                    <dt>Set</dt>
                    <dd>{setName}</dd>
                  </div>
                  {card.subset && (
                    <div>
                      <dt>Subset</dt>
                      <dd>{card.subset}</dd>
                    </div>
                  )}
                  {card.variant && (
                    <div>
                      <dt>Variant</dt>
                      <dd>{card.variant}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Sport</dt>
                    <dd>{card.productSport || "—"}</dd>
                  </div>
                  <div>
                    <dt>Value basis</dt>
                    <dd>VCS book value</dd>
                  </div>
                </dl>
              </details>
              {!!collector?.auctions.length && (
                <details className="cd-disclosure">
                  <summary>
                    Your auction listings ({collector.auctions.length})
                  </summary>
                  {collector.auctions.map((a) => (
                    <Link
                      key={a.id}
                      className="cd-history-row"
                      href={`/auctions/${a.id}`}
                    >
                      <span>
                        {gradeLabel(a.grade)} ·{" "}
                        {a.status.toLowerCase().replaceAll("_", " ")}
                      </span>
                      <span>View auction ↗</span>
                    </Link>
                  ))}
                </details>
              )}
              {!!collector?.history.length && (
                <details className="cd-disclosure">
                  <summary>Your acquisition activity</summary>
                  <p className="cd-muted">
                    Recorded purchases and box pulls. Box quantities are
                    cumulative; dates show the first pull from that box.
                  </p>
                  {collector.history.map((h) => (
                    <div key={h.id} className="cd-history-row">
                      <div>
                        <strong>{h.label}</strong>
                        <span>
                          {dateLabel(h.date)} · {h.quantity}{" "}
                          {h.quantity === 1 ? "copy" : "copies"}
                        </span>
                      </div>
                      {h.href && <Link href={h.href}>View ↗</Link>}
                    </div>
                  ))}
                </details>
              )}
            </div>
            <div
              id="cd-panel-market"
              role="tabpanel"
              aria-labelledby="cd-tab-market"
              hidden={tab !== "market"}
            >
              {marketOpened && (
                <MarketPanel
                  key={cardId}
                  cardId={cardId}
                  initialGrade={grade}
                />
              )}
            </div>
            <div
              id="cd-panel-population"
              role="tabpanel"
              aria-labelledby="cd-tab-population"
              hidden={tab !== "population"}
            >
              <div className="cd-section-heading">
                <div>
                  <h2>VCS population</h2>
                  <p>Copies owned by collectors in Virtual Card Shop.</p>
                </div>
                <span>{population.uniqueOwners} collectors</span>
              </div>
              <table className="cd-table cd-population">
                <thead>
                  <tr>
                    <th>Grade</th>
                    <th>Population</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {population.gradeBreakdown.map((row) => (
                    <tr key={row.grade}>
                      <th scope="row">
                        {row.label}
                        {row.grade === 10 && row.quantity > 0 && (
                          <span className="cd-gem">Gem mint</span>
                        )}
                      </th>
                      <td>{row.quantity}</td>
                      <td>
                        {row.percentage > 0 && row.percentage < 0.1
                          ? "<0.1"
                          : row.percentage.toFixed(1)}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th>Total</th>
                    <td>{population.totalOwned}</td>
                    <td>{population.totalOwned ? "100.0" : "0.0"}%</td>
                  </tr>
                </tfoot>
              </table>
              <p className="cd-muted">
                {population.pendingGrading} copies in grading are excluded from
                these percentages until revealed. Total including pending:{" "}
                {population.totalOwnedIncludingPending}.
              </p>
              <p className="cd-muted">
                Population book value: {money(population.totalValueCents)}.
                Pending copies use raw book value.
              </p>
              <h3 className="cd-subheading">Collectors</h3>
              {current.owners.length === 0 ? (
                <p className="cd-empty">No collectors own this card yet.</p>
              ) : (
                current.owners.map((owner, i) => (
                  <details key={owner.userId} className="cd-owner">
                    <summary>
                      <span className="cd-avatar" aria-hidden="true">
                        {(owner.name || "C").slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        <strong>
                          {owner.userId === owned.userId
                            ? "You"
                            : owner.name?.trim() || `Collector ${i + 1}`}
                        </strong>
                        <small>
                          {owner.slabs[0]
                            ? `Best: ${owner.slabs[0].label}`
                            : "Raw collection"}
                        </small>
                      </span>
                      <span>{owner.totalQuantity} copies</span>
                    </summary>
                    <table className="cd-table">
                      <thead>
                        <tr>
                          <th>Grade</th>
                          <th>Copies</th>
                          <th>Value each</th>
                        </tr>
                      </thead>
                      <tbody>
                        {owner.gradeBreakdown.map((r) => (
                          <tr key={r.grade}>
                            <td>{r.label}</td>
                            <td>{r.quantity}</td>
                            <td>{money(r.valueCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="cd-muted">
                      {owner.pendingGradingQuantity} pending ·{" "}
                      {money(owner.totalValueCents)} total book value
                    </p>
                  </details>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      {sheet && (
        <ActionSheet
          mode={sheet}
          data={current}
          context={collector}
          initialGrade={grade}
          onClose={() => setSheet(null)}
          onChanged={refresh}
        />
      )}
      {inspect && (
        <Dialog
          title={`${card.player} · #${card.cardNumber}`}
          wide
          onClose={() => setInspect(false)}
        >
          <div className="cd-inspect-toolbar">
            <div
              className="cd-segmented"
              role="group"
              aria-label="Inspection side"
            >
              <button
                aria-pressed={!back}
                disabled={!rawImage && !slabView}
                onClick={() => setBack(false)}
              >
                Front
              </button>
              <button
                aria-pressed={back}
                disabled={!backImage && !slabView}
                onClick={() => setBack(true)}
              >
                Back
              </button>
            </div>
            {!slabView && (
              <div className="cd-zoom">
                <button
                  aria-label="Zoom out"
                  disabled={zoom <= 1}
                  onClick={() => setZoom((v) => Math.max(1, v - 0.5))}
                >
                  −
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  aria-label="Zoom in"
                  disabled={zoom >= 3}
                  onClick={() => setZoom((v) => Math.min(3, v + 0.5))}
                >
                  +
                </button>
                <button onClick={() => setZoom(1)}>Fit</button>
              </div>
            )}
          </div>
          <div
            className={`cd-inspect-stage ${slabView ? "cd-inspect-slab" : ""}`}
          >
            <div
              style={
                slabView
                  ? undefined
                  : {
                      width: `${zoom * 100}%`,
                      height: `calc((100dvh - 270px) * ${zoom})`,
                      maxWidth: "none",
                    }
              }
            >
              {slabView ? (
                art()
              ) : (
                <RawImage
                  src={activeImage}
                  alt={`${card.player} ${back ? "back" : "front"} scan`}
                />
              )}
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
