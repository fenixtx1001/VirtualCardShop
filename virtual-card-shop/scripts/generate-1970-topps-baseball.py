#!/usr/bin/env python3
"""1970 Topps Baseball Set Factory — fail-closed TCDB reconciliation."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1970-topps-baseball.bundle.json"
CSV=ROOT/"data/set-factory/1970-topps-baseball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory checklist validator)","Accept":"text/html,application/xhtml+xml"}
# Keep RS, LL, TC, CL source subject text; strip only TCDB classification tails.
ANNOT=re.compile(r"(?:,\s*|\s+)(?:RC|UER|ERR|COR|VAR|SP|SN\d+|PR\d+|RS|ASR|HOF)(?=\s|,|:|$)",re.I)
NUMBER=re.compile(r"^(?:\d{1,3}[ab]?|NNO)$",re.I)
ROOKIES=85
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
 value=re.sub(r"(?<=\s)RCUER(?=:|\s|,|$)", "RC UER", value, flags=re.I)
 m=ANNOT.search(value)
 return value[:m.start()].strip(" ,;") if m else value
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.5)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=40) as r:return r.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code} at {url}; NO CSV WRITTEN")
   print(f"TCDB temporary HTTP {e.code}, retry {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*2**attempt)
  except Exception as e:raise SystemExit(f"TCDB request failed: {e}; NO CSV WRITTEN")
 raise SystemExit(f"TCDB unavailable: {url}; NO CSV WRITTEN")
def collect(key,sid,expected,rookies=False):
 found={};issues=[];unnumbered=0
 for page in range(1,14):
  endpoint="Rookies" if rookies else "Checklist"
  p=Rows();p.feed(fetch(f"https://www.tcdb.com/{endpoint}.cfm/sid/{sid}/1970-Topps?PageIndex={page}"))
  parsed=added=0
  for row in p.rows:
   cells=[c.strip() for c in row if c.strip()]
   for i,number in enumerate(cells):
    if not NUMBER.fullmatch(number) or i+1>=len(cells):continue
    if key=="base" or rookies:
     matched=re.fullmatch(r"(\d{1,3})(?:[ab])?",number,re.I)
     if not matched or not 1<=int(matched.group(1))<=720:continue
    if number.upper()=="NNO":
     unnumbered+=1;number=f"NNO-{unnumbered:02d}"
    else:number=str(int(re.match(r"\d+",number).group()))
    player=clean(cells[i+1])
    if not player:continue
    team=cells[-1] if i+2<len(cells) else ""
    if team==cells[i+1]:team=""
    identity=(player,team);parsed+=1
    if number in found and found[number]!=identity:issues.append(f"{key} #{number}: {found[number]!r} differs from {identity!r}")
    if number not in found:found[number]=identity;added+=1
    break
  print(f"{key} page {page}: {parsed} rows, +{added}; {len(found)}/{expected}",flush=True)
  if len(found)>=expected:break
  if page>1 and not parsed:break
 if len(found)!=expected:issues.append(f"{key}: expected {expected}, found {len(found)}")
 return found,issues
def run():
 cfg=json.loads(BUNDLE.read_text(encoding="utf-8"))
 data={};errors=[]
 for s in cfg["productSets"]:
  found,issues=collect(s["key"],s["sourceSetId"],s["expectedCards"])
  data[s["key"]]=found;errors.extend(issues)
 rookies,issues=collect("rookies",70,ROOKIES,True);errors.extend(issues)
 base=data["base"]
 if set(base)!={str(i) for i in range(1,721)}:errors.append("Base numbering must be exactly 1-720")
 if set(rookies)-set(base):errors.append("Rookie index contains numbers outside Base")
 for number,identity in rookies.items():
  if identity!=base.get(number):errors.append(f"Rookie #{number}: {identity!r} differs from Base {base.get(number)!r}")
 for key in ("booklets","posters","scratch-offs"):
  expected={f"NNO-{i:02d}" for i in range(1,25)} if key=="scratch-offs" else {str(i) for i in range(1,25)}
  if set(data[key])!=expected:errors.append(f"{key}: expected complete 24-card checklist")
 if errors:
  print("=== SOURCE DISCREPANCIES ===")
  for issue in errors[:100]:print("  "+issue)
  raise SystemExit(f"{len(errors)} discrepancies; NO CSV WRITTEN")
 rows=[]
 for s in cfg["productSets"]:
  key=s["key"]
  for number,(player,team) in data[key].items():
   if key=="base" and number in rookies:player+=" RC"
   rows.append((key,number,player,team,"",s["name"] if key!="base" else ""))
 if len(rows)!=792 or len({(r[0],r[1]) for r in rows})!=792:raise SystemExit("Unexpected count/identity; NO CSV WRITTEN")
 CSV.parent.mkdir(parents=True,exist_ok=True)
 with CSV.open("w",newline="",encoding="utf-8") as f:
  w=csv.writer(f,lineterminator="\n");w.writerow(("setKey","cardNumber","player","team","subset","variant"));w.writerows(rows)
 print("GENERATED 792 cards across 4 ProductSets; 85 true Base RCs; UNRELEASED")
 print(f"CSV: {CSV}")
def selftest():
 assert clean("Athletics 1970 Rookie Stars (Vida Blue / Gene Tenace) RS, RC")=="Athletics 1970 Rookie Stars (Vida Blue / Gene Tenace)"
 assert clean("Mike Nagy ASR, RC")=="Mike Nagy"
 assert clean("Jose Martinez RC")=="Jose Martinez"
 assert clean("Willie Mays")=="Willie Mays"
 assert clean("Buck Martinez RCUER: Circle on backis white.")=="Buck Martinez"
 assert NUMBER.fullmatch("NNO") and NUMBER.fullmatch("101a")
 assert NUMBER.fullmatch("720") and NUMBER.fullmatch("1")
 print("1970 Topps offline self-tests passed")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");args=p.parse_args()
 selftest()
 if not args.self_test:run()
