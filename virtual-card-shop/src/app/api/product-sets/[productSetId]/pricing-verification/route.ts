import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { PRICE_FIELDS } from "@/lib/pricing-advisor";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const json = (body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function PATCH(req:Request,ctx:{params:Promise<{productSetId:string}>}) {
 try {
  const session=await getServerSession(authOptions);
  const owner=process.env.PRICING_OWNER_EMAIL?.trim().toLowerCase();
  if(!owner||session?.user?.email?.trim().toLowerCase()!==owner)return json({error:"Only the VCS owner can verify tier prices."},403);
  if(req.headers.get("origin")!==new URL(req.url).origin)return json({error:"Invalid request origin."},403);
  if(!req.headers.get("content-type")?.includes("application/json"))return json({error:"JSON required."},415);
  const body=await req.json().catch(()=>null);
  if(!body||typeof body.verified!=="boolean"||!body.prices||typeof body.prices!=="object"||Array.isArray(body.prices))return json({error:"Verification requires the displayed price snapshot."},400);
  const prices=Object.fromEntries(PRICE_FIELDS.map(k=>[k,body.prices[k]]));
  if(PRICE_FIELDS.some(k=>prices[k]!==null&&(typeof prices[k]!=="number"||!Number.isFinite(prices[k]))))return json({error:"Invalid price snapshot."},400);
  if(body.verified&&PRICE_FIELDS.some(k=>prices[k]===null||prices[k]<=0))return json({error:"Set all six positive prices before verifying."},400);
  const {productSetId}=await ctx.params;
  const result=await prisma.productSet.updateMany({where:{id:productSetId,...prices},data:{pricingVerified:body.verified}});
  if(result.count!==1)return json({error:"Prices changed. Refresh and review before verifying."},409);
  return json({ok:true,pricingVerified:body.verified});
 }catch(e){console.error("Pricing verification",e);return json({error:"Unable to save verification."},500);}
}
