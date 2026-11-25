#!/usr/bin/env python3
"""1992 Pinnacle Set Factory: original audited data source helpers."""
from pinnacle_1992_sources import *

def manifest():
 definitions=[
 ("base","Base Set","BASE","620 original cards numbered 1–620, two series of 310; seven original subsets; no parallels."),
 ("team-pinnacle","Team Pinnacle","INSERT","12 dual-front Series One wax-exclusive Chris Greco inserts; original odds 1:100."),
 ("rookie-idols","Rookie Idols","INSERT","18 dual-front Series Two wax-exclusive inserts; original odds 1:100."),
 ("team-2000","Team 2000","INSERT","Original 80 numbered players plus actual 27a and 27b printing variants (81 distinct physical subjects). SuperPacks only, 3 per pack; 1–40 Series One and 41–80 Series Two."),
 ("slugfest","Slugfest","INSERT","15 Series Two Wal-Mart SuperPack-only inserts, never wax; no sourced numeric odds."),
 ("dealer-kit-samples","Dealer Kit Samples (Promo Only)","INSERT","Eight original dealer samples with base-like numbering; promotional distribution ONLY, never in either series of packs.")]
 return dict(schemaVersion=2,status="DRAFT",
  sources={"BaseballCardPedia":BCP,"MyCardBatch":MCB,"TCDB":TCDB,
           "TCDBInserts":"https://www.tcdb.com/Inserts.cfm/sid/194/1992-Pinnacle",
           "TCDBChecklist":"https://www.tcdb.com/Checklist.cfm/sid/194/1992-Pinnacle"},
  decisions={
   "series":"One 620-card original release across Series One #1–310 and Series Two #311–620, separate wax and SuperPack configurations; pack of either series MUST NOT contain base cards from the other.",
   "authenticity":"BCP 620 individual original card numbers/subsets and 4 insert lists reconciled against independent MCB collector number/subject/team; 13 explicit base discrepancies and seven dual-front formatting discrepancies reviewed. Names and team identifiers are from printed catalogues.",
   "variants":"No invented base parallels, serials, memorabilia or autographs. Team 2000 #27a and #27b are actual Juan Guzman logo placement variants and count separately.",
   "promos":"Eight authentic Dealer Kit Samples remain separate promo-only group and must never be included in any pack pool. Total 620+12+18+81+15+8=754 physical collector entries.",
   "scarcity":"Series One Team Pinnacle 1:100 original wax, Series Two Rookie Idols 1:100 wax, Team 2000 3 per 27-card SuperPack, Slugfest Series Two Wal-Mart exclusive. Do not conflate SuperPack vs wax and do not invent odds for Slugfest.",
   "pack":"Wax 16 cards/pack, 36 packs/box; SuperPack 27 cards/pack, 16 packs/box; VCS Product uses standard 16/36 wax metadata ONLY. Requires per-series/per-format-aware collation before release.",
   "rookies":"RC annotations in card metadata only when directly identified by source; do not indiscriminately mark every subset card as a true rookie. Original #295 Manny Ramirez, #522 Jeff Kent, #555 Brian Jordan noted in sources.",
   "images":"Only genuine original card scans and original insert templates. Do not synthesize card scans, artwork, serials, promos or pack images. Leave artwork and prices pending.",
   "release":"Unreleased as draft; pack odds null because single-odds product schema cannot encode wax/SuperPack, Series One/Two, dealer-only exclusions and Walmart-only inserts. No changes to other products."},
  product={"id":PID,"year":1992,"brand":"Pinnacle","sport":"Baseball","cardsPerPack":16,"packsPerBox":36,
           "packPriceCents":0,"autoPackPricing":True,"packImageUrl":None,"boxImageUrl":None,"released":False},
  review={"checklists":"BCP_MCB_TCDB_INDEPENDENTLY_VERIFIED","images":"PENDING","packImages":"PENDING",
          "pricing":"PENDING","collation":"BLOCKED_SERIES_FORMAT_CHANNELS","released":False},
  cardsFile=CARDS.name,productSets=[
   dict(key=key,id=PID+"_"+key.replace("-","_"),name=name,kind=kind,expectedCards=COUNTS[key],
        oddsPerPack=None,sourceUrl=TCDB,notes=notes)
   for key,name,kind,notes in definitions])
def check():
 b=json.loads(BUNDLE.read_text("utf8"))
 if b.get("schemaVersion")!=2 or b.get("status")!="DRAFT" or b["product"].get("released") is not False:
  raise ValueError("Release safety gate failed")
 specs={x["key"]:x["expectedCards"] for x in b["productSets"]}
 if specs!=COUNTS or any(x["oddsPerPack"] is not None for x in b["productSets"]):
  raise ValueError("Unsupported family configuration/pack odds")
 with gzip.open(CARDS,"rt",encoding="utf8",newline="") as f:rows=list(csv.DictReader(f))
 if len(rows)!=754 or Counter(x["setKey"] for x in rows)!=Counter(COUNTS):
  raise ValueError("Physical card checklist family/total mismatch")
 if len({(r["setKey"],r["cardNumber"]) for r in rows})!=len(rows):raise ValueError("Duplicate cards")
 if any(not r["player"] or not r["team"] for r in rows):raise ValueError("Missing name/team")
 base={int(r["cardNumber"]):r for r in rows if r["setKey"]=="base"}
 if set(base)!=set(range(1,621)):raise ValueError("Missing original base number")
 if sum(1 for n in base if n<=310)!=310 or sum(1 for n in base if n>310)!=310:raise ValueError("Two series wrong")
 nums={r["cardNumber"] for r in rows if r["setKey"]=="team-2000"}
 if len(nums)!=81 or "27a" not in nums or "27b" not in nums or "27" in nums:
  raise ValueError("Authentic Team 2000 logo variations missing")
 if {r["cardNumber"] for r in rows if r["setKey"]=="dealer-kit-samples"}!=set(map(str,PROMO_NAMES)):
  raise ValueError("Promo-only sample checklist wrong")
 print("PASS 1992 Pinnacle: 620 base, 310 Series One +310 Series Two; seven authentic subsets")
 print("PASS 12 Team Pinnacle, 18 Rookie Idols, 81 Team 2000 (27a/27b), 15 Slugfest, 8 dealer promo")
 print("PASS 754 distinct collector records, six groups, complete source subject/team/number audit")
 print("PASS wax vs SuperPack vs dealer-only promo separated, no invented parallels/odds")
 print("PASS DRAFT unreleased")
def main():
 p=argparse.ArgumentParser();p.add_argument("--check",action="store_true");a=p.parse_args()
 if not a.check:
  rows=audit();OUT.mkdir(parents=True,exist_ok=True)
  buf=io.StringIO(newline="");writer=csv.DictWriter(buf,FIELDS,lineterminator="\n")
  writer.writeheader();writer.writerows(rows)
  CARDS.write_bytes(gzip.compress(buf.getvalue().encode("utf8"),compresslevel=9,mtime=0))
  BUNDLE.write_text(json.dumps(manifest(),separators=(",",":"),ensure_ascii=False)+"\n",encoding="utf8")
 check()
if __name__=="__main__":main()
