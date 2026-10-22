#!/usr/bin/env python3
"""1995 Fleer Baseball: TCDB-verified, fail-closed Set Factory."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from html.parser import HTMLParser
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1995-fleer-baseball.bundle.json"
OUT=ROOT/"data/set-factory/1995-fleer-baseball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory source validation)","Accept":"text/html,application/xhtml+xml"}
TOKEN=re.compile(r"(?:,\s*|\s+)(?:RC|UER|ERR|COR|VAR|SP|PR\d+|SN\d+)(?=\s|,|:|$)",re.I)
CARDNO=re.compile(r"^(?:\d{1,3}[a-z]?|[A-Z]{1,5}[-/]?\d{1,3}[a-z]?|NNO)$",re.I)
class Rows(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None;self.link=False
 def handle_starttag(self,tag,attrs):
  if tag=="tr":self.row=[];self.link=False
  elif tag=="td" and self.row is not None:self.cell=[]
  elif tag=="a" and self.row is not None and any(k=="href" and "ViewCard.cfm" in (v or "") for k,v in attrs):self.link=True
 def handle_data(self,value):
  if self.cell is not None:self.cell.append(value)
 def handle_endtag(self,tag):
  if tag=="td" and self.cell is not None:
   self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  elif tag=="tr" and self.row is not None:
   if self.row and self.link:self.rows.append(self.row)
   self.row=None
def clean(value):
 value=" ".join(value.split()).strip()
 found=TOKEN.search(value)
 return value[:found.start()].strip(" ,;") if found else value
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.6)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=40) as r:return r.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code} at {url}; NO CSV WRITTEN")
   print(f"TCDB temporary HTTP {e.code}; retry {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*2**attempt)
  except Exception as e:raise SystemExit(f"TCDB unavailable at {url}: {e}; NO CSV WRITTEN")
 raise SystemExit(f"TCDB unavailable after bounded retries: {url}; NO CSV WRITTEN")
def collect(key,sid,count,rookies=False):
 found={};issues=[];nno=0
 for index in range(1,10):
  route="Rookies" if rookies else "Checklist"
  parser=Rows();parser.feed(fetch(f"https://www.tcdb.com/{route}.cfm/sid/{sid}/1995-Fleer?PageIndex={index}"))
  parsed=added=0
  for row in parser.rows:
   values=[x.strip() for x in row if x.strip()]
   for i,number in enumerate(values):
    if not CARDNO.fullmatch(number) or i+1>=len(values):continue
    if key=="base" and (not number.isdecimal() or not 1<=int(number)<=600):continue
    # TCDB lists Derek Jeter #7a ERR and #7b COR. VCS treats
    # printing corrections as a single actual card identity (#7).
    if key=="major-league-prospects" and number.lower() in ("7a","7b"):
     number="7"
    player=clean(values[i+1])
    if not player:continue
    team=values[-1] if i+2<len(values) else ""
    if team==values[i+1]:team=""
    if number.upper()=="NNO":
     nno+=1;number=f"NNO-{nno:02d}"
    parsed+=1
    identity=(player,team)
    if number in found and found[number]!=identity:issues.append(f"{key} #{number}: {found[number]!r} versus {identity!r}")
    if number not in found:found[number]=identity;added+=1
    break
  print(f"{key} page {index}: {parsed} rows, +{added}; {len(found)}/{count}",flush=True)
  if len(found)>=count:break
  if index>1 and parsed==0:break
 if len(found)!=count:issues.append(f"{key}: expected {count}; found {len(found)}")
 return found,issues
def generate():
 bundle=json.loads(BUNDLE.read_text(encoding="utf-8"))
 data={};issues=[]
 for spec in bundle["productSets"]:
  cards,bad=collect(spec["key"],spec["sourceSetId"],spec["expectedCards"])
  data[spec["key"]]=cards;issues.extend(bad)
 rookies,bad=collect("rookies",494,2,True);issues.extend(bad)
 base=data["base"]
 if set(base)!={str(n) for n in range(1,601)}:issues.append("Base missing or extraneous card numbers")
 if set(rookies)!={"91","470"}:issues.append(f"Rookie index mismatch: {rookies!r}")
 for number,identity in rookies.items():
  if base.get(number)!=identity:issues.append(f"Rookie #{number}: {identity!r} differs from Base {base.get(number)!r}")
 if issues:
  print("=== SOURCE DISCREPANCIES ===")
  for item in issues:print("  "+item)
  raise SystemExit(f"{len(issues)} discrepancies; NO CSV WRITTEN")
 rows=[]
 for spec in bundle["productSets"]:
  key=spec["key"]
  for number,(player,team) in data[key].items():
   if key=="base" and number in rookies:player+=" RC"
   rows.append((key,number,player,team,"",spec["name"] if key!="base" else ""))
 target=sum(s["expectedCards"] for s in bundle["productSets"])
 if target!=716 or len(rows)!=target or len({(r[0],r[1]) for r in rows})!=target:
  raise SystemExit("Total/identity validation failed; NO CSV WRITTEN")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",newline="",encoding="utf-8") as f:
  writer=csv.writer(f,lineterminator="\n")
  writer.writerow(("setKey","cardNumber","player","team","subset","variant"));writer.writerows(rows)
 print(f"GENERATED {len(rows)} cards across {len(bundle['productSets'])} ProductSets; 2 true Base RCs; UNRELEASED")
 print(f"CSV: {OUT}")
def self_test():
 assert clean("Ken Boswell")=="Ken Boswell"
 assert clean("Ken Boswell RC")=="Ken Boswell"
 assert clean("Brad Cornett RC")=="Brad Cornett"
 assert clean("Tony Gwynn SN1000")=="Tony Gwynn"
 assert clean("All-Stars")=="All-Stars"
 assert CARDNO.fullmatch("NNO") and CARDNO.fullmatch("AS1")
 assert CARDNO.fullmatch("7a") and CARDNO.fullmatch("7b")
 print("1995 Fleer offline self-tests passed")
if __name__=="__main__":
 parser=argparse.ArgumentParser();parser.add_argument("--self-test",action="store_true");args=parser.parse_args()
 self_test()
 if not args.self_test:generate()
