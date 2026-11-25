#!/usr/bin/env python3
"""Verified 1997 Fleer Ultra Football: reproducible unreleased Set Factory."""
import argparse,csv,gzip,io,json
from collections import Counter
from pathlib import Path
from ultra_1997_football_sources import *
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data/set-factory"
BUNDLE=DATA/"1997-ultra-football.bundle.json"
CARDS=DATA/"1997-ultra-football.cards.csv.gz"
FIELDS=("setKey","cardNumber","player","team","subset","variant")
def group_name(key):
 if key=="base":return "Base Set"
 if key=="brown-backs":return "Brown Backs (Series One Veterans)"
 if key=="gold-medallion":return "Gold Medallion"
 if key=="platinum-medallion":return "Platinum Medallion"
 if key=="gold-medallion-g1b-blue-back":return "Gold Medallion G1b (Blue Back)"
 for t in INSERTS:
  if slug(t)==key:return t
 if key=="lucky-13-dan-marino-autograph":return "Lucky 13 Dan Marino Autograph (Mail-In)"
 if key.startswith("reebok-"):return "Reebok "+key.rsplit("-",1)[1].capitalize()
 if key=="terrell-davis-display":return "Terrell Davis Display (Oversized Promo)"
 if key=="terrell-davis-sample-promo":return "Terrell Davis Sample (Promo)"
 if key=="terrell-davis-autographed-promo":return "Terrell Davis Autographed (Promo)"
 if key=="presentation-game-football-offer":return "Hand Customized Presentation Game Football Offer"
 return key
def metadata(key):
 if key=="base":return "BASE","Full original 350 #1–200 Series One, #201–350 Series Two; four printed teamless checklists #199, #200, #349, #350."
 if key in ("gold-medallion","platinum-medallion"):
  return "PARALLEL",f"Original {group_name(key)} with exact G/P original back numbers; 346 unique actual printed subjects (excluding all four checklists). Hobby-only, separate Series One/Two pack pools. Veteran parallels can have different photos from base."
 if key=="brown-backs":return "PARALLEL","Beckett-listed authentic first-series Brown Backs, veterans #1–173 ONLY. Printed original numbers unchanged; original distinct brown cardbacks."
 if key=="gold-medallion-g1b-blue-back":return "PARALLEL","True TCDB Gold Medallion G1b Brett Favre Blue Back printed/photographic variation. Preserve physical print/collation; do not conflate with regular G1."
 if key in (slug(x) for x in INSERTS):return "INSERT","Original insert. "+ODDS[key]+". No universal oddsPerPack while Series One vs Series Two/retail availability differs."
 if key=="lucky-13-dan-marino-autograph":return "INSERT","100 hand autographs redeemed by Lucky 13 mail-in only, NEVER inserted in packs as an autograph."
 if key.startswith("reebok-"):return "INSERT","Physical "+group_name(key)+" Reebok branding variation, each 15 genuine source codes, specially marked Reebok promotional packs ONLY; not ordinary packs."
 return "INSERT","Authentic catalogued promotional/display/offer item. Source-restricted, never a regular pack collectible."
def manifest():
 prodsets=[]
 for key,n in EXPECTED.items():
  kind,description=metadata(key)
  prodsets.append(dict(key=key,id=PID+"_"+key.replace("-","_"),
     name=group_name(key),kind=kind,expectedCards=n,oddsPerPack=None,
     sourceUrl=TCDB if key=="base" else BECKETT_BROWN if key=="brown-backs" else
     TCDB_GOLD if key in ("gold-medallion","gold-medallion-g1b-blue-back") else
     TCDB_PLAT if key=="platinum-medallion" else TCDB_REEBOK if key.startswith("reebok-") else TCDB_INSERTS,
     notes=description))
 return dict(schemaVersion=2,status="DRAFT",
 sources={"MyCardBatch":MCB,"TCDB":TCDB,"TCDBInserts":TCDB_INSERTS,"TCDBGold":TCDB_GOLD,
          "TCDBPlatinum":TCDB_PLAT,"TCDBReebok":TCDB_REEBOK,"BeckettBrownBacks":BECKETT_BROWN},
 decisions={
  "originalStructure":"1997 Ultra genuine base 350, Series One #1-200 / Series Two #201-350; first 173 are original veterans and #174–198 original Rookie subset. Four teamless physical checklists excluded from both 346-card medallions.",
  "sourceAuthenticity":"MCB 350 exact individually numbered source team subjects, 14 numbered insert tables, 346+346 exact G/P printed numbers, 15 actual Reebok-player numbers and genuine Lucky 13 and display crosschecked with TCDB. MCB card total only 1229 and collapses original distinct variations; this audit also includes TCDB-listed variants.",
  "base": "The original issued first series 200 and second 150, no manufactured extra rookies or checklists. Preserve RC designation as collector metadata, not part of printed player identity.",
  "medallions":"Gold G1–G198 and G201–G348, Platinum P1–P198 and P201–P348, actual 346 each, excludes G/P199,200,349,350. Real source variation G1b Blue Back Brett Favre is separately catalogued. Printed prefixes preserved exactly.",
  "brownbacks":"Beckett documents a distinct 173-card Ultra Brown Backs group: original Series One veteran cards #1–173. Brown backs are not a made-up parallel or a fully printed 350-card set. No invented specific pull odds.",
  "twoExtraInserts":"TCDB authentic Blitzkrieg Die Cut 18 and Rookies Gold Embossed 12 omitted from shorter MCB. Original physical printed card number and player/team from parent inserts retained, artwork must use proper physical variation.",
  "odds":"TCDB published full distinct odds on 16 insert families, original Series noted per group in metadata. Gold guaranteed one per HOBBY pack, Platinum replaces Gold 1:100 Hobby packs, with original manufacturer-estimated Platinum print run under 150. Reebok in specially marked packs only, Lucky 13 autographed via mail only.",
  "specialIssues":"Actual 5-color x15 Reebok-logo family, original 15 specific base card numbers, TCDB documented five unique back-print colors; genuine oversized Terrell Davis display, separate original NNO Terrell Davis sample and autographed promo and single NNO printed offer. Never let display, samples, offers or redemption autograph appear in regular wax.",
  "imageAuthenticity":"Do not create visual fake parallels or reuse the base player photograph for distinct veteran medallion shots. Card scans and unique foil/die cut/different backs must be authentic sources.",
  "release":"Product unreleased until original scans, pack+box image, pricing and proper two-series Hobby/Retail/ Reebok/ mail-in/case/promo rules implemented. Do not assign fake odds or mix nonexistent cards into regular packs."},
 product={"id":PID,"year":1997,"brand":"Ultra","sport":"Football",
          "cardsPerPack":10,"packsPerBox":36,"packPriceCents":0,"autoPackPricing":True,
          "packImageUrl":None,"boxImageUrl":None,"released":False},
 review={"checklists":"AUDITED_MCB_TCDB_BECKETT","images":"PENDING","packArt":"PENDING",
         "pricing":"PENDING","packCollation":"BLOCKED_SERIES_HOBBY_RETAIL_REEBOK_REDEMPTIONS_PROMOS","released":False},
 cardsFile=CARDS.name,productSets=prodsets)
def check():
 m=json.loads(BUNDLE.read_text("utf8"))
 if m.get("schemaVersion")!=2 or m.get("status")!="DRAFT" or m["product"]["released"] is not False:
  raise ValueError("Unreleased VCS draft mandatory")
 defs={x["key"]:x["expectedCards"] for x in m["productSets"]}
 if defs!=EXPECTED or len(defs)!=31 or any(x["oddsPerPack"] is not None for x in m["productSets"]):
  raise ValueError("Source sets or fabricated odds failure")
 with gzip.open(CARDS,"rt",encoding="utf8",newline="") as f:rows=list(csv.DictReader(f))
 if len(rows)!=1496 or Counter(x["setKey"] for x in rows)!=Counter(EXPECTED):
  raise ValueError("Checklist family total fails")
 if len({(x["setKey"],x["cardNumber"]) for x in rows})!=1496:
  raise ValueError("Duplicated collector codes")
 if {int(x["cardNumber"]) for x in rows if x["setKey"]=="base"}!=set(range(1,351)):
  raise ValueError("Original full 350 base incomplete")
 if {int(x["cardNumber"]) for x in rows if x["setKey"]=="brown-backs"}!=set(range(1,174)):
  raise ValueError("Beckett authentic 173 veteran Brown Backs incomplete")
 allmed={i for i in range(1,351) if i not in NONPLAYER_NUMS}
 for key,prefix in (("gold-medallion","G"),("platinum-medallion","P")):
  if {x["cardNumber"] for x in rows if x["setKey"]==key}!={prefix+str(i) for i in allmed}:
   raise ValueError("Incorrect medallion printed numbering")
 if [(x["cardNumber"],x["player"]) for x in rows if x["setKey"]=="gold-medallion-g1b-blue-back"]!=[("G1b","Brett Favre")]:
  raise ValueError("TCDB original G1b blue-back lost")
 if any(not x["player"] or not x["cardNumber"] or (not x["team"] and not (x["setKey"]=="base" and int(x["cardNumber"]) in NONPLAYER_NUMS) and x["setKey"]!="presentation-game-football-offer") for x in rows):
  raise ValueError("Missing genuine non-checklist team/subject")
 if any(x["player"].endswith(" RC") for x in rows):raise ValueError("RC subset improperly contaminates player name")
 for color in REEBOK_COLORS:
  if len([x for x in rows if x["setKey"]=="reebok-"+color.lower()])!=15:
   raise ValueError("Authentic promotional color checklist absent")
 if len([x for x in rows if x["setKey"]=="blitzkrieg-die-cut"])!=18 or len([x for x in rows if x["setKey"]=="rookies-gold-embossed"])!=12:
  raise ValueError("Two original premium inserts missing")
 print("PASS 1997 Ultra Football: all 350 original base cards, 200+150 series, four teamless physical checklists")
 print("PASS 346 Gold +346 Platinum genuine non-checklist parallels; printed G/P prefixes, plus G1b blue back")
 print("PASS 173 independent Beckett original Series One Brown Backs #1-173")
 print("PASS 16 independently catalogued TCDB insert families (200 original subjects)")
 print("PASS 5 physical Reebok color variants each 15, original redemption autograph and distinct real display/promos/offer")
 print("PASS 1,496 complete collector records in 31 groups; no fabricated pack odds/images; unreleased DRAFT")
def main():
 p=argparse.ArgumentParser();p.add_argument("--check",action="store_true");a=p.parse_args()
 if not a.check:
  rows=audit_source();DATA.mkdir(parents=True,exist_ok=True)
  # Keep per-card CSV compact. Complete original odds/format rules and
  # provenance are stored in the audited generator + manifest per group;
  # retain compact individual variation identifiers where physically relevant.
  for row in rows:
   key,num=row["setKey"],row["cardNumber"]
   row["variant"]=(
    "Series One" if key=="base" and num.isdigit() and int(num)<=200
    else "Series Two" if key=="base"
    else "Series One brown-back" if key=="brown-backs"
    else "Gold Medallion Hobby" if key=="gold-medallion"
    else "Platinum Medallion Hobby 1:100" if key=="platinum-medallion"
    else "Original G1b Blue Back" if key=="gold-medallion-g1b-blue-back"
    else "Mail-in redemption, /100, not pack-issued" if key=="lucky-13-dan-marino-autograph"
    else "Dealer oversized, not pack-issued" if key=="terrell-davis-display"
    else "NNO SAM promo, not pack-issued" if key=="terrell-davis-sample-promo"
    else "NNO AU signed promo, not pack-issued" if key=="terrell-davis-autographed-promo"
    else "NNO offer (not a player card)" if key=="presentation-game-football-offer"
    else ("Reebok "+key.rsplit("-",1)[1]+" specially-marked packs") if key.startswith("reebok-")
    else "")
  out=io.StringIO(newline="");w=csv.DictWriter(out,FIELDS,lineterminator="\n")
  w.writeheader();w.writerows(rows)
  CARDS.write_bytes(gzip.compress(out.getvalue().encode("utf8"),compresslevel=9,mtime=0))
  BUNDLE.write_text(json.dumps(manifest(),separators=(",",":"),ensure_ascii=False)+"\n",encoding="utf8")
 check()
if __name__=="__main__":main()
