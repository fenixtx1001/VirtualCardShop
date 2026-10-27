#!/usr/bin/env python3
"""1994 Stadium Club Baseball Set Factory; reconcile physical-card numbering and inserts."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1994-stadium-club-baseball.bundle.json"
CSV=ROOT/"data/set-factory/1994-stadium-club-baseball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory source validation)","Accept":"text/html,application/xhtml+xml"}
ANNOT=re.compile(r"(?:,\s*|\s+)(?:RC|MLD|UER|ERR|COR|VAR|SP|SN\d+|PR\d+|RDM)(?=\s|,|:|$)",re.I)
NUMBER=re.compile(r"^(?:\d{1,3}[a-z]?|NNO)$",re.I)
DUPLICATES={"269","270","543"}
ROOKIE_COUNT=16
class Rows(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None;self.link=False
 def handle_starttag(self,t,a):
  if t=="tr":self.row=[];self.link=False
  elif t=="td" and self.row is not None:self.cell=[]
  elif t=="a" and self.row is not None and any(k=="href" and "ViewCard.cfm" in (v or "") for k,v in a):self.link=True
 def handle_data(self,d):
  if self.cell is not None:self.cell.append(d)
 def handle_endtag(self,t):
  if t=="td" and self.cell is not None:self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  elif t=="tr" and self.row is not None:
   if self.row and self.link:self.rows.append(self.row)
   self.row=None
def clean(value):
 value=" ".join(value.split()).strip()
 m=ANNOT.search(value)
 return value[:m.start()].strip(" ,;") if m else value
def canonical_identity(key,number,player):
 # Known TCDB subject aliases across Base/First Day/Golden Rainbow.
 aliases={
  "24":{"Jack McDowell":"Jack McDowell AW"},
  "48":{"Jeff McNeely":"Jeffrey McNeely"},
  "85":{"Ken Griffey Jr.":"Ken Griffey, Jr."},
  "187":{"Dennis Martinez":"Denny Martinez"},
  "373":{"Cal Ripken Jr.":"Cal Ripken"},
  "608":{"Tuffy Rhodes":"Karl Rhodes"},
  "677":{"Bill Spiers":"Billy Spiers"},
  "682":{"Dennis Martinez":"Denny Martinez"},
 }
 if key in ("base","first-day-issue","golden-rainbow"):
  player=aliases.get(number,{}).get(player,player)
  # Source attaches print-error descriptions after the identity.
  if number in ("269","270","543","544"):
   player=re.split(r",\s*UERUER:",player,maxsplit=1)[0]
 return player
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.5)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=40) as r:return r.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code} at {url}; NO CSV WRITTEN")
   print(f"TCDB HTTP {e.code}, retry {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*2**attempt)
  except Exception as e:raise SystemExit(f"TCDB fetch failed: {e}; NO CSV WRITTEN")
 raise SystemExit(f"TCDB unavailable: {url}; NO CSV WRITTEN")
def collect(key,sid,expected,rookies=False):
 entries=[];errors=[]
 for page in range(1,14):
  endpoint="Rookies" if rookies else "Checklist"
  p=Rows();p.feed(fetch(f"https://www.tcdb.com/{endpoint}.cfm/sid/{sid}/1994-Stadium-Club?PageIndex={page}"))
  parsed=0
  for row in p.rows:
   cells=[c.strip() for c in row if c.strip()]
   for i,raw in enumerate(cells):
    if not NUMBER.fullmatch(raw) or i+1>=len(cells):continue
    if key in ("base","first-day-issue","golden-rainbow","rookies"):
     m=re.fullmatch(r"(\d{1,3})([a-z]?)",raw,re.I)
     if not m or not 1<=int(m.group(1))<=720:continue
    number=raw.upper() if raw.upper()=="NNO" else str(int(re.match(r"\d+",raw).group()))
    player=canonical_identity(key,number,clean(cells[i+1]))
    if not player:continue
    team=cells[-1] if i+2<len(cells) else ""
    if team==cells[i+1]:team=""
    entries.append((number,player,team));parsed+=1;break
  print(f"{key} page {page}: {parsed} source rows; {len(entries)}/{expected}",flush=True)
  if len(entries)>=expected:break
  if page>1 and not parsed:break
 if len(entries)!=expected:errors.append(f"{key}: expected {expected} source cards, found {len(entries)}")
 return entries,errors
def numbered(entries,key):
 grouped=defaultdict(list)
 for number,player,team in entries:grouped[number].append((player,team))
 result={};problems=[]
 for number,variants in grouped.items():
  if number in DUPLICATES and key in ("base","first-day-issue","golden-rainbow"):
   if len(variants)!=2:problems.append(f"{key} #{number}: expected two distinct physical cards, found {len(variants)}")
   if len(set(variants))!=len(variants):problems.append(f"{key} #{number}: duplicate identities rather than distinct misnumbered cards")
   for idx,identity in enumerate(sorted(variants),1):result[number+("a" if idx==1 else "b")]=identity
  elif len(variants)==1:result[number]=variants[0]
  elif number=="NNO":
   for idx,identity in enumerate(variants,1):result[f"NNO-{idx:02d}"]=identity
  else:problems.append(f"{key} #{number}: unexpected {len(variants)} physical cards")
 return result,problems
def run():
 bundle=json.loads(BUNDLE.read_text(encoding="utf-8"))
 data={};errors=[]
 for spec in bundle["productSets"]:
  entries,issues=collect(spec["key"],spec["sourceSetId"],spec["expectedCards"])
  cards,more=numbered(entries,spec["key"])
  data[spec["key"]]=cards;errors.extend(issues+more)
 rook_entries,issues=collect("rookies",416,ROOKIE_COUNT,True)
 rookies,more=numbered(rook_entries,"rookies");errors.extend(issues+more)
 base=data["base"]
 expected={str(i) for i in range(1,721) if i not in (539,540,643) and str(i) not in DUPLICATES}|{n+s for n in DUPLICATES for s in ("a","b")}
 if set(base)!=expected:errors.append(f"Base physical numbering mismatch: missing {sorted(expected-set(base))[:20]}; unexpected {sorted(set(base)-expected)[:20]}")
 for key in ("first-day-issue","golden-rainbow"):
  if set(data[key])!=expected:errors.append(f"{key}: physical-number keys do not match Base")
  for number,identity in data[key].items():
   if identity!=base.get(number):errors.append(f"{key} #{number}: {identity!r} differs from Base {base.get(number)!r}")
 if len(rookies)!=16:errors.append("Expected 16 unique rookie identities")
 for number,identity in rookies.items():
  matches=[item for key,item in base.items() if key==number or key.startswith(number) and number in DUPLICATES]
  if identity not in matches:errors.append(f"Rookie #{number}: {identity!r} does not match Base")
 for spec in bundle["productSets"]:
  key=spec["key"]
  if len(data[key])!=spec["expectedCards"]:errors.append(f"{key}: expected {spec['expectedCards']} unique collectibles, found {len(data[key])}")
 if errors:
  print("=== SOURCE DISCREPANCIES ===")
  for err in errors[:100]:print("  "+err)
  raise SystemExit(f"{len(errors)} discrepancies; NO CSV WRITTEN")
 rows=[]
 for spec in bundle["productSets"]:
  key=spec["key"]
  for number,(player,team) in data[key].items():
   if key=="base" and (number in rookies or (number[:-1] in rookies and number[-1:] in ("a","b"))):player+=" RC"
   rows.append((key,number,player,team,"",spec["name"] if key!="base" else ""))
 if len(rows)!=2243 or len({(r[0],r[1]) for r in rows})!=2243:raise SystemExit("Card count mismatch; NO CSV WRITTEN")
 CSV.parent.mkdir(parents=True,exist_ok=True)
 with CSV.open("w",newline="",encoding="utf-8") as f:
  w=csv.writer(f,lineterminator="\n");w.writerow(("setKey","cardNumber","player","team","subset","variant"));w.writerows(rows)
 print("GENERATED 2243 cards across 10 ProductSets; 16 Base rookies; UNRELEASED")
 print(f"CSV: {CSV}")
def tests():
 assert clean("Chan Ho Park MLD, RC")=="Chan Ho Park"
 assert clean("Ken Griffey, Jr.")=="Ken Griffey, Jr."
 assert canonical_identity("first-day-issue","24","Jack McDowell")=="Jack McDowell AW"
 assert canonical_identity("golden-rainbow","48","Jeff McNeely")=="Jeffrey McNeely"
 assert canonical_identity("first-day-issue","85","Ken Griffey Jr.")=="Ken Griffey, Jr."
 assert canonical_identity("first-day-issue","269","Checklist: 271-408 CL, UERUER: #269on back, was supposed to be #539")=="Checklist: 271-408 CL"
 assert canonical_identity("base","544","Greg Maddux AW, UERUER: Missing 93 Award Winner logo")=="Greg Maddux AW"
 assert canonical_identity("first-day-issue","608","Tuffy Rhodes")=="Karl Rhodes"
 a,e=numbered([("269","A","T"),("269","B","T")],"base")
 assert not e and set(a)=={"269a","269b"}
 assert NUMBER.fullmatch("NNO") and NUMBER.fullmatch("543a")
 print("1994 Stadium Club offline self-tests passed")
if __name__=="__main__":
 parser=argparse.ArgumentParser();parser.add_argument("--self-test",action="store_true");args=parser.parse_args()
 tests()
 if not args.self_test:run()
