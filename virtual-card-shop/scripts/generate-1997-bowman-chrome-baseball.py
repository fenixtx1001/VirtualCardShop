#!/usr/bin/env python3
"""1997 Bowman Chrome Baseball — fail-closed eight-family TCDB checklist."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1997-bowman-chrome-baseball.bundle.json"
CSV=ROOT/"data/set-factory/1997-bowman-chrome-baseball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory validator)","Accept":"text/html,application/xhtml+xml"}
ANNOT=re.compile(r"(?:,\s*|\s+)(?:RC|UER|ERR|COR|VAR|SP|SN\d+|PR\d+)(?=\s|,|:|$)",re.I)
NUMBER=re.compile(r"^(?:\d{1,3}|ROY\s*\d{1,2}|SHR\s*\d{1,2})$",re.I)
ROOKIE_COUNT=99
class Rows(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None;self.link=False
 def handle_starttag(self,t,attrs):
  if t=="tr":self.row=[];self.link=False
  elif t=="td" and self.row is not None:self.cell=[]
  elif t=="a" and self.row is not None and any(k=="href" and "ViewCard.cfm" in (v or "") for k,v in attrs):self.link=True
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
def cardno(raw):
 match=re.fullmatch(r"(ROY|SHR)\s*(\d+)",raw,re.I)
 if match:return match.group(1).upper()+str(int(match.group(2)))
 if raw.isdecimal():return str(int(raw))
 return raw
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.5)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=40) as response:return response.read().decode("utf-8","replace")
  except urllib.error.HTTPError as err:
   if err.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {err.code} at {url}; NO CSV WRITTEN")
   print(f"TCDB HTTP {err.code}, retry {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*2**attempt)
  except Exception as err:raise SystemExit(f"TCDB unavailable: {err}; NO CSV WRITTEN")
 raise SystemExit(f"TCDB retries exhausted: {url}; NO CSV WRITTEN")
def collect(key,sid,expected,rookies=False):
 found={};errors=[]
 for page in range(1,12):
  endpoint="Rookies" if rookies else "Checklist"
  parser=Rows()
  parser.feed(fetch(f"https://www.tcdb.com/{endpoint}.cfm/sid/{sid}/1997-Bowman-Chrome?PageIndex={page}"))
  parsed=added=0
  for row in parser.rows:
   cells=[x.strip() for x in row if x.strip()]
   for i,raw in enumerate(cells):
    if not NUMBER.fullmatch(raw) or i+1>=len(cells):continue
    number=cardno(raw)
    if (key in ("base","international","international-refractors","refractors") or rookies) and (not number.isdecimal() or not 1<=int(number)<=300):continue
    player=clean(cells[i+1]);team=cells[-1] if i+2<len(cells) else ""
    if not player:continue
    if team==cells[i+1]:team=""
    identity=(player,team);parsed+=1
    if number in found and found[number]!=identity:errors.append(f"{key} #{number}: {found[number]!r} differs from {identity!r}")
    if number not in found:found[number]=identity;added+=1
    break
  print(f"{key} page {page}: {parsed} rows, +{added}; {len(found)}/{expected}",flush=True)
  if len(found)>=expected:break
  if page>1 and not parsed:break
 if len(found)!=expected:errors.append(f"{key}: expected {expected}, found {len(found)}")
 return found,errors
def run():
 bundle=json.loads(BUNDLE.read_text(encoding="utf-8"))
 data={};errors=[]
 for spec in bundle["productSets"]:
  rows,issues=collect(spec["key"],spec["sourceSetId"],spec["expectedCards"])
  data[spec["key"]]=rows;errors.extend(issues)
 rookies,issues=collect("rookies",864,ROOKIE_COUNT,True);errors.extend(issues)
 base=data["base"];base_numbers={str(n) for n in range(1,301)}
 if set(base)!=base_numbers:errors.append("Base must have numbers 1-300")
 for key in ("international","international-refractors","refractors"):
  if set(data[key])!=base_numbers:errors.append(f"{key}: incomplete Base numbering")
  for number,identity in data[key].items():
   if identity!=base.get(number):errors.append(f"{key} #{number}: {identity!r} differs from Base {base.get(number)!r}")
 if not set(rookies).issubset(base_numbers):errors.append("Rookie numbers outside Base")
 for number,identity in rookies.items():
  if identity!=base.get(number):errors.append(f"Rookie #{number}: {identity!r} differs from Base {base.get(number)!r}")
 for key in ("rookie-of-the-year-favorites","rookie-of-the-year-favorites-refractors","scouts-honor-roll","scouts-honor-roll-refractors"):
  prefix="ROY" if key.startswith("rookie") else "SHR"
  if set(data[key])!={f"{prefix}{n}" for n in range(1,16)}:errors.append(f"{key}: expected {prefix}1-{prefix}15")
 for left,right in (("rookie-of-the-year-favorites","rookie-of-the-year-favorites-refractors"),("scouts-honor-roll","scouts-honor-roll-refractors")):
  for n,identity in data[right].items():
   if identity!=data[left].get(n):errors.append(f"{right} #{n}: {identity!r} differs from {left} {data[left].get(n)!r}")
 if errors:
  print("=== SOURCE DISCREPANCIES ===")
  for err in errors[:100]:print("  "+err)
  raise SystemExit(f"{len(errors)} discrepancies; NO CSV WRITTEN")
 rows=[]
 for spec in bundle["productSets"]:
  key=spec["key"]
  for number,(player,team) in data[key].items():
   if key=="base" and number in rookies:player+=" RC"
   rows.append((key,number,player,team,"",spec["name"] if key!="base" else ""))
 if len(rows)!=1260 or len({(r[0],r[1]) for r in rows})!=1260:raise SystemExit("Count mismatch; NO CSV WRITTEN")
 CSV.parent.mkdir(parents=True,exist_ok=True)
 with CSV.open("w",newline="",encoding="utf-8") as f:
  w=csv.writer(f,lineterminator="\n");w.writerow(("setKey","cardNumber","player","team","subset","variant"));w.writerows(rows)
 print("GENERATED 1260 cards across 8 ProductSets; 99 true Base RCs; UNRELEASED")
 print(f"CSV: {CSV}")
def selftest():
 assert clean("Adrian Beltre RC")=="Adrian Beltre"
 assert clean("Derek Jeter")=="Derek Jeter"
 assert cardno("ROY1")=="ROY1" and cardno("ROY 15")=="ROY15"
 assert cardno("SHR 1")=="SHR1" and cardno("SHR 15")=="SHR15"
 print("1997 Bowman Chrome offline self-tests passed")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");args=p.parse_args()
 selftest()
 if not args.self_test:run()
