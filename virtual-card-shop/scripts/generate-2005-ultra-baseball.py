#!/usr/bin/env python3
"""2005 Fleer Ultra Baseball reproducible Set Factory generator, unreleased."""
import argparse,csv,gzip,io,json
from pathlib import Path
from ultra_2005_sources import *
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data/set-factory";BUNDLE=DATA/"2005-ultra-baseball.bundle.json"
CARDS=DATA/"2005-ultra-baseball.cards.csv.gz"
FIELDS=("setKey","cardNumber","player","team","subset","variant")
def display(key):
 return " ".join(w.capitalize() if w not in ("rc","1") else w.upper() for w in key.split("-")).replace("Ultraswatch","UltraSwatch")
def manifest(expected):
 psets=[]
 for key,n in expected.items():
  kind=("BASE" if key=="base" else "PARALLEL" if key in
      ("gold-medallion","platinum-medallion","follow-the-leader-die-cut","ultra-kings-gold",
       "season-crowns-game-used-gold","season-crowns-game-used-platinum-patch",
       "season-crowns-autographs-gold","season-crowns-autographs-platinum",
       "season-crowns-autographs-masterpiece","follow-the-leader-jersey-red",
       "follow-the-leader-jersey-gold","follow-the-leader-jersey-platinum-patch",
       "follow-the-leader-jersey-ultraswatch","kings-jersey-platinum-patch",
       "kings-jersey-gold-ultraswatch") else "INSERT")
  name=display(key)
  if key=="base":name="Base Set"
  if key=="gold-medallion":name="Gold Medallion"
  if key=="platinum-medallion":name="Platinum Medallion /50"
  if key=="ultra-kings-gold":name="Ultra Kings Gold /50"
  note=("Original issue; source-audited identity/number and original subject team; "
        "metadata captures genuine print cap and format restrictions. "
        "No invented pack odds or card visuals.")
  if key=="base":note+="200 veterans #1-200 plus 20 All-Rookie SP #201-220; none are true RCs."
  psets.append({"key":key,"id":P+"_"+key.replace("-","_"),"name":name,
      "kind":kind,"expectedCards":n,"oddsPerPack":None,"sourceUrl":BCP,"notes":note})
 return {
 "schemaVersion":2,"status":"DRAFT",
 "sources":{"BaseballCardPedia":BCP,"MyCardBatch":MCB,"TCDB":TCDB},
 "decisions":{
   "checklists":"All 220 original 2005 Ultra base cards cross-matched number/player/team in BCP and independent MCB. BCP + MCB checked for all four numbered original insert groups and original memorabilia variants.",
   "trueRookies":"No 2005 Ultra All-Rookie (#201-220) is a true RC per BaseballCardPedia; no blanket rookie flags.",
   "sourceAliases":"Original source differences: #53 Alexis/Alex Rios; #137 Ichiro Suzuki/Ichiro. Follow the Leader #9 Ichiro Suzuki/Ichiro. Season Crowns Platinum autograph #149 BCP misspells 'Albett Pujols'; independent source and base card confirm Albert Pujols.",
   "followLeaderJerseys":"BCP 14 real Follow the Leader jersey subjects, MCB 15 includes extra FLJ-MP Mike Piazza duplicating authentic FLJ-MPI; source-verified 14 Copper/Red/Gold/Platinum/UltraSwatch groups only.",
   "kingsJerseys":"BCP 45 genuine Kings jersey codes; source typos UKI-MTX (corrected UKJ-MTX), second UKJ-SC Scott Rolen (corrected UKJ-SR); independent MCB crosschecks. MCB Ultra Kings Jersey includes 7 extra code aliases, not additional authentic physical cards. Gold UltraSwatch 45 independently identified as 30 Ultra Kings + 15 Strikeout Kings sub-checklists and issued as UKJU- codes.",
   "goldKings":"Authentic 45 Ultra Kings Gold /50, original physical 1 UK to 45 UK, published order SK 1-15, RBI 16-30, HR 31-45.",
   "memories":"Season Crowns 50 game-used Copper /399, Gold /99, Platinum Patch /25; autographs Copper 5, Gold 14, Platinum 34 with authentic per-card cap from BCP, and Platinum Masterpiece 34 one-of-ones. Follow Leader Jersey five materials; Kings Jersey three, triple jersey 10 /33.",
   "formats":"2005 Ultra one original series: Hobby 8 cards x24 packs and Retail 8 cards x24 packs. Hobby Gold one per pack, retail Gold 1:3, All-Rookie SP hobby 1:4 retail 1:5. Other subset-specific odds, memorabilia format, serial caps incompatible with simple integer group odds.",
   "release":"Unreleased VCS draft until original pack image, genuine card scans, pricing and appropriate pack-slot/collation review. All oddsPerPack null; previous products remain untouched."
 },
 "product":{"id":P,"year":2005,"brand":"Ultra","sport":"Baseball","cardsPerPack":8,
   "packsPerBox":24,"packPriceCents":0,"autoPackPricing":True,
   "packImageUrl":None,"boxImageUrl":None,"released":False},
 "review":{"checklists":"VERIFIED_BCP_MCB_TCDB","teamData":"VERIFIED",
   "images":"PENDING","pricing":"PENDING","packCollation":"BLOCKED_FORMAT_SERIAL_SPS",
   "released":False},
 "cardsFile":CARDS.name,"productSets":psets}
def check():
 b=json.loads(BUNDLE.read_text("utf8"))
 if b["schemaVersion"]!=2 or b["status"]!="DRAFT" or b["product"]["released"] is not False:raise ValueError("Release safety gate")
 expected={p["key"]:p["expectedCards"] for p in b["productSets"]}
 if len(expected)!=25 or sum(expected.values())!=1232:raise ValueError("Unverified collector totals")
 if any(p["oddsPerPack"] is not None for p in b["productSets"]):raise ValueError("False pack odds")
 with gzip.open(CARDS,"rt",encoding="utf8",newline="") as f:rows=list(csv.DictReader(f))
 if len(rows)!=1232 or len({(r["setKey"],r["cardNumber"]) for r in rows})!=len(rows):raise ValueError("Incomplete or duplicate collector rows")
 from collections import Counter
 if Counter(r["setKey"] for r in rows)!=Counter(expected):raise ValueError("Checklist count per family mismatch")
 if any(not r["player"] or not r["team"] or not r["cardNumber"] for r in rows):raise ValueError("Missing players/teams/card identity")
 for key in ("base","gold-medallion","platinum-medallion"):
  if {int(r["cardNumber"]) for r in rows if r["setKey"]==key}!=set(range(1,221)):
   raise ValueError("Incorrect 220 original base/Medallion numbering "+key)
 if any(" RC" in r["player"] for r in rows):raise ValueError("Incorrect non-true rookie mark")
 if len([r for r in rows if r["setKey"]=="kings-jersey-gold-ultraswatch"])!=45:raise ValueError("45 authentic UltraSwatch omitted")
 if any(r["cardNumber"]=="FLJ-MP" for r in rows):raise ValueError("MCB FLJ-MP alias duplicated")
 if any(r["cardNumber"]=="UKJ-SC" and r["player"]=="Scott Rolen" for r in rows):raise ValueError("Unfixed BCP wrong suffix")
 print("PASS 2005 Ultra: 220 base (200 normal +20 non-RC All-Rookie), 220 Gold, 220 Platinum /50")
 print("PASS 25 collector families, 1232 unique records, exact serial caps and all genuine memorabilia subjects")
 print("PASS original 45 Kings Gold /50, 45 Kings Gold UltraSwatch (30+15), corrected published player-code aliases")
 print("PASS Season Crowns 50 x 3 game used and 5/14/34/34 autos; hobby vs retail metadata preserved")
 print("PASS no invented pull rates, source authenticity review, DRAFT unreleased")
def main():
 ap=argparse.ArgumentParser();ap.add_argument("--check",action="store_true");a=ap.parse_args()
 if not a.check:
  grouped,expected=generate_source();DATA.mkdir(parents=True,exist_ok=True)
  records=[]
  for key,items in grouped.items():
   for num,name,team,details in items:
    records.append(dict(zip(FIELDS,(key,str(num),name,team,display(key),details))))
  stream=io.StringIO(newline="");writer=csv.DictWriter(stream,FIELDS,lineterminator="\n")
  writer.writeheader();writer.writerows(records)
  CARDS.write_bytes(gzip.compress(stream.getvalue().encode("utf8"),compresslevel=9,mtime=0))
  BUNDLE.write_text(json.dumps(manifest(expected),separators=(",",":"),ensure_ascii=False)+"\n",encoding="utf8")
 check()
if __name__=="__main__":main()
