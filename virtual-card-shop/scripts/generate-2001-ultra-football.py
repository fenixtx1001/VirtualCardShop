#!/usr/bin/env python3
"""Build/check 2001 Ultra Football draft; full verified groups only."""
import csv,gzip,io,json,sys,re
from collections import Counter
from pathlib import Path
from html.parser import HTMLParser
PID="2001_Ultra_Football"
STEM="2001-ultra-football"
OUT=Path(__file__).resolve().parents[1]/"data/set-factory"
MCB="https://mycardbatch.com/checklists/fleer-ultra-2001-football"
TCDB="https://www.tcdb.com/Checklist.cfm/sid/4518/2001-Ultra"
INS="https://www.tcdb.com/Inserts.cfm/sid/4518/2001-Ultra"
BOX="https://www.steelcitycollectibles.com/i/2001-fleer-ultra-football-hobby-box"
COLLEGE="https://www.tcdb.com/Checklist.cfm/sid/36900/2001-Ultra-College-Greats-Previews"
SUNDAY="https://www.tcdb.com/Checklist.cfm/sid/36913/2001-Ultra-Sunday-s-Best-Jerseys"
CAPS="https://www.beckett.com/football/2001/ultra-head-of-the-class-player-worn-caps/"
COLLEGE_DATA="""Marcus Allen|USC Trojans
Drew Brees|Purdue Boilermakers
Tim Brown|Notre Dame Fighting Irish
Earl Campbell|Texas Longhorns
John Cappelletti|Penn State Nittany Lions
Ron Dayne|Wisconsin Badgers
Tony Dorsett|Pittsburgh Panthers
Tim Dwight|Iowa Hawkeyes
Doug Flutie|Boston College Eagles
Eddie George|Ohio State Buckeyes
Brian Griese|Michigan Wolverines
Archie Griffin|Ohio State Buckeyes
Franco Harris|Penn State Nittany Lions
Bob Hayes|Florida A&M Rattlers
Josh Heupel|Oklahoma Sooners
Paul Hornung|Notre Dame Fighting Irish
Bo Jackson|Auburn Tigers
Thomas Jones|Virginia Cavaliers
Jamal Lewis|Tennessee Volunteers
Bob Lilly|TCU Horned Frogs
Johnny Lujack|Notre Dame Fighting Irish
Donovan McNabb|Syracuse Orangemen
Santana Moss|Miami Hurricanes
Jim Plunkett|Stanford Cardinal
Billy Sims|Oklahoma Sooners
Roger Staubach|Navy Midshipmen
Pat Sullivan|Auburn Tigers
David Terrell|Michigan Wolverines
LaDainian Tomlinson|TCU Horned Frogs
Amani Toomer|Michigan Wolverines
Michael Vick|Virginia Tech Hokies
Herschel Walker|Georgia Bulldogs
Chris Weinke|Florida State Seminoles
Ricky Williams|Texas Longhorns
Steve Young|BYU Cougars"""
SUNDAY_DATA="""Jamal Anderson|Atlanta Falcons
Jerome Bettis|Pittsburgh Steelers
Drew Bledsoe|New England Patriots
Isaac Bruce|St. Louis Rams
Mark Brunell|Jacksonville Jaguars
Trung Canidate|St. Louis Rams
Tim Couch|Cleveland Browns
Stephen Davis|Washington Redskins
Ron Dayne|New York Giants
Warrick Dunn|Tampa Bay Buccaneers
Marshall Faulk|St. Louis Rams
Doug Flutie|San Diego Chargers
Antonio Freeman|Green Bay Packers
Brian Griese|Denver Broncos
Kevin Johnson|Cleveland Browns
Thomas Jones|Arizona Cardinals
Napoleon Kaufman|Oakland Raiders
Curtis Martin|New York Jets
Keenan McCardell|Jacksonville Jaguars
Terrell Owens|San Francisco 49ers
Jake Plummer|Arizona Cardinals
Jerry Rice|San Francisco 49ers
Jimmy Smith|Jacksonville Jaguars
Rod Smith|Denver Broncos
R.Jay Soward|Jacksonville Jaguars
Fred Taylor|Jacksonville Jaguars
Brian Urlacher|Chicago Bears
Kurt Warner|St. Louis Rams"""
GROUPS=[
("base","Base Set",300,"BASE",None,"#251–300 rookies /2499.",TCDB),
("gold-medallion","Gold Medallion",300,"PARALLEL",None,"Veterans /250; rookies /100.",INS),
("platinum-medallion","Platinum Medallion",300,"PARALLEL",None,"Veterans /50; rookies /25.",INS)]
for key,name,count,odds in [("2-minute-thrill","2 Minute Thrill",20,None),("ground-command","Ground Command",10,22),("quick-strike","Quick Strike",20,22)]:
 GROUPS.extend([(key,name,count,"INSERT",odds,"Original insert.",INS),(key+"-gold",name+" Gold Medallion",count,"PARALLEL",None,"/250; same printed insert numbering.",INS),(key+"-platinum",name+" Platinum Medallion",count,"PARALLEL",None,"/50; same printed insert numbering.",INS)])
GROUPS += [
("head-of-the-class","Head of the Class",25,"INSERT",22,"Second-year players.",INS),
("head-of-the-class-player-worn","Head of the Class Player Worn",25,"INSERT",None,"Player-worn caps /100; Beckett confirms 25-card parallel, matched to base insert; unnumbered.",CAPS),
("checklists","Checklists",2,"INSERT",None,"Two unnumbered checklist cards.",INS),
("college-greats-previews","College Greats Previews",35,"INSERT",22,"Full TCDB unnumbered checklist.",COLLEGE),
("sundays-best-jerseys","Sunday's Best Jerseys",28,"INSERT",63,"Full TCDB unnumbered checklist; game-worn jerseys.",SUNDAY)]
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
def nno(player):return "NNO-"+re.sub(r"[^A-Z0-9]","",player.upper())
def parse_extra(data):return [[nno(p),p,t] for p,t in (line.split("|") for line in data.splitlines())]
def build(html):
 p=Parser();p.feed(html);t=[x[1:] for x in p.groups]
 assert [len(x) for x in t]==[300,20,1,1,1,1,1,10,25,1,20,1,600]
 tables=[t[0],t[12][:300],t[12][300:]]
 for i in (1,7,10):tables.extend([t[i]]*3)
 tables += [t[8],[[nno(p),p,team] for _,p,team in t[8]],[["NNO-1","Checklist: 1-250",""],["NNO-2","Checklist: 251-300 and Inserts",""]],parse_extra(COLLEGE_DATA),parse_extra(SUNDAY_DATA)]
 rows=[]
 for (key,name,count,kind,odds,note,url),table in zip(GROUPS,tables):
  assert len(table)==count
  for num,player,team in table:
   player=player.removesuffix(" RC")
   subset="";variant=""
   if key in ("base","gold-medallion","platinum-medallion"):
    n=int(re.match(r"\d+",num).group())
    if n>250:subset="RC"
    if key=="base" and n>250:variant="/2499"
    if key=="gold-medallion":variant="/"+str(250 if n<=250 else 100)
    if key=="platinum-medallion":variant="/"+str(50 if n<=250 else 25)
   elif key.endswith("-gold"):variant="/250"
   elif key.endswith("-platinum"):variant="/50"
   elif key=="head-of-the-class-player-worn":variant="Player-worn cap; /100";subset="MEM"
   elif key=="sundays-best-jerseys":variant="Game-worn jersey";subset="MEM"
   elif key=="checklists":subset="Checklist";variant="Unnumbered"
   rows.append(dict(zip(FIELDS,(key,num,player,team,subset,variant))))
 return rows
def validate(rows):
 assert Counter(r["setKey"] for r in rows)=={g[0]:g[2] for g in GROUPS}
 assert len(rows)==1165==len({(r["setKey"],r["cardNumber"]) for r in rows})
 assert all(r["player"] and (r["team"] or r["setKey"]=="checklists") for r in rows)
 base={r["cardNumber"]:r for r in rows if r["setKey"]=="base"}
 assert set(base)=={str(n) for n in range(1,301)}
 assert base["260"]["player"]=="Drew Brees" and base["283"]["player"]=="Michael Vick"
 for key,suffix in (("gold-medallion","G"),("platinum-medallion","P")):
  g={r["cardNumber"]:r for r in rows if r["setKey"]==key}
  assert set(g)=={n+suffix for n in base}
  assert all((r["player"],r["team"])==(g[n+suffix]["player"],g[n+suffix]["team"]) for n,r in base.items())
 print("PASS: 1165 unique cards in 17 groups")
def manifest():
 return dict(schemaVersion=2,status="DRAFT",sources=dict(MyCardBatch=MCB,TCDB=TCDB,TCDBInserts=INS,OriginalHobbyBox=BOX,CollegeGreats=COLLEGE,SundaysBest=SUNDAY,PlayerWornCaps=CAPS),decisions=dict(omitted="Ball Hawks (24), College Greats Previews Autographs and Autograph Redemptions: full individual checklists unavailable; no guessed cards. Ball Hawks 1:144 and College autograph/redemption advertised 1:61 documented only.",numbering="NNO-player keys distinguish unnumbered cards. Insert medallions retain printed TT, GC, QS numbering.",odds="Hobby odds populated where confirmed; 2 Minute Thrill base odds not confirmed. Serial runs preserved; do not infer pack odds.",caps="25-player cap parallel reconstructed from 25-card Head of the Class checklist and Beckett parallel count; individual matching requires scan review.",images="Authentic scans only"),product=dict(id=PID,year=2001,brand="Ultra",sport="Football",cardsPerPack=10,packsPerBox=24,packPriceCents=0,autoPackPricing=True,packImageUrl=None,boxImageUrl=None,released=False),review=dict(checklists="PARTIAL_THREE_FAMILIES_PENDING",images="PENDING",pricing="PENDING",packCollation="PENDING",released=False),cardsFile=STEM+".cards.csv.gz",productSets=[dict(key=k,id=PID+"_"+k.replace("-","_"),name=n,kind=kind,expectedCards=c,oddsPerPack=o,sourceUrl=url,notes=note) for k,n,c,kind,o,note,url in GROUPS])
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
