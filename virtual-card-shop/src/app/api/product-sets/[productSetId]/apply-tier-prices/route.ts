import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { repriceProduct } from "@/lib/pack-pricing";
import { matchesPriceSnapshot, validPriceSnapshot, planTierPriceApplication, parseApplyMode } from "@/lib/apply-tier-prices";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
class Conflict extends Error{}
export async function POST(req:Request,ctx:{params:Promise<{productSetId:string}>}){
 try{
  const session=await getServerSession(authOptions);
  const owner=process.env.PRICING_OWNER_EMAIL?.trim().toLowerCase();
  if(!owner||session?.user?.email?.trim().toLowerCase()!==owner)return json({error:"Only the VCS owner may apply all tier prices."},403);
  if(req.headers.get("origin")!==new URL(req.url).origin)return json({error:"Invalid request origin."},403);
  if(!req.headers.get("content-type")?.includes("application/json"))return json({error:"JSON required."},415);
  const body=await req.json().catch(()=>null);
  const mode=parseApplyMode(body?.mode,body?.confirmedOverwrite);
  if(!mode)return json({error:"Choose fill blanks or explicitly confirm overwrite."},400);
  const expected=body?.prices;
  if(!validPriceSnapshot(expected))return json({error:"Save all six positive tier defaults before applying prices."},400);
  const {productSetId}=await ctx.params;
  const summary=await prisma.$transaction(async tx=>{
   const set=await tx.productSet.findUnique({where:{id:productSetId},select:{id:true,productId:true,commonPrice:true,semiStarPrice:true,unlistedStarPrice:true,star1Price:true,star2Price:true,star3Price:true,product:{select:{sport:true,year:true}}}});
   if(!set)throw new Conflict("Product set not found. Refresh the list.");
   if(!matchesPriceSnapshot(set,expected))throw new Conflict("Tier defaults changed. Refresh and review before applying.");
   const cards=await tx.card.findMany({where:{productSetId},select:{id:true,player:true,team:true,cardNumber:true,bookValue:true},orderBy:{id:"asc"}});
   const {groups,summary}=await planTierPriceApplication(tx,set,cards,mode);
   for(const [price,ids] of groups){
    const result=await tx.card.updateMany({where:{productSetId,id:{in:ids},...(mode==="fillBlankPrices"?{bookValue:0}:{})},data:{bookValue:price}});
    if(result.count!==ids.length)throw new Conflict("Cards changed while pricing. Nothing was saved; retry.");
   }
   if(summary.updatedCards>0)await repriceProduct(set.productId,tx);
   return summary;
  },{isolationLevel:"Serializable",timeout:30000,maxWait:5000});
  return json({ok:true,productSetId,mode,summary});
 }catch(e){
  if(e instanceof Conflict)return json({error:e.message},409);
  if(typeof e==="object"&&e!==null&&"code" in e&&e.code==="P2034")return json({error:"Concurrent catalog change. Nothing was saved; retry."},409);
  console.error("Apply tier prices",e);return json({error:"Pricing transaction failed. No partial changes were saved."},500);
 }
}
