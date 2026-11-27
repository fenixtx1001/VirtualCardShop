#!/usr/bin/env python3
"""Generate/check 2005 Ultra Football draft from saved MyCardBatch HTML."""
import csv,gzip,io,json,sys
from collections import Counter
from pathlib import Path
from html.parser import HTMLParser
PID="2005_Ultra_Football"
STEM="2005-ultra-football"
OUT=Path(__file__).resolve().parents[1]/"data/set-factory"
MCB="https://mycardbatch.com/checklists/fleer-ultra-2005-football"
TCDB="https://www.tcdb.com/Checklist.cfm/sid/4731/2005-Ultra"
INS="https://www.tcdb.com/Inserts.cfm/sid/4731/2005-Ultra"
BOX="https://www.charmcitycards.com/2005-fleer-ultra-football-1547.html"
AUTOS=dict(BB=49,BB1=66,CC=26,DF=14,DH=26,DS=27,JD=14,JJ=26,JM=64,KW=14,LF=21,LM=64,PB=14,PR=29,RB=34,RW1=64,TB1=14,TB2=26,WP=51)
# key, name, source table, count, type, pack odds, print run, TCDB set ID, notes
GROUPS=[
("base","Base Set",0,248,"BASE",None,"",4731,"#1–248 actual checklist; 249 and 250 not cataloged. #201–213 Lucky 13 /599; #214–248 SP 1:4."),
("gold-medallion","Gold Medallion",0,248,"PARALLEL",None,"",40404,"Mirror base; veterans 1:1, rookies 1:8; tiered collation pending."),
("platinum-medallion","Platinum Medallion",0,248,"PARALLEL",None,"",40405,"Mirror base; 200 veterans /50; 13 Lucky 13 /13; 35 other rookies /25."),
("all-ultra-team-autographs-gold","All-Ultra Team Autographs Gold",1,19,"INSERT",None,"",40395,"Full independent TCDB checklist and individual serial runs."),
("all-ultra-team-autographs-masterpiece","All-Ultra Team Autographs Masterpiece",1,22,"PARALLEL",None,"1/1",40396,"MyCardBatch separate checklist; AU prefix inferred from Gold."),
("all-ultra-team-autographs-platinum","All-Ultra Team Autographs Platinum",2,22,"PARALLEL",None,"/25",40397,"MyCardBatch separate checklist; AU prefix inferred from Gold."),
("all-ultra-team-jerseys-gold","All-Ultra Team Jerseys Gold",3,49,"INSERT",None,"",40398,"Full TCDB 49-card checklist crosscheck."),
("all-ultra-team-jerseys-platinum","All-Ultra Team Jerseys Platinum",3,49,"PARALLEL",None,"/50",40399,"Shared 49-card checklist; exact membership pending."),
("first-rounders","First Rounders",4,15,"INSERT",12,"",40400,"Hobby 1:12."),
("first-rounders-jerseys-copper","First Rounders Jerseys Copper",5,10,"INSERT",None,"/150",40401,"Shared checklist."),
("first-rounders-jerseys-platinum","First Rounders Jerseys Platinum",5,10,"PARALLEL",None,"/25",40402,"Shared checklist."),
("first-rounders-jerseys-ultraswatch","First Rounders Jerseys UltraSwatch",6,10,"PARALLEL",None,"Numbered to draft pick",40403,"Separate MyCardBatch list; printed numbering requires scan check."),
("td-kings","TD Kings",7,20,"INSERT",6,"",40410,"Hobby 1:6."),
("td-kings-die-cuts","TD Kings Die Cuts",7,20,"PARALLEL",None,"",40411,"Retail die cut mirror; exact odds pending."),
("td-kings-jerseys-copper","TD Kings Jerseys Copper",8,15,"INSERT",None,"",40412,"Shared checklist; exact print runs pending."),
("td-kings-jerseys-gold","TD Kings Jerseys Gold",8,15,"PARALLEL",None,"/250",40413,"Shared checklist; sample TK/CP confirms /250."),
("td-kings-jerseys-platinum","TD Kings Jerseys Platinum",8,15,"PARALLEL",None,"/99",40414,"Shared checklist."),
("td-kings-jerseys-red","TD Kings Jerseys Red",8,15,"PARALLEL",None,"",40415,"Shared checklist; exact print runs and distribution pending."),
("td-kings-jerseys-ultraswatch","TD Kings Jerseys UltraSwatch",9,15,"PARALLEL",None,"Numbered to 2004 TD total",40416,"Separate list; individual serial runs pending."),
("ultra-sensations","Ultra Sensations",10,15,"INSERT",24,"",40406,"Hobby 1:24."),
("ultra-sensations-jerseys-copper","Ultra Sensations Jerseys Copper",11,11,"INSERT",None,"/150",40407,"Shared checklist."),
("ultra-sensations-jerseys-platinum","Ultra Sensations Jerseys Platinum",11,11,"PARALLEL",None,"/25",40408,"Shared checklist."),
("ultra-sensations-jerseys-ultraswatch","Ultra Sensations Jerseys UltraSwatch",12,11,"PARALLEL",None,"Numbered to jersey number",40409,"Separate list; Aaron Brooks and Randy Moss team discrepancies require scan check.")]
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
 assert [len(g) for g in t]==[248,22,22,49,15,10,10,20,15,15,15,11,11]
 rows=[]
 for key,name,i,count,kind,odds,v0,sid,note in GROUPS:
  table=t[i]
  if key=="all-ultra-team-autographs-gold":table=[r for r in table if r[0] in AUTOS]
  assert len(table)==count,(key,len(table))
  for n,p,team in table:
   subset="";v=v0
   if i==0:
    p=p.removesuffix(" RC").removesuffix(" L13")
    j=int(n)
    if 201<=j<=213:subset="Lucky 13 RC"
    elif j>=214:subset="RC"
    if key=="base" and j>200:v="/599" if j<=213 else "SP; 1:4"
    if key=="gold-medallion":v="1:1" if j<=200 else "1:8"
    if key=="platinum-medallion":v="/50" if j<=200 else "/13" if j<=213 else "/25"
   if "autographs" in key:
    subset="AU"
    if key.endswith("-gold"):v="/"+str(AUTOS[n])
    n="AU-"+n
   if "jerseys" in key:subset="MEM"
   if i==5:n="FR"+n
   if i==8 or i==9:n="TK"+n
   if i==11 or i==12:n="US"+n
   if i==12 and p=="Aaron Brooks":team="New Orleans Saints"
   rows.append(dict(zip(FIELDS,(key,n,p,team,subset,v))))
 return rows
def validate(rows):
 expected={g[0]:g[3] for g in GROUPS}
 assert Counter(r["setKey"] for r in rows)==expected
 assert len(rows)==1113==len({(r["setKey"],r["cardNumber"]) for r in rows})
 assert all(r["player"] and r["team"] for r in rows)
 base={r["cardNumber"]:r for r in rows if r["setKey"]=="base"}
 assert set(base)=={str(n) for n in range(1,249)}
 assert base["202"]["player"]=="Aaron Rodgers" and base["248"]["player"]=="Frank Gore"
 assert sum(r["subset"]=="Lucky 13 RC" for r in base.values())==13
 for key in ("gold-medallion","platinum-medallion"):
  g={r["cardNumber"]:r for r in rows if r["setKey"]==key}
  assert set(g)==set(base)
  assert all((r["player"],r["team"])==(g[n]["player"],g[n]["team"]) for n,r in base.items())
 assert {r["cardNumber"][3:]:int(r["variant"][1:]) for r in rows if r["setKey"]=="all-ultra-team-autographs-gold"}==AUTOS
 print("PASS: 1113 unique records in 23 groups")
def manifest():
 return dict(schemaVersion=2,status="DRAFT",sources=dict(MyCardBatch=MCB,TCDB=TCDB,TCDBInserts=INS,OriginalHobbyBox=BOX,GoldAutographs="https://www.tcdb.com/Checklist.cfm/sid/40395/2005-Ultra-All-Ultra-Team-Autographs-Gold",GoldJerseys="https://www.tcdb.com/Checklist.cfm/sid/40398/2005-Ultra-All-Ultra-Team-Jerseys-Gold"),decisions=dict(checklist="Actual 248 cards, 48 rookie-subset cards; advertised 250. All 20 TCDB insert families represented.",parallel="Base and shared insert parallel lists reconstructed using MyCardBatch shared checklists and sampled catalog identities; TCDB full parallel pages unavailable. Verify individual membership, prefixes and team data before release.",autographs="Gold 19 exact TCDB entries and serial runs, not 22-card mirror. Platinum and Masterpiece use source-specific 22-card lists; AU prefixes inferred.",team="Corrected apparent Aaron Brooks Green Bay source error to New Orleans; Randy Moss Minnesota variant retained from source pending scan review.",odds="Three uniform hobby insert odds populated. Combined memorabilia 1:12 and autographs 1:384 documented only; do not assign combined odds per family. Gold/rookie and retail collation pending.",images="Authentic scans only"),product=dict(id=PID,year=2005,brand="Ultra",sport="Football",cardsPerPack=8,packsPerBox=24,packPriceCents=0,autoPackPricing=True,packImageUrl=None,boxImageUrl=None,released=False),review=dict(checklists="DRAFT_SHARED_PARALLEL_VERIFICATION_PENDING",images="PENDING",pricing="PENDING",packCollation="PENDING",released=False),cardsFile=STEM+".cards.csv.gz",productSets=[dict(key=k,id=PID+"_"+k.replace("-","_"),name=n,kind=kind,expectedCards=c,oddsPerPack=o,sourceUrl="https://www.tcdb.com/Checklist.cfm/sid/"+str(sid)+"/2005-Ultra",notes=note) for k,n,i,c,kind,o,v,sid,note in GROUPS])
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
