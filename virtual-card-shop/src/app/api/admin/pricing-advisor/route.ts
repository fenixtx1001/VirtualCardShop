import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { PRICE_FIELDS, recommendPrices, validateApprovalPrices } from "@/lib/pricing-advisor";
import type { PricingRow, PriceField } from "@/lib/pricing-advisor";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const json = (body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
async function authorized(){
 const session=await getServerSession(authOptions);
 const email=session?.user?.email?.toLowerCase().trim();
 const allowed=(process.env.ADMIN_EMAILS??process.env.ALLOWED_EMAILS??"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
 return !!email&&allowed.includes(email);
}
const select={id:true,productId:true,name:true,isBase:true,isInsert:true,oddsPerPack:true,commonPrice:true,semiStarPrice:true,unlistedStarPrice:true,star1Price:true,star2Price:true,star3Price:true,product:{select:{year:true,brand:true,sport:true,released:true}}} as const;
export async function GET(req:Request){
 try{
  if(!await authorized())return json({error:"Pricing Advisor requires an authorized VCS account."},403);
  const productId=new URL(req.url).searchParams.get("productId")?.trim();
  if(!productId)return json({error:"Select a product."},400);
  const targets=await prisma.productSet.findMany({where:{productId},select,orderBy:[{isBase:"desc"},{name:"asc"},{id:"asc"}]});
  if(!targets.length)return json({error:"No product sets found."},404);
  const sport=targets[0].product.sport;
  const sports=sport&&["basketbal","basketball"].includes(sport.toLowerCase())?["Basketbal","Basketball"]:sport?[sport]:[];
  const history:PricingRow[]=sports.length?await prisma.productSet.findMany({where:{productId:{not:productId},product:{released:true,sport:{in:sports,mode:"insensitive"}},commonPrice:{gt:0},semiStarPrice:{gt:0},unlistedStarPrice:{gt:0},star1Price:{gt:0},star2Price:{gt:0},star3Price:{gt:0}},select}):[];
  return json({productId,recommendations:targets.map(t=>recommendPrices(t,history))});
 }catch(e){console.error("Pricing Advisor preview",e);return json({error:"Unable to generate pricing recommendations."},500);}
}
class Conflict extends Error{}
export async function POST(req:Request){
 try{
  if(!await authorized())return json({error:"Pricing Advisor requires an authorized VCS account."},403);
  const origin=req.headers.get("origin"); if(!origin||origin!==new URL(req.url).origin)return json({error:"Invalid request origin."},403);
  if(!req.headers.get("content-type")?.includes("application/json"))return json({error:"JSON required."},415);
  const body=await req.json().catch(()=>null);
  if(!body||typeof body.productId!=="string"||!body.productId.trim()||!Array.isArray(body.approvals)||!body.approvals.length||body.approvals.length>200)return json({error:"Select 1–200 subsets."},400);
  const seen=new Set<string>();
  const approvals:{id:string;prices:Partial<Record<PriceField,number>>}[]=[];
  for(const entry of body.approvals){
   const prices=validateApprovalPrices(entry?.prices);
   if(typeof entry?.id!=="string"||!entry.id||seen.has(entry.id)||!prices)return json({error:"Invalid or duplicate price approval."},400);
   seen.add(entry.id);approvals.push({id:entry.id,prices});
  }
  await prisma.$transaction(async tx=>{
   for(const entry of approvals){
    const missing=Object.fromEntries(PRICE_FIELDS.filter(k=>Object.prototype.hasOwnProperty.call(entry.prices,k)).map(k=>[k,null]));
    const result=await tx.productSet.updateMany({where:{id:entry.id,productId:body.productId,...missing},data:entry.prices});
    if(result.count!==1)throw new Conflict("A selected price is already configured or the subset changed. Nothing was saved. Refresh recommendations.");
   }
  },{timeout:20000});
  return json({ok:true,subsets:approvals.length,prices:approvals.reduce((n,a)=>n+Object.keys(a.prices).length,0)});
 }catch(e){if(e instanceof Conflict)return json({error:e.message},409);console.error("Pricing Advisor approval",e);return json({error:"Approval failed; no partial batch was committed."},500);}
}
