#!/usr/bin/env python3
"""2004 Ultra Set Factory: source audit lives in ultra_2004_sources.py."""
from ultra_2004_sources import *

def manifest(expected):
 families=[]
 for key,count in expected.items():
  isbase=key=="base";isparallel=key in ("gold-medallion","platinum-medallion") or key in {slug(t) for t in DERIVED}
  name=next((ALIASES.get(orig,orig) for orig in INSERT_EXPECTED if slug(ALIASES.get(orig,orig))==key),
        next((derived for derived in DERIVED if slug(derived)==key),key.replace("-"," ").title()))
  if key=="base":name="Base Set"
  if key=="gold-medallion":name="Gold Medallion"
  if key=="platinum-medallion":name="Platinum Medallion"
  series="Series One" if name in ("Base Set","Gold Medallion","Platinum Medallion") or name.startswith(("HR Kings","K Kings","RBI Kings","Diamond Producers","Ultra Performers","Ultra Kings","Season Crowns")) else "Update Series"
  if name in ("Base Set","Gold Medallion","Platinum Medallion"):series="Series One and Update Series; original 220/175 partition"
  note=(series+"; "+("genuine parallel" if isparallel else "original collector cards")+". ")
  if key in ("gold-medallion","platinum-medallion"):note+="All 395 parallel the original #1-395 with unchanged original printed numbers. "
  if key=="platinum-medallion":note+="Numbered /66 Series One #1-220, /100 Update #221-382, /13 Lucky 13 #383-395. "
  if key=="base":note+="First series #1-220; Update #221-395, including 87 Prospects #296-382 and 13 Lucky 13 #383-395. "
  if key=="turn-back-the-clock-jerseys-copper":note+="20 authentic source-listed jersey codes, omits erroneous duplicate TBC-HM. "
  cap=next((x for target,(source,x) in DERIVED.items() if slug(target)==key),SERIAL.get(name))
  if cap is not None:note+="Physical serial /"+str(cap)+". "
  families.append(dict(key=key,id=PID+"_"+key.replace("-","_"),name=name,kind="BASE" if isbase else "PARALLEL" if isparallel else "INSERT",
       expectedCards=count,oddsPerPack=None,sourceUrl=TCDB,notes=note))
 return dict(schemaVersion=2,status="DRAFT",sources={"BaseballCardPedia":BCP,"MyCardBatch":MCB,"TCDB":TCDB},
 decisions={
  "twoSeries":"Original Series One 220 cards issued November 2003, Update Series 175 cards issued October 2004. Keep single collector checklist but never mix the update 175 into Series One packs.",
  "factory":"2004 Ultra authentic first-series hobby/retail 8 cards/pack x24 box. Update retail 8x24, Update hobby 5x12. Product-level 8x24 reflects Series One ONLY; proper series-aware pack logic required to release.",
  "base":"All 395 original player identity/team/number entries independently checked against BCP and MCB. BCP flags individual RC candidates; identity-only source flags are NOT independently validated TCDB true RC status.",
  "sourceDiscrepancies":"BCP versus MCB player aliases #72 Jose Cruz/Jr, #276 Alexis/Alex Rios, #332 Luis A./Luis Gonzalez, #348 Mike/Michael Wuertz, #357 Don/Donnie Kelly, #383 Kaz/Kazuo Matsui. Final Lucky 13 L13 suffix preserved as subset, not treated as part of player name.",
  "correction":"MCB erroneously lists a 21st Turn Back the Clock Jersey card TBC-HM Hideo Nomo despite genuine source checklist only 20 including TBC-HN Hideo Nomo; omit unsupported TBC-HM from Copper, Silver and Gold; Platinum patch variation authentically uses TBC-HM in place of Copper/Gold/Silver TBC-HN.",
  "coverage":"40 authentic TCDB insert and memorabilia groups (28 MCB source groups and 12 independently TCDB-confirmed variations) plus base and two actual parallel base families. Never invent players/numbers.",
  "gold":"All 395 Gold Medallion, correct series/SP frequencies; all 395 Platinum Medallion serial cap /66, /100, /13 per original numbered subset.",
  "rarity":"Preserve source serial caps, original exact team affiliations, swatch families, and print variations in each card variant notes; source discrepancies remain documentable.",
  "odds":"No invented integer group odds: guaranteed Gold, multi-series 8x24 vs 5x12, separately seeded SP slots, serials, blaster-only variants, unique memorabilia and series restrictions need dedicated collation engine.",
  "release":"Unreleased draft until source-accurate scans, authentic pack/box art, pricing and product-series collation are independently verified. No mutations to previous sets."},
 product={"id":PID,"year":2004,"brand":"Ultra","sport":"Baseball","cardsPerPack":8,"packsPerBox":24,
  "packPriceCents":0,"autoPackPricing":True,"released":False,"packImageUrl":None,"boxImageUrl":None},
 review={"checklists":"BCP_MCB_TCDB_CROSSCHECKED","teams":"VERIFIED_SOURCE_REPORTED",
  "images":"PENDING","pricing":"PENDING","packCollation":"BLOCKED_TWO_SERIES","released":False},
 cardsFile=CARDS.name,productSets=families)
def check():
 b=json.loads(BUNDLE.read_text())
 if b.get("schemaVersion")!=2 or b["status"]!="DRAFT" or b["product"]["released"] is not False:
  raise ValueError("Draft safety gate")
 if len(b["productSets"])!=43:raise ValueError("Expected 40 inserts plus 3 base/parallel groups")
 expected={p["key"]:p["expectedCards"] for p in b["productSets"]}
 if any(p["oddsPerPack"] is not None for p in b["productSets"]):raise ValueError("Unsupported fake pack odds")
 with gzip.open(CARDS,"rt",encoding="utf8",newline="") as f:rows=list(csv.DictReader(f))
 if Counter(r["setKey"] for r in rows)!=Counter(expected):raise ValueError("Missing set cards")
 if len({(r["setKey"],r["cardNumber"]) for r in rows})!=len(rows):raise ValueError("Number conflict")
 if any(not r["player"] or (not r["team"] and r["setKey"]!="checklists") for r in rows):
  raise ValueError("Missing team/identity")
 for key in ("base","gold-medallion","platinum-medallion"):
  nrs={int(r["cardNumber"]) for r in rows if r["setKey"]==key}
  if nrs!=set(range(1,396)):raise ValueError("Original 395-card collector checklist wrong "+key)
 if sum(expected.values())!=len(rows):raise ValueError("Total check mismatch")
 if any(r["cardNumber"]=="TBC-HM" and r["setKey"] in ("turn-back-the-clock-jerseys-copper","turn-back-the-clock-jerseys-gold","turn-back-the-clock-jerseys-silver") for r in rows):raise ValueError("Erroneous extra TBC-HM in jersey families")
 print("PASS 2004 Ultra: original 395 base (220 Series One + 175 Update), 395 Gold, 395 Platinum")
 print("PASS 40 authentic numbered/serial/relic/insert families, 43 collector ProductSets")
 print("PASS 20 source-listed TBC jersey codes; distinct patch-only TBC-HM retained")
 print("PASS no fake pack odds, multi-series release blocked, DRAFT unreleased")
 print("PASS",len(rows),"source-audited collector records")
def main():
 a=argparse.ArgumentParser();a.add_argument("--check",action="store_true");args=a.parse_args()
 if not args.check:
  rows,expected=make();DATA.mkdir(parents=True,exist_ok=True)
  buf=io.StringIO(newline="");writer=csv.DictWriter(buf,FIELDS,lineterminator="\n")
  writer.writeheader();writer.writerows(rows)
  CARDS.write_bytes(gzip.compress(buf.getvalue().encode(),compresslevel=9,mtime=0))
  BUNDLE.write_text(json.dumps(manifest(expected),separators=(",",":"),ensure_ascii=False)+"\n")
 check()
if __name__=="__main__":main()
