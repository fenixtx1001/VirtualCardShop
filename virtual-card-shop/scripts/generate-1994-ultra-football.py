#!/usr/bin/env python3
"""1994 Fleer Ultra Football, 651 audited collector records (525 base/125 inserts/1 promo)."""
import argparse,csv,gzip,io,json
from pathlib import Path
from ultra_1994_football_sources import *
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/"data/set-factory"
BUNDLE=OUT/"1994-ultra-football.bundle.json"; CARDS=OUT/"1994-ultra-football.cards.csv.gz"
FIELDS=("setKey","cardNumber","player","team","subset","variant")
# No synthetic parallel sets. Not all insert collectibles are legitimately eligible
# for a single-pack draw; release gate makes this data safe to import as a draft.
NOTES={
"base":"Base #1-325 Series I and #326-525 Series II. #320 NFL anniversary and #325 are real non-player cards with no team; other actual checklists are source-labeled.",
"second-year-standouts":"15 original cards, randomly inserted; no unsupported numeric odds.",
"award-winners":"5 original cards, randomly inserted; no unsupported numeric odds.",
"first-rounders":"20 original first-round draft subjects, randomly inserted; source notes printed error #17.",
"flair-hot-numbers":"15 original premium Flair cross-brand inserts, Series II packs ONLY.",
"flair-scoring-power":"6 original premium Flair cross-brand inserts, Series II packs ONLY.",
"flair-wave-of-the-future":"6 original premium Flair cross-brand inserts, Series II packs ONLY.",
"rick-mirer-rookie-of-the-year":"12 original Rick Mirer insert cards; #1-10 randomly inserted, #11-12 MAIL-IN exchange ONLY, not wax/jumbo cards.",
"rick-mirer-rookie-of-the-year-autographed":"Eight authentic Fleer embossed autograph insert variants; physical collector numbers 2,4,5,6,8,9,11,12; do not mistake auto for base.",
"touchdown-kings":"9 original foil-pack-exclusive inserts. Only appropriate foil pack, not all formats.",
"ultra-achievement-awards":"10 standard-size original randomly inserted cards.",
"ultra-achievement-awards-jumbo":"10 original oversized 3.5x5 achievement award cards, ONE per HOBBY CASE, NOT a regular pack insert.",
"ultra-stars":"9 original jumbo-pack-only inserts.",
"rick-mirer-promo":"One actual original Rick Mirer #1 pre-release PROMO, never pack eligible. TCDB lists separately; absent from MyCardBatch's 650-card count."
}
def manifest():
 return dict(
  schemaVersion=2,status="DRAFT",
  sources={"MyCardBatch":MCB,"TCDB":TCDB,"TCDBInserts":TCDB_INSERTS,
   "TCDBChecklist":"https://www.tcdb.com/Checklist.cfm/sid/3466/1994-Ultra",
   "TCDBPromo":"https://www.tcdb.com/Inserts.cfm/sid/3466/1994-Ultra"},
  decisions={
   "crosscheck":"TCDB confirms 525 original base, 325 Series I+200 Series II, 12 authentic insert families and original Rick Mirer PROMO; 525 individual numbered base records and all 12 named source checklists come from MCB, whose complete groups and source counts were independently corroborated against TCDB pages.",
   "totals":"650 main collector cards = 525 base + 125 across 12 insert families. Additionally one authentic #1 Rick Mirer parent-set promo = 651 entries and 14 collector ProductSets, not a manufactured 13th insert.",
   "series":"Two independent packs: Series One 14 standard cards vs Series Two 13 standard cards, with Series One #1-325 and Series Two #326-525; jumbos Series One 17 cards vs Series Two 16 cards per TCDB, 36 packs per box. Product-level 14x36 is Series One wax only; released pack engine must handle Series and format restrictions.",
   "noTeam":"Printed physical base #320 NFL 75th Anniversary and #325 Series One insert checklist have no team; these are genuinely teamless non-player records, not missing source data.",
   "mirer":"Mirer non-auto #1-10 were pack issued and #11-12 mail-in exchange ONLY. Autographed counterpart has 8 specific authentic numbers and Fleer embossing, distinct from non-auto.",
   "rarity":"TCDB documents premium Flair cross-brand Series II exclusives, foil-only Touchdown Kings, jumbo-pack-only Ultra Stars, and Hobby case-only 3.5x5 Achievement Awards Jumbo. Never permit these as generic standard pack hits; all product-set odds null until slot-specific collation added.",
   "rookies":"MCB source RC suffix preserved in per-card variant/source annotation, not appended to printed player names.",
   "noInvented":"No fabricated Gold Medallion parallels, autograph subjects beyond eight, serial numbers, pack odds, player teams, pack images or scans.",
   "release":"UNRELEASED DRAFT until authentic scans/images, pack and box art, pricing and precise Series/format/case/mail-in/promo collation is implemented. No changes to existing VCS sets."},
  product={"id":PID,"year":1994,"brand":"Ultra","sport":"Football",
   "cardsPerPack":14,"packsPerBox":36,"packPriceCents":0,"autoPackPricing":True,
   "packImageUrl":None,"boxImageUrl":None,"released":False},
  review={"checklists":"MCB_TCDB_INDEPENDENT_COUNTS_VERIFIED","cardImages":"PENDING","packArt":"PENDING",
          "pricing":"PENDING","packCollation":"BLOCKED_SERIES_FORMAT_CASE_PROMO_MAILIN","released":False},
  cardsFile=CARDS.name,
  productSets=[dict(
     key=key,id=PID+"_"+key.replace("-","_"),name=group_label(key),
     kind="BASE" if key=="base" else "INSERT",expectedCards=count,oddsPerPack=None,
     sourceUrl=(TCDB if key=="base" else TCDB_INSERTS if key=="rick-mirer-promo"
                else "https://www.tcdb.com/Checklist.cfm/sid/"+str(next(t for k,n,c,t in GROUPS if k==key))+
                     "/1994-Ultra"),
     notes=NOTES[key]) for key,count in EXPECTED.items()])
def check():
 b=json.loads(BUNDLE.read_text(encoding="utf8"))
 if b["schemaVersion"]!=2 or b["status"]!="DRAFT" or b["product"]["released"] is not False:
  raise ValueError("Safe unreleased draft required")
 sets={p["key"]:p["expectedCards"] for p in b["productSets"]}
 if sets!=EXPECTED or any(p["oddsPerPack"] is not None for p in b["productSets"]):
  raise ValueError("Incorrect authentic checklist totals or fabricated pack odds")
 with gzip.open(CARDS,"rt",encoding="utf8",newline="") as f:rows=list(csv.DictReader(f))
 if len(rows)!=651 or Counter(x["setKey"] for x in rows)!=Counter(EXPECTED):
  raise ValueError("Collector checklist rows/family mismatch")
 if len({(r["setKey"],r["cardNumber"]) for r in rows})!=len(rows):
  raise ValueError("Duplicate physical card numbers in group")
 original={int(r["cardNumber"]):r for r in rows if r["setKey"]=="base"}
 if set(original)!=set(range(1,526)):raise ValueError("Original base numbering incomplete")
 if sum(i<=325 for i in original)!=325 or sum(i>325 for i in original)!=200:
  raise ValueError("Source Series I/II base split wrong")
 if {i for i,r in original.items() if not r["team"]}!={320,325}:
  raise ValueError("Missing player-team detail beyond two source-confirmed non-player records")
 if any(not r["player"] or not r["cardNumber"] for r in rows):raise ValueError("Missing identity")
 if any(not r["team"] and (r["setKey"]!="base" or int(r["cardNumber"]) not in (320,325)) for r in rows):
  raise ValueError("Insert team identity missing")
 autos={r["cardNumber"] for r in rows if r["setKey"]=="rick-mirer-rookie-of-the-year-autographed"}
 if autos!={"2","4","5","6","8","9","11","12"}:raise ValueError("Authentic autograph numbering wrong")
 for n in (11,12):
  r=next(x for x in rows if x["setKey"]=="rick-mirer-rookie-of-the-year" and x["cardNumber"]==str(n))
  if "NOT PACK-ISSUED" not in r["variant"]:raise ValueError("Mail-in incorrect pack eligibility")
 promo=[x for x in rows if x["setKey"]=="rick-mirer-promo"]
 if len(promo)!=1 or promo[0]["cardNumber"]!="1" or "NOT pack issued" not in promo[0]["variant"].replace("NOT ISSUED IN PACKS","NOT pack issued"):
  raise ValueError("TCDB original promo missing/excluded")
 print("PASS 1994 Ultra Football: 525 original base (#1–325 Series I, #326–525 Series II)")
 print("PASS 12 independent original inserts totaling 125; eight exactly numbered Mirer autograph variants")
 print("PASS extra official Rick Mirer PROMO #1 excluded from packs; 651 records, 14 collector sets")
 print("PASS blank teams only genuine non-player #320, #325; all 649 other card records sourced")
 print("PASS mail-in #11–12, jumbo/case, foil, premium Flair series restricted; NULL group odds")
 print("PASS unreleased DRAFT; no artificial source/serial/imaging")
def main():
 parser=argparse.ArgumentParser();parser.add_argument("--check",action="store_true")
 args=parser.parse_args()
 if not args.check:
  records=audit_source();OUT.mkdir(parents=True,exist_ok=True)
  writerbuf=io.StringIO(newline="");w=csv.DictWriter(writerbuf,FIELDS,lineterminator="\n")
  w.writeheader();w.writerows(records)
  CARDS.write_bytes(gzip.compress(writerbuf.getvalue().encode("utf8"),compresslevel=9,mtime=0))
  BUNDLE.write_text(json.dumps(manifest(),separators=(",",":"),ensure_ascii=False)+"\n",encoding="utf8")
 check()
if __name__=="__main__":main()
