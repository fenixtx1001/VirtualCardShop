// Read-only VCS six-tier pricing research. No writes, no deployment, no API calls to AI.
// Run from virtual-card-shop: npx tsx scripts/pricing-advisor-shadow.ts
// Requires existing Prisma DB configuration. Never run with untrusted database credentials.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const query = "SELECT p.id AS product_id,p.year,p.brand,p.sport,p.released,ps.id AS subset_id,ps.name,ps.\"isBase\" AS base,ps.\"isInsert\" AS insert,ps.\"oddsPerPack\" AS odds,ps.\"commonPrice\" AS common,ps.\"semiStarPrice\" AS semi,ps.\"star1Price\" AS s1,ps.\"star2Price\" AS s2,ps.\"star3Price\" AS s3,ps.\"unlistedStarPrice\" AS unlisted FROM \"ProductSet\" ps JOIN \"Product\" p ON p.id=ps.\"productId\" ORDER BY p.id,ps.id";
function pricingStudy(rows){
 const tiers=["common","semi","s1","s2","s3","unlisted"];
 const norm=s=>String(s??"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
 const sport=s=>norm(s)==="basketbal"?"basketball":norm(s);
 const type=x=>x.base?"base":x.insert?"insert":"other";
 const tokens=x=>{const stop=new Set([...norm(x.brand).split(" "),...sport(x.sport).split(" "),"base","set","series","the","of","and","cards"]);return new Set(norm(x.name).split(" ").filter(t=>t&&!stop.has(t)&&!/^\d+$/.test(t)))};
 const dist=(a,b)=>{
   const A=a.tokens,B=b.tokens,union=new Set([...A,...B]).size,overlap=[...A].filter(t=>B.has(t)).length;
   let d=(norm(a.brand)===norm(b.brand)?0:3)+Math.min(Math.abs(a.year-b.year)*.3,6);
   if(a.odds>0&&b.odds>0)d+=2.5*Math.abs(Math.log2(a.odds/b.odds));else if((a.odds>0)!==(b.odds>0))d+=4;
   if(union)d+=1.2*(1-overlap/union);
   return d;
 };
 const median=arr=>{const x=[...arr].sort((a,b)=>a-b);return x.length%2?x[(x.length-1)/2]:(x[x.length/2-1]+x[x.length/2])/2};
 const valid=x=>tiers.every(t=>x[t]!=null&&Number.isFinite(Number(x[t]))&&Number(x[t])>0);
 const data=rows.map(x=>({...x,tokens:tokens(x)}));const examples=data.filter(x=>x.released&&valid(x));
 const predict=(a)=>{
   const pool=examples.filter(b=>b.product_id!==a.product_id&&sport(b.sport)===sport(a.sport)&&type(b)===type(a));
   if(!pool.length)return null;
   const sorted=pool.map(b=>({b,d:dist(a,b)})).sort((x,y)=>x.d-y.d||x.b.subset_id.localeCompare(y.b.subset_id));
   const neighbors=[];const seen=new Set();for(const n of sorted){if(seen.has(n.b.product_id))continue;seen.add(n.b.product_id);neighbors.push(n);if(neighbors.length===5)break;}
   const weightedMedian=t=>{const v=neighbors.map(n=>({p:Number(n.b[t]),w:1/Math.pow(.6+n.d,2)})).sort((x,y)=>x.p-y.p);let cum=0;const half=v.reduce((s,x)=>s+x.w,0)/2;for(const x of v){cum+=x.w;if(cum>=half)return x.p;}return v.at(-1).p;};
   const prices=Object.fromEntries(tiers.map(t=>[t,weightedMedian(t)]));const baseline=Object.fromEntries(tiers.map(t=>[t,median(pool.map(b=>Number(b[t])))]));
   const close=neighbors.filter(n=>n.d<=2.2);
   const tight=close.length>=3&&tiers.every(t=>Math.max(...close.map(n=>n.b[t]))/Math.min(...close.map(n=>n.b[t]))<=1.5);
   const confidence=neighbors[0].d<=1.2&&tight?"strong-match":"review";
   return {prices,baseline,confidence,neighbors:neighbors.map(n=>({product:n.b.product_id,subset:n.b.name,odds:n.b.odds,distance:+n.d.toFixed(2),prices:Object.fromEntries(tiers.map(t=>[t,n.b[t]]))}))};
 };
 const tested=examples.map(a=>({a,p:predict(a)})).filter(x=>x.p);
 const score=(items,model)=>{const errors=items.flatMap(({a,p})=>tiers.map(t=>({t,actual:a[t],pred:p[model][t],rel:Math.abs(p[model][t]-a[t])/a[t]})));const rate=(xs,cut)=>xs.length?+(100*xs.filter(x=>x.rel<=cut+1e-9).length/xs.length).toFixed(1):null;
 return {subsets:items.length,prices:errors.length,exact:rate(errors,0),within25:rate(errors,.25),within50:rate(errors,.5),medianAbsolutePercentError:errors.length?+(median(errors.map(x=>x.rel))*100).toFixed(1):null,allSixWithin25:items.length?+(100*items.filter(({a,p})=>tiers.every(t=>Math.abs(p[model][t]-a[t])/a[t]<=.25+1e-9)).length/items.length).toFixed(1):null,byTier:tiers.map(t=>({tier:t,within25:rate(errors.filter(x=>x.t===t),.25)}))};};
 const samples=data.filter(a=>!valid(a)&&a.sport==="Baseball"&&a.brand==="Ultra"&&a.year===2000).slice(0,8).map(a=>({name:a.name,odds:a.odds,existing:Object.fromEntries(tiers.map(t=>[t,a[t]])),prediction:predict(a)}));
 const unpriced=data.filter(a=>tiers.every(t=>a[t]==null));const targets=unpriced.map(a=>({a,p:predict(a)})).filter(x=>x.p);
 return {inventory:{rows:data.length,training:examples.length,products:new Set(examples.map(x=>x.product_id)).size,untestable:examples.length-tested.length,unpriced:unpriced.length,predictable:targets.length,strongMatchCandidates:targets.filter(x=>x.p.confidence==="strong-match").length},baseline:score(tested,"baseline"),advisor:score(tested,"prices"),strongMatch:score(tested.filter(x=>x.p.confidence==="strong-match"),"prices"),base:score(tested.filter(x=>x.a.base),"prices"),insert:score(tested.filter(x=>x.a.insert),"prices"),samples,compareExamples:tested.filter(x=>x.a.brand==="Ultra"&&x.a.sport==="Baseball"&&x.a.year===1993).slice(0,5).map(({a,p})=>({name:a.name,odds:a.odds,actual:Object.fromEntries(tiers.map(t=>[t,a[t]])),prediction:p.prices,confidence:p.confidence}))};
}
async function main() {
 const rows = await prisma.$queryRawUnsafe(query);
 console.log(JSON.stringify(pricingStudy(rows), null, 2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
