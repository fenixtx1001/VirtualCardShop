#!/usr/bin/env python3
"""1996 Studio Baseball Set Factory: complete, source-validated, fail-closed."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from pathlib import Path
from html.parser import HTMLParser

ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1996-studio-baseball.bundle.json"
OUT=ROOT/"data/set-factory/1996-studio-baseball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory)","Accept":"text/html,application/xhtml+xml"}
TOKEN=re.compile(r"(?:,\s*|\s+)(?:RC|UER|ERR|COR|VAR|PR\d+|SN\d+|SP)(?=\s|,|:|$)",re.I)
class Rows(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None;self.link=False
 def handle_starttag(self,tag,attrs):
  if tag=="tr":self.row=[];self.link=False
  elif tag=="td" and self.row is not None:self.cell=[]
  elif tag=="a" and self.row is not None and any(k=="href" and "ViewCard.cfm" in (v or "") for k,v in attrs):self.link=True
 def handle_data(self,data):
  if self.cell is not None:self.cell.append(data)
 def handle_endtag(self,tag):
  if tag=="td" and self.cell is not None:self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  elif tag=="tr" and self.row is not None:
   if self.row and self.link:self.rows.append(self.row)
   self.row=None
def clean(s):
 s=" ".join(s.split()).strip();m=TOKEN.search(s)
 return s[:m.start()].strip(" ,;") if m else s
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.5)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=40) as r:return r.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code} {url}; NO CSV WRITTEN")
   print(f"TCDB HTTP {e.code}: bounded retry {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*2**attempt)
  except Exception as e:raise SystemExit(f"TCDB unavailable {url}: {e}; NO CSV WRITTEN")
 raise SystemExit(f"TCDB rate-limit persisted {url}; NO CSV WRITTEN")
def collect(key,sid,count,rookies=False):
 found={};issues=[]
 for page in range(1,6):
  route="Rookies" if rookies else "Checklist"
  parser=Rows();parser.feed(fetch(f"https://www.tcdb.com/{route}.cfm/sid/{sid}/1996-Studio?PageIndex={page}"))
  parsed=added=0
  for raw in parser.rows:
   cells=[v.strip() for v in raw if v.strip()]
   for i,v in enumerate(cells):
    if not v.isdecimal() or i+1>=len(cells):continue
    number=int(v)
    if not 1<=number<=max(count,150):continue
    name=clean(cells[i+1])
    if not name:continue
    team=cells[-1] if i+2<len(cells) else ""
    if team==cells[i+1]:team=""
    parsed+=1;no=str(number)
    if no in found and found[no]!=(name,team):issues.append(f"{key} #{no}: conflicting {found[no]} vs {(name,team)}")
    if no not in found:found[no]=(name,team);added+=1
    break
  print(f"{key} page {page}: {parsed} rows; +{added}; {len(found)}/{count}",flush=True)
  if len(found)>=count:break
  if page>1 and parsed==0:break
 if len(found)!=count:issues.append(f"{key}: expected {count}; found {len(found)}")
 return found,issues
def main():
 bundle=json.loads(BUNDLE.read_text(encoding="utf-8"));data={};issues=[]
 for spec in bundle["productSets"]:
  key=spec["key"]
  cards,problems=collect(key,spec["sourceSetId"],spec["expectedCards"])
  data[key]=cards;issues.extend(problems)
 rookies,problems=collect("rookies",792,1,True);issues.extend(problems)
 base=data["base"]
 if set(base)!={str(i) for i in range(1,151)}:issues.append("Base 1-150 numbering invalid")
 if set(rookies)!={"123"} or rookies.get("123")!=base.get("123"):issues.append(f"RC index mismatch: {rookies!r}, Base #123 {base.get('123')!r}")
 for key in ("press-proofs-bronze","press-proofs-gold","press-proofs-silver"):
  if set(data[key])!=set(base):issues.append(f"{key}: expected complete 1-150 numbering")
  for number,identity in data[key].items():
   if identity!=base.get(number):issues.append(f"{key} #{number}: {identity!r} != Base {base.get(number)!r}")
 if set(data["masterstrokes"])!={str(i) for i in range(1,9)}:issues.append("Masterstrokes must be numbered 1-8, with no fabricated #9/#10")
 if issues:
  print("=== SOURCE DISCREPANCIES ===")
  for issue in issues:print("  "+issue)
  raise SystemExit(f"{len(issues)} discrepancies; NO CSV WRITTEN")
 rows=[]
 for spec in bundle["productSets"]:
  key=spec["key"]
  for number,(name,team) in data[key].items():
   if key=="base" and number in rookies:name+=" RC"
   rows.append((key,number,name,team,"",spec["name"] if key!="base" else ""))
 if len(rows)!=630 or len({(r[0],r[1]) for r in rows})!=630:raise SystemExit("Count or identity failed; NO CSV WRITTEN")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",newline="",encoding="utf-8") as f:
  w=csv.writer(f,lineterminator="\n");w.writerow(("setKey","cardNumber","player","team","subset","variant"));w.writerows(rows)
 print(f"GENERATED {len(rows)} cards across {len(bundle['productSets'])} ProductSets; 1 true Base RC; UNRELEASED")
 print(f"CSV: {OUT}")
def tests():
 assert clean("Ken Boswell")=="Ken Boswell"
 assert clean("Ken Boswell RC")=="Ken Boswell"
 assert clean("Marshall")=="Marshall"
 assert clean("Cal Ripken, Jr. PR500")=="Cal Ripken, Jr."
 assert clean("Tony Gwynn SN5000")=="Tony Gwynn"
 print("1996 Studio offline self-tests passed")
if __name__=="__main__":
 a=argparse.ArgumentParser();a.add_argument("--self-test",action="store_true");args=a.parse_args()
 tests()
 if not args.self_test:main()
