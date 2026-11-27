#!/usr/bin/env python3
"""Generate/validate 2004 Ultra Football draft using saved MyCardBatch checklist."""
import csv,gzip,io,json,re,sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
PID="2004_Ultra_Football"
STEM="2004-ultra-football"
OUT=Path(__file__).resolve().parents[1]/"data/set-factory"
MCB="https://mycardbatch.com/checklists/fleer-ultra-2004-football"
TCDB="https://www.tcdb.com/ViewSet.cfm/sid/4692/2004-Ultra"
BOX="https://www.charmcitycards.com/2004-fleer-ultra-football-1625.html"
GOLD="https://www.tcdb.com/Checklist.cfm/sid/39264/2004-Ultra---Gold-Medallion"
HA="https://sports.ha.com/itm/football-cards/unopened-packs-display-boxes/2004-fleer-ultra-football-retail-factory-sealed-box/a/50051-52236.s"
SCG="https://www.tcdb.com/Checklist.cfm/sid/39288/2004-"
SCP="https://www.tcdb.com/Checklist.cfm/sid/39289/2004-Ultra---Season-Crowns-Game-Used-Platinum"
AUTO="https://www.tcdb.com/ViewCard.cfm/sid/39286/cid/3893567/2004-Ultra-Season-Crowns-Autographs-Gold-8-Philip-Rivers"
FIELDS=("setKey","cardNumber","player","team","subset","variant")
# Each tuple: key, title, source table index, count, kind, odds, variant, notes, source.
GROUPS=[
("base","Base Set",0,232,"BASE",None,"","Actual #1–232; advertised 233. #201–213 Lucky 13 /500; #214–232 SP rookies 1:4.",TCDB),
("gold-medallion","Gold Medallion",0,232,"PARALLEL",None,"","Mirror base; veterans 1:1 and rookies 1:8; no uniform odds.",GOLD),
("platinum-medallion","Platinum Medallion",0,232,"PARALLEL",None,"","Lucky 13 /13; all other cards /66.",TCDB),
("checklists","Checklists",1,1,"INSERT",None,"","One verified NNO; completeness pending.",MCB),
("gridiron-producers","Gridiron Producers",2,10,"INSERT",144,"","Hobby 1:144.",BOX),
("gridiron-producers-game-used-copper","Gridiron Producers Game Used Copper",3,10,"INSERT",None,"","GP prefix; individual runs pending.",HA),
("gridiron-producers-game-used-gold","Gridiron Producers Game Used Gold",3,10,"PARALLEL",None,"/77","Mirror checklist; corroborated parallel and print run.",HA),
("gridiron-producers-game-used-platinum","Gridiron Producers Game Used Platinum",3,10,"PARALLEL",None,"/9","Mirror checklist; corroborated parallel and print run.",HA),
("gridiron-producers-game-used-ultraswatch","Gridiron Producers Game Used UltraSwatch",4,10,"PARALLEL",None,"Numbered to jersey number","Exact individual print runs pending.",HA),
("passing-kings","Passing Kings",5,10,"INSERT",96,"","Numbered 1–10 PA; Manning Family autograph separate.",BOX),
("passing-kings-gold","Passing Kings Gold",5,10,"PARALLEL",None,"/50","10-card mirror.", "https://www.tcdb.com/Checklist.cfm/sid/39273/2004-Ultra---Passing-Kings-Gold"),
("passing-kings-manning-family","Passing Kings Manning Family Autograph",5,1,"INSERT",None,"","Unnumbered triple autograph; print run pending.",MCB),
("receiving-kings","Receiving Kings",6,10,"INSERT",32,"","Hobby 1:32.",BOX),
("receiving-kings-gold","Receiving Kings Gold",6,10,"PARALLEL",None,"/50","Mirror; verify scans.",BOX),
("rushing-kings","Rushing Kings",7,10,"INSERT",24,"","Hobby 1:24.",BOX),
("rushing-kings-gold","Rushing Kings Gold",7,10,"PARALLEL",None,"/50","Mirror; verify scans.",BOX),
("season-crowns-autographs","Season Crowns Autographs",8,21,"INSERT",None,"/150","Actual checklist excludes #5.",MCB),
("season-crowns-autographs-gold","Season Crowns Autographs Gold",8,7,"PARALLEL",None,"/25","Partial: #6,8,10,11,14,17,21 corroborated; 11 of 18 pending.",AUTO),
("season-crowns-game-used-copper","Season Crowns Game Used Copper",9,50,"INSERT",None,"/349","Actual Copper run corroborated by catalog; mirror.", "https://www.beckett.com/football/2004/ultra-season-crowns-game-used-copper/12-corey-dillon-2773621"),
("season-crowns-game-used-silver","Season Crowns Game Used Silver",9,50,"PARALLEL",None,"/149","50-card mirror.", "https://www.beckett.com/football/2004/ultra-season-crowns-game-used-silver/"),
("season-crowns-game-used-gold","Season Crowns Game Used Gold",9,50,"PARALLEL",None,"/99","50-card mirror corroborated by TCDB.",SCG),
("season-crowns-game-used-platinum","Season Crowns Game Used Platinum",9,50,"PARALLEL",None,"/29","Actual checklist SN29, unlike box advertising /25.",SCP),
("three-kings-game-used","Three Kings Game Used",10,10,"INSERT",None,"/33","Triple memorabilia.",HA),
("ultra-performers","Ultra Performers",11,15,"INSERT",6,"","Hobby 1:6; retail 1:8.",BOX),
("ultra-performers-gold-die-cuts","Ultra Performers Gold Die Cuts",11,15,"PARALLEL",None,"","15-card mirror; print run pending.",MCB),
("ultra-performers-game-used-copper","Ultra Performers Game Used Copper",12,15,"INSERT",None,"","UP prefix; individual runs pending.",HA),
("ultra-performers-game-used-gold","Ultra Performers Game Used Gold",12,15,"PARALLEL",None,"/88","15-card mirror.",HA),
("ultra-performers-game-used-platinum","Ultra Performers Game Used Platinum",12,15,"PARALLEL",None,"/19","15-card mirror.",HA),
("ultra-performers-game-used-ultraswatch","Ultra Performers Game Used UltraSwatch",13,15,"PARALLEL",None,"Numbered to jersey number","Individual runs pending.",HA)]
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
 assert [len(g) for g in t]==[232,1,10,10,10,11,10,10,21,50,10,15,15,15,20]
 rows=[]
 for key,name,i,count,kind,odds,variant,note,url in GROUPS:
  table=t[i]
  if key in ("passing-kings","passing-kings-gold"):table=[r for r in table if r[0]!="NNO"]
  if key=="passing-kings-manning-family":table=[r for r in table if r[0]=="NNO"]
  if key=="season-crowns-autographs-gold":table=[r for r in table if r[0] in {"6","8","10","11","14","17","21"}]
  assert len(table)==count,(key,len(table))
  for n,p,team in table:
   subset="";v=variant
   if i==0:
    if p.endswith(" RC"):subset="RC";p=p.removesuffix(" RC")
    p=p.removesuffix(" L13")
    j=int(n)
    if key=="base":
     if 201<=j<=213:v="/500";subset="Lucky 13 RC"
     elif j>=214:v="SP; 1:4";subset="RC"
    if key=="gold-medallion":v="1:1" if j<=200 else "1:8"
    if key=="platinum-medallion":v="/13" if 201<=j<=213 else "/66"
   if i in (3,4):n="GP"+n
   if i in (12,13):n="UP"+n
   if "game-used" in key:subset="MEM"
   if "autograph" in key:subset="AU"
   if key=="checklists":subset="Checklist"
   rows.append(dict(zip(FIELDS,(key,n,p,team,subset,v))))
 return rows
def validate(rows):
 expected={g[0]:g[3] for g in GROUPS}
 assert Counter(r["setKey"] for r in rows)==expected
 assert len(rows)==sum(expected.values())==len({(r["setKey"],r["cardNumber"]) for r in rows})
 base={r["cardNumber"]:r for r in rows if r["setKey"]=="base"}
 assert set(base)=={str(n) for n in range(1,233)}
 assert base["201"]["player"]=="Eli Manning" and base["213"]["player"]=="Ben Roethlisberger"
 for key in ("gold-medallion","platinum-medallion"):
  g={r["cardNumber"]:r for r in rows if r["setKey"]==key}
  assert set(g)==set(base)
  assert all((r["player"],r["team"])==(g[n]["player"],g[n]["team"]) for n,r in base.items())
 print("PASS",len(rows),"unique cards in",len(expected),"groups")
def manifest():
 return dict(schemaVersion=2,status="DRAFT",sources=dict(MyCardBatch=MCB,TCDB=TCDB,OriginalHobbyBox=BOX,HeritageRetail=HA,Gold=GOLD,SeasonCrownsGold=SCG,SeasonCrownsPlatinum=SCP,AutographGold=AUTO,Update="https://www.tcdb.com/Inserts.cfm/sid/4658/2004-FleerTradition"),decisions=dict(checklist="232 actual base; #233 not cataloged. U234–U253 distributed via Fleer Tradition, excluded.",parallel="Full parallel mirrors reconstructed from corresponding source tables and corroborated counts/samples; individual scans pending. GP and UP prefixes restored.",autograph="Gold autograph is partial: seven confirmed of 18; 11 missing. Manning family triple autograph separately cataloged.",memorabilia="Copper/silver/gold/platinum tiers based on actual cataloged cards, not preview advertising. Generic Game Used tables assigned to Copper; no duplicate unspecific group. Exact UltraSwatch serial runs pending. Verify whether additional unqualified Season Crowns Game Used issues exist.",odds="Hobby standard insert odds only; no invented serial odds. Gold tiered collation pending.",images="Authentic scans only"),product=dict(id=PID,year=2004,brand="Ultra",sport="Football",cardsPerPack=8,packsPerBox=24,packPriceCents=0,autoPackPricing=True,packImageUrl=None,boxImageUrl=None,released=False),review=dict(checklists="DRAFT_GOLD_AUTOGRAPHS_AND_CHECKLISTS_PENDING",images="PENDING",pricing="PENDING",packCollation="PENDING",released=False),cardsFile=STEM+".cards.csv.gz",productSets=[dict(key=k,id=PID+"_"+k.replace("-","_"),name=n,kind=kind,expectedCards=c,oddsPerPack=o,sourceUrl=url,notes=note) for k,n,i,c,kind,o,v,note,url in GROUPS])
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
