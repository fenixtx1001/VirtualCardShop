#!/usr/bin/env python3
"""1987 Donruss Baseball / Roberto Clemente Puzzle: fail-closed TCDB importer."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1987-donruss-baseball.bundle.json"
OUT=ROOT/"data/set-factory/1987-donruss-baseball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory)","Accept":"text/html,application/xhtml+xml"}
TOKEN=re.compile(r"(?:,\s*|\s+)(?:DK|RR|PUZ|RC|UER(?:UER)?|ERR(?:ERR)?|COR(?:COR)?|VAR(?:VAR)?|SP)(?=\s|,|:|$)",re.I)
NO=re.compile(r"^(?:\d{1,3}|\d{1,2}-\d{1,2})$")
class CardRows(HTMLParser):
 def __init__(self):
  super().__init__();self.rows=[];self.row=None;self.cell=None;self.link=False
 def handle_starttag(self,t,a):
  if t=="tr":self.row=[];self.link=False
  elif t=="td" and self.row is not None:self.cell=[]
  elif t=="a" and self.row is not None and any(k=="href" and "ViewCard.cfm" in (v or "") for k,v in a):self.link=True
 def handle_data(self,d):
  if self.cell is not None:self.cell.append(d)
 def handle_endtag(self,t):
  if t=="td" and self.cell is not None:
   self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  elif t=="tr" and self.row is not None:
   if self.row and self.link:self.rows.append(self.row)
   self.row=None
def clean(s):
 s=" ".join(s.split()).strip()
 m=TOKEN.search(s)
 return s[:m.start()].strip(" ,;") if m else s
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.5)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=40) as r:return r.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code}: {url}; NO CSV WRITTEN")
   print(f"TCDB transient HTTP {e.code}; retry {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*2**attempt)
  except Exception as e:raise SystemExit(f"TCDB unavailable: {e}; NO CSV WRITTEN")
 raise SystemExit(f"TCDB rate limiting persisted: {url}; NO CSV WRITTEN")
def collect(key,sid,expected=None,rookies=False):
 found={};issues=[];seen_pages=set()
 for page in range(1,22):
  route="Rookies" if rookies else "Checklist"
  parser=CardRows()
  parser.feed(fetch(f"https://www.tcdb.com/{route}.cfm/sid/{sid}/1987-Donruss?PageIndex={page}"))
  parsed=added=0;page_numbers=[]
  for raw in parser.rows:
   cells=[v.strip() for v in raw if v.strip()]
   for i,no in enumerate(cells):
    if not NO.fullmatch(no) or i+1>=len(cells):continue
    if key!="roberto-clemente-puzzle" and (not no.isdecimal() or not 1<=int(no)<=660):continue
    name=clean(cells[i+1]);team=cells[-1] if i+2<len(cells) else ""
    if not name:continue
    if team==cells[i+1]:team=""
    identity=(name,team)
    parsed+=1;page_numbers.append((no,name,team))
    if no in found and found[no]!=identity:issues.append(f"{key} #{no}: conflicting {found[no]!r} vs {identity!r}")
    if no not in found:found[no]=identity;added+=1
    break
  print(f"{key} page {page}: {parsed} source rows, +{added}; {len(found)}"+(f"/{expected}" if expected else ""),flush=True)
  if expected is not None and len(found)>=expected:break
  signature=tuple(page_numbers)
  if not parsed or signature in seen_pages:break
  seen_pages.add(signature)
 if expected is not None and len(found)!=expected:issues.append(f"{key}: expected {expected}, found {len(found)}")
 return found,issues
def run():
 bundle=json.loads(BUNDLE.read_text(encoding="utf-8"));data={};issues=[]
 for spec in bundle["productSets"]:
  result,bad=collect(spec["key"],spec["sourceSetId"],spec["expectedCards"])
  data[spec["key"]]=result;issues.extend(bad)
 # TCDB returns 250 rookie VAR rows, commonly two per unique number;
 # validate full pagination and a deduplicated fixed count of 125.
 rookies,bad=collect("rookies",112,125,True);issues.extend(bad)
 expected_base={str(n) for n in range(1,661)}
 if set(data["base"])!=expected_base:
  issues.append(f"Base numbering mismatch, missing: {sorted(expected_base-set(data['base']),key=int)[:30]}")
 expected_puzzle={f"{n}-{n+2}" for n in range(1,64,3)}
 if set(data["roberto-clemente-puzzle"])!=expected_puzzle:
  issues.append(f"Puzzle numbering mismatch: {sorted(expected_puzzle-set(data['roberto-clemente-puzzle']))}")
 for no,identity in rookies.items():
  if data["base"].get(no)!=identity:issues.append(f"Rookie #{no}: {identity!r} differs from Base {data['base'].get(no)!r}")
 if issues:
  print("=== SOURCE DISCREPANCIES ===")
  for issue in issues[:80]:print("  "+issue)
  raise SystemExit(f"{len(issues)} issues; NO CSV WRITTEN")
 rows=[]
 for spec in bundle["productSets"]:
  key=spec["key"]
  for no,(name,team) in data[key].items():
   if key=="base" and no in rookies:name+=" RC"
   rows.append((key,no,name,team,"",spec["name"] if key!="base" else ""))
 if len(rows)!=681 or len({(r[0],r[1]) for r in rows})!=681:raise SystemExit("Identity count mismatch; NO CSV WRITTEN")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",newline="",encoding="utf-8") as f:
  writer=csv.writer(f,lineterminator="\n")
  writer.writerow(("setKey","cardNumber","player","team","subset","variant"));writer.writerows(rows)
 print("GENERATED 681 cards across 2 ProductSets; 125 true Base rookies; UNRELEASED")
 print(f"CSV: {OUT}")
def tests():
 assert clean("Ken Boswell")=="Ken Boswell"
 assert clean("Ken Boswell RR, RC, VAR")=="Ken Boswell"
 assert clean("Greg Maddux RR, RC, UER")=="Greg Maddux"
 assert clean("Roberto Clemente PUZ")=="Roberto Clemente"
 assert clean("Marshall")=="Marshall"
 assert len({f"{n}-{n+2}" for n in range(1,64,3)})==21
 print("1987 Donruss offline tests passed")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");args=p.parse_args();tests()
 if not args.self_test:run()
