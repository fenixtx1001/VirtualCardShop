"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import VcsSlab from "@/components/grading/VcsSlab";

type Card = {
 cardId: number; cardNumber: string; player: string; team: string | null;
 frontImageUrl: string | null; backImageUrl: string | null;
 rawValue: number; grade: number; gradedAt: string | null;
 points: number; basePoints: number; weight: number;
};
type Standing = { userId: string; name?: string; score: number; rating: number; qualified: number; gems: number; owned: number };
type Registry = {
 ok: true;
 productSet: { id: string; name: string | null; isBase: boolean; productId: string;
   product: { year: number | null; brand: string | null; sport: string | null } };
 cards: Card[]; totalCards: number; maximum: number; setValue: number; multiplier: number;
 rank: number | null; gradingCreditBalanceCents: number;
 standing: Standing; standings: Standing[];
};
type Sort = "points" | "grade" | "value" | "newest" | "number";
const PAGE_SIZE = 6;
const num = (v: number) => Math.round(v).toLocaleString("en-US");

export default function RegistryClient({ productSetId, targetUserId }: {
 productSetId: string; targetUserId: string;
}) {
 const [data, setData] = useState<Registry | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState("");
 const [ownedOnly, setOwnedOnly] = useState(true);
 const [sort, setSort] = useState<Sort>("points");
 const [filter, setFilter] = useState("all");
 const [query, setQuery] = useState("");
 const [page, setPage] = useState(0);
 const [focused, setFocused] = useState<Card | null>(null);

 useEffect(() => {
   const controller = new AbortController();
   setLoading(true); setError("");
   const qs = targetUserId ? "?userId=" + encodeURIComponent(targetUserId) : "";
   fetch("/api/registry/" + encodeURIComponent(productSetId) + qs,
     { cache: "no-store", signal: controller.signal })
     .then(async response => {
       const body = await response.json();
       if (!response.ok || !body?.ok) throw new Error(body.error || "Unable to load registry");
       setData(body);
     }).catch(e => { if (!controller.signal.aborted) setError(String(e.message || e)); })
     .finally(() => { if (!controller.signal.aborted) setLoading(false); });
   return () => controller.abort();
 }, [productSetId, targetUserId]);

 const rows = useMemo(() => {
   const list = (data?.cards || []).filter(c =>
     (!ownedOnly || c.grade >= 6) &&
     (filter === "all" || filter === "gems" && c.grade === 10 ||
       filter === "qualified" && c.grade >= 8 ||
       filter === "upgrade" && c.grade > 0 && c.grade < 10 ||
       filter === "missing" && c.grade === 0) &&
     (!query.trim() || (c.player + " " + c.cardNumber).toLowerCase().includes(query.trim().toLowerCase()))
   );
   list.sort((a, b) => {
     if (sort === "number") return a.cardNumber.localeCompare(b.cardNumber, undefined, { numeric: true });
     if (sort === "grade") return b.grade - a.grade || b.points - a.points;
     if (sort === "value") return b.rawValue - a.rawValue || b.grade - a.grade;
     if (sort === "newest") return (b.gradedAt || "").localeCompare(a.gradedAt || "");
     return b.points - a.points || b.grade - a.grade || a.cardNumber.localeCompare(b.cardNumber, undefined, { numeric: true });
   });
   return list;
 }, [data, ownedOnly, filter, sort, query]);

 const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
 const currentPage = Math.min(page, pageCount - 1);
 const visible = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
 const go = (newPage: number) => setPage(Math.max(0, Math.min(pageCount - 1, newPage)));
 const displayName = data ? [data.productSet.product.year,
   data.productSet.product.brand, data.productSet.name].filter(Boolean).join(" · ") : "Graded Registry";
 const setParam = encodeURIComponent(productSetId);

 return <main className="vcs-registry">
   <div className="vcs-registry-inner">
     <header className="vcs-registry-header">
       <div>
         <Link href="/showcase" className="vcs-registry-back">← Showcase</Link>
         <p className="vcs-registry-eyebrow">VCS GRADED REGISTRY</p>
         <h1>{displayName}</h1>
         <p>One best owned graded slab per checklist card · live raw-value scoring</p>
       </div>
       {data && <Link className="vcs-registry-link" href={"/collection/" + encodeURIComponent(data.productSet.productId) + "/binder?productSetId=" + setParam}>Raw Binder ↗</Link>}
     </header>
     {loading && <p role="status">Loading graded registry…</p>}
     {error && <p role="alert" className="vcs-registry-error">{error}</p>}
     {data && <>
       <section className="vcs-registry-stats" aria-label="Set registry standing">
         <div className="featured"><small>REGISTRY POINTS</small><strong>{num(data.standing.score)}</strong><span>{num(data.maximum)} possible · {data.multiplier.toFixed(2)}× set weight</span></div>
         <div><small>RATING</small><strong>{data.standing.rating.toFixed(2)}<em>/100</em></strong><span>Progress to all 10s</span></div>
         <div><small>SET RANK</small><strong>{data.rank ? "#" + data.rank : "—"}</strong><span>Among graded registries</span></div>
         <div><small>QUALIFIED</small><strong>{num(data.standing.qualified)}<em>/{num(data.totalCards)}</em></strong><span>Grades 8–10</span></div>
         <div><small>GEMS</small><strong>{data.standing.gems}</strong><span>Grade 10 slots</span></div>
         {!targetUserId && <div><small>SET GRADING CREDITS</small><strong>{"$" + (data.gradingCreditBalanceCents/100).toFixed(0)}</strong><span>Prestige-only credit balance</span></div>}
       </section>
       <div className="vcs-registry-explainer">REGISTRY POINTS = GRADE POINTS × CARD VALUE WEIGHT × SET MULTIPLIER. Grade 6/7/8/9/10 earns 0/1/10/30/100 base points. Card weight uses raw value relative to the median; the multiplier uses total raw set value. Book-value corrections update Points and Rating.</div>
       <div className="vcs-registry-toolbar">
         <div className="vcs-registry-view" role="group" aria-label="Registry coverage">
           <button className={ownedOnly ? "active":""} onClick={() => { setOwnedOnly(true); setPage(0); }}>Owned Only</button>
           <button className={!ownedOnly ? "active":""} onClick={() => { setOwnedOnly(false); setPage(0); }}>Full Checklist</button>
         </div>
         <label>Sort
           <select value={sort} onChange={e => { setSort(e.target.value as Sort); setPage(0); }}>
             <option value="points">Most Registry Points</option><option value="grade">Highest Grade</option>
             <option value="value">Raw Card Value</option><option value="newest">Recently Graded</option>
             <option value="number">Card Number</option>
           </select>
         </label>
         <label>Filter
           <select value={filter} onChange={e => { setFilter(e.target.value); setPage(0); if(e.target.value === "missing") setOwnedOnly(false); }}>
             <option value="all">All Grades</option><option value="gems">Gem 10s</option>
             <option value="qualified">Qualified 8+</option><option value="upgrade">Needs Upgrade</option>
             <option value="missing">Missing Slabs</option>
           </select>
         </label>
         <label className="vcs-registry-search">Find Card
           <input placeholder="Player or card #" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }}/>
         </label>
       </div>
       <div className="vcs-registry-page-head">
         <strong>{ownedOnly ? "MY GRADED COLLECTION" : "FULL SET CHECKLIST"}</strong>
         <span>{num(rows.length)} cards · Page {currentPage + 1} of {pageCount}</span>
       </div>
       <section className="vcs-registry-page" aria-label="Six slab binder">
         {visible.length ? visible.map(c => <div key={c.cardId} className="vcs-registry-pocket">
           {c.grade >= 6 ?
             <button type="button" className="vcs-registry-slab-trigger" onClick={() => setFocused(c)} aria-label={"Open full slab for " + c.player + ", grade " + c.grade}>
               <div className="vcs-registry-mini-slab">
                 <div className="vcs-registry-mini-label"><span className="vcs-registry-mini-brand">VCS</span><strong>{c.grade}</strong></div>
                 {c.frontImageUrl ? <img loading="lazy" src={c.frontImageUrl} alt="" /> : <span className="vcs-registry-no-scan">NO SCAN</span>}
               </div>
             </button> :
             <div className="vcs-registry-missing" aria-label="No graded slab"><span>+</span><small>Unslabbed</small></div>}
           <div className="vcs-registry-card-caption">
             <strong title={c.player}>{c.player}</strong><span>#{c.cardNumber} · {c.grade ? "Grade " + c.grade : "Missing"}</span>
             <b>{num(c.points)} pts</b>
           </div>
         </div>) : <div className="vcs-registry-empty">No slabs match. Choose Full Checklist to browse missing slots.</div>}
       </section>
       <nav className="vcs-registry-pager" aria-label="Registry pages">
         <button disabled={currentPage === 0} onClick={() => go(currentPage - 1)}>← Previous</button>
         <label>Page <input type="number" min={1} max={pageCount} value={currentPage + 1} onChange={e => go(Number(e.target.value || 1)-1)}/> / {pageCount}</label>
         <button disabled={currentPage >= pageCount - 1} onClick={() => go(currentPage + 1)}>Next →</button>
       </nav>
       <div className="vcs-registry-footer">
         <strong>Set Competition</strong>
         <p>Highest total score wins within this set. Duplicate slabs do not stack. Grade 6 earns zero; a 10 is the ultimate upgrade.</p>
         <div className="vcs-registry-standings">{data.standings.slice(0, 10).map((row, i) =>
           <Link key={row.userId} href={"/registry/" + setParam + "?userId=" + encodeURIComponent(row.userId)}>
             <span>#{i+1} · {row.name || "Collector"} {row.userId === targetUserId ? "(Selected)" : ""}</span><strong>{num(row.score)} pts</strong>
           </Link>)}</div>
       </div>
     </>}
   </div>
   {focused && data && <div className="vcs-registry-modal" role="presentation" onMouseDown={e => { if (e.currentTarget === e.target) setFocused(null); }}>
     <div className="vcs-registry-dialog" role="dialog" aria-modal="true" aria-label={focused.player + " graded slab"}>
       <button className="vcs-registry-close" onClick={() => setFocused(null)} aria-label="Close">×</button>
       <div className="vcs-registry-large-slab">
         <VcsSlab player={focused.player} cardNumber={focused.cardNumber} team={focused.team}
           setName={displayName} grade={focused.grade}
           imageUrl={focused.frontImageUrl} backImageUrl={focused.backImageUrl}
           registry={{ cardId: focused.cardId, gradedAt: focused.gradedAt }} />
       </div>
       <strong>{focused.player} · #{focused.cardNumber}</strong>
       <p>Grade {focused.grade} · {num(focused.points)} Registry Points · {focused.weight.toFixed(2)}× card weight</p>
       <Link href={"/cards/" + focused.cardId}>View Card Details ↗</Link>
     </div>
   </div>}
 </main>;
}
