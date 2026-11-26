#!/usr/bin/env python3
"""Build an unreleased 1998 Ultra Football bundle from MyCardBatch HTML.
Use a downloaded source HTML snapshot; no network needed for --check."""
import csv,gzip,io,json,re,sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
PID="1998_Ultra_Football"
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data/set-factory"
STEM="1998-ultra-football"
MCB="https://mycardbatch.com/checklists/fleer-ultra-1998-football"
TCDB="https://www.tcdb.com/Checklist.cfm/sid/4267/1998-Ultra"
INS="https://www.tcdb.com/Inserts.cfm/sid/4267/1998-Ultra"
BECK="https://www.beckett.com/football/1998/ultra/"
GROUPS=[
("base","Base Set",425,"BASE","Two series: 1–225 and 226–425; rookies 201–225 and 386–425 1:3 packs.",TCDB),
("canton-classics","Canton Classics",10,"INSERT","Series One 1:288",INS),
("caught-in-the-draft","Caught in the Draft",15,"INSERT","Series Two 1:24",INS),
("damage-inc","Damage Inc.",15,"INSERT","Series Two 1:72",INS),
("exclamation-points","Exclamation Points",15,"INSERT","Series Two 1:288",INS),
("flair-showcase-preview","Flair Showcase Preview",10,"INSERT","Series One 1:144",INS),
("indefensible","Indefensible",10,"INSERT","Series Two 1:144",INS),
("next-century","Next Century",15,"INSERT","Series One 1:72",INS),
("reggie-white-commemorative","Reggie White Commemorative",1,"INSERT","Special hobby card; odds unverified. Do not confuse with mini-helmet redemption.",INS),
("rush-hour","Rush Hour",20,"INSERT","Series Two 1:6",INS),
("sensational-sixty","Sensational Sixty",60,"INSERT","One per retail pack",INS),
("top-30","Top 30",30,"INSERT","One per Series Two retail pack",INS),
("touchdown-kings","Touchdown Kings",15,"INSERT","Series One 1:24",INS),
("ultra-shots","Ultra Shots",20,"INSERT","1:6 packs",INS),
("gold-medallion","Gold Medallion",425,"PARALLEL","Printed G suffix; exact original pull rate pending.","https://www.tcdb.com/Checklist.cfm/sid/34919/1998-Ultra-Gold-Medallion"),
("platinum-medallion","Platinum Medallion",425,"PARALLEL","Printed P suffix; serial /98 except 201–225 and 386–425 /66.","https://www.tcdb.com/Checklist.cfm/sid/34923/1998-Ultra-PlatinumMedallion"),
("masterpiece","Masterpiece",425,"PARALLEL","Printed P suffix, 1/1; distinct purple foil.","https://www.tcdb.com/Checklist.cfm/sid/34921/1998-Ultra-Masterpiece"),
("jeff-george-sample","Jeff George Sample (Promo)",1,"INSERT","Dealer sample #20, not ordinary pack issued.",INS)]
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
 assert [len(x) for x in tables]==[425,10,15,15,15,10,10,15,1,20,60,30,15,20,850,425]
 tables=tables[:14]+[tables[14][:425],tables[14][425:],tables[15],[["20","Jeff George","Oakland Raiders"]]]
 rows=[]
 for (key,name,count,kind,note,url),table in zip(GROUPS,tables):
  assert len(table)==count
  for num,player,team in table:
   subset=""
   if player.endswith(" RC"):player=player[:-3];subset="RC"
   if player.endswith(" 98G"):player=player[:-4];subset="98 Greats"
   num=re.sub(r"\s+","",num)
   variant=""
   if key in ("base","gold-medallion","platinum-medallion","masterpiece"):
    n=int(re.sub("[GP]$","",num))
    if n in (198,199,200,358,359,360):subset="Checklist"
    if 361<=n<=385:subset="98 Greats"
    variant="Series One" if n<=225 else "Series Two"
    if key=="platinum-medallion":variant+="; /66" if 201<=n<=225 or n>=386 else "; /98"
    if key=="masterpiece":variant+="; 1/1"
   if key=="jeff-george-sample":variant="Dealer sample; not pack-issued"
   rows.append(dict(zip(FIELDS,(key,num,player,team,subset,variant))))
 return rows
def validate(rows):
 assert Counter(r["setKey"] for r in rows)=={g[0]:g[2] for g in GROUPS}
 assert len(rows)==1937==len({(r["setKey"],r["cardNumber"]) for r in rows})
 assert all(r["player"] and r["team"] for r in rows)
 base={r["cardNumber"]:r for r in rows if r["setKey"]=="base"}
 assert set(base)==set(map(str,range(1,426)))
 for key,suffix in (("gold-medallion","G"),("platinum-medallion","P"),("masterpiece","P")):
  group={r["cardNumber"]:r for r in rows if r["setKey"]==key}
  assert set(group)=={n+suffix for n in base}
  assert all(r["player"]==group[n+suffix]["player"] for n,r in base.items())
  diff={n:group[n+suffix]["team"] for n,r in base.items() if r["team"]!=group[n+suffix]["team"]}
  assert diff==({"7":"Carolina Panthers","94":"New York Giants","249":"Seattle Seahawks"} if key=="gold-medallion" else {})
 assert base["201"]["player"]=="Peyton Manning" and base["406"]["player"]=="Randy Moss" and base["416"]["player"]=="Peyton Manning"
 assert sum(r["variant"].endswith("/66") for r in rows)==65
 assert sum(r["variant"].endswith("/98") for r in rows)==360
 assert sum(r["variant"].endswith("1/1") for r in rows)==425
 print("PASS: 1937 rows, 18 groups, full base, suffixes, identity crossmatch, serial limits, no duplicates")
def manifest():
 return dict(schemaVersion=2,status="DRAFT",sources=dict(MyCardBatch=MCB,TCDB=TCDB,TCDBInserts=INS,Beckett=BECK),decisions=dict(odds="Original odds in group notes; no universal odds pending series and retail/hobby collation.",redemption="Beckett documents 25 mini-helmet redemption cards; identity/numbering not established, excluded pending evidence.",images="Authentic scans only; none assigned."),product=dict(id=PID,year=1998,brand="Ultra",sport="Football",cardsPerPack=10,packsPerBox=24,packPriceCents=0,autoPackPricing=True,packImageUrl=None,boxImageUrl=None,released=False),review=dict(teamData="COMPLETE",checklists="SOURCE_PARSED_STRUCTURE_CROSSCHECKED",images="PENDING",packArt="PENDING",pricing="PENDING",packCollation="PENDING_SERIES_RETAIL_HOBBY",released=False),cardsFile=STEM+".cards.csv.gz",productSets=[dict(key=k,id=PID+"_"+k.replace("-","_"),name=n,kind=kind,expectedCards=c,oddsPerPack=None,sourceUrl=url,notes=note) for k,n,c,kind,note,url in GROUPS])
def main():
 if "--check" in sys.argv:
  m=json.loads((OUT/(STEM+".bundle.json")).read_text())
  assert m==manifest()
  with gzip.open(OUT/(STEM+".cards.csv.gz"),"rt") as f:validate(list(csv.DictReader(f)))
 else:
  rows=build(Path(sys.argv[1]).read_text());validate(rows)
  OUT.mkdir(parents=True,exist_ok=True)
  buf=io.StringIO(newline="");w=csv.DictWriter(buf,FIELDS,lineterminator="\n");w.writeheader();w.writerows(rows)
  (OUT/(STEM+".cards.csv.gz")).write_bytes(gzip.compress(buf.getvalue().encode(),mtime=0))
  (OUT/(STEM+".bundle.json")).write_text(json.dumps(manifest(),ensure_ascii=False,separators=(",",":"))+"\n")
if __name__=="__main__":main()
