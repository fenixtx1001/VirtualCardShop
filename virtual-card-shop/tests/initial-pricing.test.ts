import test from "node:test";
import assert from "node:assert/strict";
import { initialPrices } from "../src/lib/initial-pricing.mjs";
import { PRICE_FIELDS } from "../src/lib/pricing-advisor";
import type { PricingRow } from "../src/lib/pricing-advisor";
const row=(id:string,prices:(number|null)[],patch:Partial<PricingRow>={}):PricingRow=>({id,productId:id,name:"Base Set",isBase:true,isInsert:false,oddsPerPack:null,product:{sport:"Baseball",brand:"Topps",year:1995,released:true},...Object.fromEntries(PRICE_FIELDS.map((k,i)=>[k,prices[i]])),...patch} as PricingRow);
const h=row("known",[.1,.25,.5,1,2,3]);
test("new base gets six positive comparable defaults",()=>{
 const t=row("target",Array(6).fill(null));
 const r=initialPrices(t,[h]);
 assert.deepEqual(PRICE_FIELDS.map(k=>r.prices[k]),[.1,.25,.5,1,2,3]);
 assert.equal(t.commonPrice,null);
});
test("partial defaults are preserved and anchor missing estimates",()=>{
 const t=row("target",[.2,null,null,2,null,6]);
 const r=initialPrices(t,[h]);
 assert.deepEqual(r.prices,{semiStarPrice:.5,unlistedStarPrice:1,star2Price:4});
 assert.equal(t.commonPrice,.2);
});
test("complete pricing never gets overwritten",()=>assert.deepEqual(initialPrices(h,[]).prices,{}));
test("missing odds and sparse sport history still return positive prices",()=>{
 const t=row("target",Array(6).fill(null),{isBase:false,isInsert:true,name:"Rare insert",product:{sport:"Non-Sport",brand:"Unknown",year:1997,released:false}});
 const r=initialPrices(t,[]);
 assert.equal(Object.keys(r.prices).length,6);
 assert.ok(Object.values(r.prices).every(v=>v>0));
 assert.equal(r.confidence,"fallback");
});
test("nearby rarity and set kind outrank unrelated rarity",()=>{
 const t=row("t",Array(6).fill(null),{isBase:false,isInsert:true,name:"Refractor",oddsPerPack:24});
 const near=row("near",[1,2,3,4,5,6],{isBase:false,isInsert:true,name:"Refractor",oddsPerPack:24});
 const far=row("far",[100,200,300,400,500,600],{isBase:false,isInsert:true,name:"Refractor",oddsPerPack:1000});
 assert.equal(initialPrices(t,[far,near]).prices.commonPrice,1);
});
