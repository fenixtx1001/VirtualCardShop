import { prisma } from "./prisma";
import { PRICE_FIELDS } from "./pricing-advisor";
import { initialPrices } from "./initial-pricing.mjs";
const select={id:true,productId:true,name:true,isBase:true,isInsert:true,oddsPerPack:true,commonPrice:true,semiStarPrice:true,unlistedStarPrice:true,star1Price:true,star2Price:true,star3Price:true,product:{select:{year:true,brand:true,sport:true,released:true}}} as const;
export async function seedMissingTierPrices(ids:string[]){
 if(!ids.length)return {sets:0,prices:0};
 const [targets,history]=await Promise.all([
  prisma.productSet.findMany({where:{id:{in:ids}},select}),
  prisma.productSet.findMany({where:{pricingVerified:true},select})
 ]);
 const planned=targets.map(t=>({id:t.id,...initialPrices(t,history)})).filter(p=>Object.keys(p.prices).length);
 let sets=0,prices=0;
 await prisma.$transaction(async tx=>{
  for(const p of planned){
   const missing=Object.fromEntries(PRICE_FIELDS.filter(k=>Object.hasOwn(p.prices,k)).map(k=>[k,null]));
   const r=await tx.productSet.updateMany({where:{id:p.id,...missing},data:p.prices});
   if(r.count!==1)throw new Error("Tier defaults changed concurrently: "+p.id);
   sets++;prices+=Object.keys(p.prices).length;
  }
 },{timeout:30000});
 return {sets,prices};
}
