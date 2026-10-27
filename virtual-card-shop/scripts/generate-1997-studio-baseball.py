#!/usr/bin/env python3
"""1997 Studio Baseball Set Factory — source validated, fail-closed."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1997-studio-baseball.bundle.json"
CSV=ROOT/"data/set-factory/1997-studio-baseball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory source validator)","Accept":"text/html,application/xhtml+xml"}
ANNOTATION=re.compile(r"(?:,\s*|\s+)(?:RC|UER|ERR|COR|VAR|SP|AU|SN\d+|PR\d+)(?=\s|,|:|$)",re.I)
NUMBER=re.compile(r"^\d{1,3}$")
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
 m=ANNOTATION.search(value)
 return value[:m.start()].strip(" ,;") if m else value
def normalize_identity(key,number,player):
 # TCDB writes Dave Justice as David on the Silver parallel checklist.
 if key in ("base","press-proofs-silver","press-proofs-gold") and number=="19":
  player=player.replace("David Justice","Dave Justice")
 # Three checklist cards append pack-print metadata to subject names.
 if key in ("base","press-proofs-silver","press-proofs-gold") and number in ("163","164","165"):
  player=re.split(r"\s+CL(?:,?\s*PR\d+)?Checklist:",player,maxsplit=1)[0]
 return player
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.5)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=40) as r:return r.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code} at {url}; NO CSV WRITTEN")
   print(f"TCDB temporary HTTP {e.code}: attempt {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*(2**attempt))
  except Exception as e:raise SystemExit(f"TCDB unavailable: {e}; NO CSV WRITTEN")
 raise SystemExit(f"TCDB blocked after retries: {url}; NO CSV WRITTEN")
def collect(key,sid,expected,rookies=False):
 found={};errors=[]
 for page in range(1,12):
  endpoint="Rookies" if rookies else "Checklist"
  parser=Rows()
  parser.feed(fetch(f"https://www.tcdb.com/{endpoint}.cfm/sid/{sid}/1997-Studio?PageIndex={page}"))
  parsed=added=0
  for row in parser.rows:
   cells=[c.strip() for c in row if c.strip()]
   for i,n in enumerate(cells):
    if not NUMBER.fullmatch(n) or i+1>=len(cells):continue
    if (key in ("base","press-proofs-silver","press-proofs-gold") or rookies) and not 1<=int(n)<=165:continue
    number=str(int(n));player=normalize_identity(key,number,clean(cells[i+1]));team=cells[-1] if i+2<len(cells) else ""
    if not player:continue
    if team==cells[i+1]:team=""
    identity=(player,team);parsed+=1
    if number in found and found[number]!=identity:errors.append(f"{key} #{number}: {found[number]!r} differs from {identity!r}")
    if number not in found:found[number]=identity;added+=1
    break
  print(f"{key} page {page}: {parsed} rows, +{added}; {len(found)}/{expected}",flush=True)
  if len(found)>=expected:break
  if page>1 and parsed==0:break
 if len(found)!=expected:errors.append(f"{key}: expected {expected}, found {len(found)}")
 return found,errors
def run():
 cfg=json.loads(BUNDLE.read_text(encoding="utf-8"))
 data={};errors=[]
 for spec in cfg["productSets"]:
  cards,issues=collect(spec["key"],spec["sourceSetId"],spec["expectedCards"])
  data[spec["key"]]=cards;errors.extend(issues)
 rookies,issues=collect("rookies",1043,1,True);errors.extend(issues)
 base=data["base"];full={str(n) for n in range(1,166)}
 if set(base)!=full:errors.append("Base numbering must be exactly 1-165")
 for key in ("press-proofs-silver","press-proofs-gold"):
  if set(data[key])!=full:errors.append(f"{key}: expected Base numbering 1-165")
  for number,identity in data[key].items():
   if identity!=base.get(number):errors.append(f"{key} #{number}: {identity!r} differs from Base {base.get(number)!r}")
 if set(rookies)!={"145"}:errors.append(f"Expected Brian Giles RC #145, got {rookies!r}")
 if rookies.get("145")!=base.get("145"):errors.append(f"Rookie #145 differs from Base: {rookies.get('145')!r} vs {base.get('145')!r}")
 if rookies.get("145",("",))[0]!="Brian Giles":errors.append("Brian Giles RC identity mismatch")
 for key in ("hard-hats","master-strokes","oversized-master-strokes","oversized-portraits"):
  if set(data[key])!={str(n) for n in range(1,25)}:errors.append(f"{key}: expected cards 1-24")
 if set(data["oversized-portraits-autographs"])!={"12","21","24"}:errors.append("Expected autographs #12 #21 #24")
 for number,identity in data["oversized-portraits-autographs"].items():
  if identity!=data["oversized-portraits"].get(number):errors.append(f"Autograph #{number} differs from Oversized Portraits")
 if errors:
  print("=== SOURCE DISCREPANCIES ===")
  for issue in errors[:100]:print("  "+issue)
  raise SystemExit(f"{len(errors)} discrepancies; NO CSV WRITTEN")
 rows=[]
 for spec in cfg["productSets"]:
  key=spec["key"]
  for number,(player,team) in data[key].items():
   if key=="base" and number=="145":player+=" RC"
   rows.append((key,number,player,team,"",spec["name"] if key!="base" else ""))
 if len(rows)!=594 or len({(r[0],r[1]) for r in rows})!=594:raise SystemExit("Unexpected card count or identity; NO CSV WRITTEN")
 CSV.parent.mkdir(parents=True,exist_ok=True)
 with CSV.open("w",newline="",encoding="utf-8") as f:
  w=csv.writer(f,lineterminator="\n");w.writerow(("setKey","cardNumber","player","team","subset","variant"));w.writerows(rows)
 print("GENERATED 594 cards across 8 ProductSets; 1 true Base RC; UNRELEASED")
 print(f"CSV: {CSV}")
def tests():
 assert clean("Brian Giles RC")=="Brian Giles"
 assert normalize_identity("press-proofs-silver","19","David Justice")=="Dave Justice"
 assert normalize_identity("base","163","Ken Griffey Jr. CLChecklist: 1-83")=="Ken Griffey Jr."
 assert normalize_identity("press-proofs-silver","163","Ken Griffey Jr. CL, PR1500Checklist: 1-83")=="Ken Griffey Jr."
 assert normalize_identity("press-proofs-gold","165","Alex Rodriguez CL, PR500Checklist: Inserts")=="Alex Rodriguez"
 assert clean("Vladimir Guerrero AU, PR500")=="Vladimir Guerrero"
 assert clean("Derek Jeter SN2000")=="Derek Jeter"
 assert clean("Ken Griffey Jr. PR1500")=="Ken Griffey Jr."
 print("1997 Studio offline self-tests passed")
if __name__=="__main__":
 parser=argparse.ArgumentParser();parser.add_argument("--self-test",action="store_true");args=parser.parse_args()
 tests()
 if not args.self_test:run()
