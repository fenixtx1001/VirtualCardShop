#!/usr/bin/env python3
"""Audited 1997 Pinnacle Baseball Set Factory.

1997 Pinnacle = one 200-card series, NOT the separate 1997 New Pinnacle
product. Source-audits base, five inserts and each fractured Artist's
Proof rarity. Catalogues authentic 1/1 Press Plate Previews as explicitly
non-packable collectibles (distributed with New Pinnacle cases).
All 17 derived sets use source checklists; no invented subjects.
"""
from __future__ import annotations
import argparse,csv,gzip,html,io,json,re,urllib.request
from collections import Counter,defaultdict
from pathlib import Path

DATA=Path(__file__).resolve().parents[1]/"data/set-factory"
BUNDLE=DATA/"1997-pinnacle-baseball.bundle.json"
CSV=DATA/"1997-pinnacle-baseball.cards.csv.gz"
BCP="https://baseballcardpedia.com/index.php/1997_Pinnacle"
CC="https://www.collectioncount.com/checklists/1997-pinnacle-baseball/"
FIELDS=("setKey","cardNumber","player","team","subset","variant")
BASE=200
AP={"artists-proof-bronze":125,"artists-proof-silver":50,"artists-proof-gold":25}
INSERTS={"cardfrontations":20,"home-away":24,"passport-to-the-majors":25,"shades":10,"team-pinnacle":10}
SIDES=("front","back")
COLORS=("cyan","magenta","yellow","black")
PLATES={f"press-plate-{family}-{side}-{color}":n
 for family,n in (("base",200),("shades",10)) for side in SIDES for color in COLORS}
COUNTS={"base":200,"museum-collection":200,**AP,**INSERTS,**PLATES}
EXPLICIT={"base":200,**AP,**INSERTS}
GROUPS=(155,30,12,3,200,20,24,25,10,10)
ALIAS_TEAMS={
 "Carlos Baerga":"New York Mets",
 "Henry Rodriguez":"Montreal Expos",
 "Javy Lopez":"Atlanta Braves",
 "Larry Walker":"Colorado Rockies",
 "Mac Suzuki":"Seattle Mariners",
 "Raul Mondesi":"Los Angeles Dodgers",
 "Roberto Alomar":"Baltimore Orioles",
 "Ruben Rivera":"New York Yankees",
 "Gary Sheffield":"Florida Marlins",
}
def fetch(url):
 req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (VCS 1997 Pinnacle historical checklist audit)"})
 with urllib.request.urlopen(req,timeout=45) as rsp:
  if rsp.status!=200:raise ValueError(f"HTTP {rsp.status}: {url}")
  return rsp.read().decode("utf-8","replace")
def jsarr(src,key):
 m=re.search(r"\bvar\s+"+re.escape(key)+r"\s*=\s*(\[[\s\S]*?\]);",src)
 if not m:raise ValueError(f"Independent source lost {key} array")
 return json.loads(m.group(1))
def source_groups(src):
 blocks=re.findall(r'<ul\s+style="list-style-type:none;"\s*>(.*?)</ul>',src,re.S|re.I)
 result=[[html.unescape(re.sub(r"<[^>]*>","",x)).strip()
          for x in re.findall(r"<li[^>]*>(.*?)</li>",g,re.S|re.I)]
         for g in blocks]
 if tuple(len(x) for x in result)!=GROUPS:
  raise ValueError(f"BaseballCardPedia checklist structure changed: {[len(x) for x in result]}")
 return result
def numbered(line):
 m=re.fullmatch(r"(\d{1,3})\s+(.+)",line)
 if not m:raise ValueError(f"Unrecognized source line {line!r}")
 return int(m.group(1)),m.group(2)
def normalized_key(name):return re.sub(r"[^a-z0-9]","",name.lower())
def add(rows,key,number,player,team,subset="",variant=""):
 if not player or not team:raise ValueError(f"Empty subject/team {key} #{number}")
 rows.append(dict(zip(FIELDS,(key,str(number),player,team,subset,variant))))
def produce():
 cc=fetch(CC);bp=fetch(BCP)
 source=jsarr(cc,"BASE");teams=jsarr(cc,"TEAMS");g=source_groups(bp)
 if len(source)!=200 or len(teams)!=30 or len(set(teams))!=30:
  raise ValueError("Unexpected independent source size")
 indexed={}
 for grp in g[:4]:
  for line in grp:
   n,who=numbered(line)
   if n in indexed:raise ValueError(f"Duplicate base #{n}")
   indexed[n]=who
 if set(indexed)!=set(range(1,201)):raise ValueError("Base must have #1–200")
 rows=[];known=defaultdict(set);base_lookup={}
 for i,line in enumerate(source,1):
  if len(line)!=3 or line[0]!=i:raise ValueError(f"Invalid CollectionCount base row {i}: {line}")
  num,name,team_idx=line
  if indexed[i]!=name:raise ValueError(f"Source subject mismatch #{i}: {name} vs {indexed[i]}")
  if not isinstance(team_idx,int) or not 0<=team_idx<28:
   raise ValueError(f"Unverified 1997 team index #{i} {team_idx}")
  team=teams[team_idx]
  subset="Rookies" if 156<=i<=185 else "Clout" if 186<=i<=197 else "Checklists" if i>=198 else ""
  add(rows,"base",i,name,team,subset)
  base_lookup[i]=(name,team,subset)
  known[normalized_key(name)].add(team)
 # No true rookie cards in this original flagship release.
 if any(len(line)>3 for line in source):raise ValueError("Source gained rookie flags")
 if [(x["cardNumber"],x["player"]) for x in rows if x["setKey"]=="base" and x["player"].endswith(" RC")]:
  raise ValueError("Unexpected RC badge")
 # A physically fractured Artist's Proof set, not three full 200-card parallels.
 for line in g[4]:
  m=re.fullmatch(r"PP(\d{1,3})\s+(.+)\s+([BSG])(?:\s+300)?",line)
  if m:
   n=int(m.group(1));name=m.group(2);tier=m.group(3)
   if tier=="G" and not line.endswith(" G 300"):
    raise ValueError("Gold artist's proof must say G 300")
   if tier!="G" and " 300" in line:raise ValueError("Non-Gold given fake print run")
   color={"B":"bronze","S":"silver","G":"gold"}[tier]
  elif line=="PP200 Trey Beamon CL":
   n,name,color=200,"Trey Beamon","bronze"
  else:raise ValueError(f"Unknown Artist's Proof classification: {line!r}")
  canonical,team,subset=base_lookup[n]
  if n==135:
   if name!="Darren Fletcher" or canonical!="Darrin Fletcher":
    raise ValueError("AP #135 source typo no longer matches audited correction")
  elif name!=canonical:raise ValueError(f"AP #{n} identity mismatch {name!r} vs {canonical!r}")
  note=f"Artist's Proof {color.title()} Dufex, ONE fixed base subject per numbered card; NOT all 200 in each color"
  if color=="gold":note+="; announced 300 copies, NOT serial-numbered"
  if n==200:note+="; BCP CL notation; TCDB confirms Bronze Checklist"
  if n==135:note+="; BCP typo Darren normalized to Darrin Fletcher"
  add(rows,f"artists-proof-{color}",n,canonical,team,subset,note)
 # Five card-for-card verified insert groups, not alternate base parallels.
 for ix,key in enumerate(INSERTS,5):
  for i,line in enumerate(g[ix],1):
   n,name=numbered(line)
   if i!=n:raise ValueError(f"{key} missing sequential #{i}")
   team="Multiple Teams" if (" / " in name or name=="All 18 players") else None
   if team is None:
    match=known.get(normalized_key(name),set())
    if len(match)==1:team=next(iter(match))
    elif name in ALIAS_TEAMS:team=ALIAS_TEAMS[name]
    else:raise ValueError(f"Unverified insert subject/team {key} #{n} {name}: {match}")
   channel={
     "cardfrontations":"Hobby exclusive 1:23; dual-front hitter/pitcher, protective peel layer",
     "home-away":"Magazine pack exclusive 1:33; jersey diecut; odd=Away, even=Home",
     "passport-to-the-majors":"Hobby/retail 1:36; folding black passport diecut",
     "shades":"Retail exclusive 1:23; sunglasses mirror mylar diecut",
     "team-pinnacle":"Hobby/retail 1:90; NL-front Dufex, AL-back plain; no reverse printing",
   }[key]
   if key=="home-away":channel+="; "+("Away jersey" if n%2 else "Home jersey")
   if key=="team-pinnacle" and n==10:channel+="; original all-18-players checklist card"
   add(rows,key,n,name,team,key.replace("-"," ").title(),channel)
 return rows

def check():
 b=json.loads(BUNDLE.read_text("utf8"))
 if b["schemaVersion"]!=2 or b["status"]!="DRAFT" or b["product"]["released"] is not False:
  raise ValueError("Must be schema 2 and unreleased draft")
 if b["product"]["id"]!="1997_Pinnacle_Baseball" or b["cardsFile"]!=CSV.name:
  raise ValueError("Wrong manifest id/attachment")
 if {s["key"]:s["expectedCards"] for s in b["productSets"]}!=COUNTS or len(b["productSets"])!=26:
  raise ValueError("Incomplete/wrong manifest checklist families")
 derived={s["key"]:s["deriveCardsFrom"] for s in b["productSets"] if s.get("deriveCardsFrom")}
 expected={"museum-collection":"base",**{key:("base" if "-base-" in key else "shades") for key in PLATES}}
 if derived!=expected:raise ValueError("Bad press plate / museum source derivations")
 if any(s["oddsPerPack"] is not None for s in b["productSets"]):
  raise ValueError("Mixed packaging must not invent odds")
 with gzip.open(CSV,"rt",encoding="utf8",newline="") as f:rows=list(csv.DictReader(f))
 if Counter(x["setKey"] for x in rows)!=Counter(EXPLICIT) or len(rows)!=489:
  raise ValueError(f"Expected 489 unique explicit entries: {Counter(x['setKey'] for x in rows)}")
 if len(set((x["setKey"],x["cardNumber"]) for x in rows))!=len(rows):raise ValueError("Duplicate IDs")
 if any(not x["team"] or not x["player"] for x in rows):raise ValueError("Missing team/subject")
 base={int(x["cardNumber"]):x for x in rows if x["setKey"]=="base"}
 if set(base)!=set(range(1,201)):raise ValueError("Missing base card")
 for n,name in [(1,"Cecil Fielder"),(91,"Jason Kendall"),(92,"Alex Rodriguez"),
                (139,"Derek Jeter"),(185,"Dmitri Young"),(193,"Ken Griffey, Jr."),
                (200,"Trey Beamon")]:
  if base[n]["player"]!=name:raise ValueError(f"Important identity #{n}: {base[n]['player']}")
 ap={int(x["cardNumber"]):x["setKey"] for x in rows if x["setKey"].startswith("artists-proof-")}
 if set(ap)!=set(range(1,201)):raise ValueError("Artist's Proof tier must be disjoint and complete")
 if ap[200]!="artists-proof-bronze" or ap[139]!="artists-proof-gold":
  raise ValueError("BCP/TCDB graded Artist's Proof rarity mismatch")
 shades=[x for x in rows if x["setKey"]=="shades"]
 if len(shades)!=10 or shades[0]["player"]!="Ken Griffey, Jr.":
  raise ValueError("Press Plate Shades subject source missing")
 if sum(COUNTS.values())!=2369 or len(PLATES)!=16:raise ValueError("Press Plate total")
 print("PASS: 1997 Pinnacle 200 base / 200 Museum / AP 125 Bronze, 50 Silver, 25 Gold")
 print("PASS: 5 inserts, 89 cards; 1,680 actual one-of-one Press Plate Previews")
 print("PASS: 26 collector sets, 489 explicit and 1,880 derived = 2,369 total")
 print("PASS: zero invented RCs, AP #200 Bronze and #135 name correction")
 print("PASS: one original series, strict hobby/retail/magazine gating and non-pack plates")
 print("PASS: release remains FALSE; no existing card values or imagery changed")

def main():
 p=argparse.ArgumentParser();p.add_argument("--check",action="store_true");a=p.parse_args()
 if not a.check:
  rows=produce();DATA.mkdir(parents=True,exist_ok=True)
  out=io.StringIO(newline="")
  writer=csv.DictWriter(out,fieldnames=FIELDS,lineterminator="\n")
  writer.writeheader();writer.writerows(rows)
  CSV.write_bytes(gzip.compress(out.getvalue().encode("utf8"),compresslevel=9,mtime=0))
 check()
if __name__=="__main__":main()
