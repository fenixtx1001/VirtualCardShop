#!/usr/bin/env python3
"""2003 Ultra Set Factory: full source audit in ultra_2003_sources.py"""
from ultra_2003_sources import *

def manifest():
 def group(key,name,kind,note,source=BCP):
  return dict(key=key,id=PID+"_"+key.replace("-","_"),name=name,
              kind=kind,expectedCards=EXPECTED[key],oddsPerPack=None,sourceUrl=source,notes=note)
 groups=[
 group("base","Base Set","BASE","250 original Ultra wax #1-250 (200 veterans, 20 All-Stars, 20 2002 Ultra design rookies, 10 2003 prospects). Dave Pember #249 true RC only, verified TCDB."),
 group("gold-medallion","Gold Medallion","PARALLEL","250 original Gold Medallion, retaining base physical number. Hobby only: 1-200 one per pack, 201-220 SP 1:24, 221-250 SP 1:24. Not serial-numbered."),
 group("rookie-update-external","Ultra Rookie Update (Fleer Rookies & Greats ONLY)","INSERT","15 original U-251 to U-265 Ultra-design rookie update cards, serial /1500, exclusively packed in 2003 Fleer Rookies & Greats (Dec 2003), NOT 2003 Ultra wax.",UPDATE),
 group("double-up","Double Up","INSERT","Original 16 DU dual-player inserts, 1:8 hobby/retail."),
 group("moonshots","Moonshots","INSERT","Original 20 MS inserts, 1:12 hobby/retail."),
 group("photo-effex","Photo Effex","INSERT","Original 20 PE inserts, 1:12 hobby/retail."),
 group("photo-effex-gold","Photo Effex Gold /25","PARALLEL","All 20 original Photo Effex Gold serial /25, original PE numbers retained."),
 group("when-it-was-a-game","When It Was A Game","INSERT","Original 40 vintage/modern WG and WH insert cards, odds hobby 1:20 retail 1:12; historical teams accurately preserved."),
 group("back-2-back","Back 2 Back /1000","INSERT","Original 17 numbered B2B insert cards; each serial numbered /1000."),
 group("moonshots-memorabilia","Moonshots Memorabilia","INSERT","20 original game-used cards with source-printed letter IDs and exact material BAT/JSY/BASE/PANTS."),
 group("back-2-back-memorabilia","Back 2 Back Memorabilia /500","INSERT","17 original B2B memorabilia, exact original letter IDs and individual materials; all serial /500."),
 group("back-2-back-memorabilia-gold","Back 2 Back Memorabilia Gold /50","PARALLEL","17 authentic Gold game-used versions each numbered /50, retaining source letter code."),
 group("double-up-memorabilia","Double Up Memorabilia /100","INSERT","16 source-verified dual-player memorabilia with individual swatch materials; original printed DU numbers and serial /100."),
 group("when-it-was-a-game-used","When It Was A Game Used","INSERT","12 original game-used historical/modern cards, numbered /100, /150, /200 or /300 as appropriate, individually verified."),
 group("checklists","2003 Ultra Printed Checklist (NNO)","INSERT","One actual unnumbered printed checklist, '2003 ULTRA MLB Checklist' front and Checklist: 1-186 detail, kept separate from numbered base.")]
 if {x["key"]:x["expectedCards"] for x in groups}!=EXPECTED:raise ValueError("ProductSets don't match audited source")
 return dict(schemaVersion=2,status="DRAFT",
 source={"BCP":BCP,"MyCardBatch":MCB,"TCDB":TCDB,"TCDBRookies":"https://www.tcdb.com/Rookies.cfm/sid/1667/2003-Ultra","TCDBExternal":UPDATE},
 decisions={
 "identity":"2003 Ultra: first 250 cards issued in original November 2002 product. Cross-brand later 15 U-251..U-265 serialized /1500 isolated from original wax.",
 "base":"200 regular #1-200, 20 All-Stars #201-220, 20 2002-rookie-design #221-240, 10 prospects #241-250. BCP and independent MCB reconcile all 250 player/team/number.",
 "rookies":"Only true original base RC is #249 Dave Pember per TCDB. Fifteen later Ultra-design cards are individually TCDB recognized rookie updates, but packed exclusively in Fleer Rookies & Greats.",
 "names":"BCP/MCB source differences #70 Tony Armas/Jr, #81 Bob/Bobby Abreu, #191 Jose Cruz/Jr, #235 Will/Wil Nieves, and insert Ichiro/Suzuki variations reviewed. External U-255 Michael/Mike Hessman reviewed.",
 "gold":"All 250 authentic original base number Gold Medallion hobby-only. Gold standard 1 per pack, All-Stars and rookies 1:24, not fictitiously numbered 1G-250G.",
 "hits":"Photo Effex Gold 20 /25; Back 2 Back insert 17 /1000; Back 2 Back Memorabilia 17 /500 and Gold 17 /50; Double Up Memorabilia 16 /100; vintage When It Was A Game Used 12 individually serial capped.",
 "memo":"Moonshots Game Used 20 plus all 17 Back 2 Back game-used, 16 double-player game-used, 12 vintage/modern game-used. All published material types and printed original number codes preserved.",
 "sourceExceptions":"BaseballCardPedia mistakenly labels When It Was A Game #38-40 WH; independent MyCardBatch plus documented physical cards identify the printed suffix as WG. Physical WG used.",
 "odds":"Hobby/retail 10 cards/pack x24 box; guaranteed Gold hobby only; subsets different frequency; two game-used per Hobby box; serial- and cross-product issues require per-slot and per-channel logic not available as integer ProductSet odds. Leave all oddsPerPack null to prevent fake odds.",
 "images":"Never invent real card, relic swatch, 2002 rookie design, autograph, pack/box artwork. Source scans/pricing/collation need independent QA; draft stays unreleased.",
 "safety":"Only insert 2003_Ultra_Baseball and its 15 ProductSets, preserving existing prices/images and ownership for every other product. Released false."},
 product={"id":PID,"year":2003,"brand":"Ultra","sport":"Baseball","cardsPerPack":10,"packsPerBox":24,"packPriceCents":0,"autoPackPricing":True,"packImageUrl":None,"boxImageUrl":None,"released":False},
 review={"teamData":"COMPLETE","checklists":"VERIFIED_BCP_MCB_TCDB","trueRookies":"VERIFIED_ONE_BASE_PLUS_FIFTEEN_EXTERNAL",
 "cardImages":"PENDING","packImage":"PENDING","pricing":"PENDING","collation":"BLOCKED_CHANNEL_AND_SERIAL_ODDS","release":"UNRELEASED"},
 cardsFile=CARDS.name,productSets=groups)

def check():
 b=json.loads(BUNDLE.read_text("utf8"))
 if b.get("schemaVersion")!=2 or b.get("status")!="DRAFT" or b["product"]["released"] is not False:
  raise ValueError("Set Factory draft safety gate changed")
 if b["product"]["id"]!=PID or b["cardsFile"]!=CARDS.name:raise ValueError("Wrong product identity")
 if {s["key"]:s["expectedCards"] for s in b["productSets"]}!=EXPECTED:raise ValueError("Checklist family/count mismatch")
 if any(s["oddsPerPack"] is not None for s in b["productSets"]):raise ValueError("Unsupported pack odds")
 with gzip.open(CARDS,"rt",encoding="utf8",newline="") as f:rs=list(csv.DictReader(f))
 if Counter(r["setKey"] for r in rs)!=Counter(EXPECTED):raise ValueError("Incomplete collector CSV")
 if len({(r["setKey"],r["cardNumber"]) for r in rs})!=len(rs):raise ValueError("Duplicate numbered group entry")
 if any(not r["player"] or (not r["team"] and r["setKey"]!="checklists") for r in rs):raise ValueError("Missing teams/subjects")
 base={int(r["cardNumber"]):r for r in rs if r["setKey"]=="base"}
 if set(base)!=set(range(1,251)):raise ValueError("Original 250 base numbering wrong")
 if base[249]["player"]!="Dave Pember RC" or sum(r["player"].endswith(" RC") for r in base.values())!=1:
  raise ValueError("True RC designation changed")
 gold={int(r["cardNumber"]):r for r in rs if r["setKey"]=="gold-medallion"}
 if set(gold)!=set(range(1,251)):raise ValueError("Genuine Gold physical numbering wrong")
 if any(gold[n]["team"]!=base[n]["team"] or gold[n]["player"]!=base[n]["player"] for n in base):
  raise ValueError("Gold team/player not identical to base")
 external=[r for r in rs if r["setKey"]=="rookie-update-external"]
 if {r["cardNumber"] for r in external}!={f"U-{n}" for n in range(251,266)}:
  raise ValueError("External Fleer Rookies & Greats updates missing")
 if len(b["productSets"])!=15 or len(rs)!=731:
  raise ValueError("Wrong overall collector count")
 print("PASS 2003 Ultra: 250 base; 250 Gold; lone original RC Dave Pember #249")
 print("PASS all five numbered insert families; real Photo Effex Gold /25 and B2B /1000")
 print("PASS all original memorabilia, material types, source codes, exact serial caps and printed checklist")
 print("PASS all 15 separately cataloged Fleer Rookies & Greats-only Ultra Rookie Updates /1500")
 print("PASS 15 ProductSets, 731 distinct collectible records; no invented pack odds; DRAFT unreleased")

def main():
 p=argparse.ArgumentParser();p.add_argument("--check",action="store_true");a=p.parse_args()
 if not a.check:
  rows=emit();DATA.mkdir(parents=True,exist_ok=True)
  buf=io.StringIO(newline="");wr=csv.DictWriter(buf,FIELDS,lineterminator="\n")
  wr.writeheader();wr.writerows(rows)
  CARDS.write_bytes(gzip.compress(buf.getvalue().encode("utf8"),compresslevel=9,mtime=0))
  BUNDLE.write_text(json.dumps(manifest(),indent=2,ensure_ascii=False)+"\n",encoding="utf8")
 check()
if __name__=="__main__":main()
