#!/usr/bin/env python3
"""2002 Ultra: verified Set Factory generator (see ultra_2002_sources.py)."""
from ultra_2002_sources import *

def manifest():
 def setdef(key,label,kind,note,derive=None):
  x={"key":key,"id":PID+"_"+key.replace("-","_"),"name":label,
     "kind":kind,"expectedCards":EXPECTED[key],"oddsPerPack":None,"sourceUrl":BCP,"notes":note}
  if derive:
   x["deriveCardsFrom"]=derive
   x["derivedVariant"]="Authentic hobby-exclusive 2002 Ultra Platinum memorabilia parallel, individually numbered /25; virtual registry identifier matches original subject."
  return x
 ps=[
 setdef("base","Base Set","BASE","285 collector-numbered base, 1-200 regular, 201-220 All-Stars, 221-250 Team Players, 251-285 Prospects. All three SPs 1:4 hobby and 1:10 retail, each remains in single base checklist."),
 setdef("gold-medallion","Gold Medallion","PARALLEL","285 genuine Gold counterparts. Normal #1-200 one per pack, All-Stars/Team Players 1:24, Prospects #251-285 /100. Original physical number same as base; G suffix is VCS registry identifier."),
 setdef("checklists","Printed Checklists (NNO)","INSERT","One authentic unnumbered original checklist #1-220, independent MCB and TCDB. Separate from 285 player base."),
 setdef("rising-stars","Rising Stars","INSERT","15 verified 1 RS to 15 RS numbered insert cards, hobby 1:12 retail 1:20."),
 setdef("glove-works","Glove Works","INSERT","15 verified 1 GW to 15 GW numbered insert cards, hobby 1:20 retail 1:36."),
 setdef("hitting-machines","Hitting Machines (Retail)","INSERT","25 verified numbered 1 HM-25 HM retail-only inserts, 1:20 retail; never in original hobby wax."),
 setdef("fall-classic","Fall Classic (Hobby)","INSERT","36 actually issued FC-numbered cards, hobby-only 1:20. The nominal 39-numbered checklist has nonexistent #11FC,#17FC,#30FC, excluded."),
 setdef("hitting-machines-game-bat","Hitting Machines Game Bat","INSERT","23 original physically unnumbered bat memorabilia, 1:81 hobby / 1:102 retail."),
 setdef("hitting-machines-game-bat-platinum","Hitting Machines Game Bat Platinum /25","PARALLEL","All 23 authentic hobby-only Platinum /25 versions of physically unnumbered Bat memorabilia.",derive="hitting-machines-game-bat"),
 setdef("on-the-road-game-jersey","On the Road Game Jersey","INSERT","14 original physically unnumbered game-used jersey cards, 1:93 hobby / 1:268 retail."),
 setdef("on-the-road-game-jersey-platinum","On the Road Game Jersey Platinum /25","PARALLEL","All 14 authentic /25 original hobby-only Platinum jersey parallels.",derive="on-the-road-game-jersey"),
 setdef("fall-classic-memorabilia","Fall Classic Memorabilia","INSERT","37 actual bat/jersey/pants material issues. Individually short-printed originals carry estimated print quantities, NOT serial numbering; hobby 1:113 retail 1:400."),
 setdef("glove-works-memorabilia","Glove Works Memorabilia","INSERT","Nine original game-used glove subjects with varying serial /100 to /450 including batting/fielding material variation notes."),
 setdef("glove-works-memorabilia-platinum","Glove Works Memorabilia Platinum /25","PARALLEL","All nine verified original Glove Works Memorabilia Platinum issues hobby-only /25.",derive="glove-works-memorabilia"),
 setdef("rising-stars-game-hat","Rising Stars Game Hat /100","INSERT","Six actual original physically unnumbered game-used hat cards each numbered /100."),
 setdef("rising-stars-game-hat-platinum","Rising Stars Game Hat Platinum /25","PARALLEL","All six original Rising Stars game-used hat Platinum parallels hobby-only /25.",derive="rising-stars-game-hat"),
 setdef("fall-classic-autographs","Fall Classic Autographs","INSERT","20 original autographs, hobby 1:240; source labels SP and most as expired exchange cards.")
 ]
 if {x["key"]:x["expectedCards"] for x in ps}!=EXPECTED:raise ValueError("Manifest incomplete")
 return {
 "schemaVersion":2,"status":"DRAFT",
 "source":{"BCP":BCP,"MyCardBatch":MCB,"TCDB":TCDB,"TCDBTrueRC":RC_URL},
 "decisions":{
 "base":"285 original player cards from BCP + independent MCB, 200 regular and 85 SP: 20 All-Stars, 30 Team Players, 35 Prospects; same collector checklist. True RCs only Spurling 254, Maldonado 262 and Nussbeck 275 per TCDB.",
 "sourceDiscrepancies":"Base #178 Bob/Bobby Abreu, #242 Bob/Bobby Higginson; numbered HM #25 Bob/Bobby Abreu; Fall Classic #8 Jimmy/Jimmie Foxx and #10 Roger/Rogers Hornsby, reviewed independently.",
 "gaps":"Though marketed as a 39-number Fall Classic insert, #11FC,17FC,30FC never issued: 36 physical collectibles; BCP and MCB agree exact 36.",
 "gold":"Entire original 285 has Gold Medallion, not Platinum Medallion. 1-200 once per pack; 201-250 1:24; 251-285 serialized /100. VCS G is parallel registry notation; not invented printed number.",
 "parallelMemo":"No 2002 base Platinum Medallion. Actual Platinum /25 memorabilia variations modeled for Hitting Machines Bats 23, On the Road Jerseys 14, Glove Works Gloves 9, Rising Stars Hats 6.",
 "memo":"Preserve real subjects/materials/print quantities and Glove Works first-75 batting-glove patch variations. Separate unnumbered memorabilia as distinct virtual identifiers.",
 "channel":"Hitting Machines base inserts retail only; Fall Classic numbered inserts hobby only. No mixing hobby/retail odds.",
 "odds":"10-card hobby packs x 24; product set odds NULL pending proper Gold slot, subsets, serial and retail/hobby eligibility, no made-up pull rates.",
 "release":"Create only new unreleased 2002 Ultra product; prices, source scans and original pack/box images pending QA. No change to existing ProductSets."
 },
 "product":{"id":PID,"year":2002,"brand":"Ultra","sport":"Baseball",
   "cardsPerPack":10,"packsPerBox":24,"packPriceCents":0,"autoPackPricing":True,
   "packImageUrl":None,"boxImageUrl":None,"released":False},
 "review":{"teamData":"COMPLETE","checklists":"VERIFIED_BCP_MCB_TCDB",
  "trueRookies":"VERIFIED_THREE_TCDB","cardImages":"PENDING","packImage":"PENDING",
  "pricing":"PENDING","collation":"BLOCKED_CHANNEL_AND_SERIAL_SP_ODDS","release":"UNRELEASED"},
 "cardsFile":CARDS.name,"productSets":ps}

def check():
 b=json.loads(BUNDLE.read_text("utf8"))
 if b.get("schemaVersion")!=2 or b.get("status")!="DRAFT" or b["product"]["released"] is not False:
  raise ValueError("Unreleased draft safety gate failed")
 if b["product"]["id"]!=PID or b["cardsFile"]!=CARDS.name:
  raise ValueError("Manifest identity changed")
 if {p["key"]:p["expectedCards"] for p in b["productSets"]}!=EXPECTED:raise ValueError("Collector group sizes changed")
 if {p["key"]:p["deriveCardsFrom"] for p in b["productSets"] if p.get("deriveCardsFrom")}!=DERIVE:raise ValueError("Physical Platinum group derivation changed")
 if any(p["oddsPerPack"] is not None for p in b["productSets"]):raise ValueError("Pack odds must remain gated pending channel/slot implementation")
 with gzip.open(CARDS,"rt",newline="",encoding="utf8") as f:rows=list(csv.DictReader(f))
 explicit={k:v for k,v in EXPECTED.items() if k not in DERIVE}
 if Counter(r["setKey"] for r in rows)!=Counter(explicit):
  raise ValueError("Incomplete original source CSV")
 if len({(r["setKey"],r["cardNumber"]) for r in rows})!=len(rows):raise ValueError("Duplicate collector card number")
 if any(not r["player"] or (not r["team"] and r["setKey"]!="checklists") for r in rows):
  raise ValueError("Missing player/team after source audit")
 base={int(r["cardNumber"]):r for r in rows if r["setKey"]=="base"}
 if set(base)!=set(range(1,286)):raise ValueError("Original base #1-285 incomplete")
 for n,p in [(1,"Jeff Bagwell"),(3,"Alex Rodriguez"),(51,"Ichiro"),(56,"Albert Pujols"),(178,"Bobby Abreu"),
             (254,"Chris Spurling RC"),(262,"Carlos Maldonado RC"),(275,"Mark Nussbeck RC"),(285,"Luis Lopez")]:
  if base[n]["player"]!=p:raise ValueError(f"Base player mismatch #{n}: {base[n]['player']}")
 if {int(r["cardNumber"].removesuffix("G")) for r in rows if r["setKey"]=="gold-medallion"}!=set(range(1,286)):
  raise ValueError("Original 285 Gold Medallion parallel checklist incomplete")
 fcs={int(r["cardNumber"].split(" ")[0]) for r in rows if r["setKey"]=="fall-classic"}
 if len(fcs)!=36 or set(range(1,40))-fcs!={11,17,30}:raise ValueError("Fictional Fall Classic cards")
 if sum(EXPECTED.values())!=823 or len(rows)!=771:raise ValueError("Total collector count must be 771+52=823")
 print("PASS 2002 Fleer Ultra: 285 base (200 regular + 85 subset SP), 285 Gold, three individually verified RCs")
 print("PASS 36 original Fall Classic, #11/17/30 never issued; four source-crosschecked numbered inserts")
 print("PASS game-used bat 23+23 Platinum, jersey 14+14, FC memorabilia 37, glove 9+9, hat 6+6, autographs 20, checklist 1")
 print("PASS 17 ProductSets, 771 explicit + 52 derived = 823 collector records")
 print("PASS true Gold SP /100; no fictional base Platinum; channel odds gated; DRAFT unreleased")

def main():
 p=argparse.ArgumentParser();p.add_argument("--check",action="store_true");a=p.parse_args()
 if not a.check:
  rows=groups_from_source();DATA.mkdir(parents=True,exist_ok=True)
  stream=io.StringIO(newline="")
  w=csv.DictWriter(stream,fieldnames=COLS,lineterminator="\n");w.writeheader();w.writerows(rows)
  CARDS.write_bytes(gzip.compress(stream.getvalue().encode("utf8"),compresslevel=9,mtime=0))
  BUNDLE.write_text(json.dumps(manifest(),indent=2,ensure_ascii=False)+"\n",encoding="utf8")
 check()
if __name__=="__main__":main()
