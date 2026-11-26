#!/usr/bin/env python3
"""Generate/check 1999 Ultra Football from saved MyCardBatch checklist HTML."""
import csv,gzip,io,json,re,sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
PID="1999_Ultra_Football"
STEM="1999-ultra-football"
OUT=Path(__file__).resolve().parents[1]/"data/set-factory"
TCDB="https://www.tcdb.com/Checklist.cfm/sid/4354/1999-Ultra"
INS="https://www.tcdb.com/Inserts.cfm/sid/4354/1999-Ultra"
MCB="https://mycardbatch.com/checklists/fleer-ultra-1999-football"
BECK="https://www.beckett.com/football/1999/ultra/"
BOX="https://www.steelcitycollectibles.com/i/1999-fleer-ultra-football-hobby-box"
GROUPS=[
("base","Base Set",300,"BASE",None,"One series; #248–250 checklists; #251–260 Super Bowl 1:8; #261R–300R rookies 1:4.",TCDB),
("as-good-as-it-gets","As Good As It Gets",15,"INSERT",288,"Die cut; 1:288 packs.",INS),
("caught-in-the-draft","Caught in the Draft",15,"INSERT",18,"1:18 packs.",INS),
("counterparts","Counterparts",15,"INSERT",36,"1:36 packs; preserve multi-player subjects.",INS),
("damage-inc","Damage, Inc.",15,"INSERT",72,"1:72 packs.",INS),
("over-the-top","Over the Top",20,"INSERT",6,"1:6 packs.",INS),
("gold-medallion","Gold Medallion",300,"PARALLEL",None,"Hobby: #1G–250G 1:1; #251G–260G 1:50; #261RG–300RG 1:25. No uniform odds.", "https://www.tcdb.com/Checklist.cfm/sid/35571/1999-Ultra-Gold-Medallion"),
("platinum-medallion","Platinum Medallion",300,"PARALLEL",None,"Hobby: #1P–250P /99; #251P–260P /40; #261RP–300RP /65.", "https://www.tcdb.com/Checklist.cfm/sid/35574/1999-Ultra-Platinum-Medallion"),
("masterpiece","Masterpiece",300,"PARALLEL",None,"Hobby: all 300 numbered 1/1.", "https://www.tcdb.com/Checklist.cfm/sid/35572/1999-Ultra---Masterpiece"),
("fred-taylor-sample","Fred Taylor Sample (Promo)",1,"INSERT",None,"Original #247 SAM, pre-release; not pack-issued.",INS)]
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
FIELDS=("setKey","cardNumber","player","team","subset","variant")
def build(html):
 p=Parser();p.feed(html)
 tables=[x[1:] for x in p.groups]
 assert [len(x) for x in tables]==[300,15,15,15,15,20,600,300]
 tables=tables[:6]+[tables[6][:300],tables[6][300:],tables[7],[["247","Fred Taylor","Jacksonville Jaguars"]]]
 rows=[]
 for (key,name,count,kind,odds,note,url),table in zip(GROUPS,tables):
  assert len(table)==count
  for num,player,team in table:
   subset=""
   if player.endswith(" RC"):player=player[:-3];subset="RC"
   if player.endswith(" SBXXXIII"):player=player[:-9].strip();subset="Super Bowl XXXIII"
   player=re.sub(r"\s*/\s*", " / ",player)
   variant=""
   if key in ("base","gold-medallion","platinum-medallion","masterpiece"):
    n=int(re.match(r"\d+",num).group())
    if n in (248,249,250):subset="Checklist"
    if 251<=n<=260:subset="Super Bowl XXXIII"
    if n>=261:subset="RC"
    if key=="gold-medallion":variant="Hobby; 1:"+str(1 if n<=250 else 50 if n<=260 else 25)
    if key=="platinum-medallion":variant="Hobby; /"+str(99 if n<=250 else 40 if n<=260 else 65)
    if key=="masterpiece":variant="Hobby; 1/1"
   if key=="fred-taylor-sample":variant="Dealer sample; not pack-issued"
   rows.append(dict(zip(FIELDS,(key,num,player,team,subset,variant))))
 return rows
def validate(rows):
 assert Counter(r["setKey"] for r in rows)=={g[0]:g[2] for g in GROUPS}
 assert len(rows)==1281==len({(r["setKey"],r["cardNumber"]) for r in rows})
 assert all(r["player"] and r["team"] for r in rows)
 base={int(re.match(r"\d+",r["cardNumber"]).group()):r for r in rows if r["setKey"]=="base"}
 assert set(base)==set(range(1,301))
 assert all(r["cardNumber"]==str(n)+("R" if n>=261 else "") for n,r in base.items())
 for key,suffix in (("gold-medallion","G"),("platinum-medallion","P"),("masterpiece","")):
  group={r["cardNumber"]:r for r in rows if r["setKey"]==key}
  codes={n:str(n)+("R" if n>=261 and suffix else "")+suffix for n in base}
  assert set(group)==set(codes.values())
  diff=[(n,r["player"],r["team"],group[codes[n]]["player"],group[codes[n]]["team"]) for n,r in base.items() if (r["player"],r["team"])!=(group[codes[n]]["player"],group[codes[n]]["team"])]
  if diff:print(key,"source differences:",diff)
  assert diff==([(37,"Eric Metcalf","Arizona Cardinals","Eric Metcalf","San Diego Chargers")] if key in ("platinum-medallion","masterpiece") else [])
 assert Counter(r["variant"] for r in rows if r["setKey"]=="platinum-medallion")=={"Hobby; /99":250,"Hobby; /40":10,"Hobby; /65":40}
 assert sum(r["variant"]=="Hobby; 1/1" for r in rows)==300
 print("PASS: 1281 unique cards, 10 groups, 300 base, 900 parallel, 80 inserts, 1 promo")
def manifest():
 return dict(schemaVersion=2,status="DRAFT",sources=dict(MyCardBatch=MCB,TCDB=TCDB,TCDBInserts=INS,Beckett=BECK,OriginalHobbyBox=BOX),decisions=dict(odds="Exact five uniform insert odds populated for hobby product; guaranteed Gold and tiered base/Gold slots require collation; no invented Platinum or Masterpiece odds.",promo="Fred Taylor sample excluded from pack pool; not a base variation.",teamDifference="TCDB confirms Eric Metcalf #37 Arizona on base/Gold, San Diego on Platinum/Masterpiece; preserve distinct teams.",images="Authentic scans only; no placeholder artwork."),product=dict(id=PID,year=1999,brand="Ultra",sport="Football",cardsPerPack=10,packsPerBox=24,packPriceCents=0,autoPackPricing=True,packImageUrl=None,boxImageUrl=None,released=False),review=dict(teamData="COMPLETE",checklists="SOURCE_PARSED_STRUCTURE_CROSSCHECKED",images="PENDING",packArt="PENDING",pricing="PENDING",packCollation="PENDING_HOBBY_TIERED_GOLD_AND_BASE",released=False),cardsFile=STEM+".cards.csv.gz",productSets=[dict(key=k,id=PID+"_"+k.replace("-","_"),name=n,kind=kind,expectedCards=c,oddsPerPack=o,sourceUrl=url,notes=note) for k,n,c,kind,o,note,url in GROUPS])
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
