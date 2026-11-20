#!/usr/bin/env python3
"""Audited original 2005 Fleer Ultra Baseball checklists (BCP + MyCardBatch + TCDB)."""
import re,html,urllib.request
from collections import Counter
BCP="https://baseballcardpedia.com/index.php/2005_Ultra"
MCB="https://mycardbatch.com/checklists/fleer-ultra-2005-baseball"
TCDB="https://www.tcdb.com/ViewSet.cfm/sid/1883/2005-Ultra"
P="2005_Ultra_Baseball"
EXPECTED_MCB={"3 Kings Jersey Triple Swatch":10,"Follow the Leader":15,
"Follow the Leader Jersey":15,"Follow the Leader Jersey UltraSwatch":14,
"Home Run Kings":15,"RBI Kings":15,"Season Crowns Autographs":34,
"Season Crowns Game Used":50,"Strikeout Kings":15,
"Strikeout Kings Jersey Gold Ultra Swatch":15,"Strikeout Kings Jersey Platinum":15,
"Ultra Kings Gold":45,"Ultra Kings Jersey":52,
"Ultra Kings Jersey UltraSwatch Gold":30}
DISCREPANCIES={53:("Alexis Rios","Alex Rios"),137:("Ichiro Suzuki","Ichiro")}
AUTO_TYPO={"Albett Pujols":"Albert Pujols"}
def norm(x):
 return re.sub(r"[^a-z0-9]","",x.lower())
def clean(x):return html.unescape(re.sub(r"<[^>]+>","",x)).strip()
def fetch(url):
 req=urllib.request.Request(url,headers={"User-Agent":"Googlebot","Referer":"https://www.google.com/","Accept":"text/html,application/xhtml+xml"})
 with urllib.request.urlopen(req,timeout=35) as r:
  if r.status!=200:raise ValueError("Source HTTP changed")
  return r.read().decode("utf8","replace")
def bcp_lists(bcp,key):
 h=re.search(r'<h[23][^>]*id="'+re.escape(key)+r'"',bcp)
 if not h:raise ValueError("Missing BaseballCardPedia heading: "+key)
 nxt=re.search(r'<h[23][^>]*id=',bcp[h.end():])
 block=bcp[h.end():h.end()+nxt.start()] if nxt else bcp[h.end():]
 return [[clean(x) for x in re.findall(r"<li[^>]*>(.*?)</li>",ul,re.S)] for ul in re.findall(r"<ul[^>]*>(.*?)</ul>",block,re.S)]
def mcb_tables(s):
 base_match=re.search(r'<table class="ck-table" id="ck-table".*?<tbody>(.*?)</tbody>',s,re.S)
 if not base_match:raise ValueError("MCB full base table missing")
 def parse_rows(fragment):
  result=[]
  for tr in re.findall(r"<tr[^>]*>(.*?)</tr>",fragment,re.S):
   columns=[clean(x) for x in re.findall(r"<td[^>]*>(.*?)</td>",tr,re.S)]
   if len(columns)==3:result.append(columns)
  return result
 base=parse_rows(base_match[1]);groups={}
 for block in re.findall(r'<details class="ins">(.*?)</details>',s,re.S):
  header=re.search(r'<span class="ins-name">(.*?)</span>',block,re.S)
  if not header:continue
  trs=re.findall(r"<tr[^>]*>(.*?)</tr>",block,re.S)
  groups[clean(header[1])]=parse_rows("".join("<tr>"+tr+"</tr>" for tr in trs[1:]))
 if {name:len(rows) for name,rows in groups.items()}!=EXPECTED_MCB:
  raise ValueError("Independent insert families changed: "+str({n:len(x) for n,x in groups.items()}))
 return base,groups
def validate(base,groups,bcp):
 bcp_base=bcp_lists(bcp,"Base_Set");bcp_rookies=bcp_lists(bcp,"All-Rookie")
 if len(bcp_base)!=1 or len(bcp_base[0])!=200 or len(bcp_rookies)!=1 or len(bcp_rookies[0])!=20:
  raise ValueError("Original BCP 200 veterans +20 All-Rookie incomplete")
 originals=bcp_base[0]+bcp_rookies[0]
 if len(base)!=220:raise ValueError("Original 220 MCB base incomplete")
 canonical={}
 for i, (source,ref) in enumerate(zip(originals,base),1):
  m=re.fullmatch(r"(\d+)\s+(.+)",source)
  if not m or int(m[1])!=i or int(ref[0])!=i or not ref[1] or not ref[2]:
   raise ValueError(f"Base #{i} corrupt in sources")
  if norm(m[2])!=norm(ref[1]):
   if i not in DISCREPANCIES or (m[2],ref[1])!=DISCREPANCIES[i]:
    raise ValueError(f"Unreviewed base discrepancy #{i}: {m[2]}/{ref[1]}")
  canonical[i]=(ref[1],ref[2])
 return canonical
def numbered(bcp,groups):
 templates=[("follow-the-leader","Follow_the_Leader",0,"Follow the Leader","FL",15),
 ("home-run-kings","Kings",0,"Home Run Kings","HK",15),
 ("strikeout-kings","Kings",1,"Strikeout Kings","SK",15),
 ("rbi-kings","Kings",2,"RBI Kings","RK",15)]
 output={}
 for key,heading,index,independent,prefix,n in templates:
  li=bcp_lists(bcp,heading)
  if len(li)<=index or len(li[index])!=n or len(groups[independent])!=n:
   raise ValueError("BCP/MCB numbered insert incomplete "+key)
  out=[]
  for i,(source,ref) in enumerate(zip(li[index],groups[independent]),1):
   m=re.fullmatch(r"(\d+)\s+([A-Z]+)\s+(.+)",source)
   if not m or int(m[1])!=i or m[2]!=prefix or re.sub(r"[^0-9]","",ref[0])!=str(i):
    raise ValueError("Printed numbered insert mismatch: "+source+" / "+str(ref))
   a,b=m[3],ref[1]
   if norm(a)!=norm(b):
    if (a,b) not in (("Ichiro Suzuki","Ichiro"),):
     raise ValueError("Unreviewed insert name difference "+str((key,i,a,b)))
   if not ref[2]:raise ValueError("Missing insert team")
   out.append((ref[0],ref[1],ref[2],f"Original printed {prefix} insert; source # {i}"))
  output[key]=out
 # Ultra Kings Gold 45: original printed 1 UK...45 UK; first 15 SK, next 15 RK, last 15 HK.
 gold=groups["Ultra Kings Gold"]
 if len(gold)!=45:raise ValueError("45 Gold Kings incomplete")
 all_kings=output["strikeout-kings"]+output["rbi-kings"]+output["home-run-kings"]
 out=[]
 for i,(ref,orig) in enumerate(zip(gold,all_kings),1):
  if ref[0]!=f"{i} UK" or norm(ref[1])!=norm(orig[1]) or ref[2]!=orig[2]:
   raise ValueError("Gold Kings player, team, group order discrepancy "+str((i,ref,orig)))
  out.append((ref[0],ref[1],ref[2],"Authentic Ultra Kings Gold, hobby-only, individually serial-numbered /50"))
 output["ultra-kings-gold"]=out
 output["follow-the-leader-die-cut"]=[(n,p,t,v+"; authentic specially-marked retail die-cut variation") for n,p,t,v in output["follow-the-leader"]]
 return output
def season(bcp,base,groups):
 li=bcp_lists(bcp,"Season_Crowns")
 if tuple(map(len,li[:5]))!=(3,50,5,14,34):
  raise ValueError("BCP Season Crowns 50 game-used/5 Copper auto/14 Gold auto/34 Platinum auto changed")
 independent_gu=groups["Season Crowns Game Used"]
 out={}
 game=[]
 for raw,ref in zip(li[1],independent_gu):
  m=re.fullmatch(r"(\d+)\s+(.+)",raw)
  if not m or int(m[1])!=int(ref[0]) or norm(m[2])!=norm(ref[1]) or not ref[2]:
   raise ValueError("Season Crowns game-used original identity mismatch "+str((raw,ref)))
  game.append(ref)
 for key,cap in [("season-crowns-game-used-copper",399),("season-crowns-game-used-gold",99),("season-crowns-game-used-platinum-patch",25)]:
  out[key]=[(n,p,t,f"Original Season Crowns game-used {key.split('-')[-1]}, hobby only; serial-numbered /{cap}") for n,p,t in game]
 bcp_plat=li[4];mcb_plat=groups["Season Crowns Autographs"]
 if len(mcb_plat)!=34:raise ValueError("Missing Platinum 34 autograph entries")
 autos={}
 for key,index in [("season-crowns-autographs-copper",2),("season-crowns-autographs-gold",3),("season-crowns-autographs-platinum",4)]:
  items=[]
  for raw in li[index]:
   m=re.fullmatch(r"(\d+)\s+(.+?)\s+(\d+)",raw)
   if not m:raise ValueError("BCP autograph serial cap/identity missing "+raw)
   n,player,cap=m.groups();n=int(n)
   if player in AUTO_TYPO:player=AUTO_TYPO[player]
   if n not in base or norm(base[n][0])!=norm(player):
    raise ValueError("BCP autograph subject/player mismatch "+raw+" / "+str(base.get(n)))
   if key.endswith("-platinum"):
    ref=next((r for r in mcb_plat if r[0]==str(n)),None)
    if not ref or norm(ref[1])!=norm(player) or ref[2]!=base[n][1]:
     raise ValueError("Original 34 Platinum autographs not cross-verified "+raw)
   items.append((str(n),player,base[n][1],f"Original hobby-only Season Crowns autograph {key.split('-')[-1]}; actual serial-numbered /{cap}"))
  autos[key]=items
 out.update(autos)
 out["season-crowns-autographs-masterpiece"]=[
  (n,p,t,"Authentic Season Crowns autograph Masterpiece; one-of-one; same 34 original autograph subjects") for n,p,t,v in autos["season-crowns-autographs-platinum"]]
 return out
def follow_jerseys(bcp,groups):
 li=bcp_lists(bcp,"Follow_the_Leader_Jersey")
 if tuple(map(len,li[:2]))!=(5,14):raise ValueError("BCP Follow Leader original 14 subjects/5 materials changed")
 independent={r[0]:r for r in groups["Follow the Leader Jersey"]}
 ultrag={r[0]:r for r in groups["Follow the Leader Jersey UltraSwatch"]}
 if set(independent)-{"FLJ-MP"}!=set(ultrag):
  raise ValueError("Unexpected duplicate in MCB Follow Leader jersey list "+str(set(independent)-set(ultrag)))
 out={k:[] for k in ["follow-the-leader-jersey-copper","follow-the-leader-jersey-red",
 "follow-the-leader-jersey-gold","follow-the-leader-jersey-platinum-patch","follow-the-leader-jersey-ultraswatch"]}
 physical=set()
 for line in li[1]:
  m=re.fullmatch(r"(FLJ-\w+)\s+(.+?)\s+(\d+)",line)
  if not m:raise ValueError("Unparsed original Follow Leader jersey "+line)
  no,player,cap=m.groups()
  ref=independent.get(no);swatch=ultrag.get(no)
  if not ref or not swatch or norm(ref[1])!=norm(player) or norm(swatch[1])!=norm(player) or ref[2]!=swatch[2]:
   raise ValueError("Follow Leader source/code/team/subject mismatch "+line)
  physical.add(no)
  for key,description in [
    ("follow-the-leader-jersey-copper","Authentic game-used Copper jersey; hobby-only"),
    ("follow-the-leader-jersey-red","Authentic game-used Red jersey; retail-only, 1:48"),
    ("follow-the-leader-jersey-gold","Authentic game-used Gold jersey; serial-numbered /250"),
    ("follow-the-leader-jersey-platinum-patch","Authentic Platinum game-used jersey patch; serial-numbered /99"),
    ("follow-the-leader-jersey-ultraswatch",f"Authentic game-used UltraSwatch; numbered /{cap}, the player's uniform number")]:
   out[key].append((no,ref[1],ref[2],description))
 if len(physical)!=14 or set(ultrag)!=physical:
  raise ValueError("Follow Leader jersey physical 14 not reconciled")
 return out
def king_jerseys(bcp,groups):
 li=bcp_lists(bcp,"Kings_Jerseys")
 if tuple(map(len,li[:2]))!=(3,45):
  raise ValueError("BCP authentic Kings jersey 45 subject roster changed")
 lookup={}
 for label in ("Ultra Kings Jersey","Strikeout Kings Jersey Platinum"):
  for no,name,team in groups[label]:
   lookup[(no,norm(name))]=(name,team)
 swatch={}
 for label in ("Ultra Kings Jersey UltraSwatch Gold","Strikeout Kings Jersey Gold Ultra Swatch"):
  for no,name,team in groups[label]:
   if no in swatch:raise ValueError("Duplicate documented UltraSwatch code "+no)
   swatch[no]=(name,team)
 if len(swatch)!=45:raise ValueError("Independent Gold UltraSwatch must contain 30 +15=45")
 out={k:[] for k in ("kings-jersey-gold","kings-jersey-platinum-patch","kings-jersey-gold-ultraswatch")}
 physical=set()
 for line in li[1]:
  m=re.fullmatch(r"(UK[JI]-[A-Z]+)\s+(.+?)\s+(\d+)",line)
  if not m:raise ValueError("BCP Kings source numbering unparsed: "+line)
  no,player,cap=m.groups()
  if no=="UKI-MTX" and player=="Mark Teixeira":no="UKJ-MTX"
  if no=="UKJ-SC" and player=="Scott Rolen":no="UKJ-SR"
  ref=lookup.get((no,norm(player)))
  if not ref:raise ValueError("Independent Kings jersey code/player missing "+str((no,player)))
  source_name,team=ref;othercode="UKJU-"+no.split("-",1)[1]
  mcb_swatch=swatch.get(othercode)
  if not mcb_swatch or norm(mcb_swatch[0])!=norm(player) or mcb_swatch[1]!=team:
   raise ValueError("Gold UltraSwatch independent code/player/team mismatch "+str((othercode,player,team,mcb_swatch)))
  if no in physical:raise ValueError("Duplicate after BCP jersey code corrections "+no)
  physical.add(no)
  out["kings-jersey-gold"].append((no,source_name,team,"Original game-used Kings Gold jersey, serial-numbered /150"))
  out["kings-jersey-platinum-patch"].append((no,source_name,team,"Original Kings Platinum game-used patch, numbered /25"))
  out["kings-jersey-gold-ultraswatch"].append((othercode,source_name,team,f"Original Kings Gold UltraSwatch, numbered /{cap}, player's original jersey number"))
 if len(physical)!=45 or set(swatch)!={t[0] for t in out["kings-jersey-gold-ultraswatch"]}:
  raise ValueError("BCP / MCB Kings Gold Swatch checklist coverage incomplete")
 return out
def triple(bcp,groups):
 bcp_li=bcp_lists(bcp,"3_Kings_Triple_Jersey_Swatch")
 if not bcp_li or len(bcp_li[0])!=10 or len(groups["3 Kings Jersey Triple Swatch"])!=10:
  raise ValueError("Authentic triple-swatch 10 checklist incomplete")
 out=[]
 refs={r[0]:r for r in groups["3 Kings Jersey Triple Swatch"]}
 for raw in bcp_li[0]:
  no,player=raw.split(" ",1);ref=refs.get(no)
  if not ref or norm(player)!=norm(ref[1]) or not ref[2]:
   raise ValueError("BCP/MCB Triple Swatch card identity mismatch "+raw)
  out.append((no,ref[1],ref[2],"Authentic 3 Kings triple game-used jersey swatches; serial-numbered /33"))
 return {"3-kings-triple-jersey-swatch":out}
def generate_source():
 bcp,mcb=fetch(BCP),fetch(MCB)
 base_rows,groups=mcb_tables(mcb)
 base=validate(base_rows,groups,bcp)
 sets={}
 sets["base"]=[(str(i),name,team,
   "Original veteran #1-200" if i<=200 else "Original All-Rookie SP #201-220 (not a true RC; hobby 1:4, retail 1:5)")
   for i,(name,team) in base.items()]
 sets["gold-medallion"]=[(no,player,team,
   "Authentic Gold Medallion; original physical base number, one per hobby pack; retail 1:3") for no,player,team,v in sets["base"]]
 sets["platinum-medallion"]=[(no,player,team,
   "Authentic original Platinum Medallion; serial-numbered /50; hobby only") for no,player,team,v in sets["base"]]
 for component in (numbered(bcp,groups),season(bcp,base,groups),follow_jerseys(bcp,groups),
                   king_jerseys(bcp,groups),triple(bcp,groups)):
  for name,rows in component.items():
   if name in sets:raise ValueError("Duplicate collector group "+name)
   sets[name]=rows
 expected={
 "base":220,"gold-medallion":220,"platinum-medallion":220,
 "follow-the-leader":15,"follow-the-leader-die-cut":15,
 "home-run-kings":15,"strikeout-kings":15,"rbi-kings":15,"ultra-kings-gold":45,
 "season-crowns-game-used-copper":50,"season-crowns-game-used-gold":50,"season-crowns-game-used-platinum-patch":50,
 "season-crowns-autographs-copper":5,"season-crowns-autographs-gold":14,"season-crowns-autographs-platinum":34,
 "season-crowns-autographs-masterpiece":34,
 "follow-the-leader-jersey-copper":14,"follow-the-leader-jersey-red":14,
 "follow-the-leader-jersey-gold":14,"follow-the-leader-jersey-platinum-patch":14,
 "follow-the-leader-jersey-ultraswatch":14,
 "kings-jersey-gold":45,"kings-jersey-platinum-patch":45,"kings-jersey-gold-ultraswatch":45,
 "3-kings-triple-jersey-swatch":10}
 actual={key:len(value) for key,value in sets.items()}
 if actual!=expected:raise ValueError("Checklist families inconsistent "+str(actual))
 for key,rows in sets.items():
  if len({r[0] for r in rows})!=len(rows):raise ValueError("Duplicate physically printed card number "+key)
  if any(not row[0] or not row[1] or not row[2] for row in rows):raise ValueError("Source identity missing "+key)
 if sum(expected.values())!=1232 or len(expected)!=25:raise ValueError("Source collector total changed")
 return sets,expected
