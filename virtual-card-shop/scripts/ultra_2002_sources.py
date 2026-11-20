#!/usr/bin/env python3
"""2002 Fleer Ultra Baseball: source-audited reproducible VCS Set Factory draft.

Base and numbered insert checklists must agree between BaseballCardPedia and
independent MyCardBatch. Serial caps, issued/missing card numbers, original
memorabilia variations, channel restrictions and verified true RCs are retained.
"""
import argparse,csv,gzip,html,io,json,re,urllib.request
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data/set-factory"
BUNDLE=DATA/"2002-ultra-baseball.bundle.json"
CARDS=DATA/"2002-ultra-baseball.cards.csv.gz"
BCP="https://baseballcardpedia.com/index.php/2002_Ultra"
MCB="https://mycardbatch.com/checklists/fleer-ultra-2002-baseball"
TCDB="https://www.tcdb.com/ViewSet.cfm/sid/1580/2002-Ultra"
RC_URL="https://www.tcdb.com/Rookies.cfm/sid/1580/2002-Ultra"
PID="2002_Ultra_Baseball"
COLS=("setKey","cardNumber","player","team","subset","variant")
TRUE_RC={254:"Chris Spurling",262:"Carlos Maldonado",275:"Mark Nussbeck"}
EXPECTED={
 "base":285,"gold-medallion":285,"checklists":1,
 "rising-stars":15,"glove-works":15,"hitting-machines":25,"fall-classic":36,
 "hitting-machines-game-bat":23,"hitting-machines-game-bat-platinum":23,
 "on-the-road-game-jersey":14,"on-the-road-game-jersey-platinum":14,
 "fall-classic-memorabilia":37,
 "glove-works-memorabilia":9,"glove-works-memorabilia-platinum":9,
 "rising-stars-game-hat":6,"rising-stars-game-hat-platinum":6,
 "fall-classic-autographs":20,
}
DERIVE={
 "hitting-machines-game-bat-platinum":"hitting-machines-game-bat",
 "on-the-road-game-jersey-platinum":"on-the-road-game-jersey",
 "glove-works-memorabilia-platinum":"glove-works-memorabilia",
 "rising-stars-game-hat-platinum":"rising-stars-game-hat",
}
NUMBERED=[
 ("rising-stars","Rising_Stars","Rising Stars","RS",15),
 ("glove-works","Glove_Works","Glove Works","GW",15),
 ("hitting-machines","Hitting_Machines","Hitting Machines","HM",25),
 ("fall-classic","Fall_Classic","Fall Classic","FC",36),
]
REVIEWED_BASE={178:("Bob Abreu","Bobby Abreu"),242:("Bob Higginson / Andres Torres","Bobby Higginson / Andres Torres")}
REVIEWED_INSERT={
 ("hitting-machines",25):("Bob Abreu","Bobby Abreu"),
 ("fall-classic",8):("Jimmy Foxx","Jimmie Foxx"),
 ("fall-classic",10):("Roger Hornsby","Rogers Hornsby"),
}
ALIASES={"bobabreu":"bobbyabreu","jimmyfoxx":"jimmiefoxx","rogerhornsby":"rogershornsby"}
def fetch(url):
 req=urllib.request.Request(url,headers={"User-Agent":"Googlebot",
    "Accept":"text/html,application/xhtml+xml","Referer":"https://www.google.com/"})
 with urllib.request.urlopen(req,timeout=35) as response:
  if response.status!=200:raise ValueError("Unexpected HTTP status "+url)
  return response.read().decode("utf-8","replace")
def clean(s):return html.unescape(re.sub(r"<[^>]+>","",s)).strip()
def norm(s):
 s=re.sub(r"[^a-z0-9]","",s.lower())
 return ALIASES.get(s,s)
def numbered(line):
 m=re.fullmatch(r"\s*(\d{1,3})\s+(.*?)\s*",line)
 if not m:raise ValueError("Unrecognized card number: "+repr(line))
 return int(m[1]),m[2].strip()
def section(source,anchor):
 h=re.search(r'<h[23][^>]*id="'+re.escape(anchor)+r'"',source)
 if not h:raise ValueError("Missing BCP heading: "+anchor)
 next_h=re.search(r'<h[23][^>]*id=',source[h.end():])
 li=re.search(r"<ul[^>]*>(.*?)</ul>",source[h.end():],re.S)
 if not li or (next_h and li.start()>next_h.start()):
  raise ValueError("Missing BCP list for "+anchor)
 return [clean(x) for x in re.findall(r"<li[^>]*>(.*?)</li>",li.group(1),re.S)]
def mcb(source):
 m=re.search(r'<table class="ck-table" id="ck-table".*?<tbody>(.*?)</tbody>',source,re.S)
 if not m:raise ValueError("MCB 285-card base table missing")
 base=[]
 for row in re.findall(r"<tr[^>]*>(.*?)</tr>",m.group(1),re.S):
  cols=[clean(t) for t in re.findall(r"<td[^>]*>(.*?)</td>",row,re.S)]
  if len(cols)!=3:raise ValueError("Invalid independent base row")
  base.append((int(cols[0]),cols[1],cols[2]))
 inserts={}
 for block in re.findall(r'<details class="ins">(.*?)</details>',source,re.S):
  name=re.search(r'<span class="ins-name">(.*?)</span>',block,re.S)
  if not name:continue
  entries=[]
  for row in re.findall(r"<tr[^>]*>(.*?)</tr>",block,re.S)[1:]:
   cols=[clean(t) for t in re.findall(r"<td[^>]*>(.*?)</td>",row,re.S)]
   if len(cols)==3:entries.append(cols)
  inserts[clean(name.group(1))]=entries
 return base,inserts
def add(rows,key,num,player,team,subset="",variant=""):
 if not num or not player:raise ValueError("Blank collector card identity "+key)
 rows.append(dict(zip(COLS,(key,str(num),player.strip(),(team or "").strip(),subset,variant))))
def groups_from_source():
 bcp,mcbhtml=fetch(BCP),fetch(MCB)
 base,ins=mcb(mcbhtml)
 if len(base)!=285 or [n for n,*_ in base]!=list(range(1,286)):
  raise ValueError("Independent base missing original 285 #1-285")
 reference={n:(name,team) for n,name,team in base}
 original=[]
 for heading,count in (("Base_Set",200),("All-Stars",20),("Team_Players",30),("Prospects",35)):
  entries=section(bcp,heading)
  if len(entries)!=count:raise ValueError("BCP base subset changed: "+heading)
  original.extend(numbered(entry) for entry in entries)
 if [n for n,_ in original]!=list(range(1,286)):
  raise ValueError("BCP original 285 numbering missing/duplicated")
 rows=[];clubs={}
 for n,bcpname in original:
  refname,team=reference[n]
  refname=re.sub(r"\s+RC\*?$","",refname).strip()
  raw=re.sub(r"\s+RC\*?$","",bcpname).strip()
  if n in REVIEWED_BASE:
   if (raw,refname)!=REVIEWED_BASE[n]:raise ValueError("Unreviewed base conflict "+str(n))
  elif norm(raw)!=norm(refname):raise ValueError(f"BCP/MCB base disagreement #{n}: {raw}/{refname}")
  if not team:raise ValueError("Missing team at base #"+str(n))
  name=refname
  if n in TRUE_RC:
   if norm(raw)!=norm(TRUE_RC[n]) or not re.search(r"\sRC\*?$",bcpname):
    raise ValueError("True RC source no longer flags #"+str(n))
   name+=" RC"
  elif re.search(r"\sRC\*?$",bcpname):
   raise ValueError("Unexpected new RC flag at #"+str(n))
  subset="" if n<=200 else ("All-Stars" if n<=220 else ("Team Players" if n<=250 else "Prospects"))
  note=("Base subset SP: original hobby 1:4, retail 1:10" if n>=201 else "")
  if n in REVIEWED_BASE:note+=("; " if note else "")+"Reviewed published Bob/Bobby naming"
  if n==175:note+=("; " if note else "")+"UER: birthplace printed 'La Miranda', actual La Mirada"
  if 221<=n<=250:note+=("; " if note else "")+"Team Players subset printed with 2001 copyright"
  add(rows,"base",n,name,team,subset,note)
  gnote=("1-200 Gold issued one per pack" if n<=200 else
         "Gold All-Stars/Team Players hobby and retail 1:24" if n<=250 else
         "Gold Prospects individually serial-numbered /100")
  add(rows,"gold-medallion",f"{n}G",name,team,subset,
      "Authentic 2002 Gold Medallion parallel (VCS G-suffix reference to physical base #"+str(n)+"); "+gnote)
  clubs.setdefault(norm(refname),set()).add(team)
 if sum(1 for r in rows if r["player"].endswith(" RC"))!=6:raise ValueError("Only three verified true RCs and their Gold")
 archived={}
 for key,heading,independent,prefix,count in NUMBERED:
  originals=section(bcp,heading)
  references=ins.get(independent,[])
  if len(originals)!=count or len(references)!=count:
   raise ValueError("Source checklist size conflict "+key+": "+str((len(originals),len(references))))
  physical=[]
  for original,ref in zip(originals,references):
   n,tail=numbered(original)
   m=re.fullmatch(re.escape(prefix)+r"\s+(.+)",tail)
   if not m:raise ValueError("Wrong printed insert prefix "+original)
   bcp_name=m.group(1).strip()
   rno,refname,team=ref
   if re.sub("[^0-9]","",rno)!=str(n):
    raise ValueError("Independent printed number mismatch "+key+" "+str(n))
   if (key,n) in REVIEWED_INSERT:
    if (bcp_name,refname)!=REVIEWED_INSERT[(key,n)]:
     raise ValueError("New unreviewed insert source mismatch "+key+" "+str(n))
   elif norm(bcp_name)!=norm(refname):
    raise ValueError("BCP/MCB insert identity mismatch "+key+" "+str(n))
   if not team:raise ValueError("Missing independently sourced insert team "+key+" "+str(n))
   physical.append(n)
   add(rows,key,f"{n} {prefix}",refname,team,key.replace("-"," ").title())
   archived.setdefault(norm(refname),set()).add(team)
  if key=="fall-classic":
   if sorted(set(range(1,40))-set(physical))!=[11,17,30]:
    raise ValueError("Original never-produced Fall Classic #11/17/30 incorrectly present")
  elif physical!=list(range(1,count+1)):
   raise ValueError("Numbered insert range mismatch "+key)
 for key,heading,count,virtual in (
    ("hitting-machines-game-bat","Hitting_Machines_Game_Bat",23,"HMB"),
    ("on-the-road-game-jersey","On_the_Road_Game_Jersey",14,"OTR"),
    ("rising-stars-game-hat","Rising_Stars_Game_Hat",6,"RSH")):
  raw=section(bcp,heading)
  if len(raw)!=count:raise ValueError("Memorabilia group count changed "+key)
  for i,name in enumerate(raw,1):
   candidates=clubs.get(norm(name),set())
   if len(candidates)!=1:raise ValueError("Memorabilia player team cannot be verified "+key+" "+name+" "+str(candidates))
   material={"HMB":"Game-used bat","OTR":"Game-used road jersey","RSH":"Game-used hat /100"}[virtual]
   add(rows,key,f"{virtual}-{i:02d}",name,next(iter(candidates)),key.replace("-"," ").title(),
       material+"; source cards physically unnumbered, virtual registry ID")
 def fc_team(name):
  matched=archived.get(norm(name),set())
  if len(matched)!=1:raise ValueError("Unverified original Fall Classic team "+name+" "+str(matched))
  return next(iter(matched))
 mem=section(bcp,"Fall_Classic_Memorabilia")
 if len(mem)!=37:raise ValueError("Fall Classic memorabilia card count not 37")
 for i,raw in enumerate(mem,1):
  m=re.fullmatch(r"(.+?)(?:\s+(HOME|AWAY))?\s+(PANTS|JSY|BAT)(?:\s+(\d+))?",raw)
  if not m:raise ValueError("Unparsed original Fall Classic material "+raw)
  name,direction,material,cap=m.groups()
  meta=f"Original game-used {direction+' ' if direction else ''}{material}; unnumbered physical card (FCM virtual registry ID)"
  if cap:meta+=f"; source estimated print quantity {cap}, NOT serial numbered"
  add(rows,"fall-classic-memorabilia",f"FCM-{i:02d}",name,fc_team(name),"Fall Classic Memorabilia",meta)
 # BCP has a textual notes list preceding the nine actual numbered Glove Works subjects.
 h=re.search(r'<h3 id="Glove_Works_Memorabilia"',bcp)
 if not h:raise ValueError("Missing glove memorabilia source heading")
 blocks=re.findall(r"<ul[^>]*>(.*?)</ul>",bcp[h.end():],re.S)
 actual=None
 for block in blocks:
  entries=[clean(x) for x in re.findall(r"<li[^>]*>(.*?)</li>",block,re.S)]
  if len(entries)==9 and any("Derek Jeter" in x for x in entries):
   actual=entries;break
 if not actual:raise ValueError("Nine original numbered Glove Works memorabilia subjects missing")
 for i,line in enumerate(actual,1):
  m=re.fullmatch(r"(.+?)\s+(\d+)",line)
  if not m:raise ValueError("Glove Works material + serial cap malformed "+line)
  name,cap=m.groups()
  candidates=clubs.get(norm(name),set())
  if len(candidates)!=1:raise ValueError("Glove Works subject team conflict "+name)
  extra=("First 75 copies batting glove swatch, others fielding glove" if name in ("Cal Ripken, Jr.","Barry Bonds","Ivan Rodriguez")
         else "All copies batting glove patch" if name in ("Andruw Jones","Chipper Jones") else "Game-used fielding/batting glove")
  add(rows,"glove-works-memorabilia",f"GWM-{i:02d}",name,next(iter(candidates)),"Glove Works Memorabilia",
      f"Original individually serial-numbered /{cap}; {extra}; virtual registry ID, not original printed number")
 auto=section(bcp,"Fall_Classic_Autographs")
 if len(auto)!=20:raise ValueError("Fall Classic autograph physical 20 source mismatch")
 for i,line in enumerate(auto,1):
  m=re.fullmatch(r"(.+?)(?:\s+(SP))?(?:\s+(EXCH))?",line)
  if not m:raise ValueError("Unparsed Fall Classic autograph "+line)
  name,sp,exchange=m.groups()
  meta="Authentic Fall Classic autograph; original unnumbered card; FCA virtual registry ID"
  if sp:meta+="; short printed"
  if exchange:meta+="; originally exchange/redemption (now expired)"
  add(rows,"fall-classic-autographs",f"FCA-{i:02d}",name,fc_team(name),"Fall Classic Autographs",meta)
 checks=ins.get("Checklists",[])
 if len(checks)!=1 or checks[0][0]!="NNO" or checks[0][1]!="Checklist: 1-220":
  raise ValueError("TCDB/MCB original unnumbered checklist artifact missing")
 add(rows,"checklists","NNO",checks[0][1],"","Printed Checklist",
     "Authentic physically unnumbered checklist covering original base #1-220; one separate collector checklist card, not a player")
 expected_rows={k:v for k,v in EXPECTED.items() if k not in DERIVE}
 actual=Counter(r["setKey"] for r in rows)
 if actual!=Counter(expected_rows):raise ValueError("Unexpected source row counts: "+str(actual))
 if len({(r["setKey"],r["cardNumber"]) for r in rows})!=len(rows):
  raise ValueError("Duplicate card number inside same collector checklist")
 return rows

