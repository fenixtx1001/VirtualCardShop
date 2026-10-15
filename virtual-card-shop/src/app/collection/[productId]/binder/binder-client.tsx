"use client";

import Link from "next/link";
import SetViewToggle from "@/components/collection/SetViewToggle";
import { checklistHref } from "@/lib/collection/set-view-links";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type BinderCard = {
  cardId: number;
  cardNumber: string;
  player: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  frontImageUrl: string | null;
  backImageUrl: string | null;
  quantity: number;
};
type BinderData = {
  ok: true;
  product: {
    id: string;
    year: number | null;
    brand: string | null;
    sport: string | null;
    packImageUrl: string | null;
    boxImageUrl: string | null;
  };
  productSet: { id: string; name: string | null; isBase: boolean };
  productSets: Array<{ id: string; name: string | null; isBase: boolean }>;
  uniqueOwned: number;
  totalCards: number;
  cards: BinderCard[];
};
type PageTurn = { from: number; to: number; direction: "next" | "previous" };

function productName(data: BinderData) {
  return [data.product.year, data.product.brand || data.product.id, data.product.sport]
    .filter(Boolean).join(" ");
}
function setName(data: BinderData) {
  return data.productSet.isBase ? "Base Set" : data.productSet.name || "Insert Set";
}
function accessibleCard(card: BinderCard) {
  return card.player + (card.cardNumber ? " #" + card.cardNumber : "") +
    (card.quantity > 0 ? ", owned " + card.quantity : ", not owned");
}
function useBodyLocked(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, [open]);
}

export default function BinderClient({
  productId, initialProductSetId, initialCardId = null, initialOpen = false,
}: {
  productId: string;
  initialProductSetId: string;
  initialCardId?: number | null;
  initialOpen?: boolean;
}) {
  const [setId, setSetId] = useState(initialProductSetId);
  const [data, setData] = useState<BinderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(-1); // -1 is the nostalgic binder cover
  const [turn, setTurn] = useState<PageTurn | null>(null);
  const [preview, setPreview] = useState<BinderCard | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [brokenScans, setBrokenScans] = useState<Record<string, boolean>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const switchingSets = useRef(false);
  const [landscapeScans, setLandscapeScans] = useState<Record<string, boolean>>({});
  const dialog = useRef<HTMLDialogElement>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (setId) qs.set("productSetId", setId);
      const url = "/api/collection/product/" + encodeURIComponent(productId) +
        "/binder" + (qs.size ? "?" + qs.toString() : "");
      const result = await fetch(url, { signal, cache: "no-store" });
      const json = await result.json().catch(() => null);
      if (!result.ok || !json?.ok) throw new Error(json?.error || "Couldn't open this binder.");
      if (signal.aborted) return;
      const incoming = json as BinderData;
      setData(incoming);
      // Returning from Card Details restores the sleeve page; a never-opened
      // product set still starts with its nostalgic front cover.
      const storageKey = "vcs:binder:" + productId + ":" + incoming.productSet.id;
      let savedPage = -1;
      try {
        const rawPage = sessionStorage.getItem(storageKey);
        if (rawPage !== null) {
          const parsed = Number(rawPage);
          if (Number.isSafeInteger(parsed)) savedPage = Math.max(-1,
            Math.min(Math.ceil(incoming.cards.length / 9) - 1, parsed));
        }
      } catch { /* Session memory is a convenience, never required. */ }
      // Directly linked from a specific card? Turn straight to that nine-pocket
      // page. Checklist's Binder toggle opens page one instead of hiding it
      // behind the cover; ordinary Collection links still open the cover.
      const arrivedViaSetSwitch = switchingSets.current;
      switchingSets.current = false;
      const selectedCardIndex = !arrivedViaSetSwitch && initialCardId ?
        incoming.cards.findIndex(card => card.cardId === initialCardId) : -1;
      const startPage = arrivedViaSetSwitch ? -1 :
        selectedCardIndex >= 0 ? Math.floor(selectedCardIndex / 9) :
        initialOpen ? 0 : savedPage;
      setPage(Math.min(Math.max(-1, startPage), Math.ceil(incoming.cards.length / 9) - 1));
      setTurn(null);
      setBrokenScans({});
    } catch (e) {
      if (!signal.aborted) setError(e instanceof Error ? e.message : "Couldn't open this binder.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [productId, setId, initialCardId, initialOpen]);

  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal);
    return () => abort.abort();
  }, [load]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const modal = dialog.current;
    if (!modal) return;
    if (preview && !modal.open) modal.showModal();
    if (!preview && modal.open) modal.close();
  }, [preview]);
  useBodyLocked(Boolean(preview));

  const pageCount = data ? Math.ceil(data.cards.length / 9) : 0;
  const completedPages = useMemo(() => {
    if (!data) return 0;
    let completed = 0;
    for (let i = 0; i < pageCount; i += 1) {
      const slice = data.cards.slice(i * 9, (i + 1) * 9);
      if (slice.length === 9 && slice.every(c => c.quantity > 0)) completed += 1;
    }
    return completed;
  }, [data, pageCount]);

  const flip = useCallback((target: number) => {
    if (loading || !data || turn || target === page || target < -1 || target >= pageCount) return;
    const direction = target > page ? "next" : "previous";
    if (timer.current) clearTimeout(timer.current);
    setTurn({ from: page, to: target, direction });
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    timer.current = setTimeout(() => {
      setPage(target);
      try {
        sessionStorage.setItem("vcs:binder:" + productId + ":" + data.productSet.id, String(target));
      } catch { /* Browsing still works when storage is unavailable. */ }
      setTurn(null);
      timer.current = null;
    }, reducedMotion ? 0 : 520);
  }, [data, loading, page, pageCount, turn, productId]);

  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (preview || event.altKey || event.ctrlKey || event.metaKey ||
          ["INPUT", "SELECT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName)) return;
      if (event.key === "ArrowRight") flip(page + 1);
      if (event.key === "ArrowLeft") flip(page - 1);
    }
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [flip, page, preview]);

  // Only preload the next nine scans, not the entire card universe.
  useEffect(() => {
    if (!data || page < -1 || page >= pageCount - 1) return;
    const upcoming = data.cards.slice((page + 1) * 9, (page + 2) * 9);
    for (const card of upcoming) {
      if (card.quantity > 0 && card.frontImageUrl) {
        const image = new Image();
        image.src = card.frontImageUrl;
      }
    }
  }, [data, page, pageCount]);

  function changeSet(next: string) {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setTurn(null);
    setPage(-1);
    setData(null);
    setPreview(null);
    try { sessionStorage.removeItem("vcs:binder:" + productId + ":" + next); } catch { /* optional */ }
    switchingSets.current = true;
    setSetId(next);
    const url = "/collection/" + encodeURIComponent(productId) + "/binder?productSetId=" +
      encodeURIComponent(next);
    window.history.replaceState(window.history.state, "", url);
  }

  function markLandscape(key: string, image: HTMLImageElement) {
    const isLandscape = image.naturalWidth > image.naturalHeight;
    setLandscapeScans(previous => previous[key] === isLandscape
      ? previous : { ...previous, [key]: isLandscape });
  }

  function openPreview(card: BinderCard) {
    if (turn) return;
    setShowBack(false);
    setPreview(card);
  }

  function renderPocket(card: BinderCard | undefined, slot: number) {
    if (!card) return <div key={"unused-" + slot} className="binder-pocket binder-pocket-unused"
      aria-hidden="true"><div className="binder-pocket-lip" /></div>;
    const owned = card.quantity > 0;
    const visibleScan = owned && !!card.frontImageUrl && !brokenScans[String(card.cardId) + ":front"];
    const state = !owned ? "missing" : visibleScan ? "owned" : "scanless";
    return <button type="button" key={card.cardId}
      className={"binder-pocket binder-pocket-" + state +
        (card.cardId === initialCardId && !switchingSets.current ? " binder-pocket-focused" : "")}
      aria-label={accessibleCard(card)} onClick={() => openPreview(card)}>
      <span className="binder-pocket-contents">
        {visibleScan ? <img src={card.frontImageUrl!}
          alt="" loading="lazy" decoding="async"
          className={landscapeScans[String(card.cardId) + ":front"] ? "binder-oriented-scan is-landscape" : "binder-oriented-scan"}
          onLoad={event => markLandscape(String(card.cardId) + ":front", event.currentTarget)}
          onError={() => setBrokenScans(prev => ({ ...prev, [String(card.cardId) + ":front"]: true }))} /> :
          <span className={owned ? "binder-scan-card" : "binder-empty-pocket"}>
            <span className="binder-ghost-number">#{card.cardNumber || "—"}</span>
            {owned ? <>
              <span className="binder-missing-art-icon" aria-hidden="true">▧</span>
              <span className="binder-ghost-name">{card.player}</span>
              <small>SCAN UNAVAILABLE</small>
            </> : <>
              <span className="binder-ghost-symbol" aria-hidden="true">+</span>
              <span className="binder-ghost-name">{card.player}</span>
              <small>EMPTY POCKET</small>
            </>}
          </span>}
      </span>
      {owned && <span className="binder-qty-badge">×{card.quantity}</span>}
      <span className="binder-pocket-lip" aria-hidden="true" />
    </button>;
  }

  function renderCover() {
    if (!data) return null;
    return <button type="button" className="binder-cover" aria-label="Open your trading card binder"
      onClick={() => flip(0)} disabled={Boolean(turn) || pageCount === 0}>
      <div className="binder-cover-spine" aria-hidden="true" />
      <div className="binder-cover-face">
        <div className="binder-cover-emboss" aria-hidden="true">
          <span className="binder-cover-arc">THE COLLECTOR&apos;S</span>
          <span className="binder-cover-monogram">VCS</span>
          <span className="binder-cover-divider" />
          <span className="binder-cover-arc">TRADING CARD ALBUM</span>
        </div>
        <div className="binder-cover-label">
          <span>MY COLLECTION</span>
          <strong>{productName(data)}</strong>
          <small>{setName(data)} · {data.totalCards.toLocaleString()} cards</small>
        </div>
        <div className="binder-cover-bottom">
          <span>9-POCKET • COLLECTOR&apos;S EDITION</span>
          <span className="binder-cover-stamp">EST. 1990</span>
        </div>
      </div>
    </button>;
  }

  function renderSheet(index: number) {
    if (!data) return null;
    if (index === -1) return renderCover();
    const cards = data.cards.slice(index * 9, (index + 1) * 9);
    return <div className="binder-sheet">
      <div className="binder-ring-rail" aria-hidden="true">
        {[0, 1, 2].map(x => <span className="binder-ring" key={x} />)}
      </div>
      <div className="binder-plastic">
        <div className="binder-pockets">
          {Array.from({ length: 9 }, (_, slot) => renderPocket(cards[slot], slot))}
        </div>
        <div className="binder-sheet-bottom">
          <span>{data.product.year} {data.product.brand} · {setName(data)}</span>
          <span>{index + 1} / {pageCount}</span>
        </div>
      </div>
    </div>;
  }

  const currentCards = data && page >= 0 ? data.cards.slice(page * 9, (page + 1) * 9) : [];
  const onPage = currentCards.filter(c => c.quantity > 0).length;
  const activeSetId = data?.productSet.id || setId;
  const previewImage = preview ?
    (showBack ? preview.backImageUrl : preview.frontImageUrl) : null;
  const previewKey = preview ? preview.cardId + ":" + (showBack ? "back" : "front") : "";
  const validPreviewImage = previewImage && !brokenScans[previewKey];
  const uniquePercent = data && data.totalCards ? Math.round(data.uniqueOwned / data.totalCards * 100) : 0;

  return <main className="binder-shell">
    <div className="binder-content">
      <header className="binder-header">
        <div className="binder-heading">
          <Link href={"/collection/" + encodeURIComponent(productId)} className="binder-back">← Back to Collection</Link>
          <span className="binder-eyebrow">THE NINE-POCKET COLLECTION</span>
          <h1>Binder View</h1>
          <p>Just like flipping through your childhood collection.</p>
        </div>
        <div className="binder-head-actions">
          <label className="binder-set-selector">Choose a product set
            <select value={activeSetId} disabled={loading || !data || !!turn}
              onChange={e => changeSet(e.target.value)}>
              {data?.productSets.map(s => <option key={s.id} value={s.id}>
                {s.isBase ? "Base Set" : s.name || s.id}
              </option>)}
            </select>
          </label>
          <Link className="binder-collection-link"
            href={checklistHref(productId, activeSetId)}>Set checklist ↗</Link>
        </div>
      </header>

      {data && <SetViewToggle productId={productId} productSetId={activeSetId} active="binder" />}

      {error && <div className="binder-error" role="alert">
        {error} <button type="button" onClick={() => void load(new AbortController().signal)}>Try again</button>
      </div>}
      {loading && <div className="binder-loading" role="status">Opening your binder…</div>}
      {!loading && data && <>
        <div className="binder-summary">
          <div><span>THE SET</span><strong>{productName(data)}</strong>
            <small>{setName(data)}</small></div>
          <div><span>COLLECTED</span><strong>{data.uniqueOwned} / {data.totalCards}</strong>
            <small>{uniquePercent}% complete</small></div>
          <div><span>COMPLETE PAGES</span><strong>{completedPages} / {pageCount}</strong>
            <small>Nine cards per page</small></div>
        </div>

        <section className="binder-experience" aria-label="Interactive nine-pocket card binder">
          <div className="binder-tabletop">
            <div className={"binder-stage" + (turn ? " binder-is-turning" : "")}
              onTouchStart={event => {
                const t = event.touches[0];
                touchStart.current = { x: t.clientX, y: t.clientY };
              }}
              onTouchEnd={event => {
                const started = touchStart.current;
                touchStart.current = null;
                if (!started || turn || preview) return;
                const t = event.changedTouches[0];
                const dx = t.clientX - started.x, dy = t.clientY - started.y;
                if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
                flip(page + (dx < 0 ? 1 : -1));
              }}>
              {turn && <div className="binder-layer binder-layer-next" aria-hidden="true">
                {renderSheet(turn.to)}
              </div>}
              <div className={"binder-layer binder-layer-current" +
                (turn ? " binder-turn-" + turn.direction : "")}
                aria-hidden={Boolean(turn)}>
                {renderSheet(turn ? turn.from : page)}
              </div>
            </div>
          </div>
          <div className="binder-navigation">
            <button className="binder-nav-button" type="button"
              onClick={() => flip(page - 1)} disabled={page < 0 || Boolean(turn)}
              aria-label="Flip to previous binder page">← <span>Previous</span></button>
            <div className="binder-page-label" aria-live="polite">
              <strong>{page < 0 ? "Front Cover" : "Page " + (page + 1) + " of " + pageCount}</strong>
              <small>{page < 0 ? "Your collection begins here" :
                onPage + " of " + currentCards.length + " pockets filled"}</small>
              {pageCount > 8 && <label className="binder-page-jump">
                Jump to
                <select aria-label="Jump to binder page" value={page}
                  disabled={Boolean(turn)} onChange={event => flip(Number(event.target.value))}>
                  <option value={-1}>Cover</option>
                  {Array.from({ length: pageCount }, (_, index) => (
                    <option key={index} value={index}>Page {index + 1}</option>
                  ))}
                </select>
              </label>}
            </div>
            <button className="binder-nav-button binder-nav-next" type="button"
              onClick={() => flip(page + 1)} disabled={page >= pageCount - 1 || Boolean(turn)}>
              <span>{page < 0 ? "Open Binder" : "Next"}</span> →</button>
          </div>
          <div className="binder-instruction">{page < 0 ?
            "Open the cover to turn to the first page." :
            "Tap a pocket to take a closer look. Swipe to flip pages."}</div>
        </section>
        <div className="binder-legend" aria-label="Pocket key">
          <span><i className="binder-legend-owned"/> In collection</span>
          <span><i className="binder-legend-missing"/> Empty pocket</span>
          <span><i className="binder-legend-noscan"/> Owned · scan unavailable</span>
        </div>
      </>}

      <dialog ref={dialog} className="binder-preview"
        aria-label="Card pocket preview"
        onCancel={() => setPreview(null)}
        onClick={event => { if (event.target === event.currentTarget) setPreview(null); }}>
        {preview && <div className="binder-preview-inside">
          <div className="binder-preview-top">
            <span>FROM YOUR BINDER</span>
            <button type="button" aria-label="Close card preview" onClick={() => setPreview(null)}>×</button>
          </div>
          <div className="binder-preview-art">
            {validPreviewImage ? <img src={previewImage!} alt={preview.player + " card " + (showBack ? "back" : "front")}
              className={landscapeScans[previewKey] ? "binder-oriented-scan is-landscape" : "binder-oriented-scan"}
              onLoad={event => markLandscape(previewKey, event.currentTarget)}
              onError={() => setBrokenScans(prev => ({ ...prev, [previewKey]: true }))} /> :
              <div className="binder-preview-placeholder">
                <span>#{preview.cardNumber}</span>
                <strong>{preview.quantity ? "Scan unavailable" : "Empty pocket"}</strong>
                <small>{preview.player}</small>
              </div>}
          </div>
          {preview.backImageUrl && <div className="binder-preview-flip">
            <button type="button" onClick={() => setShowBack(v => !v)}>
              <span aria-hidden="true">↻</span> Show {showBack ? "front" : "back"}
            </button>
          </div>}
          <h2>{preview.player} <span>#{preview.cardNumber}</span></h2>
          <p>{[productName(data!), setName(data!), preview.team, preview.subset, preview.variant]
            .filter(Boolean).join(" · ")}</p>
          <div className="binder-preview-ownership">
            <span>{preview.quantity > 0 ? "IN YOUR COLLECTION" : "MISSING FROM COLLECTION"}</span>
            <strong>{preview.quantity > 0 ? "×" + preview.quantity + " owned" : "Not owned"}</strong>
          </div>
          <Link href={"/cards/" + preview.cardId} className="binder-preview-details">
            Open Card Details ↗
          </Link>
        </div>}
      </dialog>
    </div>
  </main>;
}
