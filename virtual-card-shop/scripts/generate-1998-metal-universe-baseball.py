#!/usr/bin/env python3
"""1998 Metal Universe Baseball — fail-closed TCDB Set Factory."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1998-metal-universe-baseball.bundle.json"
CSV=ROOT/"data/set-factory/1998-metal-universe-baseball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory source validator)","Accept":"text/html,application/xhtml+xml"}
TAG=re.compile(r"(?:,\s*|\s+)(?:RC|UER(?:UER)?|ERR(?:ERR)?|COR(?:COR)?|VAR(?:VAR)?|SP|SN\d+|PR\d+|SAM)(?=\s|,|:|$)",re.I)
NUMBER=re.compile(r"^(\d{1,3})(?:\s+(AGT|DH|PP|T|UL))?$",re.I)
ROOKIE_NUMBERS={"52","111","113"}
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
 match=TAG.search(value)
 return value[:match.start()].strip(" ,;") if match else value
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.5)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=40) as r:return r.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code} at {url}; NO CSV WRITTEN")
   print(f"TCDB temporary HTTP {e.code}; retry {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*(2**attempt))
  except Exception as e:raise SystemExit(f"TCDB unavailable: {e}; NO CSV WRITTEN")
 raise SystemExit(f"TCDB unavailable after retries: {url}; NO CSV WRITTEN")
def collect(key,sid,expected,rookies=False):
 cards={};errors=[]
 for page in range(1,12):
  path="Rookies" if rookies else "Checklist"
  p=Rows();p.feed(fetch(f"https://www.tcdb.com/{path}.cfm/sid/{sid}/1998-Metal-Universe?PageIndex={page}"))
  parsed=added=0
  for row in p.rows:
   cells=[c.strip() for c in row if c.strip()]
   for i,value in enumerate(cells):
    match=NUMBER.fullmatch(value)
    if not match or i+1>=len(cells):continue
    number=str(int(match.group(1)))
    if (key in ("base","precious-metal-gems","rookies")) and not 1<=int(number)<=220:continue
    player=clean(cells[i+1]);team=cells[-1] if i+2<len(cells) else ""
    if not player:continue
    if team==cells[i+1]:team=""
    identity=(player,team)
    parsed+=1
    if number in cards and cards[number]!=identity:
     errors.append(f"{key} #{number}: {cards[number]!r} differs from {identity!r}")
    if number not in cards:cards[number]=identity;added+=1
    break
  print(f"{key} page {page}: {parsed} rows, +{added}; {len(cards)}/{expected}",flush=True)
  if len(cards)>=expected:break
  if page>1 and parsed==0:break
 if len(cards)!=expected:errors.append(f"{key}: expected {expected}, found {len(cards)}")
 return cards,errors
def run():
 cfg=json.loads(BUNDLE.read_text(encoding="utf-8"))
 data={};errors=[]
 for spec in cfg["productSets"]:
  entries,issues=collect(spec["key"],spec["sourceSetId"],spec["expectedCards"])
  data[spec["key"]]=entries;errors.extend(issues)
 rookies,issues=collect("rookies",1167,3,True);errors.extend(issues)
 base=data["base"];pmg=data["precious-metal-gems"]
 full={str(n) for n in range(1,221)}
 if set(base)!=full:errors.append("Base numbering must be 1 through 220")
 if set(pmg)!=full:errors.append("PMG numbering must match entire Base checklist")
 for number,identity in pmg.items():
  if identity!=base.get(number):errors.append(f"PMG #{number}: {identity!r} differs from Base {base.get(number)!r}")
 if set(rookies)!=ROOKIE_NUMBERS:errors.append(f"Rookie index numbers inconsistent: {sorted(rookies)}")
 for number,identity in rookies.items():
  if identity!=base.get(number):errors.append(f"Rookie #{number}: {identity!r} differs from Base {base.get(number)!r}")
 for key in ("all-galactic-team","diamond-heroes","platinum-portraits","titanium","universal-language"):
  expected={str(n) for n in range(1,len(data[key])+1)}
  if set(data[key])!=expected:errors.append(f"{key}: unexpected insert numbering")
 if errors:
  print("=== SOURCE DISCREPANCIES ===")
  for issue in errors[:100]:print("  "+issue)
  raise SystemExit(f"{len(errors)} source discrepancies; NO CSV WRITTEN")
 rows=[]
 for spec in cfg["productSets"]:
  key=spec["key"]
  for number,(player,team) in data[key].items():
   if key=="base" and number in rookies:player+=" RC"
   rows.append((key,number,player,team,"",spec["name"] if key!="base" else ""))
 count=sum(s["expectedCards"] for s in cfg["productSets"])
 if count!=511 or len(rows)!=511 or len({(r[0],r[1]) for r in rows})!=511:raise SystemExit("Card identity mismatch; NO CSV WRITTEN")
 CSV.parent.mkdir(parents=True,exist_ok=True)
 with CSV.open("w",newline="",encoding="utf-8") as f:
  w=csv.writer(f,lineterminator="\n");w.writerow(("setKey","cardNumber","player","team","subset","variant"));w.writerows(rows)
 print("GENERATED 511 cards across 7 ProductSets; 3 true Base RCs; UNRELEASED")
 print(f"CSV: {CSV}")
def tests():
 assert clean("Ken Boswell")=="Ken Boswell"
 assert clean("Henry Blanco RC")=="Henry Blanco"
 assert clean("Jose Cruz, Jr. SN50")=="Jose Cruz, Jr."
 assert clean("Frank Thomas UER: Incorrect checklist")=="Frank Thomas"
 assert NUMBER.fullmatch("1 AGT") and NUMBER.fullmatch("18 AGT")
 assert NUMBER.fullmatch("1 DH") and NUMBER.fullmatch("1 PP")
 assert NUMBER.fullmatch("1 T") and NUMBER.fullmatch("1 UL")
 assert len(ROOKIE_NUMBERS)==3
 print("1998 Metal Universe offline self-tests passed")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");args=p.parse_args()
 tests()
 if not args.self_test:run()
