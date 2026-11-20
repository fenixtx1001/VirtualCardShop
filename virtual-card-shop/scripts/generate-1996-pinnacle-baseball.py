#!/usr/bin/env python3
"""1996 Pinnacle Baseball source-audited VCS Set Factory.

Creates 400 base checklist entries, separate 200-card Starburst Dufex,
200 Starburst Artist's Proof (derived) and 200 Series Two Foil (explicit),
plus all eleven documented pack-insert checklists. The two distinct
.300 Series #305 subjects are preserved as #305.3 and #305.6.

Run live audit: python3 scripts/generate-1996-pinnacle-baseball.py
Offline packaged audit: python3 scripts/generate-1996-pinnacle-baseball.py --check
"""
from __future__ import annotations
import argparse,csv,gzip,html,io,json,re,urllib.request
from collections import Counter,defaultdict
from pathlib import Path

DATA=Path(__file__).resolve().parents[1]/"data/set-factory"
CSV=DATA/"1996-pinnacle-baseball.cards.csv.gz"
BUNDLE=DATA/"1996-pinnacle-baseball.bundle.json"
CC="https://www.collectioncount.com/checklists/1996-pinnacle-baseball/"
BCP="https://baseballcardpedia.com/index.php/1996_Pinnacle"
FIELDS=("setKey","cardNumber","player","team","subset","variant")
COUNTS={"base":400,"starburst":200,"starburst-artists-proof":200,"foil":200,
  "cal-ripken-tribute":1,"power":20,"team-pinnacle":9,
  "essence-of-the-game":18,"first-rate":18,"team-tomorrow":10,
  "christie-brinkley":16,"team-spirit":12,"project-stardom":18,
  "slugfest":18,"skylines":18}
EXPLICIT={k:n for k,n in COUNTS.items() if k!="starburst-artists-proof"}
GROUP_SIZES=[9,1,133,30,30,7,53,30,16,69,25,7,100,100,1,20,9,18,18,10,16,12,18,18,18]
INSERT_GROUPS={"cal-ripken-tribute":14,"power":15,"team-pinnacle":16,
 "essence-of-the-game":17,"first-rate":18,"team-tomorrow":19,
 "christie-brinkley":20,"team-spirit":21,"project-stardom":22,
 "slugfest":23,"skylines":24}
ROOKIES={"168","180","372","382","383","385","388","392"}
MANUAL_TEAMS={"Sandy Alomar":"Cleveland Indians",
 "Bobby Abreu":"Houston Astros","Richard Hidalgo":"Houston Astros"}
# Historical catalog flags. Two players moved clubs during the issue year;
# avoid mislabeling a specific scan by noting 'Multiple Teams' in VCS.
AMBIGUOUS={"Eddie Murray","Cecil Fielder"}
BASE_SUBJECT_EXCEPTION={"132"}
def fetch(url):
 req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (VCS catalog audit)","Accept":"text/html"})
 with urllib.request.urlopen(req,timeout=40) as response:
  if response.status!=200:raise ValueError(f"Source {url}: HTTP {response.status}")
  return response.read().decode("utf-8","replace")
def jsarr(s,name):
 m=re.search(r"\bvar\s+"+name+r"\s*=\s*(\[[\s\S]*?\]);",s)
 if not m:raise ValueError(f"Missing independently maintained array {name}")
 return json.loads(m.group(1))
def groups(s):
 blocks=re.findall(r'<ul\s+style="list-style-type:none;"\s*>(.*?)</ul>',s,re.S|re.I)
 allrows=[[html.unescape(re.sub(r"<[^>]+>","",line)).strip() for line in re.findall(r"<li[^>]*>(.*?)</li>",block,re.S|re.I)] for block in blocks]
 if [len(x) for x in allrows]!=GROUP_SIZES:
  raise ValueError(f"BCP source group layout or totals changed: {[len(x) for x in allrows]}")
 return allrows
def subject(x):
 # NAT, HH, .300, and RC are *subset/badging annotations*, not
 # part of the collector-facing printed player name.
 x=re.sub(r"\s+(?:NAT|HH|\.300|RC\*?|ROY)(?=\s|$).*$","",x).strip()
 return x
def make_key(name):
 return re.sub(r"[^a-z0-9]","",name.lower())
def parse(line):
 m=re.fullmatch(r"(\d{1,3}(?:\.\d)?)\s+(.+)",line)
 if not m:raise ValueError("Unrecognized checklist line "+repr(line))
 return m.groups()
def add(rows,key,num,player,team,subset="",variant=""):
 if not str(num).strip() or not player.strip() or not team.strip():
  raise ValueError(f"Missing card field {key} {num} {player}/{team}")
 rows.append(dict(zip(FIELDS,[key,str(num),player.strip(),team.strip(),subset,variant])))
def base_subset(number,source_text):
 n=float(number)
 if 134<=n<=163:return "The Naturals"
 if 164<=n<=193:return "'95 Rookies"
 if 194<=n<=200 or 393<=n<=399:return "Checklist"
 if 254<=n<=283:return "Hardball Heroes"
 if 300<=n<=339:return "The .300 Series"
 if 368<=n<=392:return "Rookies"
 return ""
def produce():
 cc_html=fetch(CC);bcp_html=fetch(BCP)
 base=jsarr(cc_html,"BASE");teams=jsarr(cc_html,"TEAMS");g=groups(bcp_html)
 if len(base)!=400 or len(teams)!=28 or len(set(teams))!=28:
  raise ValueError("Independent base or team count changed")
 bcp={}
 for group in g[2:12]:
  for line in group:
   no,who=parse(line)
   if no in bcp:raise ValueError("Duplicate BCP base ID "+no)
   bcp[no]=who
 numbers={str(n) for n in range(1,400)}-{"305"}|{"305.3","305.6"}
 if set(bcp)!=numbers or {str(x[0]) for x in base}!=numbers:
  raise ValueError("Missing/wrong 400 base IDs, including distinct #305 variants")
 result=[];known=defaultdict(set);source_rookies=set()
 for row in base:
  if len(row) not in (3,4):raise ValueError("Unexpected base row "+repr(row))
  no,name,team_index,*flags=row;no=str(no)
  original=bcp[no]
  clean=subject(original)
  if name!=clean and no not in BASE_SUBJECT_EXCEPTION:
   raise ValueError(f"Unreviewed independent source subject #{no}: {name!r}/{clean!r}")
  if no in BASE_SUBJECT_EXCEPTION and name!=original:
   raise ValueError("Card #132 multi-subject award caption changed")
  if not 0<=team_index<len(teams):raise ValueError(f"Invalid team index #{no}")
  if flags and flags[0]==1:source_rookies.add(no)
  is_multi=" / " in name
  team="Multiple Teams" if is_multi else teams[team_index]
  variant=[]
  if no in ("305.3","305.6"):
   variant.append("Two physically distinct #305 .300 Series subjects; VCS catalog ID .3/.6 distinguishes them")
  if no=="132":variant.append("Four-subject 1995 Rookie of the Year commemorative card")
  if is_multi:variant.append("Multi-subject card; team is not a single player's club")
  if " .300" in original:variant.append("The .300 Series printed numbering")
  if flags and flags[0]==1:variant.append("True rookie card (catalog flagged)")
  add(result,"base",no,name+(" RC" if no in ROOKIES else ""),team,base_subset(no,original),"; ".join(variant))
  if not is_multi:known[make_key(name)].add(team)
 if source_rookies!=ROOKIES:
  raise ValueError(f"Rookie source flag changes: {sorted(source_rookies^ROOKIES)}")
 # STARBURST: partial parallel with a distinct 1–200 checklist and
 # separate serial "of 100"/"of 200" printed denominator by series.
 for groupnum in [12,13]:
  for line in g[groupnum]:
   num,original=parse(line)
   if not num.isdigit():raise ValueError("Unexpected Starburst number")
   i=int(num)
   if groupnum==12 and not 1<=i<=100:raise ValueError("Starburst S1 number")
   if groupnum==13 and not 101<=i<=200:raise ValueError("Starburst S2 number")
   name=subject(original)
   mapped=known.get(make_key(name),set())
   if len(mapped)!=1:
    if name in AMBIGUOUS and len(mapped)>=2:team="Multiple Teams"
    elif name in MANUAL_TEAMS:team=MANUAL_TEAMS[name]
    else:raise ValueError(f"Unverified Starburst team #{num} {name}: {mapped}")
   else:team=next(iter(mapped))
   subst=("Naturals" if " NAT" in original else "Hardball Heroes" if " HH" in original
          else "The .300 Series" if " .300" in original else "")
   note=f"Starburst silver Dufex partial parallel; Series {1 if i<=100 else 2}, printed as {i} of {100 if i<=100 else 200} (not serial numbered)"
   if team=="Multiple Teams":note+="; mid-year multiple-club subject, scan-specific club unverified"
   add(result,"starburst",num,name,team,subst,note)
 if len([x for x in result if x["setKey"]=="starburst"])!=200:
  raise ValueError("Starburst checklist not 200")
 # Foil retail SuperPack exclusive, Series Two #201–399, with TWO #305 cards.
 for x in [r for r in result if r["setKey"]=="base"]:
  n=float(x["cardNumber"])
  if 201<=n<=399:
   note="Series Two retail SuperPack-exclusive foil partial parallel; 6 foil cards per 7-card SuperPack"
   if x["cardNumber"] in {"305.3","305.6"}:note+="; two distinct #305 .300 Series subjects"
   add(result,"foil",x["cardNumber"],x["player"],x["team"],x["subset"],note)
 if len([x for x in result if x["setKey"]=="foil"])!=200:
  raise ValueError("Foil subset must be exactly 200")
 # Eleven original inserts remain distinct for proper collecting and scarcity.
 for key,ix in INSERT_GROUPS.items():
  for position,line in enumerate(g[ix],1):
   num,original=parse(line)
   if num!=str(position):raise ValueError(f"Unexpected printed {key} number {num}")
   name=subject(original)
   if " / " in name:team="Multiple Teams"
   else:
    mapped=known.get(make_key(name),set())
    if len(mapped)!=1:
     if name in AMBIGUOUS and len(mapped)>=2:team="Multiple Teams"
     elif name in MANUAL_TEAMS:team=MANUAL_TEAMS[name]
     else:raise ValueError(f"Unable to verify team for {key} #{num}: {name}, {mapped}")
    else:team=next(iter(mapped))
   channel={
    "cal-ripken-tribute":"Series One hobby/retail 1:150",
    "power":"Series One hobby/retail 1:35; jumbo 1:29",
    "team-pinnacle":"Series One hobby/retail 1:72; single front Dufex/back foil issue (no reversed version)",
    "essence-of-the-game":"Series One hobby exclusive 1:23; etched acetate",
    "first-rate":"Series One retail exclusive 1:23; Dufex",
    "team-tomorrow":"Series One jumbo exclusive 1:19; Dufex",
    "christie-brinkley":"Series Two hobby/retail 1:23; jumbo 1:19; SuperPack 1:32; photography",
    "team-spirit":"Series Two hobby/retail 1:72; jumbo 1:60; SuperPack 1:103",
    "project-stardom":"Series Two hobby exclusive 1:35; Dufex",
    "slugfest":"Series Two retail exclusive 1:35; Dufex",
    "skylines":"Series Two jumbo exclusive 1:29 or retail SuperPack 1:50; acetate"
   }[key]
   if team=="Multiple Teams":channel+="; multi-subject / midyear club ambiguity"
   add(result,key,num,name,team,key.replace("-"," ").title(),channel)
 return result

def check():
 b=json.loads(BUNDLE.read_text("utf8"))
 if b["schemaVersion"]!=2 or b["status"]!="DRAFT" or b["product"]["released"] is not False:
  raise ValueError("Must remain draft and unreleased")
 if b["product"]["id"]!="1996_Pinnacle_Baseball" or b["cardsFile"]!=CSV.name:
  raise ValueError("Product or file mismatch")
 if {s["key"]:s["expectedCards"] for s in b["productSets"]}!=COUNTS or len(b["productSets"])!=15:
  raise ValueError("Manifest not 15 expected ProductSets")
 derived={s["key"]:s["deriveCardsFrom"] for s in b["productSets"] if s.get("deriveCardsFrom")}
 if derived!={"starburst-artists-proof":"starburst"}:
  raise ValueError("Starburst Artist's Proof derived from wrong subset")
 if any(s["oddsPerPack"] is not None for s in b["productSets"]):
  raise ValueError("Unsafe mixed series/channel pack odds")
 with gzip.open(CSV,"rt",encoding="utf8",newline="") as f:r=list(csv.DictReader(f))
 if Counter(x["setKey"] for x in r)!=Counter(EXPLICIT) or len(r)!=958:
  raise ValueError(f"Wrong 958 explicit entries: {Counter(x['setKey'] for x in r)}")
 if len({(x["setKey"],x["cardNumber"]) for x in r})!=len(r):
  raise ValueError("Duplicate ProductSet+number IDs")
 if any(not x["player"] or not x["team"] for x in r):
  raise ValueError("Blank player/team")
 base={x["cardNumber"]:x for x in r if x["setKey"]=="base"}
 base_numbers={str(i) for i in range(1,400)}-{"305"}|{"305.3","305.6"}
 if set(base)!=base_numbers:raise ValueError("400 base IDs incomplete")
 if {n for n,x in base.items() if x["player"].endswith(" RC") }!=ROOKIES:
  raise ValueError("Eight true rookie flags incorrect")
 for n,name in [("1","Greg Maddux"),("122","Ken Griffey, Jr."),("168","Matt Lawton RC"),("180","Mike Sweeney RC"),
                ("305.3","Paul Molitor"),("305.6","Jeff Bagwell"),("392","Mike Busby RC")]:
  if base[n]["player"]!=name:raise ValueError(f"Important card #{n} incorrect {base[n]['player']}")
 star={int(x["cardNumber"]):x for x in r if x["setKey"]=="starburst"}
 foil={x["cardNumber"]:x for x in r if x["setKey"]=="foil"}
 if set(star)!=set(range(1,201)) or len(foil)!=200:
  raise ValueError("Partial parallel numbering mismatch")
 if set(foil)!={n for n in base if 201<=float(n)<=399}:
  raise ValueError("Foil should be Series Two *only*, including both 305 printings")
 print("PASS: 1996 Pinnacle Baseball 400 base, 200 Starburst, 200 Artist's Proof, 200 Foil, 158 inserts = 1,158")
 print("PASS: 15 collector groups; 958 explicit CSV records + 200 derived AP")
 print("PASS: two separate #305.3/#305.6 cards, eight TCDB-flagged base RCs")
 print("PASS: original Starburst subset and Series Two Foil do NOT fabricate full 400-card parallel")
 print("PASS: historical pack channels/odds gated, DRAFT unreleased")

def main():
 p=argparse.ArgumentParser();p.add_argument("--check",action="store_true");a=p.parse_args()
 if not a.check:
  rows=produce();DATA.mkdir(parents=True,exist_ok=True)
  buff=io.StringIO(newline="")
  writer=csv.DictWriter(buff,fieldnames=FIELDS,lineterminator="\n")
  writer.writeheader();writer.writerows(rows)
  CSV.write_bytes(gzip.compress(buff.getvalue().encode("utf8"),compresslevel=9,mtime=0))
 check()
if __name__=="__main__":main()
