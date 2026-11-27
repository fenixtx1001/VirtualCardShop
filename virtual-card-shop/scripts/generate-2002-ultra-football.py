#!/usr/bin/env python3
"""Generate or validate an unreleased 2002 Ultra Football Set Factory bundle."""
import csv,gzip,io,json,re,sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
PID="2002_Ultra_Football"
STEM="2002-ultra-football"
OUT=Path(__file__).resolve().parents[1]/"data/set-factory"
MCB="https://mycardbatch.com/checklists/fleer-ultra-2002-football"
TCDB="https://www.tcdb.com/Checklist.cfm/sid/4584/2002-Ultra"
INS="https://www.tcdb.com/Inserts.cfm/sid/4584/2002-Ultra"
BOX="https://www.steelcitycollectibles.com/i/2002-fleer-ultra-football-hobby-box"
MID="https://www.midwestcards.com/products/2002-fleer-ultra-football-hobby-box"
LL="https://www.tcdb.com/Checklist.cfm/sid/37619/2002-Ultra---League-Leaders-Memorabilia"
GOLD="https://www.tcdb.com/Checklist.cfm/sid/37617/2002-Ultra---Gold-Medallion"
LLP="https://www.tcdb.com/ViewCard.cfm/sid/37620/cid/3798484/2002-Ultra-League-Leaders-Memorabilia-Platinum-Medallion-NNO-Marshall-Faulk"
LRM="https://www.tcdb.com/ViewCard.cfm/sid/37622/cid/3798425/2002-Ultra-Logo-Rhythm-Memorabilia-NNO-Marshall-Faulk"
SBM="https://www.tcdb.com/ViewCard.cfm/sid/37624/cid/3798521/2002-Ultra-San-Diego-Bound-Memorabilia-NNO-Marshall-Faulk"
SBP="https://www.tcdb.com/ViewCard.cfm/sid/37625/cid/3798536/2002-Ultra-San-Diego-Bound-Memorabilia-Platinum-Medallion-NNO-Marshall-Faulk"
LL_NAMES="Aaron Brooks|Laveranues Coles|Daunte Culpepper|Stephen Davis|Marshall Faulk|Jeff Garcia|Eddie George|Torry Holt|Curtis Martin|Donovan McNabb|Terrell Owens|Antowain Smith|Emmitt Smith|Anthony Thomas|LaDainian Tomlinson|Brian Urlacher|Kurt Warner|Ricky Williams"
LOGO_NAMES="Germane Crowell|Marshall Faulk|Kurt Warner|Brian Urlacher|LaDainian Tomlinson|Jeff Garcia"
SB_NAMES="Tom Brady|Marshall Faulk|Kurt Warner|Brian Urlacher|Fred Taylor|Michael Vick|Daunte Culpepper|Jeff Garcia|Terrell Owens"
SBP_NAMES="Tom Brady|Marshall Faulk|Kurt Warner|Brian Urlacher|Fred Taylor|Michael Vick"
GROUPS=[
("base","Base Set",240,"BASE",None,"#201–240 rookie short prints; exact pack odds not verified.",TCDB),
("gold-medallion","Gold Medallion",240,"PARALLEL",None,"Mirror base numbering; TCDB and SportsCardsPro confirm 240 parallel identities. #201–240 /100; aggregate odds unverified.",GOLD),
("league-leaders","League Leaders",27,"INSERT",6,"Actual numbered checklist 1–27 LL; box advertises 26.",INS),
("league-leaders-memorabilia","League Leaders Memorabilia",18,"INSERT",20,"Full TCDB checklist; unnumbered.",LL),
("league-leaders-memorabilia-platinum","League Leaders Memorabilia Platinum Medallion",18,"PARALLEL",None,"/25; same-size parallel reconstructed from full memorabilia list, individual scan check pending.",LLP),
("logo-rhythm","Logo Rhythm",22,"INSERT",12,"Numbered 1–22 LR.",INS),
("logo-rhythm-memorabilia","Logo Rhythm Memorabilia",6,"INSERT",96,"PARTIAL: 6 individually corroborated of 12; six unresolved.",LRM),
("san-diego-bound","San Diego Bound",20,"INSERT",72,"Numbered 1–20 SB.",INS),
("san-diego-bound-memorabilia","San Diego Bound Memorabilia",9,"INSERT",48,"PARTIAL: 9 individually corroborated of 15; Faulk SP.",SBM),
("san-diego-bound-memorabilia-platinum","San Diego Bound Memorabilia Platinum Medallion",6,"PARALLEL",None,"PARTIAL: 6 individually corroborated of 15; /25.",SBP)]
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
def nno(p):return "NNO-"+re.sub(r"[^A-Z0-9]","",p.upper())
def build(html):
 p=Parser();p.feed(html);t=[x[1:] for x in p.groups]
 assert [len(x) for x in t]==[240,27,1,1,22,1,20,1,1]
 teams={p.removesuffix(" RC"):team for n,p,team in t[0]}
 teams.update({p:team for group in (t[1],t[4],t[6]) for n,p,team in group})
 def mem(names):
  return [[nno(p),p,teams[p]] for p in names.split("|")]
 tables=[t[0],t[0],t[1],mem(LL_NAMES),mem(LL_NAMES),t[4],mem(LOGO_NAMES),t[6],mem(SB_NAMES),mem(SBP_NAMES)]
 rows=[]
 for (key,name,count,kind,odds,note,url),table in zip(GROUPS,tables):
  assert len(table)==count
  for n,p,team in table:
   subset="RC" if p.endswith(" RC") else ""
   p=p.removesuffix(" RC")
   variant=""
   if key=="gold-medallion" and int(n)>200:variant="/100"
   if "memorabilia" in key:
    subset="MEM";variant="Unnumbered"
    if key.endswith("-platinum"):variant="Unnumbered; /25"
    if key=="san-diego-bound-memorabilia" and p=="Marshall Faulk":variant="Unnumbered; SP"
   rows.append(dict(zip(FIELDS,(key,n,p,team,subset,variant))))
 return rows
def validate(rows):
 assert Counter(r["setKey"] for r in rows)=={g[0]:g[2] for g in GROUPS}
 assert len(rows)==606==len({(r["setKey"],r["cardNumber"]) for r in rows})
 assert all(r["player"] and r["team"] for r in rows)
 base={r["cardNumber"]:r for r in rows if r["setKey"]=="base"}
 gold={r["cardNumber"]:r for r in rows if r["setKey"]=="gold-medallion"}
 assert set(base)==set(gold)=={str(n) for n in range(1,241)}
 assert sum(r["subset"]=="RC" for r in base.values())==40
 assert sum(r["variant"]=="/100" for r in gold.values())==40
 assert base["181"]["player"]=="Tom Brady"
 assert all((r["player"],r["team"])==(gold[n]["player"],gold[n]["team"]) for n,r in base.items())
 print("PASS: 606 unique cards, 10 groups; 21 known memorabilia identities pending")
def manifest():
 return dict(schemaVersion=2,status="DRAFT",sources=dict(MyCardBatch=MCB,TCDB=TCDB,TCDBInserts=INS,OriginalHobbyBox=BOX,MidwestCards=MID,LeagueLeadersMEM=LL,GoldMedallion=GOLD,LeagueLeadersPlatinum=LLP,LogoRhythmMEM=LRM,SanDiegoMEM=SBM,SanDiegoPlatinum=SBP,GoldRC="https://www.beckett.com/football/2002/ultra-gold-medallion/207-tj-duckett-2587678",GoldCrosscheck="https://www.sportscardspro.com/console/football-cards-2002-ultra?sort=model-number",LogoTomlinson="https://www.beckett.com/football/2002/ultra-logo-rhythm-memorabilia/9-ladainian-tomlinson-2587842",LogoGarcia="https://www.ebay.com/itm/237097315504",Taylor="https://forums.collectors.com/discussion/302761/need-help-need-a-complete-checklist",Vick="https://www.sportscardforum.com/threads/144201-Need-this-checklist-plz%21%21%21"),decisions=dict(knownMissing={"logo-rhythm-memorabilia":6,"san-diego-bound-memorabilia":6,"san-diego-bound-memorabilia-platinum":9},catalogDiscrepancy="League Leaders has 27 actual cards versus 26 advertised. Physical unnumbered checklist cards outside TCDB product group not imported pending verification.",parallel="Gold 240-card mirror crosschecked against separate catalog and sampled identities; rookie /100. League Leaders Platinum 18-card mirror inferred from matching count and confirmed parallel; individual scans pending.",numbering="Original numbers, NNO-player keys for genuinely unnumbered cards.",odds="Six advertised hobby odds; no estimated serial-numbered parallel odds.",images="Authentic scans only"),product=dict(id=PID,year=2002,brand="Ultra",sport="Football",cardsPerPack=10,packsPerBox=24,packPriceCents=0,autoPackPricing=True,packImageUrl=None,boxImageUrl=None,released=False),review=dict(checklists="PARTIAL_21_MEMORABILIA_CARDS_PENDING",images="PENDING",pricing="PENDING",packCollation="PENDING",released=False),cardsFile=STEM+".cards.csv.gz",productSets=[dict(key=k,id=PID+"_"+k.replace("-","_"),name=n,kind=kind,expectedCards=c,oddsPerPack=o,sourceUrl=url,notes=note) for k,n,c,kind,o,note,url in GROUPS])
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
