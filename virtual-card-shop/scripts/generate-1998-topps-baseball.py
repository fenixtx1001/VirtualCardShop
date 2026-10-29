#!/usr/bin/env python3
"""1998 Topps Baseball fail-closed Set Factory generator (TCDB source audit)."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1998-topps-baseball.bundle.json"
OUT=ROOT/"data/set-factory/1998-topps-baseball.cards.csv"
HEADER={"User-Agent":"Mozilla/5.0 (compatible; VCS TCDB checklist validator)","Accept":"text/html,application/xhtml+xml"}
NUMBER=re.compile(r"^(?:\d{1,3}|[A-Z]{1,7}[-]?\d{1,3}|NNO)$",re.I)
NOTES=re.compile(r"(?:,\s*|\s+)(?:RC|PROS|DPK|UER|ERR|COR|VAR|SP|SN\d+|PR\d+|MEM|AU)(?=:|,|\s|$)",re.I)
class TableRows(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None;self.link=False
 def handle_starttag(self,t,a):
  if t=="tr":self.row=[];self.link=False
  elif t=="td" and self.row is not None:self.cell=[]
  elif t=="a" and self.row is not None and any(k=="href" and "ViewCard.cfm" in (v or "") for k,v in a):self.link=True
 def handle_data(self,s):
  if self.cell is not None:self.cell.append(s)
 def handle_endtag(self,t):
  if t=="td" and self.cell is not None:self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  elif t=="tr" and self.row is not None:
   if self.row and self.link:self.rows.append(self.row)
   self.row=None
def clean(s):
 s=" ".join(s.split()).strip()
 s=re.sub(r",?\s*(?:RCRC|ERRERR|CORCOR|VARVAR):.*$","",s,flags=re.I)
 m=NOTES.search(s)
 return s[:m.start()].strip(" ,;") if m else s
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.25)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEADER),timeout=45) as response:return response.read().decode("utf-8","replace")
  except urllib.error.HTTPError as error:
   if error.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {error.code}; NO CSV WRITTEN: {url}")
   print(f"Temporary HTTP {error.code}, attempt {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*2**attempt)
  except Exception as error:raise SystemExit(f"TCDB read failed {error}; NO CSV WRITTEN")
 raise SystemExit("TCDB retries exhausted; NO CSV WRITTEN")
def collect(key,sid,expected,rookies=False):
 found={};errors=[];nno=0;rows_seen=0
 for page in range(1,12):
  mode="Rookies" if rookies else "Checklist"
  parser=TableRows();parser.feed(fetch(f"https://www.tcdb.com/{mode}.cfm/sid/{sid}/1998-Topps?PageIndex={page}"))
  new=0
  for row in parser.rows:
   cells=[c.strip() for c in row if c.strip()]
   for i,raw in enumerate(cells):
    if not NUMBER.fullmatch(raw) or i+1>=len(cells):continue
    if rookies and not raw.isdigit():continue
    num=str(int(raw)) if raw.isdigit() else raw.upper()
    player=clean(cells[i+1]);team=cells[-1] if i+2<len(cells) else ""
    if team==cells[i+1]:team=""
    if not player:continue
    new+=1;rows_seen+=1
    if num=="NNO":nno+=1;num=f"NNO-{nno:02d}"
    value=(player,team)
    if num in found and found[num]!=value:errors.append(f"{key} #{num}: {found[num]!r} conflicts with {value!r}")
    elif num in found:errors.append(f"{key} #{num}: duplicate source row")
    else:found[num]=value
    break
  print(f"{key} page {page}: {new} source rows; {len(found)}/{expected}",flush=True)
  if len(found)>=expected:break
  if page>1 and not new:break
 if len(found)!=expected:errors.append(f"{key}: {len(found)} cards, expected {expected}")
 return found,errors
def test():
 assert clean("Rich Loiselle RC")=="Rich Loiselle"
 assert clean("A.J. Hinch / Mark Osborne / Robert Fick PROS, RC")=="A.J. Hinch / Mark Osborne / Robert Fick"
 assert NUMBER.fullmatch("ILM20") and NUMBER.fullmatch("RC5") and NUMBER.fullmatch("NNO")
 print("1998 Topps offline self-tests passed")
def main():
 bundle=json.loads(BUNDLE.read_text(encoding="utf-8"))
 source={};errors=[]
 for spec in bundle["productSets"]:
  records,problems=collect(spec["key"],spec["sourceSetId"],spec["expectedCards"])
  source[spec["key"]]=records;errors.extend(problems)
 rookies,problems=collect("rookies",1238,23,True);errors.extend(problems)
 base=source["base"];printed={str(i) for i in range(1,505) if i!=7}
 if set(base)!=printed:errors.append(f"Base numbers wrong: missing {sorted(printed-set(base))[:10]}, extra {sorted(set(base)-printed)[:10]}")
 for key in ("inaugural-devil-rays","inaugural-diamondbacks"):
  if set(source[key])!=printed:errors.append(f"{key}: expected all 503 printed Base numbers")
  for n,value in source[key].items():
   if value!=base.get(n):errors.append(f"{key} #{n}: differs from Base {value!r} != {base.get(n)!r}")
 coop={str(i) for i in range(1,504) if i!=7}
 if set(source["minted-cooperstown"])!=coop:errors.append("Minted in Cooperstown must exclude #7 and #504")
 for n,value in source["minted-cooperstown"].items():
  if value!=base.get(n):errors.append(f"Minted in Cooperstown #{n}: differs from Base")
 if set(rookies)!=set(rookies).intersection(printed):errors.append("Rookies outside Base numbering")
 for n,value in rookies.items():
  if value!=base.get(n):errors.append(f"Rookie #{n}: {value!r} differs from Base {base.get(n)!r}")
 if errors:
  print("=== SOURCE DISCREPANCIES ===")
  for item in errors[:120]:print("  "+item)
  raise SystemExit(f"{len(errors)} discrepancies; NO CSV WRITTEN")
 result=[]
 for spec in bundle["productSets"]:
  key=spec["key"]
  for n,(player,team) in source[key].items():
   if key=="base" and n in rookies:player+=" RC"
   subset=("Series 1" if int(n)<=283 else "Series 2") if key=="base" else ""
   result.append((key,n,player,team,subset,spec["name"] if key!="base" else ""))
 expected=Counter({s["key"]:s["expectedCards"] for s in bundle["productSets"]})
 if Counter(row[0] for row in result)!=expected or len(result)!=2357 or len(set((r[0],r[1]) for r in result))!=2357:raise SystemExit("Output count/identity discrepancy; NO CSV WRITTEN")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",newline="",encoding="utf-8") as file:
  writer=csv.writer(file,lineterminator="\n");writer.writerow(("setKey","cardNumber","player","team","subset","variant"));writer.writerows(result)
 print("GENERATED 2357 cards across 25 ProductSets; 23 Base rookies; UNRELEASED")
 print(f"CSV: {OUT}")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");args=p.parse_args()
 test()
 if not args.self_test:main()
