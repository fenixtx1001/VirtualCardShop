#!/usr/bin/env python3
"""1997 Zenith Baseball: fail-closed TCDB pack-issued checklist."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from html.parser import HTMLParser
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1997-zenith-baseball.bundle.json"
OUT=ROOT/"data/set-factory/1997-zenith-baseball.cards.csv"
HEAD={"User-Agent":"Mozilla/5.0 (compatible; VCS TCDB checklist audit)","Accept":"text/html,application/xhtml+xml"}
NUMBER=re.compile(r"^(?:\d{1,3}|[A-Z]{1,4}[-]?\d{1,3}|V/\d{1,2}|NNO)$",re.I)
ANNO=re.compile(r"(?:,\s*|\s+)(?:RC|UER|ERR|COR|VAR|SN\d+|PR\d+|SP)(?=:|,|\s|$)",re.I)
class Rows(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None;self.has_card=False
 def handle_starttag(self,t,a):
  if t=="tr":self.row=[];self.has_card=False
  elif t=="td" and self.row is not None:self.cell=[]
  elif t=="a" and self.row is not None and any(k=="href" and "ViewCard.cfm" in (v or "") for k,v in a):self.has_card=True
 def handle_data(self,d):
  if self.cell is not None:self.cell.append(d)
 def handle_endtag(self,t):
  if t=="td" and self.cell is not None:self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  elif t=="tr" and self.row is not None:
   if self.has_card and self.row:self.rows.append(self.row)
   self.row=None
def clean(s):
 s=" ".join(s.split()).strip()
 m=ANNO.search(s)
 return s[:m.start()].strip(" ,;") if m else s
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.2)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEAD),timeout=45) as r:return r.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code}; NO CSV WRITTEN")
   print(f"TCDB retry HTTP {e.code} {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*(2**attempt))
  except Exception as e:raise SystemExit(f"TCDB error {e}; NO CSV WRITTEN")
 raise SystemExit("TCDB retries exhausted; NO CSV WRITTEN")
def collect(key,sid,expected,rookies=False):
 cards={};issues=[];rows=0
 for page in range(1,6):
  mode="Rookies" if rookies else "Checklist"
  source=Rows();source.feed(fetch(f"https://www.tcdb.com/{mode}.cfm/sid/{sid}/1997-Zenith?PageIndex={page}"))
  count=0
  for row in source.rows:
   cells=[s.strip() for s in row if s.strip()]
   for i,n in enumerate(cells):
    if not NUMBER.fullmatch(n) or i+1>=len(cells):continue
    if rookies and not n.isdigit():continue
    number=str(int(n)) if n.isdigit() else n.upper()
    player=clean(cells[i+1])
    team=cells[-1] if i+2<len(cells) else ""
    if team==cells[i+1]:team=""
    if not player:continue
    count+=1;rows+=1
    if number=="NNO":number=f"NNO-{rows:02d}"
    val=(player,team)
    if number in cards and cards[number]!=val:issues.append(f"{key} #{number}: {cards[number]!r} differs from {val!r}")
    elif number in cards:issues.append(f"{key} duplicate ID #{number}")
    else:cards[number]=val
    break
  print(f"{key} page {page}: {count} source rows; {len(cards)}/{expected}",flush=True)
  if len(cards)>=expected:break
  if page>1 and count==0:break
 if len(cards)!=expected:issues.append(f"{key}: {len(cards)} cards, expected {expected}")
 return cards,issues
def test():
 assert clean("Hideki Irabu RC")=="Hideki Irabu"
 assert clean("Jose Cruz Jr. RC")=="Jose Cruz Jr."
 assert NUMBER.fullmatch("ZT9")
 assert NUMBER.fullmatch("V/1") and NUMBER.fullmatch("V/8")
 assert not NUMBER.fullmatch("V/")
 print("1997 Zenith offline self-tests passed")
def run():
 bundle=json.loads(BUNDLE.read_text(encoding="utf-8"))
 all_cards={};errors=[]
 for set_ in bundle["productSets"]:
  cards,problems=collect(set_["key"],set_["sourceSetId"],set_["expectedCards"])
  all_cards[set_["key"]]=cards;errors+=problems
 rookies,problems=collect("rookies",1115,2,rookies=True);errors+=problems
 base=all_cards["base"]
 if set(base)!={str(i) for i in range(1,51)}:errors.append("Base numbering must be 1-50")
 if set(rookies)!={"45","47"}:errors.append(f"Unexpected rookie numbers: {sorted(rookies)}")
 for n,identity in rookies.items():
  if identity!=base.get(n):errors.append(f"RC #{n}: {identity!r} != Base {base.get(n)!r}")
 for key in ("oversized-8x10","oversized-dufex-8x10"):
  if set(all_cards[key])!={str(i) for i in range(1,25)}:errors.append(f"{key} numbering must be 1-24")
 if set(all_cards["oversized-v2-8x10"])!={f"V/{i}" for i in range(1,9)}:errors.append("V-2 numbering must be V/1 through V/8")
 for n,identity in all_cards["oversized-dufex-8x10"].items():
  if identity!=all_cards["oversized-8x10"].get(n):errors.append(f"Dufex #{n}: mismatches glossy oversized #{n}")
 if errors:
  print("=== SOURCE DISCREPANCIES ===")
  for error in errors[:100]:print(" ",error)
  raise SystemExit(f"{len(errors)} source discrepancies; NO CSV WRITTEN")
 rows=[]
 for spec in bundle["productSets"]:
  for n,(player,team) in all_cards[spec["key"]].items():
   if spec["key"]=="base" and n in rookies:player+=" RC"
   rows.append((spec["key"],n,player,team,"",spec["name"] if spec["key"]!="base" else ""))
 expected=Counter({s["key"]:s["expectedCards"] for s in bundle["productSets"]})
 if Counter(r[0] for r in rows)!=expected or len(rows)!=115 or len(set((r[0],r[1]) for r in rows))!=115:raise SystemExit("Output count mismatch; NO CSV WRITTEN")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",encoding="utf-8",newline="") as f:
  writer=csv.writer(f,lineterminator="\n");writer.writerow(("setKey","cardNumber","player","team","subset","variant"));writer.writerows(rows)
 print("GENERATED 115 cards across 5 ProductSets; 2 Base rookies; UNRELEASED")
 print(f"CSV: {OUT}")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");args=p.parse_args()
 test()
 if not args.self_test:run()
