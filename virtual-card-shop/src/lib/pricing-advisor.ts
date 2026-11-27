// Deterministic, read-only comparable-set recommendations. No external APIs.
export const PRICE_FIELDS = ["commonPrice","semiStarPrice","unlistedStarPrice","star1Price","star2Price","star3Price"] as const;
export type PriceField = typeof PRICE_FIELDS[number];
export type PriceVector = Record<PriceField, number | null>;
export type PricingRow = PriceVector & {id:string; productId:string; name:string|null; isBase:boolean; isInsert:boolean; oddsPerPack:number|null; product:{year:number|null;brand:string|null;sport:string|null;released:boolean}};
const norm = (s:string|null) => (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
const sport = (s:string|null) => norm(s)==="basketbal"?"basketball":norm(s);
function kind(x:PricingRow) {
 const n=norm(x.name);
 if(x.isBase)return "base";
 if(/\b(autograph|autographs|signed|signatures|signature|fresh ink|auto|autos)\b/.test(n))return "autograph";
 if(/\b(memorabilia|jersey|jerseys|patch|patches|game used|game worn|relic|relics|bat|bats)\b/.test(n))return "memorabilia";
 if(/\b(refractor|refractors|parallel|parallels|medallion|press proof|press proofs|star rubies|platinum|gold foil|silver foil|gold signature)\b/.test(n)||!x.isInsert)return "parallel";
 return "insert";
}
function tokens(x:PricingRow){
 const stop=new Set([...norm(x.product.brand).split(" "),...sport(x.product.sport).split(" "),"base","set","series","the","of","and","cards"]);
 return new Set(norm(x.name).split(" ").filter(t=>t&&!stop.has(t)&&!/^\d+$/.test(t)));
}
const goodOdds=(n:number|null):n is number=>n!==null&&Number.isInteger(n)&&n>0;
const full=(x:PricingRow)=>PRICE_FIELDS.every(k=>x[k]!==null&&Number.isFinite(x[k])&&x[k]!>0);
const vector=(x:PricingRow)=>Object.fromEntries(PRICE_FIELDS.map(k=>[k,x[k]])) as PriceVector;
export function recommendPrices(target:PricingRow, history:PricingRow[]){
 const category=kind(target);
 const base={id:target.id,name:target.name??target.id,odds:target.oddsPerPack,category,existing:vector(target),updatedPrices: null as PriceVector|null};
 const empty=(status:string)=>({...base,status,comparables:[]});
 if(PRICE_FIELDS.every(k=>target[k]!==null))return empty("configured");
 if(!sport(target.product.sport)||target.product.year===null)return empty("missing-metadata");
 if(category!=="base"&&!goodOdds(target.oddsPerPack))return empty("missing-odds");
 const A=tokens(target);
 const ranked=history.filter(b=>b.product.released&&full(b)&&b.productId!==target.productId&&sport(b.product.sport)===sport(target.product.sport)&&kind(b)===category&&b.product.year!==null&&(category==="base"||goodOdds(b.oddsPerPack))).map(b=>{
  const B=tokens(b),u=new Set([...A,...B]).size,o=[...A].filter(t=>B.has(t)).length;
  const brand=norm(target.product.brand)===norm(b.product.brand),year=Math.abs(target.product.year!-b.product.year!);
  const odds=category==="base"?0:Math.abs(Math.log2(target.oddsPerPack!/b.oddsPerPack!));
  return {b,brand,year,odds,d:(brand?0:1.8)+Math.min(year*.35,7)+odds*4+(u?1.5*(1-o/u):0)};
 }).sort((a,b)=>a.d-b.d||a.b.id.localeCompare(b.b.id));
 const neighbors:typeof ranked=[];const seen=new Set<string>();
 for(const n of ranked){if(seen.has(n.b.productId))continue;seen.add(n.b.productId);neighbors.push(n);if(neighbors.length===3)break;}
 const nearest=neighbors[0];
 if(!nearest)return empty("no-comparable");
 if(nearest.d>5||nearest.odds>1.5||nearest.year>12)return empty("weak-comparable");
 const priceFor=(k:PriceField)=>{const v=neighbors.map(n=>({p:n.b[k]!,w:1/Math.pow(.65+n.d,2)})).sort((a,b)=>a.p-b.p);let sum=0;const half=v.reduce((s,x)=>s+x.w,0)/2;for(const x of v){sum+=x.w;if(sum>=half)return x.p;}return v[v.length-1].p;};
 const prices=Object.fromEntries(PRICE_FIELDS.map(k=>[k,target[k]===null?priceFor(k):null])) as PriceVector;
 const close=neighbors.filter(n=>n.brand&&n.year<=3&&n.odds<=.25);
 const consistent=close.length>=2&&PRICE_FIELDS.every(k=>Math.max(...close.map(n=>n.b[k]!))/Math.min(...close.map(n=>n.b[k]!))<=1.25);
 const strong=nearest.brand&&nearest.year<=2&&nearest.odds<=.25&&consistent;
 return {...base,status:strong?"strong-match":"review",updatedPrices:prices,comparables:neighbors.map(n=>({id:n.b.id,name:n.b.name??n.b.id,productId:n.b.productId,odds:n.b.oddsPerPack,prices:vector(n.b)}))};
}
export type Recommendation = ReturnType<typeof recommendPrices>;
export function validateApprovalPrices(input:unknown):Partial<Record<PriceField,number>>|null {
 if(!input||typeof input!=="object"||Array.isArray(input))return null;
 const out:Partial<Record<PriceField,number>>={};
 for(const [key,val] of Object.entries(input)){
  if(!PRICE_FIELDS.includes(key as PriceField)||typeof val!=="number"||!Number.isFinite(val)||val<=0||val>1000000||Math.abs(val*100-Math.round(val*100))>1e-6)return null;
  out[key as PriceField]=val;
 }
 return Object.keys(out).length?out:null;
}
