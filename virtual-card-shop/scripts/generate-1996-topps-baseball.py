#!/usr/bin/env python3
"""1996 Topps Baseball Set Factory: all 15 TCDB insert families, fail-closed."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from html.parser import HTMLParser
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1996-topps-baseball.bundle.json"
OUT=ROOT/"data/set-factory/1996-topps-baseball.cards.csv"
HEAD={"User-Agent":"Mozilla/5.0 (compatible; VCS checklist audit)","Accept":"text/html,application/xhtml+xml"}
NUMBER=re.compile(r"^(?:\d{1,3}|[A-Z]{1,4}-?\d{1,3}|NNO)$",re.I)
ANNO=re.compile(r"(?:,\s*|\s+)(?:STP|COMM|DPK|AAA|FUT|RC|UER|ERR|COR|VAR|PR\d+|SN\d+|SP)(?=:|,|\s|$)",re.I)
class Rows(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None;self.has_card=False
 def handle_starttag(self,t,attrs):
  if t=="tr":self.row=[];self.has_card=False
  elif t=="td" and self.row is not None:self.cell=[]
  elif t=="a" and self.row is not None and any(k=="href" and "ViewCard.cfm" in (v or "") for k,v in attrs):self.has_card=True
 def handle_data(self,s):
  if self.cell is not None:self.cell.append(s)
 def handle_endtag(self,t):
  if t=="td" and self.cell is not None:self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  elif t=="tr" and self.row is not None:
   if self.has_card and self.row:self.rows.append(self.row)
   self.row=None
def clean(s):
 s=" ".join(s.split()).strip()
 # TCDB appends detailed RC notes after PROS on multi-player cards.
 s=re.sub(r",?\s*RCRC for .*? only\.?$","",s,flags=re.I)
 s=re.sub(r"(?<=\w)(PROS)(?=,|$)",r" PROS",s) if not re.search(r"\sPROS(?:,|$)",s) else s
 for before,after in (("AdamRiggs","Adam Riggs"),("RayRicken","Ray Ricken")):s=s.replace(before,after)
 m=ANNO.search(s)
 return s[:m.start()].strip(" ,;") if m else s
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.25)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEAD),timeout=45) as response:return response.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code}; NO CSV WRITTEN: {url}")
   print(f"Temporary TCDB HTTP {e.code}; retry {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*2**attempt)
  except Exception as e:raise SystemExit(f"TCDB request failed: {e}; NO CSV WRITTEN")
 raise SystemExit("TCDB retries exhausted; NO CSV WRITTEN")
def collect(key,sid,expected,rookies=False):
 result={};issues=[];rows_seen=0
 for page in range(1,12):
  mode="Rookies" if rookies else "Checklist"
  parsed=Rows();parsed.feed(fetch(f"https://www.tcdb.com/{mode}.cfm/sid/{sid}/1996-Topps?PageIndex={page}"))
  new=0
  for row in parsed.rows:
   cells=[c.strip() for c in row if c.strip()]
   for i,raw in enumerate(cells):
    if not NUMBER.fullmatch(raw) or i+1>=len(cells):continue
    if rookies and not raw.isdigit():continue
    number=raw.upper() if not raw.isdigit() else str(int(raw))
    player=clean(cells[i+1])
    team=cells[-1] if i+2<len(cells) else ""
    for before,after in (("OaklandAthletics","Oakland Athletics"),("St. LouisCardinals","St. Louis Cardinals"),("SanFrancisco","San Francisco"),("Los AngelesDodgers","Los Angeles Dodgers")):team=team.replace(before,after)
    if team==cells[i+1]:team=""
    if not player:continue
    rows_seen+=1;new+=1
    if number=="NNO":number=f"NNO-{rows_seen:02d}"
    identity=(player,team)
    if number in result and result[number]!=identity:issues.append(f"{key} #{number}: {result[number]!r} vs {identity!r}")
    elif number not in result:result[number]=identity
    break
  print(f"{key} page {page}: {new} source rows; {len(result)}/{expected}",flush=True)
  if len(result)>=expected:break
  if page>1 and not new:break
 if len(result)!=expected:issues.append(f"{key}: {len(result)} unique IDs, expected {expected}")
 return result,issues
def check():
 assert clean("Tony Gwynn STP")=="Tony Gwynn"
 assert clean("Sean Casey DPK, RC")=="Sean Casey"
 assert clean("Matt Drews / Rich Hunter / Matt Ruebel / Bret Wagner PROS, RCRC for Hunter and Ruebel only.")=="Matt Drews / Rich Hunter / Matt Ruebel / Bret Wagner PROS"
 assert clean("Kevin Jordan / Bobby Morris / Desi Relaford / AdamRiggs PROS, RCRC for Morris and Riggs only")=="Kevin Jordan / Bobby Morris / Desi Relaford / Adam Riggs PROS"
 assert clean("Anton French / Demond Smith / Darond Stovall / Keith Williams PROS, RCRC for French, Smith and Stovall only.")=="Anton French / Demond Smith / Darond Stovall / Keith Williams PROS"
 assert NUMBER.fullmatch("NL-20") and NUMBER.fullmatch("CC15") and NUMBER.fullmatch("NNO")
 print("1996 Topps offline self-tests passed")
def run():
 bundle=json.loads(BUNDLE.read_text(encoding="utf-8"))
 result={};problems=[]
 for spec in bundle["productSets"]:
  cards,issues=collect(spec["key"],spec["sourceSetId"],spec["expectedCards"])
  result[spec["key"]]=cards;problems.extend(issues)
 rookies,issues=collect("rookies",803,34,rookies=True);problems.extend(issues)
 base=result["base"]
 if set(base)!={str(n) for n in range(1,441)}:problems.append("Base numbering is not exactly 1-440")
 for number,identity in rookies.items():
  if identity!=base.get(number):problems.append(f"Rookie #{number} {identity!r} != Base {base.get(number)!r}")
 if set(result["power-boosters"])!={str(i) for i in range(1,27) if i!=7}:problems.append("Power Boosters numbering is not 1-26 except 7")
 for key in ("mantle-reprints","mantle-finest","mantle-finest-refractors","mantle-sealed"):
  if set(result[key])!={str(i) for i in range(1,20)}:problems.append(f"{key}: expected all 19 Mantle reprints")
 for key in ("mystery-finest","mystery-finest-refractors"):
  if set(result[key])!={f"M{i}" for i in range(1,27)}:problems.append(f"{key}: expected M1-M26")
 if problems:
  print("=== SOURCE DISCREPANCIES ===")
  for p in problems[:100]:print(" ",p)
  raise SystemExit(f"{len(problems)} source discrepancies; NO CSV WRITTEN")
 output=[]
 for spec in bundle["productSets"]:
  for number,(player,team) in result[spec["key"]].items():
   if spec["key"]=="base" and number in rookies:player+=" RC"
   output.append((spec["key"],number,player,team,"Series 1" if spec["key"]=="base" and int(number)<=220 else "Series 2" if spec["key"]=="base" else "",spec["name"] if spec["key"]!="base" else ""))
 expected={s["key"]:s["expectedCards"] for s in bundle["productSets"]}
 if Counter(r[0] for r in output)!=expected or len(output)!=723 or len(set((r[0],r[1]) for r in output))!=723:raise SystemExit("Output count mismatch; NO CSV WRITTEN")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",newline="",encoding="utf-8") as f:
  writer=csv.writer(f,lineterminator="\n");writer.writerow(("setKey","cardNumber","player","team","subset","variant"));writer.writerows(output)
 print(f"GENERATED {len(output)} cards across {len(expected)} ProductSets; {len(rookies)} Base rookies; UNRELEASED")
 print(f"CSV: {OUT}")
if __name__=="__main__":
 parser=argparse.ArgumentParser();parser.add_argument("--self-test",action="store_true");args=parser.parse_args()
 check()
 if not args.self_test:run()
