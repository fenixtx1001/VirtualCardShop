"use client";
import {useState} from "react";
import {PRICE_FIELDS} from "@/lib/pricing-advisor";
import type {PriceField,Recommendation} from "@/lib/pricing-advisor";
const labels:Record<PriceField,string>={commonPrice:"Common",semiStarPrice:"Semi-Star",unlistedStarPrice:"Unlisted Star",star1Price:"Star 1",star2Price:"Star 2",star3Price:"Star 3"};
const statuses:Record<string,string>={"strong-match":"Strong match",review:"Review",configured:"Already configured","missing-odds":"Missing pack odds","weak-comparable":"Weak comparisons","no-comparable":"No comparisons","missing-metadata":"Missing product metadata"};
type Draft=Record<string,Partial<Record<PriceField,string>>>;
export default function PricingAdvisor({productId,onSaved}:{productId:string;onSaved:()=>void}){
 const [rows,setRows]=useState<Recommendation[]>([]);
 const [drafts,setDrafts]=useState<Draft>({});
 const [selected,setSelected]=useState<Record<string,boolean>>({});
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [open,setOpen]=useState(false);
 async function preview(){
  setBusy(true);setError("");setMessage("");setRows([]);setOpen(true);
  try{
   const res=await fetch("/api/admin/pricing-advisor?productId="+encodeURIComponent(productId),{cache:"no-store"});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error??"Preview failed");
   const next=data.recommendations as Recommendation[];
   setRows(next);
   setDrafts(Object.fromEntries(next.filter(r=>r.updatedPrices).map(r=>[r.id,Object.fromEntries(PRICE_FIELDS.filter(k=>r.updatedPrices?.[k]!=null).map(k=>[k,String(r.updatedPrices?.[k])]))])));
   setSelected(Object.fromEntries(next.map(r=>[r.id,r.status==="strong-match"])));
  }catch(e){setError(e instanceof Error?e.message:"Preview failed");}finally{setBusy(false);}
 }
 const eligible=rows.filter(r=>r.updatedPrices);
 const picked=eligible.filter(r=>selected[r.id]);
 const count=picked.reduce((n,r)=>n+Object.keys(drafts[r.id]??{}).length,0);
 const invalid=picked.some(r=>Object.values(drafts[r.id]??{}).some(v=>!v?.trim()||!Number.isFinite(Number(v))||Number(v)<=0||Number(v)>1000000||Math.abs(Number(v)*100-Math.round(Number(v)*100))>1e-6));
 async function approve(){
  if(!count||invalid||busy||!window.confirm("Save "+count+" missing tier defaults across "+picked.length+" subsets? Existing prices and individual card values will not change."))return;
  setBusy(true);setError("");setMessage("");
  try{
   const res=await fetch("/api/admin/pricing-advisor",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId,approvals:picked.map(r=>({id:r.id,prices:Object.fromEntries(Object.entries(drafts[r.id]??{}).map(([k,v])=>[k,Number(v)]))}))})});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error??"Approval failed");
   setMessage("Saved "+data.prices+" missing defaults across "+data.subsets+" subsets. Individual card values were not changed.");
   setRows([]);setDrafts({});setSelected({});onSaved();
  }catch(e){setError(e instanceof Error?e.message:"Approval failed");}finally{setBusy(false);}
 }
 return <section aria-label="Pricing Advisor" style={{border:"1px solid #94a3b8",borderRadius:12,padding:12,margin:"12px 0"}}>
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
   <div><strong>Pricing Advisor</strong><div style={{fontSize:12,opacity:.8}}>Fill missing six-tier defaults using comparable released sets. Existing prices are locked.</div></div>
   <button type="button" disabled={!productId||busy} onClick={preview}>{busy?"Working…":"Suggest All Tier Prices"}</button>
  </div>
  {!productId&&<p style={{fontSize:12}}>Select a product in the filter below to price every subset in that product.</p>}
  {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}{message&&<p role="status">{message}</p>}
  {open&&rows.length>0&&<>
   <p style={{fontSize:13}}>{eligible.length} recommendations · {rows.length-eligible.length} configured or skipped. Strong matches are selected initially; review the others before selecting.</p>
   <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
    <button type="button" disabled={busy} onClick={()=>setSelected(Object.fromEntries(eligible.map(r=>[r.id,true])))}>Select all suggestions</button>
    <button type="button" disabled={busy} onClick={()=>setSelected(Object.fromEntries(eligible.map(r=>[r.id,r.status==="strong-match"])))}>Strong matches only</button>
    <button type="button" disabled={busy} onClick={()=>setSelected({})}>Clear selection</button>
    <button type="button" disabled={busy} onClick={()=>{setRows([]);setOpen(false);}}>Close preview</button>
   </div>
   {rows.map(r=><div key={r.id} style={{borderTop:"1px solid #94a3b8",padding:"8px 0"}}>
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
     <input type="checkbox" aria-label={"Approve "+r.name} disabled={busy||!r.updatedPrices} checked={!!selected[r.id]&&!!r.updatedPrices} onChange={e=>setSelected(old=>({...old,[r.id]:e.target.checked}))}/>
     <strong>{r.name}</strong><small>{r.odds?"1:"+r.odds:r.category==="base"?"Base":"No odds"} · {statuses[r.status]??r.status}</small>
    </div>
    {r.updatedPrices&&<>
     <div className="vcs-admin-set-price-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:8,marginTop:8}}>
      {PRICE_FIELDS.map(k=><label key={k} style={{minWidth:0}}><span>{labels[k]} ($)</span><input style={{width:"100%",boxSizing:"border-box"}} type="number" min=".01" step=".01" inputMode="decimal" disabled={busy||r.existing[k]!==null} value={r.existing[k]!==null?String(r.existing[k]):drafts[r.id]?.[k]??""} title={r.existing[k]!==null?"Existing value protected":"Editable suggested price"} onChange={e=>setDrafts(old=>({...old,[r.id]:{...old[r.id],[k]:e.target.value}}))}/></label>)}
     </div>
     <details style={{fontSize:12,marginTop:6}}><summary>Comparable pricing evidence</summary>{r.comparables.map(c=><div key={c.id} style={{padding:"3px 0"}}><strong>{c.productId.replace(/_/g," ")} — {c.name}</strong> ({c.odds?"1:"+c.odds:"Base"}): {PRICE_FIELDS.map(k=>labels[k]+" $"+c.prices[k]?.toFixed(2)).join(" · ")}</div>)}</details>
    </>}
   </div>)}
   <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginTop:12}}>
    <button type="button" disabled={busy||!count||invalid} onClick={approve}>Approve {count} missing prices</button>
    <small>Only blank defaults are saved. Card book values, odds, release status and existing prices are untouched.</small>
   </div>
  </>}
 </section>;
}
