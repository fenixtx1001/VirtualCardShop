#!/usr/bin/env python3
"""1996 Ultra Football Set Factory. Audited, source-stable unreleased draft."""
import argparse,csv,gzip,io,json
from collections import Counter
from pathlib import Path
from ultra_1996_football_sources import *
ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/"data/set-factory"
BUNDLE=DATA/"1996-ultra-football.bundle.json"
CARDS=DATA/"1996-ultra-football.cards.csv.gz"
FIELDS=("setKey","cardNumber","player","team","subset","variant")
def manifest():
 names={"base":"Base Set",**{slug(x):x for x in INSERTS},
        "sample-sheet-singles":"Sample Sheet Singles (Promo Only)",
        "dealer-promo-sheet":"Dealer Promotional Sheet (Promo Only)"}
 sets=[]
 for key,n in COUNTS.items():
  kind="BASE" if key=="base" else "INSERT"
  sets.append(dict(key=key,id=PID+"_"+key.replace("-","_"),
    name=names[key],kind=kind,expectedCards=n,oddsPerPack=None,
    sourceUrl=TCDB_CHECKLIST if key=="base" else TCDB_INSERTS,
    notes=source_info(key)+". Actual family-level published odds are NOT globally assignable to mixed Hobby/Retail packs in current VCS model."))
 return dict(schemaVersion=2,status="DRAFT",
  sources={"MyCardBatch":MCB,"TCDB":TCDB,"TCDBChecklist":TCDB_CHECKLIST,
           "TCDBInserts":TCDB_INSERTS,"Beckett":BECKETT},
  decisions={
   "preflight":"No preexisting production product, matching GitHub PR, or branch before creation.",
   "numbering":"Original TCDB base is 200 physical cards: #1-198 plus two physically printed NNO checklist cards. MCB shorter 198 total silently omits checklists. VCS internal NNO-1 and NNO-2 are unique collector IDs, their printed number remains NNO.",
   "insertSets":"Five authentic TCDB pack-insert families: All-Rookies (10), Mr. Momentum (20), Pulsating (10), Sledgehammer (10) and Ultra Rookies (30). MyCardBatch spelling variant All Rookies matches TCDB All-Rookies.",
   "promos":"MyCardBatch lists three individual Sample Sheet Singles S1–S3; TCDB documents same three-up promotional sheet itself S1 / S2 / S3. Separate four physical promo collectibles, never eligible for original wax.",
   "baseSubsets":"Original numbered rookie college cards #164-178, Flash Impact #179-188, Seasoned Winners #189-198 and source RC #137. Real RC/FI/SW suffixes documented as subset/variant only, stripped from physical player names.",
   "standalone":"1996 Ultra Sensations is another standalone 100-card product, NOT an insert or parallel of 1996 Ultra. Do not combine.",
   "format":"Hobby 12 cards x 24 packs; Retail 12 cards x 36 packs. Product fields represent Hobby 12x24, retail pack/box variation requires distinct product release logic.",
   "odds":"Original published TCDB group odds: All-Rookies 1:180 (die-cut), Mr. Momentum 1:10, Pulsating 1:20, Sledgehammer 1:15 HOBBY ONLY, Ultra Rookies 1:3. Do not invent any per-card rate or encode hobby-only inserts as universal group odds. ALL ProductSet.oddsPerPack NULL.",
   "images":"Only original scans and original printed insert templates. No generated or fabricated card art, odds, serial numbers, alternate parallel or pricing.",
   "release":"Unreleased VCS draft until card scans, pack/box artwork, pricing and hobby/retail-aware insert collation verified; previous user cards untouched."},
  product={"id":PID,"year":1996,"brand":"Ultra","sport":"Football","cardsPerPack":12,
           "packsPerBox":24,"packPriceCents":0,"autoPackPricing":True,"released":False,
           "packImageUrl":None,"boxImageUrl":None},
  review={"checklists":"VERIFIED_MCB_TCDB_BECKETT","images":"PENDING","pricing":"PENDING",
          "packCollation":"BLOCKED_HOBBY_RETAIL_PACK_ODDS","released":False},
  cardsFile=CARDS.name,productSets=sets)
def check():
 b=json.loads(BUNDLE.read_text("utf8"))
 if b["schemaVersion"]!=2 or b["status"]!="DRAFT" or b["product"]["released"] is not False:
  raise ValueError("Release safety gate")
 family={p["key"]:p["expectedCards"] for p in b["productSets"]}
 if family!=COUNTS or any(p["oddsPerPack"] is not None for p in b["productSets"]):
  raise ValueError("Incomplete family list / fake odds")
 with gzip.open(CARDS,"rt",encoding="utf8",newline="") as f:rows=list(csv.DictReader(f))
 if len(rows)!=284 or Counter(r["setKey"] for r in rows)!=Counter(COUNTS):
  raise ValueError("Original collector counts missing")
 if len({(r["setKey"],r["cardNumber"]) for r in rows})!=284:
  raise ValueError("Duplicate physical collector identity")
 numbered={int(x["cardNumber"]) for x in rows if x["setKey"]=="base" and x["cardNumber"].isdigit()}
 if numbered!=set(range(1,199)):raise ValueError("198 numbered base incomplete")
 nno={x["cardNumber"]:x for x in rows if x["setKey"]=="base" and x["cardNumber"].startswith("NNO-")}
 if set(nno)!={"NNO-1","NNO-2"} or any(x["team"] for x in nno.values()):
  raise ValueError("Original NNO checklists missing/misidentified")
 if any(not r["player"] or not r["cardNumber"] or (not r["team"] and r["cardNumber"] not in nno) for r in rows):
  raise ValueError("Non-checklist player team missing")
 if any(r["player"].endswith(" RC") or r["player"].endswith(" FI") or r["player"].endswith(" SW") for r in rows):
  raise ValueError("Printed player names contaminated by source subset labels")
 if [r["cardNumber"] for r in rows if r["setKey"]=="sample-sheet-singles"]!=["S1","S2","S3"]:
  raise ValueError("Promotional singles missing")
 print("PASS 1996 Ultra Football: 200 base physical cards (198 numbered +2 genuine NNO)")
 print("PASS five TCDB insert families: 10,20,10,10,30 = 80")
 print("PASS three separated original dealer samples and one complete promotional sheet")
 print("PASS 284 original collector records across eight source-verified groups")
 print("PASS no invented gold, serial, odd, pack-only promo or card imagery; DRAFT")
def main():
 p=argparse.ArgumentParser();p.add_argument("--check",action="store_true");a=p.parse_args()
 if not a.check:
  rows=audit_source();DATA.mkdir(parents=True,exist_ok=True)
  buffer=io.StringIO(newline="");w=csv.DictWriter(buffer,FIELDS,lineterminator="\n")
  w.writeheader();w.writerows(rows)
  CARDS.write_bytes(gzip.compress(buffer.getvalue().encode("utf8"),compresslevel=9,mtime=0))
  BUNDLE.write_text(json.dumps(manifest(),separators=(",",":"),ensure_ascii=False)+"\n",encoding="utf8")
 check()
if __name__=="__main__":main()
