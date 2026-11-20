"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { binderHref } from "@/lib/collection/set-view-links";
import "./home.css";

type CollectionSet = {
  productId: string;
  uniqueOwned: number;
  totalQty: number;
  totalCards: number;
  percentComplete: number;
  packImageUrl: string | null;
};

type SealedProduct = {
  productId: string;
  packsOwned: number;
  updatedAt: string;
  packImageUrl: string | null;
};

type PrestigeLevel = {
  productSetId: string;
  totalCards: number;
  level: number;
  nextLevel: number;
  nextPct: number;
  cardsNeededForNext: number;
};

const number = (value: number) => Math.max(0, value).toLocaleString("en-US");
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
const percent = (value: number) => Math.min(100, Math.max(0, count(value)));
const nameOf = (id: string) => id.replace(/_/g, " ").replace(/\bBase\b/gi, "").replace(/\s+/g, " ").trim();
const dateOf = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

async function readCollection(): Promise<CollectionSet[]> {
  const response = await fetch("/api/collection/summary", { cache: "no-store" });
  if (!response.ok) throw new Error("Your collection could not be loaded.");
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("Your collection could not be loaded.");
  return payload as CollectionSet[];
}

async function readInventory(): Promise<SealedProduct[]> {
  const response = await fetch("/api/inventory", { cache: "no-store" });
  if (!response.ok) throw new Error("Your sealed inventory could not be loaded.");
  const payload = await response.json();
  if (!payload?.ok || !Array.isArray(payload.rows)) throw new Error("Your sealed inventory could not be loaded.");
  return payload.rows as SealedProduct[];
}

async function readPrestige(completedProductIds: string[]): Promise<Record<string, PrestigeLevel>> {
  if (!completedProductIds.length) return {};
  // Chunk IDs to avoid oversized URLs for collectors with large libraries.
  const chunks: string[][] = [];
  for (let i = 0; i < completedProductIds.length; i += 40) chunks.push(completedProductIds.slice(i, i + 40));
  const replies = await Promise.allSettled(chunks.map(async (ids) => {
    const response = await fetch("/api/prestige/levels?ids=" + encodeURIComponent(ids.join(",")), { cache: "no-store" });
    if (!response.ok) return {};
    const payload = await response.json();
    return payload?.ok && payload.levels && typeof payload.levels === "object" ? payload.levels : {};
  }));
  return Object.assign({}, ...replies.filter((reply) => reply.status === "fulfilled").map((reply) => reply.value)) as Record<string, PrestigeLevel>;
}

function PackArtwork({ src, title, className = "" }: { src: string | null | undefined; title: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = typeof src === "string" ? src.trim() : "";
  return <div className={"home-art " + className}>
    {url && !failed ? <img src={url} alt={title} loading="lazy" decoding="async" onError={() => setFailed(true)} /> :
      <div className="home-art-fallback" aria-label="Pack artwork unavailable"><strong>VCS</strong><span>THE ARCHIVE</span></div>}
  </div>;
}

function SectionTitle({ eyebrow, title, href, linkLabel }: { eyebrow: string; title: string; href: string; linkLabel: string }) {
  return <div className="home-section-heading">
    <div><span className="home-eyebrow">{eyebrow}</span><h2>{title}</h2></div>
    <Link className="home-text-link" href={href}>{linkLabel} <span aria-hidden="true">↗</span></Link>
  </div>;
}

function Progress({ value }: { value: number }) {
  return <div className="home-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent(value))}>
    <span style={{ width: percent(value) + "%" }} />
  </div>;
}

export default function HomePage() {
  const [sets, setSets] = useState<CollectionSet[]>([]);
  const [inventory, setInventory] = useState<SealedProduct[]>([]);
  const [prestigeById, setPrestigeById] = useState<Record<string, PrestigeLevel>>({});
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setIssues([]);
      const [collection, sealed] = await Promise.allSettled([readCollection(), readInventory()]);
      if (cancelled) return;
      const errors: string[] = [];
      if (collection.status === "fulfilled") {
        setSets(collection.value);
        const completed = collection.value.filter((row) => count(row.totalCards) > 0 && count(row.uniqueOwned) >= count(row.totalCards)).map((row) => row.productId);
        try {
          const levels = await readPrestige(completed);
          if (!cancelled) setPrestigeById(levels);
        } catch {
          if (!cancelled) setPrestigeById({});
        }
      } else {
        setSets([]);
        setPrestigeById({});
        errors.push("Collection data is unavailable.");
      }
      if (sealed.status === "fulfilled") setInventory(sealed.value);
      else { setInventory([]); errors.push("Sealed inventory is unavailable."); }
      if (!cancelled) { setIssues(errors); setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [revision]);

  const readyPacks = useMemo(() => [...inventory].filter((row) => count(row.packsOwned) > 0)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [inventory]);
  const finishing = useMemo(() => [...sets].filter((row) => count(row.totalCards) > 0 && count(row.uniqueOwned) > 0 && count(row.uniqueOwned) < count(row.totalCards))
    .sort((a, b) => (count(a.totalCards) - count(a.uniqueOwned)) - (count(b.totalCards) - count(b.uniqueOwned))
      || count(b.percentComplete) - count(a.percentComplete)), [sets]);
  const prestigeTargets = useMemo(() => sets.map((row) => ({ row, level: prestigeById[row.productId] }))
    .filter(({ row, level }) => count(row.totalCards) > 0 && count(row.uniqueOwned) >= count(row.totalCards) && level && count(level.totalCards) > 0)
    .sort((a, b) => count(b.level.nextPct) - count(a.level.nextPct)), [sets, prestigeById]);
  const recent = useMemo(() => [...inventory]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 3), [inventory]);

  const ownedCards = sets.reduce((sum, row) => sum + count(row.totalQty), 0);
  const complete = sets.filter((row) => count(row.totalCards) > 0 && count(row.uniqueOwned) >= count(row.totalCards)).length;
  const unopened = readyPacks.reduce((sum, row) => sum + count(row.packsOwned), 0);
  const feature = readyPacks[0] ?? null;
  const chase = finishing[0] ?? null;
  const heroHref = feature ? "/open-pack/" + encodeURIComponent(feature.productId) : chase ? "/collection/" + encodeURIComponent(chase.productId) : "/shop";
  const heroAction = feature ? "Open a pack" : chase ? "Continue this set" : "Explore the shop";
  const heroImage = feature?.packImageUrl ?? chase?.packImageUrl ?? null;
  const heroName = feature ? nameOf(feature.productId) : chase ? nameOf(chase.productId) : "The collector's choice";

  const stats = [
    { label: "Cards owned", value: number(ownedCards), detail: "Across your collection" },
    { label: "Sets collected", value: number(sets.length), detail: "Products with cards" },
    { label: "Sets complete", value: number(complete), detail: "Base sets finished" },
    { label: "Ready to rip", value: number(unopened), detail: "Unopened packs" },
  ];

  const destinations = [
    { number: "01", title: "The Shop", description: "Explore packs, boxes & singles", href: "/shop" },
    { number: "02", title: "Auction House", description: "Buy, bid & list cards", href: "/auctions" },
    { number: "03", title: "Showcase", description: "Your best cards & registry", href: "/showcase" },
    { number: "04", title: "Slab Vault", description: "Explore your graded collection", href: "/collection/slabs" },
    { number: "05", title: "Grading", description: "Submit, track & reveal", href: "/grading" },
    { number: "06", title: "Analytics", description: "Understand your collection", href: "/analytics" },
  ];

  return <main className="home-shell">
    <div className="home-container">
      <header className="home-masthead">
        <div><span className="home-eyebrow">VIRTUAL CARD SHOP / THE COLLECTOR&apos;S DESK</span>
          <h1>Your collecting home.</h1><p>Everything that matters in your hobby, right where you left it.</p>
        </div>
        <button type="button" className="home-refresh" onClick={() => setRevision((v) => v + 1)} disabled={loading}
          aria-label={loading ? "Refreshing your dashboard" : "Refresh your dashboard"}>
          <span aria-hidden="true">↻</span> {loading ? "Updating" : "Refresh"}
        </button>
      </header>

      <section className="home-hero" aria-label="Your next collecting move">
        <div className="home-hero-copy">
          <span className="home-hero-kicker"><span className="home-dot" /> {feature ? "A PACK IS WAITING" : chase ? "YOUR NEXT MILESTONE" : "THE HOBBY STARTS HERE"}</span>
          <h2>{feature ? "There's another story in the next pack." : chase ? "A little closer to the finish line." : "Find something worth chasing."}</h2>
          <p>{feature ? number(feature.packsOwned) + " unopened " + (feature.packsOwned === 1 ? "pack" : "packs") + " of " + heroName + " are ready whenever you are." :
            chase ? nameOf(chase.productId) + " is " + percent(chase.percentComplete).toFixed(1) + "% complete. Your next card could close the gap." :
            "Discover a classic set, open your first pack, and make this collection your own."}</p>
          <div className="home-hero-actions">
            <Link className="home-button home-button-gold" href={heroHref}>{heroAction}<span aria-hidden="true">↗</span></Link>
            <Link className="home-button home-button-quiet" href="/collection">Visit collection <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
        <div className="home-feature">
          <div className="home-feature-top"><span>ON YOUR DESK</span><span>VCS / 001</span></div>
          <PackArtwork key={heroImage ?? "none"} src={heroImage} title={heroName + " pack"} className="home-feature-art" />
          <div className="home-feature-bottom"><span>{heroName}</span><span>{feature ? number(feature.packsOwned) + " PACKS" : chase ? Math.ceil(count(chase.totalCards) - count(chase.uniqueOwned)) + " TO GO" : "START HERE"}</span></div>
        </div>
      </section>

      {issues.length ? <div className="home-notice" role="alert">{issues.join(" ")} <button type="button" onClick={() => setRevision((v) => v + 1)}>Retry</button></div> : null}

      <section className="home-stats" aria-label="Your collection at a glance">
        {stats.map((stat) => <div className="home-stat" key={stat.label}>
          <span>{stat.label}</span><strong>{loading && !sets.length && !inventory.length ? "—" : stat.value}</strong><small>{stat.detail}</small>
        </div>)}
      </section>

      <div className="home-main-grid">
        <section className="home-panel home-set-panel">
          <SectionTitle eyebrow="THE FINISH LINE" title="Sets within reach" href="/collection" linkLabel="All sets" />
          {finishing.length ? <div className="home-set-list">
            {finishing.slice(0, 3).map((row, index) => {
              const remaining = count(row.totalCards) - count(row.uniqueOwned);
              return <div className="home-set-row" key={row.productId}>
                <div className="home-rank">{String(index + 1).padStart(2, "0")}</div>
                <PackArtwork key={row.productId} src={row.packImageUrl} title={nameOf(row.productId) + " pack"} className="home-set-art" />
                <div className="home-set-copy">
                  <div className="home-row-top"><Link href={"/collection/" + encodeURIComponent(row.productId)}>{nameOf(row.productId)}</Link>
                    <strong>{percent(row.percentComplete).toFixed(1)}%</strong></div>
                  <Progress value={row.percentComplete} />
                  <div className="home-row-foot"><span>{number(remaining)} {remaining === 1 ? "card" : "cards"} to finish</span>
                    <Link href={binderHref(row.productId)}>Open binder ↗</Link></div>
                </div>
              </div>;
            })}
          </div> : <div className="home-empty">
            <strong>{loading ? "Finding your sets…" : "The chase is yours to start."}</strong>
            <p>{loading ? "Checking your collection progress." : "Build toward a base set and your closest finishes will appear here."}</p>
            {!loading && <Link href="/collection">Browse collection ↗</Link>}
          </div>}
        </section>

        <section className="home-panel home-rip-panel">
          <SectionTitle eyebrow="THE SEALED SHELF" title="Ready to rip" href="/inventory" linkLabel="Inventory" />
          {readyPacks.length ? <div className="home-pack-list">
            {readyPacks.slice(0, 3).map((row) => <div className="home-pack-row" key={row.productId}>
              <PackArtwork key={row.productId} src={row.packImageUrl} title={nameOf(row.productId) + " pack"} className="home-pack-art" />
              <div className="home-pack-copy"><strong>{nameOf(row.productId)}</strong><span>{number(row.packsOwned)} unopened {row.packsOwned === 1 ? "pack" : "packs"}</span></div>
              <Link href={"/open-pack/" + encodeURIComponent(row.productId)} aria-label={"Open a pack of " + nameOf(row.productId)}>Rip ↗</Link>
            </div>)}
          </div> : <div className="home-empty">
            <strong>{loading ? "Checking your shelves…" : "Your shelf is ready for something new."}</strong>
            <p>{loading ? "Looking for unopened packs." : "Pick up a pack or box in the Shop and come back for the rip."}</p>
            {!loading && <Link href="/shop">Find packs ↗</Link>}
          </div>}
          <Link href="/inventory" className="home-panel-footer">Explore sealed inventory <span aria-hidden="true">↗</span></Link>
        </section>
      </div>

      <div className="home-lower-grid">
        <section className="home-panel home-compact-panel">
          <SectionTitle eyebrow="THE LONG GAME" title="Prestige pursuit" href="/showcase" linkLabel="Your showcase" />
          {prestigeTargets.length ? <div className="home-compact-list">
            {prestigeTargets.slice(0, 3).map(({ row, level }) => <Link key={row.productId} className="home-compact-row" href={"/collection/" + encodeURIComponent(row.productId)}>
              <div><strong>{nameOf(row.productId)}</strong><span>Level {number(count(level.level))} · {number(count(level.cardsNeededForNext))} cards to {number(count(level.nextLevel))}×</span></div>
              <div className="home-compact-side"><strong>{percent(level.nextPct).toFixed(0)}%</strong><span aria-hidden="true">↗</span></div>
            </Link>)}
          </div> : <div className="home-empty home-empty-compact"><strong>Finish a set. Then do it again.</strong><p>Completed sets unlock your next prestige chase.</p></div>}
        </section>
        <section className="home-panel home-compact-panel">
          <SectionTitle eyebrow="RECENT SHELF ACTIVITY" title="Back in rotation" href="/inventory" linkLabel="All inventory" />
          {recent.length ? <div className="home-compact-list">
            {recent.map((row) => <Link key={row.productId} className="home-compact-row" href={"/collection/" + encodeURIComponent(row.productId)}>
              <div><strong>{nameOf(row.productId)}</strong><span>{number(count(row.packsOwned))} unopened · Inventory updated {dateOf(row.updatedAt)}</span></div>
              <span className="home-row-arrow" aria-hidden="true">↗</span>
            </Link>)}
          </div> : <div className="home-empty home-empty-compact"><strong>Your collecting history starts here.</strong><p>Recently updated inventory will be easy to find here.</p></div>}
        </section>
      </div>

      <section className="home-destinations">
        <div className="home-destinations-heading"><div><span className="home-eyebrow">AROUND THE CLUBHOUSE</span><h2>Go where the hobby takes you.</h2></div><p>One home for every side of collecting.</p></div>
        <nav className="home-destination-grid" aria-label="Explore Virtual Card Shop">
          {destinations.map((destination) => <Link href={destination.href} key={destination.href} className="home-destination">
            <span className="home-destination-number">{destination.number}</span>
            <strong>{destination.title}</strong>
            <span className="home-destination-description">{destination.description}</span>
            <span className="home-destination-arrow" aria-hidden="true">↗</span>
          </Link>)}
        </nav>
      </section>
      <footer className="home-footer"><span>VCS · THE COLLECTOR&apos;S DESK</span><Link href="/rip-log">Your rip history ↗</Link></footer>
    </div>
  </main>;
}
