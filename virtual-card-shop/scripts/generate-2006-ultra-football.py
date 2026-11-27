#!/usr/bin/env python3
"""Generate and validate the unreleased 2006 Ultra Football catalog."""
import csv,gzip,io,json,sys
from collections import Counter
from pathlib import Path
from html.parser import HTMLParser
PID="2006_Ultra_Football"
STEM="2006-ultra-football"
OUT=Path(__file__).resolve().parents[1]/"data/set-factory"
MCB="https://mycardbatch.com/checklists/fleer-ultra-2006-football"
TCDB="https://www.tcdb.com/Checklist.cfm/sid/4776/2006-Ultra"
INS="https://www.tcdb.com/Inserts.cfm/sid/4776/2006-Ultra"
BOX="https://www.dacardworld.com/sports-cards/2006-fleer-ultra-football-hobby-box"
GROUPS=[
("base","Base Set",0,263,"BASE",None,"","200 veterans, Lucky 13 #201–213 /500, 50 remaining rookie-subset cards. Six rookies per box advertised.",TCDB),
("gold-medallion","Gold Medallion",0,263,"PARALLEL",None,"","Veteran 1:1, regular rookies 1:24, Lucky 13 1:288; slot weighting pending.","https://www.tcdb.com/ViewCard.cfm/sid/42102/cid/4090078/2006-Ultra-Gold-Medallion-167-Brandon-Lloyd"),
("platinum-medallion","Platinum Medallion",0,263,"PARALLEL",None,"","Lucky 13 /25; all others /99.","https://www.tcdb.com/Checklist.cfm/sid/42107/2006-"),
("autographics","Autographics",1,45,"INSERT",288,"","Hobby 1:288.",INS),
("campus-classics","Campus Classics",2,38,"INSERT",12,"","Hobby 1:12; CC prefix independently confirmed.","https://www.tcdb.com/Checklist.cfm/sid/42099/2006-Ultra-Campus-Classics"),
("campus-classics-autographs","Campus Classics Autographs",3,28,"INSERT",None,"/25","Separate 28-card checklist; CC prefix confirmed by card samples.",INS),
("head-of-the-class","Head of the Class",4,42,"INSERT",None,"","Distribution and odds unverified.",INS),
("kings-of-defense","Kings of Defense",5,15,"INSERT",6,"","Hobby 1:6.",INS),
("kings-of-defense-jerseys","Kings of Defense Jerseys",6,15,"INSERT",72,"","Hobby 1:72; separate jersey table.",INS),
("lucky-13-autographs","Lucky 13 Autographs",7,13,"INSERT",None,"/25","13-card source list; individual scan verification pending.",INS),
("postseason-performers","Postseason Performers",8,15,"INSERT",6,"","Hobby 1:6.",INS),
("postseason-performers-jerseys","Postseason Performers Jerseys",9,15,"INSERT",72,"","Hobby 1:72.",INS),
("rookie-autographs-target","Rookie Autographs (Target Exclusive)",10,15,"INSERT",None,"Target exclusive","Exclude from hobby collation. Independent TCDB 15-card list.","https://www.tcdb.com/Checklist.cfm/sid/42114/2006-Ultra-Rookie-Autographs"),
("rookies-target","Rookies (Target Exclusive)",11,63,"INSERT",None,"Target exclusive","No foil and alternate images; exclude from hobby collation.","https://www.tcdb.com/Checklist.cfm/sid/42115/2006-Ultra-Rookies"),
("scoring-kings","Scoring Kings",12,15,"INSERT",None,"","Advertised as Touchdown Kings 1:6; mapping not independently confirmed.",INS),
("scoring-kings-jerseys","Scoring Kings Jerseys",13,15,"INSERT",None,"","Advertised as Touchdown Kings Memorabilia 1:72; mapping not independently confirmed.",INS),
("ultra-achievements","Ultra Achievements",14,15,"INSERT",6,"","Hobby 1:6.",INS),
("ultra-achievements-jerseys","Ultra Achievements Jerseys",15,15,"INSERT",72,"","Hobby 1:72.",INS),
("ultra-award-winners","Ultra Award Winners",16,15,"INSERT",6,"","Hobby 1:6.",INS),
("ultra-award-winners-jerseys","Ultra Award Winners Jerseys",17,15,"INSERT",72,"","Hobby 1:72.",INS),
("ultra-dream-team","Ultra Dream Team",18,42,"INSERT",None,"","Distribution and odds unverified.",INS),
("ultra-stars","Ultra Stars",19,15,"INSERT",6,"","Hobby 1:6.","https://www.tcdb.com/Checklist.cfm/sid/42112/2006-"),
("ultra-stars-jerseys","Ultra Stars Jerseys",20,15,"INSERT",72,"","Hobby 1:72.",INS)]
FIELDS=("setKey","cardNumber","player","team","subset","variant")
class Parser(HTMLParser):
 def __init__(self):super().__init__();self.groups=[];self.row=None;self.cell=None
 def handle_starttag(self,t,a):
  if t=="table":self.groups.append([])
  if t=="tr":self.row=[]
  if t in ("td","th"):self.cell=[]
 def handle_data(self,d):
  if self.cell is not None:self.cell.append(d)
 def handle_endtag(self,t):
  if t in ("td","th") and self.cell is not None:self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  if t=="tr" and self.row is not None:self.groups[-1].append(self.row);self.row=None
def build(html):
 p=Parser();p.feed(html);t=[g[1:] for g in p.groups]
 assert [len(g) for g in t]==[263,45,38,28,42,15,15,13,15,15,15,63,15,15,15,15,15,15,42,15,15]
 rows=[]
 for key,name,i,count,kind,odds,v0,note,url in GROUPS:
  assert len(t[i])==count
  for n,p,team in t[i]:
   subset="";v=v0
   if i==0:
    p=p.removesuffix(" RC").removesuffix(" L13");j=int(n)
    if 201<=j<=213:subset="Lucky 13 RC"
    elif j>=214:subset="RC"
    if key=="base" and 201<=j<=213:v="/500"
    if key=="gold-medallion":v="1:1" if j<=200 else "1:288" if j<=213 else "1:24"
    if key=="platinum-medallion":v="/25" if 201<=j<=213 else "/99"
   if i in (2,3):n="CC"+n
   if "autograph" in key:subset="AU"
   if "jerseys" in key:subset="MEM"
   if i==11:p=p.removesuffix(" L13").removesuffix(" RC");subset="Rookie"
   rows.append(dict(zip(FIELDS,(key,n,p,team,subset,v))))
 return rows
def validate(rows):
 expected={g[0]:g[3] for g in GROUPS}
 assert Counter(r["setKey"] for r in rows)==expected
 assert len(rows)==1255==len({(r["setKey"],r["cardNumber"]) for r in rows})
 assert all(r["player"] and r["team"] for r in rows)
 base={r["cardNumber"]:r for r in rows if r["setKey"]=="base"}
 assert set(base)=={str(n) for n in range(1,264)}
 assert base["203"]["player"]=="Reggie Bush" and base["263"]["player"]=="Vernon Davis"
 for key in ("gold-medallion","platinum-medallion"):
  g={r["cardNumber"]:r for r in rows if r["setKey"]==key}
  assert set(g)==set(base)
  assert all((r["player"],r["team"])==(g[n]["player"],g[n]["team"]) for n,r in base.items())
 assert {int(r["cardNumber"]) for r in rows if r["setKey"]=="rookie-autographs-target"}=={201,203,210,227,228,234,235,241,246,248,250,254,255,258,261}
 assert sum(r["variant"]=="/25" for r in rows if r["setKey"]=="platinum-medallion")==13
 print("PASS: 1255 distinct records, 23 groups")
def manifest():
 return dict(schemaVersion=2,status="DRAFT",sources=dict(MyCardBatch=MCB,TCDB=TCDB,TCDBInserts=INS,OriginalHobbyBox=BOX,SecondHobbySource="https://www.midwestcards.com/products/2006-fleer-ultra-football-hobby-box"),decisions=dict(checklist="263 actual base cards; 20 cataloged insert families. All 21 MyCardBatch source tables parsed, base parallel mirrors added.",parallel="Gold and Platinum 263 each confirmed by TCDB counts and card samples; individual parallel team/number scans pending.",campus="CC prefix restored on separate 38-card and 28-card lists using TCDB and card samples.",distribution="Target-exclusive Rookies and Rookie Autographs retained as separately labeled groups with null odds; pack exclusion must be enforced before release. Head of the Class and Dream Team distribution unverified.",odds="12 documented hobby odds populated (Autographics, Campus Classics, five standard and five jersey groups). Advertised Touchdown Kings and actual Scoring Kings naming mapping pending; no guessed odds. Rookie and Gold tier collation pending.",images="Authentic scans only"),product=dict(id=PID,year=2006,brand="Ultra",sport="Football",cardsPerPack=8,packsPerBox=24,packPriceCents=0,autoPackPricing=True,packImageUrl=None,boxImageUrl=None,released=False),review=dict(checklists="SOURCE_TABLES_COMPLETE_PARALLEL_CARD_LEVEL_REVIEW_PENDING",images="PENDING",pricing="PENDING",packCollation="PENDING_TARGET_EXCLUSION_AND_TIER_WEIGHTING",released=False),cardsFile=STEM+".cards.csv.gz",productSets=[dict(key=k,id=PID+"_"+k.replace("-","_"),name=n,kind=kind,expectedCards=c,oddsPerPack=o,sourceUrl=url,notes=note) for k,n,i,c,kind,o,v,note,url in GROUPS])
def main():
 if "--check" in sys.argv:
  assert json.loads((OUT/(STEM+".bundle.json")).read_text())==manifest()
  with gzip.open(OUT/(STEM+".cards.csv.gz"),"rt") as f:validate(list(csv.DictReader(f)))
 else:
  rows=build(Path(sys.argv[1]).read_text());validate(rows)
  OUT.mkdir(parents=True,exist_ok=True)
  buf=io.StringIO(newline="");w=csv.DictWriter(buf,FIELDS,lineterminator="\n");w.writeheader();w.writerows(rows)
  (OUT/(STEM+".cards.csv.gz")).write_bytes(gzip.compress(buf.getvalue().encode(),mtime=0))
  (OUT/(STEM+".bundle.json")).write_text(json.dumps(manifest(),ensure_ascii=False,separators=(",",":"))+"\n")
if __name__=="__main__":main()
