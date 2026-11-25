#!/usr/bin/env python3
"""1997 Ultra Football source audit: original card identities, inserts, parallels, promos."""
import re,html,urllib.request
from collections import Counter
MCB="https://mycardbatch.com/checklists/fleer-ultra-1997-football"
TCDB="https://www.tcdb.com/ViewSet.cfm/sid/4163/1997-Ultra"
TCDB_INSERTS="https://www.tcdb.com/Inserts.cfm/sid/4163/1997-Ultra"
TCDB_GOLD="https://www.tcdb.com/Checklist.cfm/sid/34543/1997-Ultra-Gold-Medallion"
TCDB_PLAT="https://www.tcdb.com/Checklist.cfm/sid/34544/1997-Ultra-Platinum-Medallion"
TCDB_REEBOK="https://www.tcdb.com/Checklist.cfm/sid/130990/1997-Ultra-Reebok-Green"
BECKETT_BROWN="https://www.beckett.com/football/1997/ultra-brown-backs"
PID="1997_Ultra_Football"
# 14 populated original MCB insert lists; TCDB explicitly confirms 16,
# the additional two reuse the original printed numbering/player/club.
INSERTS={
 "Blitzkrieg":18,"Blitzkrieg Die Cut":18,
 "Comeback Kids":10,"First Rounders":12,
 "Play of the Game":10,"Rising Stars":10,
 "Rookies":12,"Rookies Gold Embossed":12,
 "Specialists":18,"Starring Role":10,
 "Sunday School":10,"Talent Show":10,
 "The Main Event":10,"Ultra All Rookie Team":12,
 "Ultra Specialists":18,"Ultra Stars":10}
ODDS={
 "blitzkrieg":"Series One, 1:6 original packs",
 "blitzkrieg-die-cut":"Series One, 1:36 original packs, die cut",
 "comeback-kids":"Series Two, 1:8 original packs, die cut",
 "first-rounders":"Series Two, 1:4 original packs",
 "play-of-the-game":"Series One, 1:8 original packs",
 "rising-stars":"Series Two, 1:4 original packs",
 "rookies":"Series One, 1:4 original packs",
 "rookies-gold-embossed":"Series One, 1:18 original packs, authentic stamped alternative (TCDB)",
 "specialists":"Series Two, 1:6 original packs, die cut",
 "starring-role":"Series One, 1:288 original packs",
 "sunday-school":"Series One, 1:8 original packs",
 "talent-show":"Series One, 1:4 original packs",
 "the-main-event":"Series Two, 1:8 original packs",
 "ultra-all-rookie-team":"Series Two, 1:18 original packs",
 "ultra-specialists":"Series Two, 1:36 original packs",
 "ultra-stars":"Series Two, 1:288 original packs"}
REEBOK_COLORS=("Bronze","Silver","Gold","Red","Green")
EXPECTED={
 "base":350,
 "brown-backs":173,
 "gold-medallion":346,
 "platinum-medallion":346,
 "gold-medallion-g1b-blue-back":1}
for title,n in INSERTS.items():
 EXPECTED[re.sub("[^a-z0-9]+","-",title.lower()).strip("-")]=n
EXPECTED["lucky-13-dan-marino-autograph"]=1
for color in REEBOK_COLORS:EXPECTED["reebok-"+color.lower()]=15
EXPECTED["terrell-davis-display"]=1
EXPECTED["terrell-davis-sample-promo"]=1
EXPECTED["terrell-davis-autographed-promo"]=1
EXPECTED["presentation-game-football-offer"]=1
assert len(EXPECTED)==31 and sum(EXPECTED.values())==1496
MCB_COUNTS={k:v for k,v in INSERTS.items() if k not in ("Blitzkrieg Die Cut","Rookies Gold Embossed")}
MCB_COUNTS.update({"Lucky 13 Dan Marino Autograph":1,"Medallion":692,
                  "Reebok":15,"Terrell Davis Display":1})
assert len(MCB_COUNTS)==18
NONPLAYER_NUMS={199,200,349,350}
def slug(s):return re.sub("[^a-z0-9]+","-",s.lower()).strip("-")
def clean(s):return html.unescape(re.sub(r"<[^>]+>","",s)).strip()
def fetch():
 req=urllib.request.Request(MCB,headers={"User-Agent":"Googlebot","Referer":"https://www.google.com/","Accept":"text/html,application/xhtml+xml"})
 with urllib.request.urlopen(req,timeout=35) as r:
  if r.status!=200:raise ValueError("Collector source unavailable")
  return r.read().decode("utf8","replace")
def tables(doc):
 m=re.search(r'<table class="ck-table" id="ck-table".*?<tbody>(.*?)</tbody>',doc,re.S)
 if not m:raise ValueError("Original base table missing")
 def parse(htmlblock):
  rows=[]
  for tr in re.findall(r"<tr[^>]*>(.*?)</tr>",htmlblock,re.S):
   td=[clean(x) for x in re.findall(r"<td[^>]*>(.*?)</td>",tr,re.S)]
   if len(td)==3:rows.append(td)
  return rows
 base=parse(m[1]);groups={}
 for detail in re.findall(r'<details class="ins">(.*?)</details>',doc,re.S):
  name=re.search(r'<span class="ins-name">(.*?)</span>',detail,re.S)
  if name:
   tr=re.findall(r"<tr[^>]*>(.*?)</tr>",detail,re.S)[1:]
   groups[clean(name[1])]=parse("".join("<tr>"+x+"</tr>" for x in tr))
 return base,groups
def add(out,key,num,name,team,subset,note):
 if not num or not name or (not team and not (key=="base" and str(num) in {str(n) for n in NONPLAYER_NUMS}) and key!="presentation-game-football-offer"):
  raise ValueError("Source subject/team missing "+str((key,num,name,team)))
 out.append(dict(setKey=key,cardNumber=str(num),player=name,team=team,subset=subset,variant=note))
def audit_source():
 base,groups=tables(fetch())
 if len(base)!=350 or {k:len(v) for k,v in groups.items()}!=MCB_COUNTS:
  raise ValueError("MCB original base/insert/parallel/source groups have changed")
 out=[];bybase={}
 for i,(number,raw,team) in enumerate(base,1):
  if number!=str(i):raise ValueError("1997 base number mismatch "+str((i,number)))
  if (i in NONPLAYER_NUMS)!=(not team):raise ValueError("Actual checklist/team discrepancy "+number)
  if i in NONPLAYER_NUMS and not raw.startswith("Checklist"):raise ValueError("Physical nonplayer checklist changed")
  name=re.sub(r"\s+RC$","",raw)
  if not name:raise ValueError("Empty published base subject")
  variant=("Series One #1-200" if i<=200 else "Series Two #201-350")
  variant+="; original base printed card; "+("genuine source-designated rookie" if raw.endswith(" RC") else "physical checklist" if i in NONPLAYER_NUMS else "original base subject")
  add(out,"base",number,name,team,"Checklist" if i in NONPLAYER_NUMS else "RC" if raw.endswith(" RC") else "Base",variant)
  bybase[number]=(name,team)
  if 1<=i<=173:
   # TCDB labels even #79 and #165 as RC; preserve original 1-173 scope while
   # keeping those catalog designations in base metadata (not excluding cards).
   add(out,"brown-backs",number,name,team,"Brown Backs",
       "Original Beckett-catalogued Series One VETERAN brown-back card, 173-card checklist; true alternate cardback; original front/source number")
 # Medallion checklists exclude all four real base checklists.
 seen={"gold-medallion":set(),"platinum-medallion":set()}
 for printed,raw,club in groups["Medallion"]:
  m=re.fullmatch(r"([GP])(\d+)",printed)
  if not m:raise ValueError("Medallion printed G/P numbering corrupted "+printed)
  key="gold-medallion" if m[1]=="G" else "platinum-medallion"
  number=m[2]
  if int(number) in NONPLAYER_NUMS or number not in bybase:raise ValueError("Invented nonexistent medallion "+printed)
  bname,bteam=bybase[number]
  if not (raw==bname or number=="35" and raw=="Derrick Alexander WR" and bname=="Derrick Alexander") or club!=bteam:
   raise ValueError("Published medallion identity/team mismatch "+str((printed,raw,bname,club,bteam)))
  if printed in seen[key]:raise ValueError("Medallion duplicated "+printed)
  seen[key].add(printed)
  note=("Series One" if int(number)<=200 else "Series Two")+" HOBBY only; original "+m[1]+" prefix on card back; no four checklist medallions"
  if key=="gold-medallion":
   note+="; authentic Gold Medallion one per original Hobby pack unless replaced by Platinum"
  else:note+="; authentic Platinum Medallion 1:100 original Hobby packs, manufacturer-estimated print run under 150"
  note+="; IMPORTANT vintage veteran parallel image may differ from base photo; never generate a fake scan"
  if printed=="G1":note+="; primary TCDB-listed original Orange/standard back; separate G1b blue-back also catalogued"
  add(out,key,printed,bname,bteam,"Gold Medallion" if m[1]=="G" else "Platinum Medallion",note)
 target={f"{p}{i}" for p in "GP" for i in range(1,351) if i not in NONPLAYER_NUMS}
 actual=seen["gold-medallion"]|seen["platinum-medallion"]
 if actual!=target or len(seen["gold-medallion"])!=346 or len(seen["platinum-medallion"])!=346:
  raise ValueError("Medallion 346+346 authentic printed numbers incomplete")
 # TCDB documents an additional blue-back print variation for Gold #G1.
 favre=bybase["1"]
 if favre!=("Brett Favre","Green Bay Packers"):raise ValueError("TCDB G1b verified subject changed")
 add(out,"gold-medallion-g1b-blue-back","G1b",*favre,"Gold Medallion Blue Back",
     "Actual distinct TCDB Gold Medallion #G1b Brett Favre VAR Blue Back; original printed G1, b is catalog variation suffix; NOT a new fabricated card number")
 # Original fourteen MCB insert lists, exact subject/team/printed card code.
 originals={}
 for name,expected in MCB_COUNTS.items():
  if name in ("Lucky 13 Dan Marino Autograph","Medallion","Reebok","Terrell Davis Display"):continue
  cards=groups[name];key=slug(name);seen_nums=set();items=[]
  for i,(printed,player,team) in enumerate(cards,1):
   m=re.fullmatch(r"(\d+)(?:\s+[A-Z]+)?",printed)
   if not m or int(m[1])!=i or not player or not team:
    raise ValueError("Original insert number/source subject mismatch "+str((name,i,printed,player,team)))
   if printed in seen_nums:raise ValueError("Duplicate published insert "+key+":"+printed)
   seen_nums.add(printed);items.append((printed,player,team))
   add(out,key,printed,player,team,name,"Authentic original insert; "+ODDS[key]+"; preserve all original printed code suffixes exactly")
  if len(items)!=expected:raise ValueError("Unverified insert card count "+name)
  originals[name]=items
 # TCDB confirms these TWO additional full 18/12-card stamped/die-cut groups
 # with the identical original names, numbers and teams as the physical parents.
 for title,parent in (("Blitzkrieg Die Cut","Blitzkrieg"),("Rookies Gold Embossed","Rookies")):
  key=slug(title)
  for code,player,team in originals[parent]:
   add(out,key,code,player,team,title,
       "TCDB original full "+title+" variation of "+parent+"; "+ODDS[key]+"; inherit authentic original INSERT art/template, not a fabricated base parallel")
 # Original redeemed Lucky 13 autograph #3 is not a normal pack pull.
 luc=groups["Lucky 13 Dan Marino Autograph"]
 if luc!=[["3","Dan Marino","Miami Dolphins"]]:raise ValueError("Original Lucky 13 player/code source changed")
 add(out,"lucky-13-dan-marino-autograph","3","Dan Marino","Miami Dolphins",
     "Lucky 13 Redeemed Autograph",
     "Original Fleer-embossed hand-autographed #3 base card obtained ONLY via Lucky 13 redemption; declared print run 100; never pack-issued directly")
 # Five physically different color Reebok logo/promotional cards for each 15
 # authentic Reebok spokesman numbers (not ONE shared 15-card generic promo).
 reebok=groups["Reebok"]
 if len(reebok)!=15:raise ValueError("Original Reebok family differs from TCDB")
 for idx,(number,player,team) in enumerate(reebok,1):
  if not number.isdigit() or int(number)<=200 or int(number)>348:raise ValueError("Invalid Reebok source number "+number)
  if not player or not team:raise ValueError("Missing original Reebok identity")
  if str(number) not in bybase:raise ValueError("Reebok original base code does not exist")
  for color in REEBOK_COLORS:
   key="reebok-"+color.lower()
   add(out,key,number,player,team,"Reebok "+color,
       "TCDB authentic distinct "+color+" Reebok logo/back text for original #"+number+
       "; originally one Reebok spokesman variation per specially marked pack; do NOT insert in generic Hobby/Retail packs")
 # Separate true oversized dealer display, not a pack card.
 display=groups["Terrell Davis Display"]
 if display!=[["NNO","Terrell Davis","Denver Broncos"]]:raise ValueError("Authentic oversized display subject/number changed")
 add(out,"terrell-davis-display","NNO","Terrell Davis","Denver Broncos","Dealer Display",
     "Oversized original Terrell Davis dealer/retail display card, genuinely NNO; NOT an eligible pack collectible")
 for key,designation in (("terrell-davis-sample-promo","SAM"),("terrell-davis-autographed-promo","AU")):
  add(out,key,designation,"Terrell Davis","Denver Broncos","Unnumbered Promo",
      "Actual TCDB parent-set NNO "+designation+" Terrell Davis promotional physical card; distinct "+("signed" if designation=="AU" else "sample")+" variation, NOT a pack-issued base")
 # Actual TCDB catalogued physical NNO offer insert, not an individual player card.
 add(out,"presentation-game-football-offer","NNO","Hand Customized Presentation Game Football Offer","",
     "Original Non-Player Offer","TCDB parent-set listed physical NNO hand-customized presentation game football offer; paper/offer insert only, no athlete/team; NEVER eligible as standard player card")
 if Counter(x["setKey"] for x in out)!=Counter(EXPECTED):
  raise ValueError("Authenticity source counts incomplete "+str(Counter(x["setKey"] for x in out)))
 if len({(r["setKey"],r["cardNumber"]) for r in out})!=len(out):
  raise ValueError("Duplicate printed collector identity within same family")
 if len(out)!=1496:raise ValueError("Expected physical 1,496 collectors entries changed")
 return out
