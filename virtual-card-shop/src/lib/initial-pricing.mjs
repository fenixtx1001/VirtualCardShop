// Deterministic initial defaults; only complete owner-verified vectors are supplied as history.
export function initialPrices(target,history){
 const fields=["commonPrice","semiStarPrice","unlistedStarPrice","star1Price","star2Price","star3Price"];
 const norm=s=>String(s??"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
 const sport=x=>norm(x.product.sport)==="basketbal"?"basketball":norm(x.product.sport);
 const kind=x=>{const n=norm(x.name);if(x.isBase)return "base";if(/\b(autograph|autographs|signed|signatures|signature|fresh ink|auto|autos)\b/.test(n))return "autograph";if(/\b(memorabilia|jersey|jerseys|patch|patches|game used|game worn|relic|relics|bat|bats)\b/.test(n))return "memorabilia";if(/\b(refractor|refractors|parallel|parallels|medallion|press proof|press proofs|star rubies|platinum|gold foil|silver foil|gold signature|legacy collection|row [01]|spectrum|radiance|mirror)\b/.test(n)||!x.isInsert)return "parallel";return "insert";};
 const tokens=x=>{const stop=new Set([...norm(x.product.brand).split(" "),...sport(x).split(" "),"base","set","series","the","of","and","cards"]);return new Set(norm(x.name).split(" ").filter(t=>t&&!stop.has(t)&&!/^\d+$/.test(t)));};
 const good=x=>Number.isInteger(x.oddsPerPack)&&x.oddsPerPack>0;
 const cat=kind(target),A=tokens(target);
 const candidates=history.filter(b=>b.id!==target.id&&fields.every(k=>Number.isFinite(b[k])&&b[k]>0));
 const sameKind=candidates.filter(b=>kind(b)===cat);
 const sameSport=sameKind.filter(b=>sport(b)===sport(target));
 const pool=sameSport.length?sameSport:sameKind.length?sameKind:candidates.filter(b=>b.isBase===target.isBase);
 const ranked=pool.map(b=>{const B=tokens(b),u=new Set([...A,...B]).size,o=[...A].filter(t=>B.has(t)).length,brand=norm(target.product.brand)===norm(b.product.brand),year=target.product.year!=null&&b.product.year!=null?Math.abs(target.product.year-b.product.year):15,odds=cat==="base"?0:good(target)&&good(b)?Math.abs(Math.log2(target.oddsPerPack/b.oddsPerPack)):good(target)!==good(b)?2:0;
 return {b,brand,year,odds,d:(brand?0:1.8)+Math.min(year*.35,7)+odds*4+(u?1.5*(1-o/u):0)+(b.product.released?0:.35)+(sport(b)===sport(target)?0:3)};}).sort((a,b)=>a.d-b.d||a.b.id.localeCompare(b.b.id));
 const neighbors=[],seen=new Set();for(const n of ranked){if(seen.has(n.b.productId))continue;seen.add(n.b.productId);neighbors.push(n);if(neighbors.length===3)break;}
 const fallback=cat==="base"?[.1,.25,.5,1,2,3]:[1,2,3,5,8,12];
 const raw=fields.map((k,i)=>{if(!neighbors.length)return fallback[i];const v=neighbors.map(n=>({p:n.b[k],w:1/Math.pow(.65+n.d,2)})).sort((a,b)=>a.p-b.p);let sum=0;const half=v.reduce((s,x)=>s+x.w,0)/2;for(const x of v){sum+=x.w;if(sum>=half)return x.p;}return v[v.length-1].p;});
 const anchors=fields.map((k,i)=>target[k]!=null&&target[k]>0?i:-1).filter(i=>i>=0);
 const result={},round=v=>Math.max(.01,Math.round(v*100)/100);
 for(let i=0;i<fields.length;i++){
  if(target[fields[i]]!=null)continue;
  let v=raw[i];if(anchors.length){const nearest=anchors.slice().sort((a,b)=>Math.abs(a-i)-Math.abs(b-i)||a-b)[0];v*=target[fields[nearest]]/raw[nearest];}
  const prev=fields.slice(0,i).map(k=>target[k]??result[k]).filter(x=>x!=null);const next=fields.slice(i+1).map(k=>target[k]).filter(x=>x!=null);
  if(prev.length)v=Math.max(v,Math.max(...prev));if(next.length)v=Math.min(v,Math.min(...next));result[fields[i]]=round(v);
 }
 const nearest=neighbors[0];return {prices:result,comparables:neighbors.map(n=>n.b.id),confidence:!nearest?"fallback":!sameSport.length?"cross-sport":cat!=="base"&&!good(target)?"missing-odds":nearest.d>5||nearest.odds>1.5?"broader-match":"comparable"};
}
