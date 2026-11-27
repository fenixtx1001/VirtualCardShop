#!/usr/bin/env python3
"""Generate and validate 2003 Ultra Football draft from MyCardBatch HTML."""
import csv,gzip,io,json,re,sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
PID="2003_Ultra_Football"
STEM="2003-ultra-football"
OUT=Path(__file__).resolve().parents[1]/"data/set-factory"
MCB="https://mycardbatch.com/checklists/fleer-ultra-2003-football"
TCDB="https://www.tcdb.com/ViewSet.cfm/sid/4637/2003-Ultra"
BOX="https://www.steelcitycollectibles.com/i/2003-fleer-ultra-football-hobby-box"
GOLD="https://www.tcdb.com/ViewCard.cfm/sid/38300/cid/3837540/2003-Ultra-Gold-Medallion-89-Clinton-Portis"
PLAT="https://www.tcdb.com/ViewCard.cfm/sid/38302/cid/3837754/2003-Ultra-Platinum-Medallion-89-Clinton-Portis"
TKU="https://www.tcdb.com/Checklist.cfm/sid/38306/2003-"
GROUPS=[
("base","Base Set",198,"BASE",None,"#161–198 rookies 1:4.",TCDB),
("gold-medallion","Gold Medallion",198,"PARALLEL",None,"Veterans 1:1, rookies 1:12; separate collation pending.",GOLD),
("platinum-medallion","Platinum Medallion",198,"PARALLEL",None,"All /100.",PLAT),
("autographs","Autographs",4,"INSERT",None,"Four advertised signers; unnumbered; three PR300, Larry Johnson PR350. College team metadata inferred pending scans.",BOX),
("award-winners","Award Winners",10,"INSERT",12,"1:12 hobby.",TCDB),
("award-winners-memorabilia","Award Winners Memorabilia",14,"INSERT",25,"1:25 hobby; AW prefix.",TCDB),
("award-winners-ultraswatch","Award Winners UltraSwatch Memorabilia",14,"PARALLEL",None,"AWU prefix; numbered to jersey number.",TCDB),
("checklists","Checklists",1,"INSERT",None,"One corroborated unnumbered checklist; completeness pending.",MCB),
("head-of-the-class","Head of the Class",15,"INSERT",None,"/599.",TCDB),
("head-of-the-class-memorabilia","Head of the Class Memorabilia",1,"INSERT",None,"Carson Palmer HC/CP /1500; other subjects not verified.",MCB),
("touchdown-kings","Touchdown Kings",15,"INSERT",24,"1:24 hobby.",TCDB),
("touchdown-kings-memorabilia","Touchdown Kings Memorabilia",15,"INSERT",26,"1:26 hobby; TK prefix.",TCDB),
("touchdown-kings-career","Touchdown Kings Career Touchdowns Memorabilia",15,"PARALLEL",None,"TK prefix; numbered to career TDs; individual print runs pending.",TCDB),
("touchdown-kings-ultraswatch","Touchdown Kings UltraSwatch Memorabilia",15,"PARALLEL",None,"TKU prefix; jersey-number print runs from TCDB.",TKU)]
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
JERSEYS=dict(zip("BF CP CP2 DB DM ES JR MV PH PM RM RW SA SM TB".split(),[4,26,10,11,5,22,12,7,31,18,2,34,37,9,12]))
def build(html):
 p=Parser();p.feed(html);t=[x[1:] for x in p.groups]
 assert [len(x) for x in t]==[198,1,10,14,14,1,15,1,15,15,15,15]
 autos=[["NNO-AJ","Andre Johnson","Miami Hurricanes"],["NNO-BL","Byron Leftwich","Marshall Thundering Herd"],["NNO-CP","Carson Palmer","USC Trojans"],["NNO-LJ","Larry Johnson","Penn State Nittany Lions"]]
 tables=[t[0],t[0],t[0],autos,t[2],t[3],t[4],t[5],t[6],t[7],t[8],t[9],t[10],t[11]]
 rows=[]
 for (key,name,count,kind,odds,note,url),table in zip(GROUPS,tables):
  assert len(table)==count
  for n,p,team in table:
   subset="RC" if p.endswith(" RC") else "";p=p.removesuffix(" RC");v=""
   if key=="base" and subset=="RC":v="SP; 1:4"
   if key=="gold-medallion":v="1:12" if subset=="RC" else "1:1"
   if key=="platinum-medallion":v="/100"
   if key=="autographs":subset="AU";v="PR350" if p=="Larry Johnson" else "PR300"
   if key=="head-of-the-class":v="/599"
   if key=="checklists":subset="Checklist"
   if key=="head-of-the-class-memorabilia":subset="MEM";v="/1500"
   if key.startswith("award-winners-"):
    n=("AWU" if key.endswith("ultraswatch") else "AW")+n;subset="MEM"
    if key.endswith("ultraswatch"):v="Numbered to jersey number"
   if key.startswith("touchdown-kings-"):
    subset="MEM"
    if key.endswith("ultraswatch"):
     n="TKU"+n;v="/"+str(JERSEYS[n.split("/")[-1]])
    else:
     n="TK"+n
     if key.endswith("career"):v="Numbered to career TD total"
   rows.append(dict(zip(FIELDS,(key,n,p,team,subset,v))))
 return rows
def validate(rows):
 assert Counter(r["setKey"] for r in rows)=={g[0]:g[2] for g in GROUPS}
 assert len(rows)==713==len({(r["setKey"],r["cardNumber"]) for r in rows})
 base={r["cardNumber"]:r for r in rows if r["setKey"]=="base"}
 assert set(base)=={str(n) for n in range(1,199)}
 assert sum(r["subset"]=="RC" for r in base.values())==38
 assert base["182"]["player"]=="Tony Romo"
 for key in ("gold-medallion","platinum-medallion"):
  g={r["cardNumber"]:r for r in rows if r["setKey"]==key}
  assert set(g)==set(base)
  assert all((r["player"],r["team"])==(g[n]["player"],g[n]["team"]) for n,r in base.items())
 print("PASS: 713 unique cards in 14 groups")
def manifest():
 return dict(schemaVersion=2,status="DRAFT",sources=dict(MyCardBatch=MCB,TCDB=TCDB,OriginalHobbyBox=BOX,Gold=GOLD,Platinum=PLAT,TouchdownUltraSwatch=TKU,Update="https://www.tcdb.com/Checklist.cfm/sid/289899/2003-Fleer-Tradition---2003-Ultra-Update"),decisions=dict(update="U199–U219 distributed in Fleer Tradition Hot Packs; excluded from Ultra.",parallel="198-card Gold and Platinum mirrors reconstructed from base and corroborated set counts/selected identities.",autographs="Four advertised signers; internal NNO keys; college teams inferred for three, verify scans.",checklists="One checklist verified; possible additional checklists and other Head of the Class memorabilia subjects pending.",odds="Four uniform insert odds populated. Tiered Gold/rookie collation and serial-numbered rarity pending; no guessed pack odds.",memorabilia="MyCardBatch lacks prefixes; AW, AWU, TK, TKU restored from TCDB samples. TK career uses TK numbering, verify remaining print runs. Award Winners UltraSwatch exact per-card print runs pending.",images="Authentic scans only"),product=dict(id=PID,year=2003,brand="Ultra",sport="Football",cardsPerPack=8,packsPerBox=24,packPriceCents=0,autoPackPricing=True,packImageUrl=None,boxImageUrl=None,released=False),review=dict(checklists="DRAFT_CHECKLIST_AND_MEMORABILIA_REVIEW_PENDING",images="PENDING",pricing="PENDING",packCollation="PENDING",released=False),cardsFile=STEM+".cards.csv.gz",productSets=[dict(key=k,id=PID+"_"+k.replace("-","_"),name=n,kind=kind,expectedCards=c,oddsPerPack=o,sourceUrl=url,notes=note) for k,n,c,kind,o,note,url in GROUPS])
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
