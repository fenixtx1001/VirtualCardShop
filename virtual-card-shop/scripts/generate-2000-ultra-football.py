#!/usr/bin/env python3
"""Generate/check 2000 Ultra Football from saved MyCardBatch checklist HTML."""
import csv,gzip,io,json,re,sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
PID="2000_Ultra_Football"
STEM="2000-ultra-football"
OUT=Path(__file__).resolve().parents[1]/"data/set-factory"
MCB="https://mycardbatch.com/checklists/fleer-ultra-2000-football"
TCDB="https://www.tcdb.com/Checklist.cfm/sid/4439/2000-Ultra"
INS="https://www.tcdb.com/Inserts.cfm/sid/4439/2000-Ultra"
BOX="https://www.steelcitycollectibles.com/i/2000-fleer-ultra-football-hobby-box"
GROUPS=[
("base","Base Set",249,"BASE",None,"#1–220 regular; #221–250 SP rookies 1:4, excluding withdrawn #240.",TCDB),
("base-aftermarket","Base Set Aftermarket",1,"INSERT",None,"#240 LaVar Arrington withdrawn early; exclude from normal pack collation.",INS),
("checklists","Checklists",2,"INSERT",None,"Both unnumbered checklists; internal identifiers NNO-1 and NNO-2 disambiguate.", "https://www.tcdb.com/Gallery.cfm/sid/568238/2000-Ultra-Checklists"),
("dream-team","Dream Team",10,"INSERT",24,"Hobby 1:24.",INS),
("fast-lane","Fast Lane",15,"INSERT",3,"Hobby 1:3.",INS),
("head-of-the-class","Head of the Class",10,"INSERT",6,"Hobby 1:6.",INS),
("instant-three-play","Instant Three Play",15,"INSERT",3,"Hobby 1:3.",INS),
("millennium-monsters","Millennium Monsters",10,"INSERT",12,"Hobby 1:12.",INS),
("won-by-one","Won by One",10,"INSERT",72,"Hobby 1:72.",INS),
("gold-medallion","Gold Medallion",249,"PARALLEL",1,"One Gold per hobby pack overall; rookie weighting not verified; #240G nonexistent.", "https://www.tcdb.com/Checklist.cfm/sid/36298/2000-Ultra---Gold-Medallion"),
("platinum-medallion","Platinum Medallion",249,"PARALLEL",None,"#1–220 /50; #221–250 /25; #240P nonexistent.", "https://www.tcdb.com/Checklist.cfm/sid/36303/2000-Ultra---Platinum-Medallion"),
("masterpiece","Masterpiece",249,"PARALLEL",None,"All 1/1; #240M nonexistent.", "https://www.tcdb.com/Checklist.cfm/sid/36301/2000-Ultra-Masterpiece")]
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
 p=Parser();p.feed(html);tables=[x[1:] for x in p.groups]
 assert [len(x) for x in tables]==[249,1,1,10,15,10,15,10,10,498,249]
 tables[2]=[["NNO-1","Checklist: 1-169",""],["NNO-2","Checklist: 170-250 and Inserts",""]]
 tables=tables[:9]+[tables[9][:249],tables[9][249:],tables[10]]
 base_rc={n for n,player,t in tables[0] if player.endswith(" RC")}
 rows=[]
 for (key,name,count,kind,odds,note,url),table in zip(GROUPS,tables):
  assert len(table)==count
  for num,player,team in table:
   subset="RC" if player.endswith(" RC") else ""
   player=player.removesuffix(" RC")
   variant=""
   if key in ("base","gold-medallion","platinum-medallion","masterpiece"):
    n=int(re.match(r"\d+",num).group())
    if str(n) in base_rc:subset="RC"
    if n>=221:subset="SP Rookie"
    if key=="platinum-medallion":variant="/"+str(50 if n<=220 else 25)
    if key=="masterpiece":variant="1/1"
   if key=="base-aftermarket":variant="Withdrawn; aftermarket only";subset="RC"
   if key=="checklists":subset="Checklist";variant="Unnumbered"
   rows.append(dict(zip(FIELDS,(key,num,player,team,subset,variant))))
 return rows
def validate(rows):
 assert Counter(r["setKey"] for r in rows)=={g[0]:g[2] for g in GROUPS}
 assert len(rows)==1069==len({(r["setKey"],r["cardNumber"]) for r in rows})
 assert all(r["player"] and (r["team"] or r["setKey"]=="checklists") for r in rows)
 base={int(r["cardNumber"]):r for r in rows if r["setKey"]=="base"}
 assert set(base)==set(range(1,251))-{240}
 assert base[234]["player"]=="Tom Brady"
 for key,suffix in (("gold-medallion","G"),("platinum-medallion","P"),("masterpiece","M")):
  group={r["cardNumber"]:r for r in rows if r["setKey"]==key}
  assert set(group)=={str(n)+suffix for n in base}
  diff=[(n,r["player"],r["team"],group[str(n)+suffix]["player"],group[str(n)+suffix]["team"]) for n,r in base.items() if (r["player"],r["team"])!=(group[str(n)+suffix]["player"],group[str(n)+suffix]["team"])]
  print(key,"source differences:",diff)
  assert {d[0] for d in diff}=={"gold-medallion":{204},"platinum-medallion":{97,164},"masterpiece":{64,164}}[key]
 assert Counter(r["variant"] for r in rows if r["setKey"]=="platinum-medallion")=={"/50":220,"/25":29}
 print("PASS: 1069 distinct cards, 12 groups")
def manifest():
 return dict(schemaVersion=2,status="DRAFT",sources=dict(MyCardBatch=MCB,TCDB=TCDB,TCDBInserts=INS,OriginalHobbyBox=BOX,SharedInserts="https://www.beckett.com/football/2000/fleer-tradition-autographics/"),decisions=dict(odds="Six Ultra-specific insert odds populated; Gold 1:1 overall. Rookie weighting, guaranteed Gold slot, checklist odds, serial parallel odds and aftermarket exclusion need review before release.",sharedInserts="Autographics, Autographics Silver/Gold and Feel the Game/Gold were advertised in Ultra but are cross-product issues cataloged separately under Fleer Tradition; Ultra-specific eligibility not verified; not duplicated in this draft.",numbering="NNO-1 and NNO-2 distinguish the two unnumbered checklists; #240 only aftermarket.",sourceDifferences="Preserve source-specific team/name differences on 204G, 97P, 164P, 64M, 164M; James Johnson is J.J. Johnson.",images="Authentic scans only"),product=dict(id=PID,year=2000,brand="Ultra",sport="Football",cardsPerPack=10,packsPerBox=24,packPriceCents=0,autoPackPricing=True,packImageUrl=None,boxImageUrl=None,released=False),review=dict(teamData="COMPLETE_EXCEPT_CHECKLISTS",checklists="ULTRA_SPECIFIC_SOURCE_PARSED_STRUCTURE_CROSSCHECKED",images="PENDING",packArt="PENDING",pricing="PENDING",packCollation="PENDING_ROOKIE_AND_GOLD_SLOTS_AND_AFTERMARKET_EXCLUSION",released=False),cardsFile=STEM+".cards.csv.gz",productSets=[dict(key=k,id=PID+"_"+k.replace("-","_"),name=n,kind=kind,expectedCards=c,oddsPerPack=o,sourceUrl=url,notes=note) for k,n,c,kind,o,note,url in GROUPS])
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
