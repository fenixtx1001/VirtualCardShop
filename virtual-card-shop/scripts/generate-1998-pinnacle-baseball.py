#!/usr/bin/env python3
"""VCS Set Factory: source-audited 1998 Pinnacle flagship Baseball.

Historical sources: BaseballCardPedia base/Museum/Power Pack/insert lists,
CollectionCount independent 200-card index and two insert lists, and the
cross-brand Pinnacle Epix table. The generator deliberately excludes
the never-released Certified Epix, other-company Epix types, and made-up
Hit It Here Gold cards for players other than the sole verified Griffey.

Run: python3 scripts/generate-1998-pinnacle-baseball.py
Offline check: python3 scripts/generate-1998-pinnacle-baseball.py --check
"""
from __future__ import annotations
import argparse,csv,gzip,html,io,json,re,urllib.request
from collections import Counter,defaultdict
from pathlib import Path
from bs4 import BeautifulSoup

DATA=Path(__file__).resolve().parents[1]/"data/set-factory"
BUNDLE=DATA/"1998-pinnacle-baseball.bundle.json"
CSV=DATA/"1998-pinnacle-baseball.cards.csv.gz"
BCP="https://baseballcardpedia.com/index.php/1998_Pinnacle"
CC="https://www.collectioncount.com/checklists/1998-pinnacle-baseball/"
EPIX="https://baseballcardpedia.com/index.php/1998_Pinnacle_Epix"
FIELDS=("setKey","cardNumber","player","team","subset","variant")
GROUP_SIZES=[157,24,6,10,3,100,24,10,50]
COUNTS={
 "base":200,"home-stats":157,"away-stats":157,
 "museum-collection":100,"artists-proof":100,
 "power-pack-jumbos":24,"uncut":6,
 "epix-orange":24,"epix-purple":24,"epix-emerald":24,
 "hit-it-here":10,"hit-it-here-gold":1,"spellbound":50,
}
for family,size in (("base",200),("epix",24),("hit-it-here",10),("spellbound",50)):
 for side in ("front","back"):
  for ink in ("cyan","magenta","yellow","black"):
   COUNTS[f"press-plate-{family}-{side}-{ink}"]=size
EXPLICIT={"base":200,"museum-collection":100,"power-pack-jumbos":24,"uncut":6,
          "epix-orange":24,"hit-it-here":10,"hit-it-here-gold":1,"spellbound":50}
ALIASES={
 "Cal Ripken, Jr.":"Baltimore Orioles",
 "Cal Ripken / Roberto Alomar":"Multiple Teams",
 "Ivan Rodriguez":"Texas Rangers",
 "Ryne Sandberg":"Chicago Cubs",
 "Albert Belle":"Chicago White Sox",
 "Mo Vaughn":"Boston Red Sox",
 "Eddie Murray/Hideo Nomo":"Multiple Teams",
}
SPECIAL_NAMES={
 114:("Bob Higginson","Bobby Higginson"),  # Independent CC uses Bob's full first name.
}
def fetch(url):
 req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (VCS historical trading card checklist audit)"})
 with urllib.request.urlopen(req,timeout=45) as r:
  if r.status!=200:raise ValueError(f"Unable to verify source {url}: {r.status}")
  return r.read().decode("utf-8","replace")
def jsarray(src,key):
 m=re.search(r"\bvar\s+"+re.escape(key)+r"\s*=\s*(\[[\s\S]*?\]);",src)
 if not m:raise ValueError("Independent source lacks "+key)
 # CollectionCount intentionally embeds Javascript block comments into BASE.
 val=re.sub(r"/\*[\s\S]*?\*/","",m.group(1))
 return json.loads(val)
def groups(src):
 x=re.findall(r'<ul\s+style="list-style-type:none;"\s*>(.*?)</ul>',src,re.I|re.S)
 result=[[html.unescape(re.sub(r"<[^>]+>","",v)).strip()
          for v in re.findall(r"<li[^>]*>(.*?)</li>",g,re.I|re.S)] for g in x]
 if [len(v) for v in result]!=GROUP_SIZES:raise ValueError(f"Source group sizes changed {[len(v) for v in result]}")
 return result
def split_numbered(line,prefix=""):
 m=re.fullmatch(re.escape(prefix)+r"(\d{1,3})\s+(.+)",line)
 if not m:raise ValueError(f"Unexpected checklist line: {line!r}")
 return int(m.group(1)),m.group(2)
def namekey(s):return re.sub(r"[^a-z0-9]","",s.lower())
def add(rows,key,num,player,team,subset="",variant=""):
 if not str(num).strip() or not player or not team:
  raise ValueError(f"Missing subject/team: {key} #{num} {player}/{team}")
 rows.append(dict(zip(FIELDS,(key,str(num),player,team,subset,variant))))
def build():
 cc_html=fetch(CC);bc_html=fetch(BCP);ep_html=fetch(EPIX)
 base_cc=jsarray(cc_html,"BASE");teams=jsarray(cc_html,"TEAMS")
 cc_hits=jsarray(cc_html,"HITITHERE");cc_spell=jsarray(cc_html,"SPELLBOUND")
 g=groups(bc_html)
 if len(base_cc)!=200 or len(teams)!=30 or len(cc_hits)!=10 or len(cc_spell)!=50:
  raise ValueError("Independent source counts changed")
 bcp_base={}
 for ix,part in enumerate(g[:5]):
  for line in part:
   n,name=split_numbered(line)
   if n in bcp_base:raise ValueError("Base duplicate #"+str(n))
   bcp_base[n]=name
 if set(bcp_base)!=set(range(1,201)):raise ValueError("Base numbers missing")
 rows=[];base={};known=defaultdict(set)
 for idx,row in enumerate(base_cc,1):
  if len(row) not in (3,4) or int(row[0])!=idx:
   raise ValueError(f"Unexpected independent base row {idx} {row!r}")
  _,name,ti,*extra=row
  bname=bcp_base[idx]
  if idx in SPECIAL_NAMES:
   if (bname,name)!=SPECIAL_NAMES[idx]:
    raise ValueError("Unreviewed alternate name for #114")
  elif name!=bname:raise ValueError(f"Number/subject mismatch #{idx}: {name!r} vs {bname!r}")
  if ti is None:
   if idx!=198 or name!="All-Star Home Run Derby Contestants":
    raise ValueError("Unexpected missing team for base subject")
   team="Multiple Teams"
  elif not isinstance(ti,int) or not 0<=ti<len(teams):raise ValueError("Bad team index")
  else:team=teams[ti]
  # CC flags the ten Rookie subset subjects as notable future stars, not
  # true RCs. BCP explicitly notes no notable true rookie cards.
  if extra and (idx<158 or idx>181):raise ValueError("Unexpected rookie index flag")
  subset=("Rookies" if 158<=idx<=181 else
          "Field of Vision" if 182<=idx<=187 else
          "Goin' Jake" if 188<=idx<=197 else
          "Checklist" if 198<=idx<=200 else "")
  note="Full career statistics back, one of three equally issued original back versions" if idx<=157 else ""
  if idx==114:note+="; independent catalog normalizes Bob Higginson to Bobby Higginson"
  if idx==198:note="Multi-team checklist; no single club assigned"
  add(rows,"base",idx,name,team,subset,note.lstrip("; "))
  base[idx]=(name,team,subset)
  if team!="Multiple Teams":known[namekey(name)].add(team)
 def resolve(name):
  if " / " in name or name in ("All-Star Home Run Derby Contestants","Eddie Murray/Hideo Nomo"):
   return "Multiple Teams"
  found=known.get(namekey(name),set())
  if len(found)==1:return next(iter(found))
  if name in ALIASES:return ALIASES[name]
  raise ValueError(f"Unverified subject team: {name!r} / {sorted(found)}")
 # 100-card numbered Dufex, with PP1–PP100 numbering different from
 # base-card number. AP exactly parallels this 100-card pool, not 200.
 for line in g[5]:
  n,raw=split_numbered(line,"PP")
  if not 1<=n<=100:raise ValueError("Museum numbering out of 100")
  flag="Field of Vision" if raw.endswith(" FV") else "Goin' Jake" if raw.endswith(" GJ") else ""
  player=raw[:-3] if flag else raw
  team=resolve(player)
  add(rows,"museum-collection",f"PP{n}",player,team,flag,
      "Museum Collection silver wave Dufex, partial 100-card checklist; original PP printed number (not base ID)")
 # 24 enormous 3.5x5 Power Pack Jumbos; last eight are additional
 # player photos (not invented base card subjects/number duplicates).
 for line in g[6]:
  n,raw=split_numbered(line)
  subset="Field of Vision" if raw.endswith(" FV") else "Goin' Jake" if raw.endswith(" GJ") else ""
  player=raw[:-3] if subset else raw
  if player=="Cal Ripken / Roberto Alomar":player="Cal Ripken, Jr. / Roberto Alomar"
  add(rows,"power-pack-jumbos",n,player,resolve(player),subset,
      "Original oversized 3.5 x 5 inch numbered "+str(n)+" of 24; one per separate Power Pack, not ordinary wax")
 # Six gigantic retail promotional premium cards, actual base subjects 182–187.
 for i in range(182,188):
  name,team,subset=base[i]
  add(rows,"uncut",i,name,team,subset,
      "Original 13 5/16 x 18 11/16 inch Dufex retail giant; one-card $9.99 pack, NOT wax")
 # Epix 1998 Pinnacle-specific: Game E1–E6, Season E7–E12,
 # Moment E13–E18, Play E19–E24. Each of three foil colors exists for
 # the same 24 subjects; the two other colors derive from Orange.
 soup=BeautifulSoup(ep_html,"html.parser")
 candidates=[]
 for tb in soup.find_all("table"):
  t=[[c.get_text(" ",strip=True) for c in tr.select("th,td")] for tr in tb.select("tr")]
  if t and t[0][:2]==["Player","Card Number"]:candidates.append(t)
 if len(candidates)!=1 or len(candidates[0])!=25:
  raise ValueError("Epix published 24-subject issue changed")
 for i,line in enumerate(candidates[0][1:],1):
  if len(line)<6 or line[1]!=f"E{i}":raise ValueError(f"Unexpected Epix E{i} row {line}")
  types=["Play","Game","Season","Moment"]
  p=[typ for typ,brand in zip(types,line[2:6]) if brand=="P"]
  if len(p)!=1:raise ValueError("Pinnacle-specific Epix type not unique")
  expected="Game" if i<=6 else "Season" if i<=12 else "Moment" if i<=18 else "Play"
  if p[0]!=expected:raise ValueError("Epix cross-brand type mismatch")
  name=line[0]
  add(rows,"epix-orange",f"E{i}",name,resolve(name),f"Epix {expected}",
      "Original Pinnacle-specific "+expected+" Epix, Orange foil (70% of Epix print); 1:21 any Epix across colors. Not alternate-brand type")
 # Hit It Here contest, individually serial-numbered but known print run not disclosed.
 for i,line in enumerate(g[7],1):
  n,who=split_numbered(line)
  row=cc_hits[i-1]
  if n!=i or str(row[0])!=str(i) or row[1]!=who:raise ValueError("Hit It Here independent name/number mismatch")
  add(rows,"hit-it-here",n,who,resolve(who),"Hit It Here",
      "Red etched foil, unique printed contest serial, undisclosed total print run; 1998 opening-day cycle contest ended without winner")
 # Only Gold-colored Hit It Here card known to exist: #2 Griffey.
 add(rows,"hit-it-here-gold",2,"Ken Griffey, Jr.",resolve("Ken Griffey, Jr."),
     "Hit It Here","Only gold-foil Hit It Here example independently documented (Griffey #2, serial #02680), surfaced 2018; no other nine speculative gold parallels created")
 # Spellbound: preserve duplicate letters as separate true collector cards.
 for i,line in enumerate(g[8],1):
  n,raw=split_numbered(line)
  row=cc_spell[i-1]
  if n!=i or str(row[0])!=str(i) or row[1]!=raw:raise ValueError(f"Spellbound independent source mismatch #{i}")
  m=re.fullmatch(r"(.+)\s([A-Z])",raw)
  if not m:raise ValueError("Unparseable Spellbound card "+raw)
  who,letter=m.groups()
  add(rows,"spellbound",i,who,resolve(who),"Spellbound",
      f"Silver etched-foil letter '{letter}', original individually numbered card {i}; not interchangeable with other same-letter cards")
 return rows

def check():
 manifest=json.loads(BUNDLE.read_text("utf8"))
 if manifest["schemaVersion"]!=2 or manifest["status"]!="DRAFT" or manifest["product"]["released"] is not False:
  raise ValueError("Must stay unreleased draft")
 if manifest["product"]["id"]!="1998_Pinnacle_Baseball" or manifest["cardsFile"]!=CSV.name:
  raise ValueError("Product/file mismatch")
 if {x["key"]:x["expectedCards"] for x in manifest["productSets"]}!=COUNTS or len(COUNTS)!=45:
  raise ValueError("1998 Pinnacle 45 ProductSet size mismatch")
 if any(x["oddsPerPack"] is not None for x in manifest["productSets"]):
  raise ValueError("Do not blend pack odds across formats")
 derived={x["key"]:x["deriveCardsFrom"] for x in manifest["productSets"] if x.get("deriveCardsFrom")}
 expected={"home-stats":"base","away-stats":"base","artists-proof":"museum-collection",
 "epix-purple":"epix-orange","epix-emerald":"epix-orange"}
 for family in ("base","epix","hit-it-here","spellbound"):
  source={"base":"base","epix":"epix-orange","hit-it-here":"hit-it-here","spellbound":"spellbound"}[family]
  for side in ("front","back"):
   for ink in ("cyan","magenta","yellow","black"):
    expected[f"press-plate-{family}-{side}-{ink}"]=source
 if derived!=expected:raise ValueError("Incorrect parallel source derivation")
 with gzip.open(CSV,"rt",encoding="utf8",newline="") as f:rows=list(csv.DictReader(f))
 if Counter(x["setKey"] for x in rows)!=Counter(EXPLICIT) or len(rows)!=415:
  raise ValueError("Expected 415 explicit validated cards "+str(Counter(x["setKey"] for x in rows)))
 if len(set((x["setKey"],x["cardNumber"]) for x in rows))!=len(rows):
  raise ValueError("Duplicate ProductSet and printed number")
 if any(not x["team"] or not x["player"] for x in rows):raise ValueError("Blank subject/team")
 base={int(x["cardNumber"]):x for x in rows if x["setKey"]=="base"}
 if set(base)!=set(range(1,201)):raise ValueError("Base 1-200 missing")
 for n,who in [(1,"Tony Gwynn"),(7,"Mike Piazza"),(18,"Chipper Jones"),(53,"Sammy Sosa"),
               (63,"Mark McGwire"),(64,"Derek Jeter"),(114,"Bobby Higginson"),
               (182,"Alex Rodriguez"),(187,"Ken Griffey, Jr.")]:
  if base[n]["player"]!=who:raise ValueError(f"Important base card #{n}: {base[n]['player']}")
 museum=[x for x in rows if x["setKey"]=="museum-collection"]
 if {x["cardNumber"] for x in museum}!={f"PP{i}" for i in range(1,101)}:
  raise ValueError("Museum independently numbered PP1-100, not base IDs")
 epix=[x for x in rows if x["setKey"]=="epix-orange"]
 if {x["cardNumber"] for x in epix}!={f"E{i}" for i in range(1,25)}:
  raise ValueError("Pinnacle-specific Epix wrong")
 if len(rows)+sum(x["expectedCards"] for x in manifest["productSets"] if x.get("deriveCardsFrom"))!=3149:
  raise ValueError("Unexpected final card count")
 print("PASS: 1998 Pinnacle 200 original base, 314 Home/Away back variants, Museum/AP 100 each")
 print("PASS: 24 Jumbo Power Pack, 6 Uncut, 3x24 true Pinnacle-specific Epix colors")
 print("PASS: 10 Hit It Here, ONE verifiable Griffey Gold, 50 distinct lettered Spellbound")
 print("PASS: 2,272 authentic 1-of-1 press plates (200 base, 24 Epix, 10 HIH, 50 Spellbound × 8)")
 print("PASS: 45 ProductSets, 415 explicit + 2,734 derived = 3,149 collector entries")
 print("PASS: Original pack formats and odds gated; product remains UNRELEASED")

def main():
 ap=argparse.ArgumentParser();ap.add_argument("--check",action="store_true");args=ap.parse_args()
 if not args.check:
  rows=build();DATA.mkdir(parents=True,exist_ok=True)
  buf=io.StringIO(newline="")
  w=csv.DictWriter(buf,fieldnames=FIELDS,lineterminator="\n")
  w.writeheader();w.writerows(rows)
  CSV.write_bytes(gzip.compress(buf.getvalue().encode("utf8"),compresslevel=9,mtime=0))
 check()
if __name__=="__main__":main()
