import type { Prisma } from "@prisma/client";
import { PRICE_FIELDS, type PriceVector } from "./pricing-advisor";
import { resolveCardTierIdentity, resolvedProfileMatches, defaultPriceForTier } from "./player-tiers";
import { effectivePlayerTier } from "./player-tier-cleanup";

export type PricingCard = {id:number; player:string; team:string|null; cardNumber:string; bookValue:number};
export type PricingSet = PriceVector & {id:string; productId:string; product:{sport:string|null;year:number|null}};
export type ApplyMode = "fillBlankPrices" | "overwriteAllPrices";
export function parseApplyMode(mode:unknown, confirmed:unknown):ApplyMode|null {
 if(mode===undefined||mode==="fillBlankPrices")return "fillBlankPrices";
 if(mode==="overwriteAllPrices"&&confirmed===true)return "overwriteAllPrices";
 return null;
}
export type ApplySummary = {scannedCards:number; updatedCards:number; alreadyCorrect:number; skippedAlreadyPriced:number; skippedNoTier:number; skippedNoPrice:number; pricedCards:number};
export function validPriceSnapshot(value:unknown):value is PriceVector {
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 return PRICE_FIELDS.every(k=>typeof v[k]==="number"&&Number.isFinite(v[k])&&(v[k] as number)>0);
}
export function matchesPriceSnapshot(set:PriceVector, expected:PriceVector){
 return PRICE_FIELDS.every(k=>set[k]===expected[k]);
}
// Use the same card-context identity resolution as the existing default-price lookup.
export async function planTierPriceApplication(db:Pick<Prisma.TransactionClient,"playerTierProfile">,set:PricingSet,cards:PricingCard[],mode:ApplyMode="fillBlankPrices"){
 const sport=set.product.sport?.trim()||"";
 const identities=[] as Array<Awaited<ReturnType<typeof resolveCardTierIdentity>>>;
 for(const card of cards)identities.push(await resolveCardTierIdentity(sport,card.player,{...card,productSetId:set.id,year:set.product.year}));
 const keys=[...new Set(identities.filter(i=>!i.blocked&&i.canonicalName&&i.normalizedName).map(i=>i.normalizedName))];
 const profiles=keys.length?await db.playerTierProfile.findMany({where:{sport,normalizedName:{in:keys}},select:{id:true,sport:true,canonicalName:true,normalizedName:true,tier:true}}):[];
 const byKey=new Map(profiles.map(p=>[p.normalizedName,p]));
 const groups=new Map<number,number[]>();
 const summary:ApplySummary={scannedCards:cards.length,updatedCards:0,alreadyCorrect:0,skippedAlreadyPriced:0,skippedNoTier:0,skippedNoPrice:0,pricedCards:0};
 for(let i=0;i<cards.length;i++){
  const card=cards[i], identity=identities[i],profile=byKey.get(identity.normalizedName);
  if(mode==="fillBlankPrices"&&card.bookValue!==0){summary.skippedAlreadyPriced++;if(card.bookValue>0)summary.pricedCards++;continue;}
  const tier=!identity.blocked&&identity.canonicalName&&profile&&resolvedProfileMatches(sport,identity.normalizedName,profile)?effectivePlayerTier(profile):null;
  const price=defaultPriceForTier(set,tier);
  if(!tier){summary.skippedNoTier++;if(card.bookValue>0)summary.pricedCards++;continue;}
  if(price===null||!Number.isFinite(price)||price<=0){summary.skippedNoPrice++;if(card.bookValue>0)summary.pricedCards++;continue;}
  summary.pricedCards++;
  if(card.bookValue===price){summary.alreadyCorrect++;continue;}
  const ids=groups.get(price)??[];ids.push(card.id);groups.set(price,ids);summary.updatedCards++;
 }
 return {groups,summary};
}
