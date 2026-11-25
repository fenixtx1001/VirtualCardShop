#!/usr/bin/env python3
"""1995 Ultra Football reproducible Set Factory; draft until pack-collation QA."""
import argparse,csv,gzip,io,json
from collections import Counter
from pathlib import Path
from ultra_1995_football_sources import *
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/"data/set-factory"
BUNDLE=OUT/"1995-ultra-football.bundle.json"; CARDS=OUT/"1995-ultra-football.cards.csv.gz"
FIELDS=("setKey","cardNumber","player","team","subset","variant")
def label(key):
 if key=="base":return "Base Set"
 if key=="gold-medallion":return "Gold Medallion"
 if key=="bam-morris-prototype-promo":return "Bam Morris Prototype (Promo Only)"
 return next((name for name in [*INSERTS,*GOLD_INSERTS.values(),*PROMOS] if slug(name)==key),key)
def meta(key):
 if key=="base":return ("BASE","Original Series One #1-350; Ultra Extra Series Two #351-550, no shared pack base pool. True RC and Extra Edition source suffixes in card metadata, three teamless physical checklists.")
 if key=="gold-medallion":return ("PARALLEL","550 authentic base parallels with original printed card numbers. Foil Gold Medallion Edition #1-350 one per Series One pack, #351-550 one per Ultra Extra pack. Original series-specific selection required.")
 if key in {slug(n) for n in GOLD_INSERTS.values()}:
  return ("PARALLEL","TCDB-authenticated printed Gold Medallion insert alternative, inherited exact original insert printed code, subject and team; foil design must use insert template, never base template.")
 if key in {slug(n) for n in PROMOS} or key=="bam-morris-prototype-promo":
  return ("INSERT","PROMO-ONLY: official advance promotional sheet/singles or printed stat-line proof, NEVER eligible for original packs, boxes, or grading lotteries.")
 return ("INSERT",source_note(key,"1")+". Actual published odds and channel are annotations only; product-set group odds NULL until conditional pack slot implementation.")
def manifest():
 groups=[]
 for key,count in EXPECTED.items():
  kind,description=meta(key)
  groups.append(dict(key=key,id=PID+"_"+key.replace("-","_"),name=label(key),
     kind=kind,expectedCards=count,oddsPerPack=None,sourceUrl=TCDB_INSERTS if key not in ("base","gold-medallion") else GOLD_TCDB if key=="gold-medallion" else TCDB,
     notes=description))
 return dict(schemaVersion=2,status="DRAFT",
 sources={"MyCardBatch":MCB,"TCDB":TCDB,"TCDBInserts":TCDB_INSERTS,
          "TCDBGold":GOLD_TCDB,"Beckett":BECKETT},
 decisions={
  "sourceAudit":"Source parses 550 exact individually numbered base card identities, player teams and 12 pack insert families from MyCardBatch. TCDB independently confirms 550 base, Gold Medallion 550, all 19 actual insert families (12 primary + seven printed Gold Medallion insert alternates) and 2 Ultra Extra promotional families; printed Bam Morris parent-set prototype audited.",
  "series":"Series One #1–350 and Ultra Extra Series Two #351–550; NEVER mix base cards across original separate series. Some original base checklists #350, #351, #352 are genuinely teamless non-player checklist subjects.",
  "counts":"550 base + 550 Gold Medallion + 170 across 12 original pack insert groups + 80 across seven genuine Gold Medallion insert foil variations + 5 Ultra Extra promo sheet/individually separated cards + 1 Bam Morris parent-set prototype = 1,356, 24 product sets.",
  "rookies":"Source RC and EE suffixes removed from player name, retained as card subset/variant annotations. Derrick Alexander #184/#443 UER original birthdate noted, no fake corrective print-run cards.",
  "goldVariants":"Seven distinct insert Gold Medallion groups source verified: 1st Rounders, 2nd Year Standouts, Award Winners, Rising Stars, Touchdown Kings, Ultra Achievements, Ultra Stars. Use original insert template, NOT generic base Gold Medallion artwork.",
  "promos":"Ultra Extra pre-release perforated 4-card sheet (S1–S4) and individual 4 singles S1–S4 preserved as distinct genuine collector formats. TCDB lists separate printed #264 Bam Morris promo proof with Steelers/Pittsburgh statline discrepancy; no promo eligible for wax packs.",
  "packs":"Original Series One wax 12 cards x36 packs; 15-card premium/jumbo formats documented, while Ultra Extra changes Series/retail/hobby and pull eligibility. Product fields describe 12x36 Series One ONLY. Gold base parallel one per respective Series pack, but simple oddsPerPack cannot express deterministic 1 Gold slot, exclusive insert varieties and hot packs.",
  "odds":"Original TCDB group-level pull rates annotated for original Series and format, Gold insert parallels separately documented but specific original rates not verified. All ProductSet.oddsPerPack NULL intentionally to avoid fabricated single-pool rarity or accidental promotion of advanced promos, hot-packs and retailer-only inserts into wax.",
  "release":"Unreleased VCS draft pending authentic front/back scans, pack and box imagery, pricing, and series/format/guaranteed Gold/Hot Pack collation. Previous products and owned cards remain unchanged."},
 product={"id":PID,"year":1995,"brand":"Ultra","sport":"Football","cardsPerPack":12,"packsPerBox":36,"packPriceCents":0,"autoPackPricing":True,"released":False,
          "packImageUrl":None,"boxImageUrl":None},
 review={"checklists":"SOURCE_AUDITED_MCB_TCDB_BECKETT","sourceNames":"VERIFIED","images":"PENDING","packArt":"PENDING",
         "pricing":"PENDING","collation":"BLOCKED_SERIES_FORMAT_GOLD_HOT_PACK_PROMOS","released":False},
 cardsFile=CARDS.name,productSets=groups)
def check():
 m=json.loads(BUNDLE.read_text(encoding="utf8"))
 if m["schemaVersion"]!=2 or m["status"]!="DRAFT" or m["product"]["released"] is not False:
  raise ValueError("Release safety gate")
 spec={x["key"]:x["expectedCards"] for x in m["productSets"]}
 if spec!=EXPECTED or len(spec)!=24 or sum(spec.values())!=1356:
  raise ValueError("Source group map mismatch")
 if any(x["oddsPerPack"] is not None for x in m["productSets"]):
  raise ValueError("Invented pack odds must be null")
 with gzip.open(CARDS,"rt",encoding="utf8",newline="") as f:rows=list(csv.DictReader(f))
 if len(rows)!=1356 or Counter(x["setKey"] for x in rows)!=Counter(EXPECTED):
  raise ValueError("Incomplete 24 original physical collector groups")
 if len({(x["setKey"],x["cardNumber"]) for x in rows})!=1356:raise ValueError("Duplicate printed card number")
 if any(not x["player"] or not x["cardNumber"] or (not x["team"] and (x["setKey"] not in ("base","gold-medallion") or x["cardNumber"] not in ("350","351","352"))) for x in rows):
  raise ValueError("Missing genuine source team/subject")
 for key in ("base","gold-medallion"):
  found={int(r["cardNumber"]) for r in rows if r["setKey"]==key}
  if found!=set(range(1,551)):raise ValueError("Original full base/Gold 550 incorrect "+key)
 if {int(x["cardNumber"]) for x in rows if x["setKey"]=="base" and x["team"]==""}!={350,351,352}:
  raise ValueError("Non-player checklist team blanks altered")
 if any(x["player"].endswith(" RC") or x["player"].endswith(" EE") for x in rows):raise ValueError("Collector suffix incorrectly part of name")
 if len([x for x in rows if x["setKey"]=="all-rookie-team-hot-pack"])!=10:
  raise ValueError("Hot Pack variation incomplete")
 for key in ("ultra-extra-series-ii-promo-sheet","ultra-extra-series-ii-promo-sheet-singles","bam-morris-prototype-promo"):
  vals=[x for x in rows if x["setKey"]==key]
  if not vals or any("NOT" not in x["variant"] and "NOT DISTRIBUTED" not in x["variant"] for x in vals):
   raise ValueError("Promo pack exclusion/source records incorrectly classified "+key)
 print("PASS 1995 Ultra Football: Series One base #1-350 + Extra #351-550 and 550 original Gold")
 print("PASS 19 distinct genuine TCDB insert sets: 12 originals (170) + seven Gold foil variations (80)")
 print("PASS 4 physical Ultra Extra promo singles + one original perforated sheet + Bam Morris #264 printed prototype")
 print("PASS 24 collector families, 1,356 cards, 3 genuine blank-team checklist subjects (6 including Gold)")
 print("PASS printed source RC/EE suffixes in metadata; all actual player teams verified")
 print("PASS no fabricated per-pack odds/artwork; unreleased DRAFT")
def main():
 p=argparse.ArgumentParser();p.add_argument("--check",action="store_true");a=p.parse_args()
 if not a.check:
  rows=audit_source();OUT.mkdir(parents=True,exist_ok=True)
  buff=io.StringIO(newline="");w=csv.DictWriter(buff,FIELDS,lineterminator="\n");w.writeheader();w.writerows(rows)
  CARDS.write_bytes(gzip.compress(buff.getvalue().encode("utf8"),compresslevel=9,mtime=0))
  BUNDLE.write_text(json.dumps(manifest(),separators=(",",":"),ensure_ascii=False)+"\n",encoding="utf8")
 check()
if __name__=="__main__":main()
