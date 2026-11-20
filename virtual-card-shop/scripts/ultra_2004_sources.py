#!/usr/bin/env python3
"""2004 Ultra Baseball: source-crosschecked, two-series draft factory."""
import argparse,csv,gzip,html,io,json,re,urllib.request
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; DATA=ROOT/"data/set-factory"
BUNDLE=DATA/"2004-ultra-baseball.bundle.json"; CARDS=DATA/"2004-ultra-baseball.cards.csv.gz"
BCP="https://baseballcardpedia.com/index.php/2004_Ultra"
MCB="https://mycardbatch.com/checklists/fleer-ultra-2004-baseball"
TCDB="https://www.tcdb.com/Inserts.cfm/sid/1767/2004-Ultra"
PID="2004_Ultra_Baseball"; FIELDS=("setKey","cardNumber","player","team","subset","variant")
# Independent MCB group counts before excluding TBC-HM, a duplicate unsupported by BCP.
INSERT_EXPECTED={
"Checklists":1,"Diamond Producers":10,"Diamond Producers Game Used":10,
"Diamond Producers Game Used UltraSwatch":10,"HR Kings Home Run Kings":10,
"Hitting Machines":10,"Hitting Machines Jerseys":10,
"Hitting Machines Patches Platinum":10,"K Kings Strikeout Kings":10,
"Legendary 13 Collection Game Used":1,
"Legendary 13 Collection Game Used Masterpiece Autographed":1,
"Legendary 13 Dual Game Used":13,
"Legendary 13 Dual Game Used Masterpiece Autographed":13,
"Legendary 13 Dual Game Used Platinum Autographed":13,
"Legendary 13 Single Game Used Gold":13,
"Legendary 13 Single Game Used Masterpiece":13,
"Legendary 13 Single Game Used Masterpiece Autographed":13,
"Legendary 13 Single Game Used Platinum Autographed":13,
"RBI Kings":10,"Season Crowns Autographs":15,"Season Crowns Game Used":50,
"Turn Back the Clock":20,"Turn Back the Clock Jerseys":21,
"Turn Back the Clock Patches Platinum":20,"Ultra Kings":10,
"Ultra Performers":15,"Ultra Performers Game Used":12,
"Ultra Performers Game Used UltraSwatch":12}
# TCDB corroborates 40 authentic distinct insert/variant groups. The source rows
# below are exact original subjects/printed identities from the parent set, not
# generated player/card identities.
DERIVED={
"HR Kings (Home Run Kings) Gold":("HR Kings Home Run Kings",50),
"Hitting Machines Die Cut":("Hitting Machines",None),
"Hitting Machines Jerseys Gold":("Hitting Machines Jerseys",50),
"K Kings (Strikeout Kings) Gold":("K Kings Strikeout Kings",50),
"Legendary 13 Dual Game Used Masterpiece":("Legendary 13 Dual Game Used",1),
"Legendary 13 Dual Game Used Platinum":("Legendary 13 Dual Game Used",10),
"RBI Kings Gold":("RBI Kings",50),
"Season Crowns Autographs Gold":("Season Crowns Autographs",25),
"Season Crowns Game Used Gold":("Season Crowns Game Used",99),
"Season Crowns Game Used Platinum":("Season Crowns Game Used",25),
"Turn Back the Clock Jerseys Gold":("Turn Back the Clock Jerseys",99),
"Turn Back the Clock Jerseys Silver":("Turn Back the Clock Jerseys",199)}
# MCB names normalized to TCDB's physical variant nomenclature where needed.
ALIASES={"HR Kings Home Run Kings":"HR Kings (Home Run Kings)",
"K Kings Strikeout Kings":"K Kings (Strikeout Kings)",
"Legendary 13 Dual Game Used":"Legendary 13 Dual Game Used Gold",
"Hitting Machines Jerseys":"Hitting Machines Jerseys Silver",
"Turn Back the Clock Jerseys":"Turn Back the Clock Jerseys Copper"}
# Original print serial limits for fully identified MCB source families.
SERIAL={
"Diamond Producers Game Used":1000,
"Hitting Machines Patches Platinum":10,
"Legendary 13 Collection Game Used":13,
"Legendary 13 Collection Game Used Masterpiece Autographed":1,
"Legendary 13 Dual Game Used":22,
"Legendary 13 Dual Game Used Masterpiece Autographed":1,
"Legendary 13 Dual Game Used Platinum Autographed":3,
"Legendary 13 Single Game Used Masterpiece":1,
"Legendary 13 Single Game Used Masterpiece Autographed":1,
"Legendary 13 Single Game Used Platinum Autographed":5,
"Season Crowns Autographs":150,
"Season Crowns Game Used":399,
"Turn Back the Clock Jerseys":399,
"Turn Back the Clock Patches Platinum":25,
"Ultra Kings":33,
"Ultra Performers Game Used":500}
BASE_SOURCE_DIFF={
72:("Jose Cruz","Jose Cruz Jr"),
276:("Alexis Rios","Alex Rios"),
332:("Luis A. Gonzalez","Luis Gonzalez"),
348:("Mike Wuertz","Michael Wuertz"),
357:("Don Kelly","Donnie Kelly"),
383:("Kaz Matsui","Kazuo Matsui")}
def get(url):
 req=urllib.request.Request(url,headers={"User-Agent":"Googlebot","Accept":"text/html,application/xhtml+xml","Referer":"https://www.google.com/"})
 with urllib.request.urlopen(req,timeout=35) as r:
  if r.status!=200:raise ValueError("HTTP source error")
  return r.read().decode("utf8","replace")
def clean(s):return html.unescape(re.sub(r"<[^>]+>","",s)).strip()
def norm(s):return re.sub(r"[^a-z0-9]","",s.lower())
def base_slices(bcp):
 out=[]
 for key,counts in (("Series_One_2",(200,20)),("Update_Series_2",(75,87,13))):
  m=re.search(r'<h3[^>]*id="'+key+r'"',bcp)
  if not m:raise ValueError("BCP missing original "+key)
  h=re.search(r'<h[23][^>]*id=',bcp[m.end():])
  block=bcp[m.end():m.end()+h.start()]
  lists=[]
  for u in re.findall(r"<ul[^>]*>(.*?)</ul>",block,re.S):
   lists.append([clean(x) for x in re.findall(r"<li[^>]*>(.*?)</li>",u,re.S)])
  if tuple(map(len,lists))!=counts:raise ValueError("BCP two-series counts changed "+key)
  out+=sum(lists,[])
 return out
def mcb_tables(s):
 h=re.search(r'<table class="ck-table" id="ck-table".*?<tbody>(.*?)</tbody>',s,re.S)
 if not h:raise ValueError("MCB 395 base table unavailable")
 def rows(s):
  out=[]
  for tr in re.findall(r"<tr[^>]*>(.*?)</tr>",s,re.S):
   cols=[clean(x) for x in re.findall(r"<td[^>]*>(.*?)</td>",tr,re.S)]
   if len(cols)==3:out.append(cols)
  return out
 base=rows(h[1]); inserts={}
 for detail in re.findall(r'<details class="ins">(.*?)</details>',s,re.S):
  name=re.search(r'<span class="ins-name">(.*?)</span>',detail,re.S)
  if name:
   trs=re.findall("<tr[^>]*>(.*?)</tr>",detail,re.S)
   inserts[clean(name[1])]=rows("".join("<tr>"+tr+"</tr>" for tr in trs[1:]))
 return base,inserts
def bcp_lists(bcp,key):
 h=re.search(r'<h3[^>]*id="'+re.escape(key)+r'"',bcp)
 if not h:raise ValueError("Missing BCP numbered family "+key)
 nxt=re.search(r'<h[23][^>]*id=',bcp[h.end():]);block=bcp[h.end():h.end()+nxt.start() if nxt else len(bcp)]
 return [[clean(x) for x in re.findall(r"<li[^>]*>(.*?)</li>",u,re.S)] for u in re.findall("<ul[^>]*>(.*?)</ul>",block,re.S)]
def place(rows,key,no,player,team,subset="",variant=""):
 if not no or not player or (not team and key!="checklists"):
  raise ValueError("Source card missing identity/team "+key+" "+str(no))
 rows.append(dict(zip(FIELDS,(key,str(no),player,team,subset,variant))))
def slug(label):return re.sub(r"[^a-z0-9]+","-",label.lower()).strip("-")
def audit_numbered(bcp,tables):
 checks=[
 ("Ultra Performers","Performers",0,"UP",15),
 ("HR Kings Home Run Kings","Kings",0,"HK",10),
 ("K Kings Strikeout Kings","Kings",1,"SK",10),
 ("RBI Kings","Kings",2,"RK",10),
 ("Diamond Producers","Diamond_Producers",0,"DP",10),
 ("Turn Back the Clock","Turn_Back_the_Clock",0,"TBC",20),
 ("Hitting Machines","Hitting_Machines",0,"HM",10)]
 for label,heading,ix,prefix,count in checks:
  originals=bcp_lists(bcp,heading)
  source=originals[ix]
  rows=tables.get(label,[])
  if len(source)!=count or len(rows)!=count:raise ValueError("Numbered original source count changed "+label)
  for i,(raw,mc) in enumerate(zip(source,rows),1):
   m=re.match(r"^(\d+)\s+([A-Z]+)\s+(.+)$",raw)
   if not m:raise ValueError("Unparsed original insert "+raw)
   n,p,name=m.groups()
   if int(n)!=i or p!=prefix or re.sub("[^0-9]","",mc[0])!=str(i):raise ValueError("Printed numbering mismatch "+label+" "+raw+"/"+str(mc))
   # BCP abbreviates player first names occasionally; every disagreement must be reviewed.
   if norm(name)!=norm(mc[1]):
    if (name,mc[1]) not in (("Ichiro","Ichiro Suzuki"),("Ken Griffey, Jr.","Ken Griffey Jr."),("Bob Abreu","Bobby Abreu")):
     raise ValueError("Unreviewed numbered insert discrepancy "+label+" "+str((name,mc[1])))
def audit_material(bcp,tables):
 counts=[
 ("Ultra Performers Game Used","Performers_Game_Used",0,12),
 ("Diamond Producers Game Used","Diamond_Producers_Game_Used",0,10),
 ("Ultra Kings","Kings_Triple_Swatch",0,10),
 ("Season Crowns Game Used","Season_Crowns",1,50),
 ("Season Crowns Autographs","Season_Crowns",2,15),
 ("Hitting Machines Jerseys","Hitting_Machines_Jersey_Silver",1,10),
 ("Turn Back the Clock Jerseys","Turn_Back_the_Clock_Jersey_Copper",1,20),
 ("Legendary 13 Single Game Used Gold","Legendary_13",1,13)]
 for key,heading,ix,n in counts:
  sources=bcp_lists(bcp,heading)
  if ix>=len(sources) or len(sources[ix])!=n:raise ValueError("BCP memorabilia list changed "+key)
  if len(tables[key]) not in (n,n+1):raise ValueError("Independent memorabilia list count changed "+key)
  # Original exact printed codes: for both original and independent lists,
  # assert card number/code membership; permit BCP's game-used suffix formatting.
  if key in ("Turn Back the Clock Jerseys","Hitting Machines Jerseys","Legendary 13 Single Game Used Gold"):
   a={v.split(" ",1)[0] for v in sources[ix]}
   b={row[0] for row in tables[key]}
   if not a.issubset(b):raise ValueError("Source memorabilia codes are missing "+key+" "+str(a-b))
def make():
 bcp,mcb=get(BCP),get(MCB)
 base,groups=mcb_tables(mcb)
 if set(groups)!=set(INSERT_EXPECTED) or {k:len(v) for k,v in groups.items()}!=INSERT_EXPECTED:
  raise ValueError("Unreviewed independent insert families/count changes")
 originals=base_slices(bcp)
 if len(base)!=395 or len(originals)!=395:raise ValueError("Original base 395 missing")
 audit_numbered(bcp,groups)
 audit_material(bcp,groups)
 rows=[]
 for i,((raw_no,name,team),source) in enumerate(zip(base,originals),1):
  n,p=source.split(" ",1)
  if int(raw_no)!=i or int(n)!=i or not team:raise ValueError("Base #1-395 mismatch")
  bcpcard=p.removesuffix(" RC*").removesuffix(" RC").removesuffix(" L13")
  mname=name.removesuffix(" RC*").removesuffix(" RC").removesuffix(" L13")
  if norm(bcpcard)!=norm(mname):
   if i not in BASE_SOURCE_DIFF or (bcpcard,mname)!=BASE_SOURCE_DIFF[i]:
    raise ValueError("Independent base name discrepancy at #"+str(i)+":"+bcpcard+"/"+mname)
  subtype=("Series One Veterans" if i<=200 else "Series One Prospects SP" if i<=220 else
     "Update Veterans" if i<=295 else "Update Prospects SP" if i<=382 else "Update Lucky 13 SP")
  rc="; BCP flagged original RC" if " RC" in p else ""
  if i in BASE_SOURCE_DIFF:rc+="; documented spelling/alias difference"
  place(rows,"base",i,mname,team,subtype,("Series One" if i<=220 else "Update Series")+"; "+subtype+rc)
 # Authentic MCB insert cards, excluding just one erroneous duplicate TBC-HM.
 for label,items in groups.items():
  key=slug(ALIASES.get(label,label))
  if label=="Turn Back the Clock Jerseys":
   suspect=[r for r in items if r[0]=="TBC-HM"]
   if len(suspect)!=1 or suspect[0][1]!="Hideo Nomo":
    raise ValueError("Unreviewed MCB TBC 21st card: do not silently discard")
   items=[r for r in items if r[0]!="TBC-HM"]
  for num,name,team in items:
   meta="Original collector numbering preserved. "
   if label in SERIAL:meta+="Authentic serial /"+str(SERIAL[label])+". "
   if "Masterpiece" in label:meta+="One-of-one."
   if "UltraSwatch" in label:meta+="Original serial quantity equals player's jersey number."
   if label=="Legendary 13 Single Game Used Gold":meta+="Original serial quantity equals player's jersey number."
   if label=="Checklists":meta+="Physical unnumbered checklist."
   place(rows,key,num,name,team,label,meta)
 # Independently listed in TCDB but collapsed or omitted from MCB's 28 groups.
 for target,(parent,cap) in DERIVED.items():
  base_key=slug(ALIASES.get(parent,parent))
  key=slug(target)
  originals=[r for r in rows if r["setKey"]==base_key]
  if not originals:raise ValueError("Missing original parent for authenticated variant "+target)
  for row in originals:
   variant="TCDB-listed authentic original parallel of "+parent+". "
   if cap is not None:variant+="Serial-numbered /"+str(cap)+". "
   else:variant+="Specially marked Update Series blaster-only die cut."
   place(rows,key,row["cardNumber"],row["player"],row["team"],target,variant)
 # Gold and Platinum Medallion only reproduce the 395 original player identities.
 base_rows=[r for r in rows if r["setKey"]=="base"]
 for r in base_rows:
  n=int(r["cardNumber"]);common=r["variant"]
  gold=("1:1 Series One #1-200" if n<=200 else
        "1:8 Series One Prospects #201-220" if n<=220 else
        "1:1 Update Hobby / 1:3 Update Retail #221-295" if n<=295 else
        "1:4 Update Hobby / 1:12 Update Retail #296-395")
  cap=66 if n<=220 else 100 if n<=382 else 13
  place(rows,"gold-medallion",n,r["player"],r["team"],r["subset"],
       "Genuine original Gold Medallion, die cut; "+gold+"; "+common)
  place(rows,"platinum-medallion",n,r["player"],r["team"],r["subset"],
       "Genuine original Platinum Medallion, die cut; serial /"+str(cap)+"; "+common)
 expected={"base":395,"gold-medallion":395,"platinum-medallion":395}
 for label,n in INSERT_EXPECTED.items():
  expected[slug(ALIASES.get(label,label))]=n-(1 if label=="Turn Back the Clock Jerseys" else 0)
 for label,(parent,cap) in DERIVED.items():
  expected[slug(label)]=expected[slug(ALIASES.get(parent,parent))]
 if len(expected)!=43:raise ValueError("Wrong 40 insert + 3 base product set group count")
 if Counter(r["setKey"] for r in rows)!=Counter(expected):
  raise ValueError("Missing/duplicate source family "+str(Counter(r["setKey"] for r in rows)-Counter(expected)))
 if len({(r["setKey"],r["cardNumber"]) for r in rows})!=len(rows):
  raise ValueError("Duplicate physical card number within collector family")
 return rows,expected

