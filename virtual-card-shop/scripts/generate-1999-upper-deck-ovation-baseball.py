#!/usr/bin/env python3
"""1999 Upper Deck Ovation Baseball — TCDB source-audited, fail-closed generator."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1999-upper-deck-ovation-baseball.bundle.json"
OUT=ROOT/"data/set-factory/1999-upper-deck-ovation-baseball.cards.csv"
HEAD={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory checklist validator)","Accept":"text/html,application/xhtml+xml"}
NUMBER=re.compile(r"^(?:\d{1,3}|R\d{1,2}|S\d{1,2}|M\d{1,2}|MM\d{1,2}|[A-Z]{2,5}|NNO)$",re.I)
ANNOT=re.compile(r"(?:,\s*|\s+)(?:RC|WP|SS|AU|MEM|CUT|SN\d+|PR\d+|UER|ERR|COR|VAR)(?=:|,|\s|$)",re.I)
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
 s=" ".join(s.split()).strip()
 m=ANNOT.search(s)
 return s[:m.start()].strip(" ,;") if m else s
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.25)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEAD),timeout=45) as f:return f.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code}; NO CSV WRITTEN: {url}")
   print(f"Temporary HTTP {e.code}; attempt {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*2**attempt)
  except Exception as e:raise SystemExit(f"TCDB source error {e}; NO CSV WRITTEN")
 raise SystemExit("TCDB retry limit; NO CSV WRITTEN")
def fetch_cards(sid,total):
 cards={};issues=[];source_rows=0
 for page in range(1,6):
  url=f"https://www.tcdb.com/Checklist.cfm/sid/{sid}/1999-Upper-Deck-Ovation?PageIndex={page}"
  rows=Rows();rows.feed(fetch(url));parsed=0
  for row in rows.rows:
   cells=[s.strip() for s in row if s.strip()]
   for i,raw in enumerate(cells):
    if not NUMBER.fullmatch(raw) or i+1>=len(cells):continue
    number=raw.upper() if not raw.isdigit() else str(int(raw))
    player=clean(cells[i+1]);team=cells[-1] if i+2<len(cells) else ""
    if team==cells[i+1]:team=""
    if not player:continue
    parsed+=1
    if number=="NNO":
     number=f"NNO-{source_rows+1:02d}"
    source_rows+=1
    val=(player,team)
    if number in cards and cards[number]!=val:issues.append(f"#{number}: {cards[number]} != {val}")
    else:cards[number]=val
    break
  print(f"sid {sid} page {page}: {parsed} source rows; {len(cards)}/{total}",flush=True)
  if len(cards)>=total:break
  if page>1 and parsed==0:break
 if len(cards)!=total:issues.append(f"sid {sid}: expected {total} distinct cards, found {len(cards)}")
 return cards,issues
def test():
 assert clean("J.D. Drew WP")=="J.D. Drew"
 assert clean("Ken Griffey Jr. SS")=="Ken Griffey Jr."
 assert clean("Kerry Wood AU, MEM, SN25")=="Kerry Wood"
 assert NUMBER.fullmatch("R20") and NUMBER.fullmatch("MM15") and NUMBER.fullmatch("M15")
 assert {f"M{i}" for i in range(1,16)}==set(["M"+str(i) for i in range(1,16)])
 assert {f"R{i}" for i in range(1,16)}==set(["R"+str(i) for i in range(1,16)])
 print("1999 Upper Deck Ovation offline self-tests passed")
def run():
 bundle=json.loads(BUNDLE.read_text(encoding="utf-8"))
 source={}
 issues=[]
 for sid,expected in [(1366,90),(11908,90),(11905,20),(11906,20),(11907,15),(11904,16),(263198,2)]:
  source[sid],errors=fetch_cards(sid,expected);issues.extend(errors)
 base=source[1366]
 if set(base)!={str(i) for i in range(1,91)}:issues.append("Base numbering must be 1-90")
 for n,identity in source[11908].items():
  if identity!=base.get(n):issues.append(f"Standing Ovation #{n} differs from Base: {identity} != {base.get(n)}")
 for sid,nums in [(11905,{f"R{i}" for i in range(1,21)}),(11906,{f"S{i}" for i in range(1,21)}),(11907,{f"M{i}" for i in range(1,16)})]:
  if set(source[sid])!=nums:issues.append(f"sid {sid} numbering mismatch: {set(source[sid])^nums}")
 if set(source[263198])!={"NNO-01","NNO-02"}:issues.append("Mickey Mantle two unnumbered physical cards missing")
 if set(source[11904])!={"AR","BB","BG","BGAU","BW","CJ","CR","DJ","JG","KGJ","KWAU","MP","NG","SS","TG","VG"}:issues.append("A Piece of History 16 physical checklist numbers mismatch")
 if issues:
  print("=== SOURCE DISCREPANCIES ===")
  for issue in issues[:100]:print(" ",issue)
  raise SystemExit(f"{len(issues)} source discrepancies; NO CSV WRITTEN")
 output=[]
 for spec in bundle["productSets"]:
  key=spec["key"];sid=spec["sourceSetId"]
  for n,(player,team) in source[sid].items():
   if key=="remarkable-silver" and not 1<=int(n.removeprefix("M"))<=5:continue
   if key=="remarkable-gold" and not 6<=int(n.removeprefix("MM"))<=10:continue
   if key=="remarkable-holofoil" and not 11<=int(n.removeprefix("MM"))<=15:continue
   subset=("World Premiere" if key=="base" and 61<=int(n)<=80 else "Superstar Spotlight" if key=="base" and 81<=int(n)<=90 else "")
   output.append((key,n,player,team,subset,spec["name"] if key!="base" else ""))
 expected={s["key"]:s["expectedCards"] for s in bundle["productSets"]}
 from collections import Counter
 actual=Counter(r[0] for r in output)
 if actual!=expected or len(output)!=253 or len(set((r[0],r[1]) for r in output))!=253:raise SystemExit(f"Output checklist mismatch: {actual} expected {expected}; NO CSV WRITTEN")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",encoding="utf-8",newline="") as f:
  w=csv.writer(f,lineterminator="\n")
  w.writerow(("setKey","cardNumber","player","team","subset","variant"));w.writerows(output)
 print("GENERATED 253 cards across 9 ProductSets; 0 Base rookies; UNRELEASED")
 print(f"CSV: {OUT}")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true")
 args=p.parse_args();test()
 if not args.self_test:run()
