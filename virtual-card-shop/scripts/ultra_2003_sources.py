#!/usr/bin/env python3
"""Source-audited 2003 Fleer Ultra Baseball Set Factory draft; unreleased."""
import argparse,csv,gzip,html,io,json,re,urllib.request
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; DATA=ROOT/"data/set-factory"
BUNDLE=DATA/"2003-ultra-baseball.bundle.json"; CARDS=DATA/"2003-ultra-baseball.cards.csv.gz"
BCP="https://baseballcardpedia.com/index.php/2003_Ultra"
MCB="https://mycardbatch.com/checklists/fleer-ultra-2003-baseball"
TCDB="https://www.tcdb.com/ViewSet.cfm/sid/1667/2003-Ultra"
UPDATE="https://www.tcdb.com/Checklist.cfm/sid/289946/2003-Fleer-Rookies-Greats-2003-Ultra-Rookie-Update"
PID="2003_Ultra_Baseball"; FIELDS=("setKey","cardNumber","player","team","subset","variant")
FAMILIES=[
 ("double-up","Double_Up","Double Up",16),
 ("moonshots","Moonshots","Moonshots",20),
 ("photo-effex","Photo_Effex","Photo Effex",20),
 ("when-it-was-a-game","When_it_was_a_Game","When It Was a Game",40),
 ("back-2-back","Back_2_Back","Back 2 Back",17)]
EXPECTED={"base":250,"gold-medallion":250,"rookie-update-external":15,
"double-up":16,"moonshots":20,"photo-effex":20,"photo-effex-gold":20,
"when-it-was-a-game":40,"back-2-back":17,
"moonshots-memorabilia":20,"back-2-back-memorabilia":17,
"back-2-back-memorabilia-gold":17,
"double-up-memorabilia":16,"when-it-was-a-game-used":12,"checklists":1}
NAME_DIFF_BASE={70:("Tony Armas","Tony Armas Jr"),81:("Bob Abreu","Bobby Abreu"),
 191:("Jose Cruz","Jose Cruz Jr"),235:("Will Nieves","Wil Nieves")}
NAME_DIFF_INSERT={("double-up",7):("Ichiro / Hideo Nomo","Ichiro Suzuki / Hideo Nomo"),
 ("double-up",14):("Ichiro / Ken Griffey, Jr.","Ichiro Suzuki / Ken Griffey, Jr"),
 ("photo-effex",7):("Ichiro","Ichiro Suzuki"),
 ("back-2-back",15):("Ichiro","Ichiro Suzuki")}
# The complete external TCDB 15-item checklist; each player/team is source-audited.
UPDATE_TCDB=[
("U-251","Chien-Ming Wang","New York Yankees"),
("U-252","Rickie Weeks","Milwaukee Brewers"),
("U-253","Brandon Webb","Arizona Diamondbacks"),
("U-254","Hideki Matsui","New York Yankees"),
("U-255","Mike Hessman","Atlanta Braves"),
("U-256","Ryan Wagner","Cincinnati Reds"),
("U-257","Matt Kata","Arizona Diamondbacks"),
("U-258","Edwin Jackson","Los Angeles Dodgers"),
("U-259","Jose Contreras","New York Yankees"),
("U-260","Delmon Young","Tampa Bay Devil Rays"),
("U-261","Bo Hart","St. Louis Cardinals"),
("U-262","Jeff Duncan","New York Mets"),
("U-263","Robby Hammock","Arizona Diamondbacks"),
("U-264","Jeremy Bonderman","Detroit Tigers"),
("U-265","Clint Barmes","Colorado Rockies")]
def request(url):
 req=urllib.request.Request(url,headers={"User-Agent":"Googlebot",
 "Accept":"text/html,application/xhtml+xml","Referer":"https://www.google.com/"})
 with urllib.request.urlopen(req,timeout=40) as response:
  if response.status!=200:raise ValueError("Bad source response")
  return response.read().decode("utf8","replace")
def clean(s):return html.unescape(re.sub(r"<[^>]*>","",s)).strip()
def norm(s):
 s=s.lower().replace("ichiro suzuki","ichiro").replace("bob abreu","bobby abreu")
 return re.sub(r"[^a-z0-9]","",s)
def section(src,name):
 h=re.search(r'<h[23][^>]*id="'+re.escape(name)+r'"',src)
 if not h:raise ValueError("BCP heading unavailable "+name)
 tail=src[h.end():];u=re.search(r"<ul[^>]*>(.*?)</ul>",tail,re.S)
 next_head=re.search(r"<h[23][^>]*id=",tail)
 if not u or (next_head and next_head.start()<u.start()):
  raise ValueError("Missing source list "+name)
 return [clean(x) for x in re.findall(r"<li[^>]*>(.*?)</li>",u[1],re.S)]
def mcb_tables(src):
 t=re.search(r'<table class="ck-table" id="ck-table".*?<tbody>(.*?)</tbody>',src,re.S)
 if not t:raise ValueError("Independent base checklist missing")
 def parsed_rows(text):
  out=[]
  for tr in re.findall(r"<tr[^>]*>(.*?)</tr>",text,re.S):
   fields=[clean(x) for x in re.findall(r"<td[^>]*>(.*?)</td>",tr,re.S)]
   if len(fields)==3:out.append(fields)
  return out
 base=parsed_rows(t[1])
 groups={}
 for block in re.findall(r'<details class="ins">(.*?)</details>',src,re.S):
  tag=re.search(r'<span class="ins-name">(.*?)</span>',block,re.S)
  if tag:
   rows=re.findall(r"<tr[^>]*>(.*?)</tr>",block,re.S)
   groups[clean(tag[1])]=parsed_rows("".join("<tr>"+r+"</tr>" for r in rows[1:]))
 return base,groups
def nparse(s):
 m=re.fullmatch(r"(\d+)\s+(.+)",s)
 if not m:raise ValueError("Unparsed original numbered checklist "+s)
 return int(m[1]),m[2].strip()
def put(rows,key,number,player,team,subset="",variant=""):
 if not number or not player:raise ValueError("Missing collector card identity")
 rows.append(dict(zip(FIELDS,(key,str(number),player.strip(),(team or "").strip(),subset,variant))))
def emit():
 bcp=request(BCP); mcb=request(MCB)
 base,groups=mcb_tables(mcb)
 if len(base)!=250 or [int(r[0]) for r in base]!=list(range(1,251)):
  raise ValueError("Independent 250 base #1-250 changed")
 original=[]
 for heading,count in (("Base_Set",200),("All-Stars",20),
                       ("2002_Ultra_Rookies",20),("Prospects",10)):
  subset=section(bcp,heading)
  if len(subset)!=count:raise ValueError("BCP base subset changed "+heading)
  original.extend(nparse(raw) for raw in subset)
 if [x[0] for x in original]!=list(range(1,251)):raise ValueError("Missing BCP base #1-250")
 gold=groups.get("Gold Medallion",[])
 if len(gold)!=250:raise ValueError("Missing genuine Gold Medallion 250")
 rows=[];teams={}
 def addteam(name,club):
  if name and club:teams.setdefault(norm(name),set()).add(club)
 def addteams(name,club):
  names=name.split(" / ");clubs=club.split(" / ")
  if len(clubs)==1 and len(names)>1:clubs*=len(names)
  if len(names)!=len(clubs):raise ValueError("Misaligned dual-player teams "+name+"/"+club)
  for n,c in zip(names,clubs):addteam(n,c)
 for i,(n,source_name) in enumerate(original,1):
  number,player,team=base[i-1];gn,gname,gteam=gold[i-1]
  if int(number)!=n or int(gn)!=n or team!=gteam or norm(player) not in norm(gname):
   raise ValueError(f"Independent base/Gold conflict at #{n}")
  if n in NAME_DIFF_BASE:
   if (source_name,player)!=NAME_DIFF_BASE[n]:raise ValueError("Name discrepancy changed #"+str(n))
  elif norm(source_name)!=norm(player):
   raise ValueError("Unreviewed base subject discrepancy "+str(n)+" "+source_name+"/"+player)
  subset=("" if n<=200 else "All-Stars" if n<=220 else
          "2002 Ultra Rookies Design" if n<=240 else "2003 Prospects")
  meta=("2002 Ultra design retained for 2002 Rookies subset" if 221<=n<=240 else "")
  if n in NAME_DIFF_BASE:meta+=("; " if meta else "")+"Reviewed source name/canonical surname"
  if n==249:
   if norm(player)!=norm("Dave Pember"):raise ValueError("TCDB true rookie identity changed")
   player+=" RC"
  put(rows,"base",n,player,team,subset,meta)
  goldnote=("Original hobby one-per-pack standard Gold" if n<=200 else
            "All-Star Gold, hobby only 1:24" if n<=220 else
            "Rookie/Prospects Gold, hobby only 1:24")
  put(rows,"gold-medallion",n,player,team,subset,
      "Authentic Gold Medallion, original base number (no invented G suffix); "+goldnote)
  addteam(player.removesuffix(" RC"),team)
 for key,head,label,count in FAMILIES:
  listed=section(bcp,head);independent=groups.get(label,[])
  if len(listed)!=count or len(independent)!=count:
   raise ValueError("Numbered insert source count conflict: "+key)
  for idx,(src,reference) in enumerate(zip(listed,independent),1):
   n,rest=nparse(src); rno,rname,team=reference
   if n!=idx or not team:raise ValueError("Numbered insert missing "+key+str(idx))
   if key=="double-up":
    original_name=rest
    number=f"{n} DU"
    if rno!=number:raise ValueError("Double Up original printed number mismatch "+str(n))
   else:
    mt=re.fullmatch(r"(B2B|MS|PE|WG|WH)\s+(.+)",rest)
    if not mt:raise ValueError("Original printed prefix absent "+src)
    suffix,original_name=mt.groups()
    if suffix=="B2B" and key!="back-2-back" or suffix=="MS" and key!="moonshots" or suffix=="PE" and key!="photo-effex" or suffix in ("WG","WH") and key!="when-it-was-a-game":
     raise ValueError("Insert prefix conflicts with physical group "+src)
    # BCP misprints WH for the final three; independently cataloged WG is the physical suffix.
    if key=="when-it-was-a-game" and n in (38,39,40) and suffix=="WH" and rno.replace(" ","")==f"{n}WG":
     suffix="WG"
    number=f"{n} {suffix}"
    if rno.replace(" ","")!=number.replace(" ",""):
     raise ValueError("Independent insert printed number mismatch "+number+"/"+rno)
   if (key,n) in NAME_DIFF_INSERT:
    expected=NAME_DIFF_INSERT[(key,n)]
    if (original_name,rname)!=expected:raise ValueError("Reviewed insert name mismatch "+key+str(n))
   elif norm(original_name)!=norm(rname):
    raise ValueError("Source insert subject conflict "+key+str(n)+": "+original_name+"/"+rname)
   meta=("Original serial-numbered /1000" if key=="back-2-back" else "")
   put(rows,key,number,rname,team,label,meta)
   addteams(rname,team)
   if key=="photo-effex":
    put(rows,"photo-effex-gold",number,rname,team,label+" Gold",
       "Authentic original Photo Effex Gold serial-numbered /25, not base Gold Medallion")
 if len(teams)==0:raise ValueError("No independent subject/team map")
 def team_for(name):
  clubs=teams.get(norm(name),set())
  if len(clubs)!=1:raise ValueError("Game-used subject team not uniquely verified "+name+": "+str(clubs))
  return next(iter(clubs))
 for key,section_id,count in (
     ("moonshots-memorabilia","Moonshots_Memorabilia",20),
     ("back-2-back-memorabilia","Back_2_Back_Memorabilia",17)):
  entries=section(bcp,section_id)
  if len(entries)!=count:raise ValueError("Source game-used group count changed "+key)
  for line in entries:
   mt=re.fullmatch(r"([A-Z0-9]+)\s+(.+?)\s+(BAT|JSY|PANTS|BASE|HAT)",line)
   if not mt:raise ValueError("Unrecognized game-used printed number/material "+line)
   num,name,material=mt.groups()
   cap=500 if key=="back-2-back-memorabilia" else None
   note="Authentic original game-used "+material
   if cap:note+="; serial-numbered /500"
   put(rows,key,num,name,team_for(name),key.replace("-"," ").title(),note)
   if key=="back-2-back-memorabilia":
    put(rows,"back-2-back-memorabilia-gold",num,name,team_for(name),"Back 2 Back Memorabilia Gold",
       "Original gold version of game-used "+material+", serial-numbered /50")
 entries=section(bcp,"Double_Up_Memorabilia")
 if len(entries)!=16:raise ValueError("Double Up Memorabilia original count not 16")
 for line in entries:
  mt=re.fullmatch(r"(\d+)\s+(.+?)\s+(BAT|BASE|PANTS|JSY|HAT)\s*/\s*(BAT|BASE|PANTS|JSY|HAT)",line)
  if not mt:raise ValueError("Malformed numbered dual game-used "+line)
  n,players,material1,material2=mt.groups()
  names=players.split(" / ")
  if len(names)!=2:raise ValueError("Malformed dual-player memorabilia "+line)
  club=team_for(names[0])+" / "+team_for(names[1])
  put(rows,"double-up-memorabilia",f"{n} DU",players,club,"Double Up Memorabilia",
      f"Authentic original dual game-used {material1} / {material2}; serial-numbered /100")
 entries=section(bcp,"When_It_Was_A_Game_Used")
 if len(entries)!=12:raise ValueError("When It Was a Game Used 12 missing")
 for line in entries:
  mt=re.fullmatch(r"(\d+)\s+(.+?)\s+(PANTS|BAT|BASE|JSY)\s+(\d+)",line)
  if not mt:raise ValueError("Invalid historical memorabilia original "+line)
  n,name,material,print_limit=mt.groups()
  put(rows,"when-it-was-a-game-used",n,name,team_for(name),
      "When It Was A Game Used",
      f"Authentic original game-used {material}, numbered /{print_limit}")
 checks=groups.get("Checklists",[])
 if len(checks)!=1 or checks[0][0]!="NNO" or checks[0][1]!="Checklist: 1-186":
  raise ValueError("Missing original Ultra printed unnumbered checklist")
 put(rows,"checklists","NNO",checks[0][1],"","Original Checklist","Physical unnumbered checklist, not a player")
 # These were part of a different product's wax. TCDB maintains an independent 15-card checklist.
 ext=section(bcp,"Rookies_&amp;_Greats_Prospects")
 if len(ext)!=15:raise ValueError("Ultra 2003 later external update missing")
 for src,ref in zip(ext,UPDATE_TCDB):
  mt=re.fullmatch(r"(U-\d{3})\s+(.+?)\s+RC",src)
  if not mt:raise ValueError("Invalid Ultra update issued number "+src)
  num,bcname=mt.groups();rno,pname,team=ref
  if num!=rno or norm(bcname)!=norm(pname):
   # BaseBallCardPedia calls player Michael Hessman; TCDB uses Mike Hessman.
   if not (num=="U-255" and bcname=="Michael Hessman" and pname=="Mike Hessman"):
    raise ValueError("TCDB independently sourced Ultra Update disagreement "+src+"/"+str(ref))
  put(rows,"rookie-update-external",num,pname+" RC",team,
      "2003 Fleer Rookies & Greats Ultra Rookie Update",
      "Authenticated Ultra design continuation, original U- number, serial-numbered /1500; released in 2003 Fleer Rookies & Greats ONLY, never 2003 Ultra wax")
 counts=Counter(r["setKey"] for r in rows)
 if counts!=Counter(EXPECTED):raise ValueError("Original subset records/counts conflict: "+str(counts))
 if len(set((r["setKey"],r["cardNumber"]) for r in rows))!=len(rows):raise ValueError("Duplicate physical/registry number within subset")
 if any(not x["player"] or (not x["team"] and x["setKey"]!="checklists") for x in rows):
  raise ValueError("Unverified subject/team still present")
 return rows

