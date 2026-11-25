#!/usr/bin/env python3
"""1992 Pinnacle Baseball original base/inserts/dealer promos; cross-verified BCP, MCB, TCDB."""
import argparse,csv,gzip,html,io,json,re,urllib.request
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/"data/set-factory"
BUNDLE=OUT/"1992-pinnacle-baseball.bundle.json"; CARDS=OUT/"1992-pinnacle-baseball.cards.csv.gz"
BCP="https://baseballcardpedia.com/index.php/1992_Pinnacle"
MCB="https://mycardbatch.com/checklists/pinnacle-1992-baseball"
TCDB="https://www.tcdb.com/ViewSet.cfm/sid/194/1992-Pinnacle"
PID="1992_Pinnacle_Baseball"; FIELDS=("setKey","cardNumber","player","team","subset","variant")
COUNTS={"base":620,"team-pinnacle":12,"rookie-idols":18,"team-2000":81,"slugfest":15,"dealer-kit-samples":8}
SOURCE_NAME_EXCEPTIONS={
 111:("Dwight Gooden","Doc Gooden"),
 169:("Greg W. Harris","Greg Harris"),
 245:("Manny Lee","Manuel Lee"),
 283:("Ken Griffey, Jr.","Ken Griffey Jr. / Rickey Henderson"),
 285:("Chuck Knoblauch / Ozzie Smith","Ozzie Smith / Chuck Knoblauch"),
 333:("Dave West","David West"),
 436:("Sandy Alomar","Sandy Alomar Jr"),
 472:("Pat Mahomes, Sr.","Pat Mahomes"),
 516:("Jeff M. Robinson","Jeff Robinson"),
 545:('Shawn Livesey','Shawn Livsey'),
 570:("Ruben Amaro","Ruben Amaro Jr."),
 586:("Roberto Alomar / Sandy Alomar, Sr.","Roberto Alomar / Sandy Alomar"),
 587:("Scott Sanderson / Jim Hunter","Catfish Hunter / Scott Sanderson")}
INSERT_ALIASES={
 ("team-pinnacle",8):("Barry Bonds / Danny Tartabull","Danny Tartabull / Barry Bonds"),
 ("rookie-idols",3):("George Brett / Gary Cooper","Gary Cooper / George Brett"),
 ("rookie-idols",4):("Roger Clemens / Mark Wohlers","Mark Wohlers / Roger Clemens"),
 ("rookie-idols",6):("Willie Banks / Dwight Gooden","Willie Banks / Doc Gooden"),
 ("rookie-idols",10):("Thurman Munson / Todd Hundley","Todd Hundley / Thurman Munson"),
 ("rookie-idols",11):("Cal Ripken / Eddie Zosky","Eddie Zosky / Cal Ripken Jr"),
 ("rookie-idols",12):("Nolan Ryan / Todd Van Poppel","Todd Van Poppel / Nolan Ryan")}
PROMO_NAMES={1:"Frank Thomas",4:"Cecil Fielder",10:"Ryne Sandberg",14:"Ruben Sierra",
 45:"Roberto Alomar",80:"Darryl Strawberry",126:"Ray Lankford",204:"Mike Mussina"}
def norm(s):
 s=s.lower()
 # The unambiguous published name variants include punctuation and prefixes.
 s=s.replace("ken griffey, jr.","ken griffey jr").replace("cal ripken, jr.","cal ripken jr")
 s=s.replace("pat mahomes, sr.","pat mahomes").replace("sandy alomar, sr.","sandy alomar")
 return re.sub("[^a-z0-9]","",s)
def clean(s):return html.unescape(re.sub(r"<[^>]+>","",s)).strip()
def get(url):
 req=urllib.request.Request(url,headers={"User-Agent":"Googlebot","Accept":"text/html,application/xhtml+xml","Referer":"https://www.google.com/"})
 with urllib.request.urlopen(req,timeout=40) as resp:
  if resp.status!=200:raise ValueError("Checklist source HTTP failed")
  return resp.read().decode("utf8","replace")
def section_lists(text,key):
 h=re.search(r'<h3[^>]*id="'+re.escape(key)+r'"',text)
 if not h:raise ValueError("BaseballCardPedia heading missing: "+key)
 nexthead=re.search(r"<h[23][^>]*id=",text[h.end():])
 block=text[h.end():h.end()+nexthead.start()] if nexthead else text[h.end():]
 return [[clean(s) for s in re.findall(r"<li[^>]*>(.*?)</li>",ul,re.S)] for ul in re.findall(r"<ul[^>]*>(.*?)</ul>",block,re.S)]
def mcb_tables(s):
 m=re.search(r'<table class="ck-table" id="ck-table".*?<tbody>(.*?)</tbody>',s,re.S)
 if not m:raise ValueError("Independent base checklist missing")
 def rows(block):
  parsed=[]
  for tr in re.findall(r"<tr[^>]*>(.*?)</tr>",block,re.S):
   cells=[clean(x) for x in re.findall(r"<td[^>]*>(.*?)</td>",tr,re.S)]
   if len(cells)==3:parsed.append(cells)
  return parsed
 base=rows(m[1]);groups={}
 for detail in re.findall(r'<details class="ins">(.*?)</details>',s,re.S):
  match=re.search(r'<span class="ins-name">(.*?)</span>',detail,re.S)
  if match:
   trs=re.findall(r"<tr[^>]*>(.*?)</tr>",detail,re.S)
   groups[clean(match[1])]=rows("".join("<tr>"+tr+"</tr>" for tr in trs[1:]))
 return base,groups
def strip_source_flags(s):
 # BCP prints RC, PROS, DP etc. in annotations rather than subject identity.
 s=re.sub(r"\s+(?:PROS|DP|RC\*?|UER|ERR|TECH|GRIP|SHADE|SIDELINES|IDOL|SIDE)\b.*$","",s,flags=re.I)
 return s.strip()
def strip_mcb_flags(s):
 # MCB marks subgroups with RP, IDOL etc. in the subject string.
 s=re.sub(r"\s+(?:RP|DP|IDOL|TECH|GRIP|SHADE|SIDE)\b.*$","",s,flags=re.I)
 s=re.sub(r"\s+RC\*?$","",s,flags=re.I)
 return s.strip()
def subset(n):
 if n in (52,55,168) or 247<=n<=261 or 263<=n<=280:return "'92 Rookie Prospects"
 if 281<=n<=286 or 584<=n<=591:return "Idols"
 if 287<=n<=294 or 592<=n<=596:return "Sidelines"
 if 295<=n<=304:return "Draft Picks"
 if 305<=n<=310 or 601<=n<=605:return "Shades"
 if 606<=n<=612:return "Grips"
 if 614<=n<=620:return "Technicians"
 return "Regular Base"
def card(rows,key,num,player,team,subset_name="",notes=""):
 if not num or not player or not team:raise ValueError("Incomplete sourced collectible "+key+"/"+str(num))
 rows.append(dict(zip(FIELDS,(key,str(num),player,team,subset_name,notes))))
def audit():
 bcp=get(BCP);mcb=get(MCB)
 base,groups=mcb_tables(mcb)
 a=section_lists(bcp,"Series_One_2")
 b=section_lists(bcp,"Series_Two_2")
 if list(map(len,a))!=[246,34,6,8,10,6] or list(map(len,b))!=[273,8,6,4,4,8,7]:
  raise ValueError("Original series/subset structure changed")
 source=sum(a+b,[])
 if len(base)!=620 or len(source)!=620:raise ValueError("Original 620 cards incomplete")
 expected_groups={"Team Pinnacle":12,"Rookie Idols":18,"Team 2000":81,"Slugfest":15,"Dealer Kit Samples":8}
 if {name:len(rows) for name,rows in groups.items()}!=expected_groups:
  raise ValueError("Insert group composition changed")
 out=[]
 for i,(raw,row) in enumerate(zip(source,base),1):
  m=re.fullmatch(r"(\d+)\s+(.+)",raw)
  if not m or int(m[1])!=i or row[0]!=str(i):raise ValueError("Independent base number conflict "+str(i))
  a_name=strip_source_flags(m[2])
  b_name=strip_mcb_flags(row[1])
  if norm(a_name)!=norm(b_name):
   expected=SOURCE_NAME_EXCEPTIONS.get(i)
   if expected is None or norm(expected[0])!=norm(a_name) or norm(expected[1])!=norm(b_name):
    raise ValueError(f"Unreviewed published base subject discrepancy #{i}: {a_name} / {b_name}")
  # Preserve printed/name consensus from MCB/TCDB, including printed #545 typo.
  # MCB's two-name Idols variants use preferred order independently corroborated.
  notes=f"Series {'One' if i<=310 else 'Two'}; collector subset {subset(i)}"
  if i in SOURCE_NAME_EXCEPTIONS:notes+="; audited source name/order/spelling discrepancy"
  if re.search(r"\bRC\*?\b",m[2]):
   notes+="; BaseballCardPedia RC designation"
  if i==545:notes+="; original printed name misspelled Livsey; player Shawn Livesey"
  card(out,"base",i,b_name,row[2],subset(i),notes)
 conf=[("Team_Pinnacle","Team Pinnacle","team-pinnacle",12),
       ("Rookie_Idols","Rookie Idols","rookie-idols",18),
       ("Team_2000","Team 2000","team-2000",81),
       ("Slugfest","Slugfest","slugfest",15)]
 for anchor,group,key,expected_n in conf:
  parts=section_lists(bcp,anchor)
  original=parts[0][:expected_n]
  listed=groups[group]
  if len(original)!=expected_n or len(listed)!=expected_n:raise ValueError("Insert length mismatch "+key)
  for i,(line,ref) in enumerate(zip(original,listed),1):
   m=re.match(r"(\d+[ab]?)\s+(.+)",line,re.I)
   if not m or m[1].lower()!=ref[0].lower():
    raise ValueError("Insert printed code mismatch "+key+": "+line+"/"+str(ref))
   source_name=m[2];name=ref[1]
   if key=="team-2000" and m[1].lower() in ("27a","27b"):
    source_name=re.sub(r"\s+\(Pinnacle logo.*$","",source_name).strip()
   if norm(source_name)!=norm(name):
    alias=INSERT_ALIASES.get((key,i))
    if alias and norm(alias[0])==norm(source_name) and norm(alias[1])==norm(name):pass
    elif key=="team-2000" and norm(source_name.replace(", Sr.",""))==norm(name):pass
    elif norm(source_name.replace(", Jr.","").replace(" Jr",""))==norm(name.replace(", Jr.","").replace(" Jr","")):pass
    elif key=="slugfest" and norm(source_name.replace(", Jr.",""))==norm(name):pass
    else:raise ValueError("Independent insert subject discrepancy "+key+" #"+str(i)+": "+source_name+"/"+name)
   notes=("Series One wax-only; documented 1:100 wax packs; dual-front Chris Greco artwork" if key=="team-pinnacle"
      else "Series Two wax-only; documented 1:100 wax packs; rookie/veteran dual-front" if key=="rookie-idols"
      else "Series One SuperPack if #1–40; Series Two SuperPack if #41–80; three per pack; original variant 27a/27b" if key=="team-2000"
      else "Series Two Wal-Mart-exclusive SuperPack insert; no verified numeric odds")
   if key=="team-2000" and m[1].lower() in ("27a","27b"):
    notes+=("; Pinnacle logo top-left" if m[1].lower()=="27a" else "; Pinnacle logo bottom-left")
   if (key,i) in INSERT_ALIASES:notes+="; independently verified dual-front player-order difference"
   card(out,key,ref[0],name,ref[2],group,notes)
 # 8 dealer kit card samples are real, but NOT pack inserts. Keep explicitly isolated.
 promos=groups["Dealer Kit Samples"]
 if {int(n) for n,_,_ in promos}!=set(PROMO_NAMES):raise ValueError("Dealer Kit eight numbered subjects mismatch")
 base_lookup={int(r["cardNumber"]):r for r in out if r["setKey"]=="base"}
 for n,full,club in promos:
  num=int(n);p=PROMO_NAMES[num]
  if not full.startswith(p) or base_lookup[num]["team"]!=club:
   raise ValueError("Unreviewed dealer sample named subject/team "+str((n,full,club)))
  card(out,"dealer-kit-samples",n,p,club,"Dealer Kit Samples",
       "Dealer promotional sample only, never inserted in retail/wax/SuperPacks; source note: "+full[len(p):].strip())
 totals=Counter(x["setKey"] for x in out)
 if totals!=Counter(COUNTS):raise ValueError("Incomplete authentic groups "+str(totals))
 if len({(r["setKey"],r["cardNumber"]) for r in out})!=len(out):raise ValueError("Duplicate collector identity")
 return out

