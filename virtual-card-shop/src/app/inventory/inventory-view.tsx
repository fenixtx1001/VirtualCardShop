"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  baseSets, defaultInventoryFilters, inventoryName, inventorySorts, missingText,
  restoreInventoryFilters, visibleInventory, type InventoryFilters, type InventoryProduct,
  type InventorySetProgress, type InventorySort, type MissingInventoryCard,
} from "@/lib/inventory";

const STORAGE_KEY = "vcs:inventory:view:v2";
const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const number = (n: number) => n.toLocaleString("en-US");

function Icon({ kind }: { kind: "search" | "filter" | "arrow" | "close" | "random" | "refresh" }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    filter: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" /><circle cx="15" cy="17" r="2" /></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    random: <><path d="M3 6h3c4 0 8 12 12 12h3m-4-4 4 4-4 4M3 18h3c1 0 2-1 3-2m6-8 3-2h3m-4-4 4 4-4 4" /></>,
    refresh: <><path d="M20 5v5h-5M4 19v-5h5" /><path d="M19 10a7 7 0 0 0-12-5M5 14a7 7 0 0 0 12 5" /></>,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

function PackArt({ product, eager = false }: { product: InventoryProduct; eager?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className="inv-art">
    {product.packImageUrl && failed !== product.packImageUrl
      ? <img src={product.packImageUrl} alt={`${inventoryName(product.productId)} pack`} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(product.packImageUrl)} />
      : <span className="inv-art-fallback"><strong>VCS</strong><span>PACK</span></span>}
  </span>;
}

function Progress({ set, named = false }: { set: InventorySetProgress; named?: boolean }) {
  const percent = set.cardsAtNext / set.totalCards * 100;
  return <div className="inv-progress">
    <div className="inv-progress-heading"><span>{named ? set.name || (set.isBase ? "Base set" : "Insert set") : "Base set"}</span><strong>Prestige {number(set.level)}</strong></div>
    <p><strong>{missingText(set)}</strong><span> for Prestige {number(set.nextLevel)}</span></p>
    <div className="inv-track" role="progressbar" aria-label={`${set.name || "Base set"}: cards ready for Prestige ${set.nextLevel}`} aria-valuemin={0} aria-valuemax={set.totalCards} aria-valuenow={set.cardsAtNext} aria-valuetext={`${set.cardsAtNext} of ${set.totalCards} cards have enough copies; ${missingText(set)}`}><span style={{ width: `${percent}%` }} /></div>
  </div>;
}

function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return <dialog className="inv-sheet" ref={ref} aria-labelledby="inv-sheet-title" onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="inv-sheet-inner">
      <header className="inv-sheet-header"><h2 id="inv-sheet-title">{title}</h2><button className="inv-icon-button" onClick={onClose} aria-label="Close panel" autoFocus><Icon kind="close" /></button></header>
      {children}
    </div>
  </dialog>;
}

function MissingCards({ set, onBack, onNavigate }: { set: InventorySetProgress; onBack: () => void; onNavigate: () => void }) {
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{ rows: MissingInventoryCard[]; total: number; nextLevel: number | null } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setResult(null);
    fetch(`/api/inventory/missing?${new URLSearchParams({ productSetId: set.productSetId, offset: String(page * 50) })}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Couldn't load missing cards.");
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Couldn't load missing cards."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    heading.current?.focus({ preventScroll: true });
    return () => controller.abort();
  }, [set.productSetId, page, retry]);
  return <>
    <button className="inv-text-button" onClick={onBack}>← All set progress</button>
    <h3 className="inv-missing-title" ref={heading} tabIndex={-1}>{set.name || (set.isBase ? "Base set" : "Insert set")}</h3>
    <p className="inv-sheet-note">Cards needed for Prestige {result?.nextLevel ?? set.nextLevel}. Ownership includes cards in grading.</p>
    {loading && <p role="status">Loading missing cards…</p>}
    {error && <div className="inv-notice" role="alert">{error}<button onClick={() => setRetry((r) => r + 1)}>Retry</button></div>}
    {result && <>
      <ul className="inv-missing-list">{result.rows.map((card) => <li key={card.cardId}>
        <span className="inv-card-number">#{card.cardNumber}</span>
        <Link href={`/cards/${card.cardId}`} onClick={onNavigate}><strong>{card.player}</strong><span>{card.team || "View card"}</span></Link>
        <span className="inv-card-needed"><strong>Need {number(card.needed)}</strong><small>{number(card.owned)} owned</small></span>
      </li>)}</ul>
      {!result.total && <p>No missing cards for this set. Refresh Inventory to see the latest progress.</p>}
      {result.total > 0 && <div className="inv-pagination"><button className="inv-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button><span>{number(page * 50 + 1)}–{number(Math.min((page + 1) * 50, result.total))} of {number(result.total)}</span><button className="inv-secondary" disabled={(page + 1) * 50 >= result.total} onClick={() => setPage((p) => p + 1)}>Next</button></div>}
    </>}
  </>;
}

type Panel = { kind: "filters" | "summary" } | { kind: "product"; productId: string; setId?: string };

export default function InventoryView() {
  const router = useRouter();
  const [rows, setRows] = useState<InventoryProduct[]>([]);
  const [filters, setFilters] = useState<InventoryFilters>(defaultInventoryFilters);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [progressAvailable, setProgressAvailable] = useState(true);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [revision, setRevision] = useState(0);
  const request = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const savedScroll = useRef<number | null>(null);
  const currentFilters = useRef(filters);
  currentFilters.current = filters;

  const savePosition = useCallback(() => {
    if (savedScroll.current !== null) return;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ filters: currentFilters.current, scroll: window.scrollY })); } catch { /* Storage can be disabled. */ }
  }, []);

  const load = useCallback(async () => {
    const id = ++request.current;
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    setRefreshing(true);
    try {
      const response = await fetch("/api/inventory", { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(response.status === 401 ? "Sign in to view your inventory." : "Couldn't refresh your inventory. Please try again.");
      if (id !== request.current) return;
      setRows(data.rows); setProgressAvailable(data.progressAvailable !== false); setError(""); setRevision((r) => r + 1);
    } catch (err) {
      if (!controller.signal.aborted && id === request.current) setError(err instanceof Error ? err.message : "Couldn't load your inventory.");
    } finally { if (id === request.current && !controller.signal.aborted) { setLoading(false); setRefreshing(false); } }
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (saved) { setFilters(restoreInventoryFilters(saved.filters)); savedScroll.current = typeof saved.scroll === "number" && Number.isFinite(saved.scroll) ? Math.max(0, saved.scroll) : 0; }
      else {
        // Retain the previous Inventory preference on first visit to the new layout.
        const hide = localStorage.getItem("vcs.inventory.hideZeroPacks");
        if (hide === "0") setFilters((f) => ({ ...f, hideEmpty: false }));
      }
    } catch { /* Use defaults if saved preferences cannot be read. */ }
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("vcs:collection-changed", refresh);
    window.addEventListener("vcs:economy-changed", refresh);
    window.addEventListener("pagehide", savePosition);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      abort.current?.abort();
      window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh);
      window.removeEventListener("vcs:collection-changed", refresh); window.removeEventListener("vcs:economy-changed", refresh);
      window.removeEventListener("pagehide", savePosition); document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, savePosition]);

  useEffect(() => {
    if (loading || savedScroll.current === null) return;
    const top = savedScroll.current;
    const frame = requestAnimationFrame(() => { window.scrollTo({ top, behavior: "instant" }); savedScroll.current = null; });
    return () => cancelAnimationFrame(frame);
  }, [loading]);

  useEffect(() => {
    if (loading) return;
    savePosition();
    try { localStorage.setItem("vcs.inventory.hideZeroPacks", filters.hideEmpty ? "1" : "0"); } catch { /* Optional preference. */ }
    let frame = 0;
    const saveScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(savePosition); };
    window.addEventListener("scroll", saveScroll, { passive: true });
    return () => { window.removeEventListener("scroll", saveScroll); cancelAnimationFrame(frame); };
  }, [filters, loading, savePosition]);

  const visible = useMemo(() => visibleInventory(rows, filters), [rows, filters]);
  const sports = [...new Set(rows.map((r) => r.sport || "Other"))].sort();
  const packs = rows.reduce((sum, row) => sum + row.packsOwned, 0);
  const products = rows.filter((r) => r.packsOwned > 0).length;
  const value = rows.reduce((sum, row) => sum + row.packsOwned * row.packPriceCents, 0);
  const filterCount = Number(filters.sport !== "all") + Number(!filters.hideEmpty);
  const activeProduct = panel?.kind === "product" ? rows.find((row) => row.productId === panel.productId) : undefined;
  const missingSet = activeProduct && panel?.kind === "product" ? activeProduct.sets.find((s) => s.productSetId === panel.setId) : undefined;
  const changeFilters = (change: Partial<InventoryFilters>) => setFilters((f) => ({ ...f, ...change }));
  const close = () => setPanel(null);
  const navigate = () => { savePosition(); setPanel(null); };
  const randomPack = () => {
    const options = visible.filter((row) => row.packsOwned > 0);
    if (!options.length) return;
    savePosition(); router.push(`/open-pack/${encodeURIComponent(options[Math.floor(Math.random() * options.length)].productId)}`);
  };

  return <div className="inv-shell">
    <header className="inv-header">
      <div><h1>Inventory</h1><button className="inv-summary" onClick={() => setPanel({ kind: "summary" })} disabled={loading} aria-label="View inventory summary">{loading ? "Your unopened collection" : <><strong>{number(packs)}</strong> packs <span>·</span> <strong>{number(products)}</strong> products <span aria-hidden="true">↗</span></>}</button></div>
      <Link className="inv-shop-link" href="/shop" onClick={savePosition}>Shop <Icon kind="arrow" /></Link>
    </header>

    <div className="inv-toolbar">
      <label className="inv-search"><Icon kind="search" /><span className="inv-sr-only">Search inventory</span><input type="search" placeholder="Search your packs" value={filters.query} onChange={(e) => changeFilters({ query: e.target.value })} /></label>
      <button className="inv-secondary inv-filter-button" onClick={() => setPanel({ kind: "filters" })} aria-label={`Filter and sort inventory${filterCount ? `, ${filterCount} active filters` : ""}`}><Icon kind="filter" /><span>Filter / Sort</span>{filterCount > 0 && <b>{filterCount}</b>}</button>
    </div>
    <div className="inv-list-tools">
      <span role="status">{loading ? "Loading packs…" : `${number(visible.length)} ${visible.length === 1 ? "product" : "products"}`}<span className="inv-sort-caption"> · {inventorySorts[filters.sort]}</span></span>
      <div><button className="inv-text-button" onClick={randomPack} disabled={!visible.some((r) => r.packsOwned > 0)} title="Choose a random product from the packs shown"><Icon kind="random" />Random pack</button><button className="inv-icon-button" onClick={() => void load()} disabled={refreshing} aria-label={refreshing ? "Refreshing inventory" : "Refresh inventory"}><Icon kind="refresh" /></button></div>
    </div>
    {filters.sport !== "all" && <button className="inv-chip" onClick={() => changeFilters({ sport: "all" })}>{filters.sport}<Icon kind="close" /><span className="inv-sr-only">Remove sport filter</span></button>}
    {error && <div className="inv-notice" role="alert">{error}{rows.length > 0 && <span>Showing the last loaded inventory.</span>}<button onClick={() => void load()}>Retry</button></div>}
    {!progressAvailable && <div className="inv-notice" role="status">Prestige progress is temporarily unavailable. You can still open your packs.<button onClick={() => void load()}>Retry progress</button></div>}

    {loading ? <div className="inv-loading" aria-label="Loading inventory" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i}><span /><div><i /><i /><i /></div></div>)}</div> : <>
      <div className="inv-list">{visible.map((product, index) => {
        const bases = baseSets(product);
        const title = inventoryName(product.productId);
        return <article className="inv-product" key={product.productId}>
          <button className="inv-art-button" onClick={() => setPanel({ kind: "product", productId: product.productId })} aria-label={`View ${title} details`}><PackArt product={product} eager={index < 4} /></button>
          <div className="inv-product-body">
            <h2><button onClick={() => setPanel({ kind: "product", productId: product.productId })}>{title}</button></h2>
            <div className="inv-product-meta"><strong>{number(product.packsOwned)} {product.packsOwned === 1 ? "pack" : "packs"}</strong><span>·</span><span>{product.sport || "Trading cards"}</span></div>
            {bases.length ? bases.map((set) => <Progress key={set.productSetId} set={set} named={bases.length > 1} />) : <p className="inv-unavailable">{progressAvailable ? "Base-set progress unavailable" : "Progress temporarily unavailable"}</p>}
            <div className="inv-product-actions">
              <button className="inv-text-button" onClick={() => setPanel({ kind: "product", productId: product.productId, setId: bases.length === 1 ? bases[0].productSetId : undefined })} aria-label={`${bases.length === 1 ? "View missing cards" : "View set progress"} for ${title}`}>{bases.length === 1 ? "View missing" : "Set progress"}<span aria-hidden="true">↗</span></button>
              {product.packsOwned > 0 ? <Link className="inv-primary" href={`/open-pack/${encodeURIComponent(product.productId)}`} onClick={savePosition} aria-label={`Open a pack of ${title}`}>Open pack<Icon kind="arrow" /></Link> : <Link className="inv-secondary" href="/shop" onClick={savePosition}>Visit Shop</Link>}
            </div>
          </div>
        </article>;
      })}</div>
      {!visible.length && !error && <section className="inv-empty"><span className="inv-empty-mark" aria-hidden="true">VCS</span><h2>{rows.length ? "No packs match this view" : "Your next rip starts here"}</h2><p>{rows.length ? "Try another search or include products with no packs left." : "Pick up a few packs in the Shop. Your collection will be waiting here."}</p>{rows.length > 0 && <button className="inv-secondary" onClick={() => setFilters({ ...defaultInventoryFilters, hideEmpty: false })}>Reset filters</button>}<Link href="/shop" className="inv-primary" onClick={savePosition}>Visit Shop<Icon kind="arrow" /></Link></section>}
    </>}

    {panel && <Sheet title={panel.kind === "filters" ? "Filter & sort" : panel.kind === "summary" ? "Your unopened collection" : activeProduct ? inventoryName(activeProduct.productId) : "Product details"} onClose={close}>
      {panel.kind === "filters" && <div className="inv-filter-fields">
        <label>Sort by<select aria-label="Sort by" value={filters.sort} onChange={(e) => changeFilters({ sort: e.target.value as InventorySort })}>{Object.entries(inventorySorts).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        {filters.sort === "prestige" && <p className="inv-sheet-note">Fewest copies needed for a base set’s next prestige. For products with multiple base sets, the closest one determines the order.</p>}
        <label>Sport<select aria-label="Sport" value={filters.sport} onChange={(e) => changeFilters({ sport: e.target.value })}><option value="all">All sports</option>{!sports.includes(filters.sport) && filters.sport !== "all" && <option value={filters.sport}>{filters.sport}</option>}{sports.map((sport) => <option key={sport} value={sport}>{sport}</option>)}</select></label>
        <label className="inv-checkbox"><input type="checkbox" checked={filters.hideEmpty} onChange={(e) => changeFilters({ hideEmpty: e.target.checked })} />Only products with unopened packs</label>
        <footer className="inv-sheet-actions"><button className="inv-text-button" onClick={() => setFilters(defaultInventoryFilters)}>Reset</button><button className="inv-primary" onClick={close}>Show {number(visible.length)} {visible.length === 1 ? "product" : "products"}<Icon kind="arrow" /></button></footer>
      </div>}
      {panel.kind === "summary" && <><dl className="inv-facts"><div><dt>Unopened packs</dt><dd>{number(packs)}</dd></div><div><dt>Products with packs</dt><dd>{number(products)}</dd></div><div><dt>Current pack list value</dt><dd>{money(value)}</dd></div></dl><p className="inv-sheet-note">Based on today’s standard pack prices. This is not your purchase cost or a resale offer.</p></>}
      {activeProduct && (missingSet ? <MissingCards key={`${missingSet.productSetId}-${revision}`} set={missingSet} onBack={() => setPanel({ kind: "product", productId: activeProduct.productId })} onNavigate={navigate} /> : <>
        <div className="inv-detail-product"><PackArt product={activeProduct} /><div><strong>{number(activeProduct.packsOwned)} unopened packs</strong><p>{[activeProduct.sport, activeProduct.cardsPerPack ? `${activeProduct.cardsPerPack} cards per pack` : null].filter(Boolean).join(" · ")}</p>{activeProduct.packsOwned > 0 && <Link className="inv-primary" href={`/open-pack/${encodeURIComponent(activeProduct.productId)}`} onClick={navigate}>Open pack<Icon kind="arrow" /></Link>}</div></div>
        <div className="inv-detail-sets">{activeProduct.sets.map((set) => <section key={set.productSetId}><span className="inv-set-kind">{set.isBase ? "BASE SET" : "INSERT SET"}</span><Progress set={set} named /><button className="inv-text-button" onClick={() => setPanel({ kind: "product", productId: activeProduct.productId, setId: set.productSetId })}>View missing cards<Icon kind="arrow" /></button></section>)}</div>
        {!activeProduct.sets.length && <p className="inv-sheet-note">Set progress is currently unavailable.</p>}
        <dl className="inv-facts"><div><dt>Standard pack price</dt><dd>{money(activeProduct.packPriceCents)}</dd></div><div><dt>Last inventory activity</dt><dd>{new Date(activeProduct.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</dd></div></dl>
        <Link className="inv-text-button" href={`/checklist/${encodeURIComponent(activeProduct.productId)}`} onClick={navigate}>Full product checklist<Icon kind="arrow" /></Link>
      </>)}
    </Sheet>}
  </div>;
}
