#!/usr/bin/env python3
"""Generate and fail-closed reconcile TCDB 1999 Pacific Invincible baseball."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1999-pacific-invincible-baseball.bundle.json"
CSV=ROOT/"data/set-factory/1999-pacific-invincible-baseball.cards.csv"
HEAD={"User-Agent":"Mozilla/5.0 (compatible; VCS checklist audit)","Accept":"text/html,application/xhtml+xml"}
NUMBER=re.compile(r"^(?:\d{1,3}[a-z]?)$",re.I)
NOTE=re.compile(r"(?:,\s*|\s+)(?:RC|UER|ERR|COR|VAR|RDM|SN\d+)(?=:|,|\s|$)",re.I)
class Rows(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None;self.has_card=False
 def handle_starttag(self,tag,attrs):
  if tag=="tr":self.row=[];self.has_card=False
  elif tag=="td" and self.row is not None:self.cell=[]
  elif tag=="a" and self.row is not None and any(k=="href" and "ViewCard.cfm" in (v or "") for k,v in attrs):self.has_card=True
 def handle_data(self,data):
  if self.cell is not None:self.cell.append(data)
 def handle_endtag(self,tag):
  if tag=="td" and self.cell is not None:self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  elif tag=="tr" and self.row is not None:
   if self.has_card and self.row:self.rows.append(self.row)
   self.row=None
def clean(s):
 s=" ".join(s.split())
 m=NOTE.search(s)
 return s[:m.start()].strip(" ,;") if m else s
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.1)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEAD),timeout=40) as r:return r.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code}; NO CSV WRITTEN: {url}")
   print(f"TCDB HTTP {e.code}; retry {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*2**attempt)
  except Exception as e:raise SystemExit(f"TCDB error {e}; NO CSV WRITTEN")
 raise SystemExit("TCDB retries exhausted; NO CSV WRITTEN")
def collect(key,sid,expected):
 cards={};errors=[]
 for page in range(1,8):
  parsed=Rows();parsed.feed(fetch(f"https://www.tcdb.com/Checklist.cfm/sid/{sid}/1999-Pacific-Invincible?PageIndex={page}"))
  n=0
  for row in parsed.rows:
   cells=[c.strip() for c in row if c.strip()]
   for i,c in enumerate(cells):
    if not NUMBER.fullmatch(c) or i+1>=len(cells):continue
    number=c.lower() if key in ("sandlot-heroes","seismic-force") else str(int(re.match(r"\d+",c).group()))
    player=clean(cells[i+1]);team=cells[-1] if i+2<len(cells) else ""
    if team==cells[i+1]:team=""
    if not player:continue
    pair=(player,team);n+=1
    if number in cards and cards[number]!=pair:errors.append(f"{key} #{number}: {cards[number]!r} vs {pair!r}")
    else:cards[number]=pair
    break
  print(f"{key} page {page}: {n} source rows; {len(cards)}/{expected}",flush=True)
  if len(cards)>=expected:break
  if page>1 and n==0:break
 if len(cards)!=expected:errors.append(f"{key}: {len(cards)} unique cards, expected {expected}")
 return cards,errors
def self_test():
 assert clean("Freddy Garcia RC")=="Freddy Garcia"
 assert clean("Cal Ripken Jr. RDM, SN10")=="Cal Ripken Jr."
 assert clean("Mo Vaughn VAR: Running")=="Mo Vaughn"
 assert NUMBER.fullmatch("20b")
 print("1999 Pacific Invincible offline self-tests passed")
def run():
 bundle=json.loads(BUNDLE.read_text())
 by_key={};problems=[]
 for spec in bundle["productSets"]:
  cards,errors=collect(spec["key"],spec["sourceSetId"],spec["expectedCards"])
  by_key[spec["key"]]=cards;problems+=errors
 base=by_key["base"]
 expected_numbers={str(n) for n in range(1,151)}
 if set(base)!=expected_numbers:problems.append("Base numbers must be exactly 1–150")
 for key in ("opening-day","platinum-blue","red"):
  parallel=by_key[key]
  if set(parallel)!=expected_numbers:problems.append(f"{key} numbers differ from Base")
  for number,subject in parallel.items():
   if subject!=base.get(number):problems.append(f"{key} #{number}: {subject!r} differs from Base {base.get(number)!r}")
 for key in ("sandlot-heroes","seismic-force"):
  expected={f"{i}{suffix}" for i in range(1,21) for suffix in ("a","b")}
  if set(by_key[key])!=expected:problems.append(f"{key}: both distinct image variants not fully indexed")
 if base.get("88",("",))[0]!="Doug Mientkiewicz":problems.append("Rookie #88 missing/mismatched")
 if base.get("132",("",))[0]!="Freddy Garcia":problems.append("Rookie #132 missing/mismatched")
 if problems:
  print("=== SOURCE DISCREPANCIES ===")
  for err in problems[:100]:print(" ",err)
  raise SystemExit(f"{len(problems)} source discrepancies; NO CSV WRITTEN")
 output=[]
 for spec in bundle["productSets"]:
  key=spec["key"]
  for number,(player,team) in by_key[key].items():
   if key=="base" and number in ("88","132"):player+=" RC"
   output.append((key,number,player,team,"",spec["name"] if key!="base" else ""))
 assert len(output)==740 and len(set((r[0],r[1]) for r in output))==740
 CSV.parent.mkdir(parents=True,exist_ok=True)
 with CSV.open("w",newline="",encoding="utf-8") as f:
  writer=csv.writer(f,lineterminator="\n")
  writer.writerow(("setKey","cardNumber","player","team","subset","variant"))
  writer.writerows(output)
 print("GENERATED 740 cards across 10 ProductSets; 2 Base rookies; UNRELEASED")
 print(f"CSV: {CSV}")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");args=p.parse_args()
 self_test()
 if not args.self_test:run()
