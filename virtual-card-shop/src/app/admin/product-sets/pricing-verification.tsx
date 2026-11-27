"use client";
import {useState} from "react";
import {PRICE_FIELDS} from "@/lib/pricing-advisor";
import type {PriceVector} from "@/lib/pricing-advisor";
export default function PricingVerification({id,prices,verified,disabled=false,onChange}:{id:string;prices:PriceVector;verified:boolean;disabled?:boolean;onChange:(value:boolean)=>void}) {
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const complete=PRICE_FIELDS.every(k=>typeof prices[k]==="number"&&prices[k]!>0);
 async function save(value:boolean){
  setBusy(true);setError("");
  try{
   const snapshot=Object.fromEntries(PRICE_FIELDS.map(k=>[k,prices[k]]));
   const res=await fetch("/api/product-sets/"+encodeURIComponent(id)+"/pricing-verification",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({verified:value,prices:snapshot})});
   const data=await res.json();
   if(!res.ok||!data.ok)throw new Error(data.error||"Verification failed.");
   onChange(data.pricingVerified===true);
  }catch(e){setError(e instanceof Error?e.message:"Verification failed.");}finally{setBusy(false);}
 }
 return <div style={{fontSize:11,whiteSpace:"normal",marginTop:4}}>
  <label title={disabled?"Save price changes before verifying.":"Only the VCS owner can confirm pricing."} style={{display:"inline-flex",alignItems:"center",gap:4,fontWeight:600,color:verified?"#167047":"#925b14",cursor:"pointer"}}>
   <input type="checkbox" aria-label={"Verify tier pricing for "+id} checked={verified} disabled={disabled||busy||(!verified&&!complete)} onChange={e=>void save(e.target.checked)}/>
   {busy?"Saving…":verified?"Verified":"Verify"}
  </label>
  {!verified&&!busy&&<small style={{display:"block",opacity:.8}}>{disabled?"Save edits first":complete?"Review estimate":"Incomplete"}</small>}
  {error&&<div role="alert" style={{color:"#b42318",fontSize:11}}>{error}</div>}
 </div>;
}
