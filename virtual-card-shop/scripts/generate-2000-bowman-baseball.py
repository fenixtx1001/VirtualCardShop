#!/usr/bin/env python3
"""2000 Bowman Baseball complete pack-issued set; TCDB-verified fail-closed generator."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/2000-bowman-baseball.bundle.json"
OUT=ROOT/"data/set-factory/2000-bowman-baseball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory source validator)","Accept":"text/html,application/xhtml+xml"}
TAG=re.compile(r"(?:,\s*|\s+)(?:RC|UER(?:UER)?|ERR(?:ERR)?|COR(?:COR)?|VAR(?:VAR)?|AU|BLUE|SIL|GOLD|SP|PR\d+)(?=\s|,|:|$)",re.I)
NO=re.compile(r"^(?:\d{1,3}|[A-Z]{1,4}\d{1,3}|[A-Z]{2,3})$",re.I)
RC_TOTAL=114
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
def clean(s):
 s=" ".join(s.split()).strip()
 m=TAG.search(s)
 return s[:m.start()].strip(" ,;") if m else s
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.6)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=40) as r:return r.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code} at {url}; NO CSV WRITTEN")
   print(f"TCDB transient HTTP {e.code}; retry {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*(2**attempt))
  except Exception as e:raise SystemExit(f"TCDB unavailable {e}; NO CSV WRITTEN")
 raise SystemExit(f"TCDB rate-limited after retries: {url}; NO CSV WRITTEN")
def collect(key,sid,count,rookies=False):
 found={};issues=[]
 for page in range(1,12):
  path="Rookies" if rookies else "Checklist"
  parser=Rows();parser.feed(fetch(f"https://www.tcdb.com/{path}.cfm/sid/{sid}/2000-Bowman?PageIndex={page}"))
  parsed=added=0
  for row in parser.rows:
   cells=[c.strip() for c in row if c.strip()]
   for i,num in enumerate(cells):
    if not NO.fullmatch(num) or i+1>=len(cells):continue
    if key in ("base","gold","retro-future","rookies"):
     if not num.isdecimal() or not 1<=int(num)<=440:continue
     num=str(int(num))
    name=clean(cells[i+1])
    if not name:continue
    team=cells[-1] if i+2<len(cells) else ""
    if team==cells[i+1]:team=""
    variant=""
    if key=="autographs":
     raw=cells[i+1]
     m=re.search(r"\b(BLUE|SIL|GOLD)\b",raw,re.I)
     if not m:issues.append(f"Autograph #{num} missing foil tier: {raw!r}")
     else:variant={"BLUE":"Blue","SIL":"Silver","GOLD":"Gold"}[m.group(1).upper()]
    identity=(name,team,variant)
    parsed+=1
    if num in found and found[num]!=identity:issues.append(f"{key} #{num}: conflicting identities {found[num]!r} versus {identity!r}")
    if num not in found:found[num]=identity;added+=1
    break
  print(f"{key} page {page}: {parsed} rows, +{added}; {len(found)}/{count}",flush=True)
  if len(found)>=count:break
  if page>1 and parsed==0:break
 if len(found)!=count:issues.append(f"{key}: expected {count}; found {len(found)}")
 return found,issues
def run():
 cfg=json.loads(BUNDLE.read_text(encoding="utf-8"));data={};issues=[]
 for spec in cfg["productSets"]:
  cards,bad=collect(spec["key"],spec["sourceSetId"],spec["expectedCards"])
  data[spec["key"]]=cards;issues.extend(bad)
 rookies,bad=collect("rookies",1371,RC_TOTAL,True);issues.extend(bad)
 base=data["base"]
 full={str(i) for i in range(1,441)}
 if set(base)!=full:issues.append("Base numbers must be 1 through 440")
 if set(rookies)-set(base):issues.append("Rookie index contains cards not in base")
 for number,identity in rookies.items():
  if base.get(number)!=identity:issues.append(f"Rookie #{number}: {identity!r} differs from Base {base.get(number)!r}")
 for key in ("gold","retro-future"):
  if set(data[key])!=full:issues.append(f"{key}: parallel must cover Base #1-440")
  for number,identity in data[key].items():
   if base.get(number)!=identity:issues.append(f"{key} #{number}: {identity!r} differs from Base {base.get(number)!r}")
 if issues:
  print("=== SOURCE DISCREPANCIES ===")
  for item in issues[:80]:print("  "+item)
  raise SystemExit(f"{len(issues)} discrepancies; NO CSV WRITTEN")
 rows=[]
 for spec in cfg["productSets"]:
  key=spec["key"]
  for no,(name,team,variant) in data[key].items():
   if key=="base" and no in rookies:name+=" RC"
   rows.append((key,no,name,team,"",variant or (spec["name"] if key!="base" else "")))
 expected=sum(s["expectedCards"] for s in cfg["productSets"])
 if expected!=1410 or len(rows)!=expected or len({(r[0],r[1]) for r in rows})!=expected:raise SystemExit("Total or identity mismatch; NO CSV WRITTEN")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",newline="",encoding="utf-8") as f:
  w=csv.writer(f,lineterminator="\n");w.writerow(("setKey","cardNumber","player","team","subset","variant"));w.writerows(rows)
 print(f"GENERATED {len(rows)} cards across {len(cfg['productSets'])} ProductSets; {len(rookies)} true Base RCs; UNRELEASED")
 print(f"CSV: {OUT}")
def tests():
 assert clean("Cal Ripken Jr.")=="Cal Ripken Jr."
 assert clean("Bobby Bradley RC, UER")=="Bobby Bradley"
 assert clean("Ben Sheets AU, BLUE")=="Ben Sheets"
 assert clean("Carlos Zambrano RC")=="Carlos Zambrano"
 assert NO.fullmatch("BBP10") and NO.fullmatch("KJW") and NO.fullmatch("MP1")
 print("2000 Bowman offline self-tests passed")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");args=p.parse_args()
 tests()
 if not args.self_test:run()
