"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { buildShelves, productName, type ProductProgress, type ShopProduct, type Shelf } from "@/lib/shop/discovery";
import { shopDateKey } from "@/lib/shop/pricing";

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const messageOf = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";
type Kind = "pack" | "box";
type Sort = "name" | "year_desc" | "price_asc" | "price_desc";

function PackArt({ product, box = true, eager = false }: { product: ShopProduct; box?: boolean; eager?: boolean }) {
  const src = (box ? product.boxImageUrl || product.packImageUrl : product.packImageUrl || product.boxImageUrl);
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <div className="shop-art-placeholder"><span>VCS</span><small>{product.year || "CARD SHOP"}</small></div>;
  return <img src={src} alt={`${productName(product)} ${box ? "box" : "pack"}`} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(src)} />;
}

function Price({ value, regular, label }: { value: number | null; regular: number | null; label: string }) {
  return <span className="shop-price"><small>{label}</small>{value === null ? <strong>—</strong> : <><strong>{money(value)}</strong>{regular !== null && regular > value && <del>{money(regular)}</del>}</>}</span>;
}

function progressText(product: ShopProduct, progress: Record<string, ProductProgress>, kind?: Shelf["kind"]) {
  const row = progress[product.id];
  if (kind === "completion" && row) return `${row.baseTotal - row.baseOwned} cards to complete`;
  if (kind === "prestige" && row?.prestige) return `${row.prestige.missingCopies} copies to level ${row.prestige.nextLevel}`;
  return null;
}

function ProductCard({ product, onSelect, progress, kind }: { product: ShopProduct; onSelect: (product: ShopProduct) => void; progress: Record<string, ProductProgress>; kind?: Shelf["kind"] }) {
  const note = progressText(product, progress, kind);
  const record = progress[product.id];
  const percent = kind === "completion" && record?.baseTotal ? record.baseOwned / record.baseTotal * 100 : kind === "prestige" && record?.prestige ? record.prestige.cardsAtNext / record.prestige.totalCards * 100 : 0;
  return <button className="shop-product" onClick={() => onSelect(product)} aria-label={`View ${productName(product)}, packs ${money(product.effectivePackPriceCents)}`}>
    <span className="shop-art" style={{ "--art-hue": product.year ? (product.year * 19) % 80 + 15 : 35 } as CSSProperties}>
      <PackArt product={product} />
      {product.discountBps > 0 ? <span className="shop-stamp">{product.discountBps / 100}% OFF</span> : product.isNewProduct ? <span className="shop-stamp shop-stamp-new">JUST IN</span> : null}
    </span>
    <span className="shop-card-meta">{product.sport || "Trading cards"}</span>
    <span className="shop-card-title">{productName(product)}</span>
    <span className="shop-card-prices"><Price label="Pack" value={product.effectivePackPriceCents} regular={product.standardPackPriceCents} /><Price label="Box" value={product.effectiveBoxPriceCents} regular={product.standardBoxPriceCents} /></span>
    {note && <span className="shop-progress-note"><span className="shop-progress-track"><span style={{ width: `${percent}%` }} /></span><span>{note}</span>{kind === "prestige" && record?.prestige && <small>{record.prestige.name}</small>}</span>}
  </button>;
}

function ProductShelf({ shelf, onSelect, onShowAll, progress }: { shelf: Shelf; onSelect: (product: ShopProduct) => void; onShowAll: () => void; progress: Record<string, ProductProgress> }) {
  const rail = useRef<HTMLDivElement>(null);
  return <section className="shop-shelf" aria-labelledby={`shelf-${shelf.id}`}>
    <div className="shop-shelf-heading"><div><h2 id={`shelf-${shelf.id}`}>{shelf.title}</h2><p>{shelf.subtitle}</p></div>
      <div className="shop-shelf-controls"><button className="shop-arrow" aria-label={`Scroll ${shelf.title} left`} onClick={() => rail.current?.scrollBy({ left: -400, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}>‹</button><button className="shop-text-button" onClick={onShowAll}>Show all <span aria-hidden="true">↗</span></button></div></div>
    <div className="shop-rail" ref={rail}>
      {shelf.products.slice(0, 10).map((product) => <ProductCard key={product.id} product={product} progress={progress} kind={shelf.kind} onSelect={onSelect} />)}
      <button className="shop-show-all" onClick={onShowAll}><span aria-hidden="true">↗</span><strong>Show all</strong><small>{shelf.products.length} products</small></button>
    </div>
  </section>;
}

export function SealedShop({ view, onViewChange }: { view: "discover" | "all"; onViewChange: (view: "discover" | "all") => void }) {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [progress, setProgress] = useState<Record<string, ProductProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendationError, setRecommendationError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [category, setCategory] = useState<Shelf | null>(null);
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("all");
  const [year, setYear] = useState("all");
  const [sort, setSort] = useState<Sort>("name");
  const [filterOpen, setFilterOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40);
  const [notice, setNotice] = useState<string | null>(null);
  const dateRef = useRef("");
  const fetchNumber = useRef(0);
  const categoryScroll = useRef(0);
  const catalogHeading = useRef<HTMLHeadingElement>(null);

  const loadProducts = useCallback(async () => {
    const request = ++fetchNumber.current;
    try {
      const response = await fetch("/api/shop/products", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't load products.");
      if (request !== fetchNumber.current) return;
      setProducts(data.filter((p: ShopProduct) => p.released));
      dateRef.current = data[0]?.dailyDealDateKey || shopDateKey();
      setError(null);
    } catch (err) { if (request === fetchNumber.current) setError(messageOf(err)); }
    finally { if (request === fetchNumber.current) setLoading(false); }
  }, []);

  const loadProgress = useCallback(async () => {
    try {
      const response = await fetch("/api/shop/discovery", { cache: "no-store" });
      if (!response.ok) throw new Error("Recommendations unavailable");
      const data = await response.json();
      setProgress(data.progress || {}); setRecommendationError(false);
    } catch { setRecommendationError(true); }
  }, []);

  useEffect(() => {
    void loadProducts(); void loadProgress();
    const refreshOnFocus = () => { if (document.visibilityState === "visible") { void loadProducts(); void loadProgress(); } };
    const refreshCollection = () => { void loadProgress(); };
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && dateRef.current !== shopDateKey()) void loadProducts(); }, 30000);
    document.addEventListener("visibilitychange", refreshOnFocus);
    window.addEventListener("vcs:collection-changed", refreshCollection);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refreshOnFocus); window.removeEventListener("vcs:collection-changed", refreshCollection); };
  }, [loadProducts, loadProgress]);

  const dateKey = products[0]?.dailyDealDateKey || shopDateKey();
  const shelves = useMemo(() => buildShelves(products, progress, dateKey), [products, progress, dateKey]);
  const dailyDeal = products.find((p) => p.isDailyDeal);
  const activeProduct = products.find((p) => p.id === selected);
  // Category snapshots preserve the chosen category even if midnight rotates Discover.
  const categoryProducts = category ? products.filter((p) => category.id === "sales" ? p.isSale : category.products.some((x) => x.id === p.id)) : products;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categoryProducts.filter((p) => (sport === "all" || p.sport === sport) && (year === "all" || String(p.year) === year) &&
      (!q || [productName(p), p.brand, p.sport, p.year].join(" ").toLowerCase().includes(q))).sort((a, b) => {
        if (sort === "price_asc") return a.effectivePackPriceCents - b.effectivePackPriceCents || a.id.localeCompare(b.id);
        if (sort === "price_desc") return b.effectivePackPriceCents - a.effectivePackPriceCents || a.id.localeCompare(b.id);
        if (sort === "year_desc") return (b.year ?? 0) - (a.year ?? 0) || a.id.localeCompare(b.id);
        return productName(a).localeCompare(productName(b));
      });
  }, [categoryProducts, query, sport, year, sort]);

  function chooseView(next: "discover" | "all") { setCategory(null); setQuery(""); setSport("all"); setYear("all"); setVisibleCount(40); onViewChange(next); }
  function showCategory(shelf: Shelf) {
    categoryScroll.current = window.scrollY;
    setCategory(shelf); setQuery(""); setSport("all"); setYear("all"); setVisibleCount(40);
    requestAnimationFrame(() => { catalogHeading.current?.focus(); catalogHeading.current?.scrollIntoView({ block: "start" }); });
  }
  function closeCategory() { setCategory(null); setQuery(""); setSport("all"); setYear("all"); requestAnimationFrame(() => window.scrollTo({ top: categoryScroll.current })); }
  const showCatalog = view === "all" || !!category;
  const sports = [...new Set(products.map((p) => p.sport).filter((v): v is string => !!v))].sort();
  const years = [...new Set(products.map((p) => p.year).filter((v): v is number => v !== null))].sort((a, b) => b - a);

  return <>
    {error && <div className="shop-notice" role="alert">{error} <button onClick={() => void loadProducts()}>Retry</button></div>}
    {notice && <div className="shop-notice shop-success" role="status">{notice}<Link href="/inventory">Open your packs ↗</Link><button aria-label="Dismiss purchase confirmation" onClick={() => setNotice(null)}>×</button></div>}
    {loading ? <div className="shop-loading" role="status"><div /><div /><div /><span>Opening the shop…</span></div> : <>
      {dailyDeal && <section className="shop-daily" aria-label="Daily deal">
        <div className="shop-daily-copy"><span className="shop-eyebrow">TODAY&apos;S COUNTER PICK <b>15% OFF</b></span><h2>{productName(dailyDeal)}</h2><p>One day. A fresh reason to rip.</p><div className="shop-daily-prices"><Price label="Pack" value={dailyDeal.effectivePackPriceCents} regular={dailyDeal.standardPackPriceCents} /><Price label="Box" value={dailyDeal.effectiveBoxPriceCents} regular={dailyDeal.standardBoxPriceCents} /></div><button className="shop-primary" onClick={() => setSelected(dailyDeal.id)}>Shop the deal <span aria-hidden="true">↗</span></button><small className="shop-deal-expiry">Until midnight · Chicago time</small></div>
        <button className="shop-daily-art" onClick={() => setSelected(dailyDeal.id)} aria-label={`View daily deal: ${productName(dailyDeal)}`}><PackArt product={dailyDeal} eager /></button>
      </section>}
      <div hidden={showCatalog} className="shop-discover" aria-label="Discover products">{recommendationError && <p className="shop-muted">Your collection picks couldn&apos;t load. <button className="shop-text-button" onClick={() => void loadProgress()}>Retry</button></p>}{shelves.map((shelf) => <ProductShelf key={shelf.id} shelf={shelf} progress={progress} onSelect={(p) => setSelected(p.id)} onShowAll={() => showCategory(shelf)} />)}{!products.length && !error && <p className="shop-empty">The shelves are being stocked. Check back soon.</p>}</div>
      <section className="shop-catalog" hidden={!showCatalog}>
        {category && <button className="shop-text-button shop-back" onClick={closeCategory}>← Back to Discover</button>}
        <div className="shop-catalog-heading"><h2 ref={catalogHeading} tabIndex={-1}>{category?.title || "All products"}</h2><span>{filtered.length} products</span></div>
        <div className="shop-search-row"><label className="shop-search"><span aria-hidden="true">⌕</span><input type="search" aria-label={category ? `Search ${category.title}` : "Search all products"} placeholder={category ? "Search this category" : "Search sets, brands, years…"} value={query} onChange={(e) => { setQuery(e.target.value); setVisibleCount(40); }} /></label><button className="shop-filter-toggle" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}>Filters{sport !== "all" || year !== "all" || sort !== "name" ? " •" : ""}</button></div>
        <div className="shop-filters" hidden={!filterOpen}><label>Sport<select value={sport} onChange={(e) => { setSport(e.target.value); setVisibleCount(40); }}><option value="all">All sports</option>{sports.map((s) => <option key={s}>{s}</option>)}</select></label><label>Year<select value={year} onChange={(e) => { setYear(e.target.value); setVisibleCount(40); }}><option value="all">All years</option>{years.map((y) => <option key={y}>{y}</option>)}</select></label><label>Sort<select value={sort} onChange={(e) => { setSort(e.target.value as Sort); setVisibleCount(40); }}><option value="name">Name</option><option value="year_desc">Newest year</option><option value="price_asc">Pack price: low to high</option><option value="price_desc">Pack price: high to low</option></select></label></div>
        <div className="shop-grid">{filtered.slice(0, visibleCount).map((p) => <ProductCard key={p.id} product={p} progress={progress} kind={category?.kind} onSelect={(product) => setSelected(product.id)} />)}</div>
        {!filtered.length && <div className="shop-empty"><h3>No products found.</h3><p>Try another name or clear your filters.</p><button onClick={() => { setQuery(""); setSport("all"); setYear("all"); }}>Clear filters</button></div>}
        {filtered.length > visibleCount && <button className="shop-load-more" onClick={() => setVisibleCount((count) => count + 40)}>Show more · {filtered.length - visibleCount} remaining</button>}
      </section>
      <footer className="shop-footer"><span>VCS · THE COLLECTOR&apos;S SHOP</span><span>New discoveries every day.</span></footer>
    </>}
    {activeProduct && <PurchaseSheet key={activeProduct.id} product={activeProduct} progress={progress[activeProduct.id]} onClose={() => setSelected(null)} onRefresh={loadProducts} onBought={(text) => { setSelected(null); setNotice(text); window.dispatchEvent(new CustomEvent("vcs:economy-changed")); }} />}
  </>;
}

function PurchaseSheet({ product, progress, onClose, onRefresh, onBought }: { product: ShopProduct; progress?: ProductProgress; onClose: () => void; onRefresh: () => Promise<void>; onBought: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Kind>("pack");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [purchased, setPurchased] = useState(false);
  const value = kind === "pack" ? product.effectivePackPriceCents : product.effectiveBoxPriceCents;
  const regular = kind === "pack" ? product.standardPackPriceCents : product.standardBoxPriceCents;
  const qty = Number(quantity);
  const valid = Number.isSafeInteger(qty) && qty >= 1 && qty <= 100;
  useEffect(() => {
    const el = dialog.current!;
    const opener = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; el.showModal();
    return () => { el.close(); document.body.style.overflow = oldOverflow; opener?.focus({ preventScroll: true }); };
  }, []);
  async function buy() {
    if (busyRef.current || !valid || value === null || purchased) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const response = await fetch("/api/shop/buy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id, kind, quantity: qty, expectedUnitCostCents: value }) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) await onRefresh();
        throw new Error(data.error || "Couldn't complete your purchase.");
      }
      setPurchased(true);
      onBought(`Bought ${qty} ${kind}${qty === 1 ? "" : "s"} of ${productName(product)} for ${money(data.costCents)}.`);
    } catch (err) { setError(messageOf(err)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="shop-sheet" aria-labelledby="shop-sheet-title" onCancel={(e) => { e.preventDefault(); if (!busyRef.current) onClose(); }} onClick={(e) => { if (e.target === e.currentTarget && !busyRef.current) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <div className="shop-sheet-inner"><div className="shop-sheet-top"><span className="shop-eyebrow">{product.isDailyDeal ? "DAILY DEAL · 15% OFF" : product.isSale ? "ON SALE · 5% OFF" : "FROM THE SHELF"}</span><button autoFocus className="shop-close" aria-label="Close product" disabled={busy} onClick={onClose}>×</button></div>
      <div className="shop-sheet-product"><div className="shop-sheet-art"><PackArt product={product} box={kind === "box"} eager /></div><div><span className="shop-card-meta">{product.sport}</span><h2 id="shop-sheet-title">{productName(product)}</h2><p>{product.cardsPerPack ? `${product.cardsPerPack} cards per pack` : "Sealed packs"}{product.packsPerBox ? ` · ${product.packsPerBox} packs per box` : ""}</p></div></div>
      {progress && progress.baseTotal > 0 && <div className="shop-sheet-progress"><span>Your base set</span><strong>{progress.baseOwned} / {progress.baseTotal}</strong><span className="shop-progress-track"><span style={{ width: `${progress.baseOwned / progress.baseTotal * 100}%` }} /></span></div>}
      <div className="shop-kind" role="group" aria-label="Purchase type"><button disabled={busy} aria-pressed={kind === "pack"} onClick={() => setKind("pack")}><Price label="Pack" value={product.effectivePackPriceCents} regular={product.standardPackPriceCents} /></button><button disabled={busy || product.effectiveBoxPriceCents === null} aria-pressed={kind === "box"} onClick={() => setKind("box")}><Price label="Box" value={product.effectiveBoxPriceCents} regular={product.standardBoxPriceCents} /></button></div>
      <div className="shop-checkout"><label htmlFor="shop-quantity">Quantity</label><div className="shop-stepper"><button disabled={busy || qty <= 1} aria-label="Decrease quantity" onClick={() => setQuantity(String(Math.max(1, (valid ? qty : 1) - 1)))}>−</button><input id="shop-quantity" type="number" inputMode="numeric" min="1" max="100" step="1" value={quantity} disabled={busy} onChange={(e) => setQuantity(e.target.value)} /><button disabled={busy || qty >= 100} aria-label="Increase quantity" onClick={() => setQuantity(String(Math.min(100, (valid ? qty : 0) + 1)))}>+</button></div><div className="shop-total"><small>Total</small><strong>{valid && value !== null ? money(value * qty) : "—"}</strong></div></div>
      {!valid && <p className="shop-sheet-error" role="alert">Choose a whole quantity from 1 to 100.</p>}
      {error && <p className="shop-sheet-error" role="alert">{error}</p>}
      <button className="shop-primary shop-checkout-button" disabled={busy || !valid || value === null || purchased} onClick={() => void buy()}>{busy ? "Adding to your collection…" : `Buy ${valid ? qty : ""} ${kind}${qty === 1 ? "" : "s"}`}<span>{valid && value !== null ? money(value * qty) : ""}</span></button>
      <p className="shop-sheet-footnote">{product.discountBps > 0 && regular !== null && value !== null ? `Save ${money(regular - value)} per ${kind}. Offer ends at midnight, Chicago time.` : "Packs are added to your inventory, ready to open."}</p>
    </div>
  </dialog>;
}
