#!/usr/bin/env python3
"""Fail-closed Set Factory for 2002-03 Upper Deck MVP basketball."""
from __future__ import annotations
import argparse,csv,json,re,urllib.request
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/2002-03-upper-deck-mvp-basketball.bundle.json"
CSV=ROOT/"data/set-factory/2002-03-upper-deck-mvp-basketball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory research import)","Accept":"text/html,application/xhtml+xml"}
CARD_NUM=re.compile(r"^(?:[A-Z]{0,5}\d{1,3}(?:-[A-Z0-9]{1,3})?|\d{1,3}|[A-Z]{1,4}/[A-Z]{1,4})$",re.I)
NOTE=re.compile(r"\s+(?:UER|ERR|COR|VAR|RC|MEM|AU|SN\d+)(?=\b|[A-Z]|[,;:])",re.I)
class Rows(HTMLParser):
 def __init__(self): super().__init__();self.rows=[];self.row=None;self.cell=None
 def handle_starttag(self,t,a):
  if t=="tr":self.row=[]
  elif t=="td" and self.row is not None:self.cell=[]
 def handle_data(self,d):
  if self.cell is not None:self.cell.append(d)
 def handle_endtag(self,t):
  if t=="td" and self.cell is not None:
   self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  elif t=="tr" and self.row is not None:
   if self.row:self.rows.append(self.row)
   self.row=None
def fetch(url):
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=40) as r:
   return r.read().decode("utf-8","replace")
 except Exception as e:raise SystemExit(f"TCDB unavailable at {url}: {e}; NO CSV written")
def clean(s):
 s=" ".join(s.split()).strip()
 s=re.sub(r",\s*(?:RC|MEM|AU|SN\d+)(?:\b|$).*", "", s, flags=re.I)
 m=NOTE.search(s)
 if m:s=s[:m.start()].strip(" ,;")
 return s
def collect(key,sid,expected,rookie=False):
 cards={};issues=[]
 for page in range(1,10):
  route="Rookies" if rookie else "Checklist"
  url=f"https://www.tcdb.com/{route}.cfm/sid/{sid}/2002-03-Upper-Deck-MVP?PageIndex={page}"
  p=Rows();p.feed(fetch(url));parsed=added=0
  for row in p.rows:
   vals=[v.strip() for v in row if v.strip()]
   for i,value in enumerate(vals):
    if not CARD_NUM.fullmatch(value) or i+1>=len(vals):continue
    # Reject header/navigation numerals by checking the name and team cells.
    name=clean(vals[i+1])
    if not name or name.lower() in ("options","gallery","checklist by age","next"):continue
    team=vals[-1] if i+2<len(vals) else ""
    if team==vals[i+1]:team=""
    if key in ("base","classic","classic-black","gold") or rookie:
     if not value.isdecimal() or not 1<=int(value)<=220:continue
    parsed+=1;num=value.upper()
    if num in cards and cards[num]!=(name,team):
     issues.append(f"{key} #{num}: {cards[num]!r} vs {(name,team)!r}")
    if num not in cards:cards[num]=(name,team);added+=1
    break
  print(f"{key} page {page}: {parsed} rows; +{added}; {len(cards)}/{expected}",flush=True)
  if len(cards)>=expected:break
  if page>1 and parsed==0:break
 if len(cards)!=expected:issues.append(f"{key}: expected {expected}; found {len(cards)}")
 if key in ("base","classic","classic-black","gold"):
  missing={str(n) for n in range(1,221)}-set(cards)
  if missing:issues.append(f"{key} missing numbers: {sorted(missing,key=int)[:30]}")
 return cards,issues
def main():
 bundle=json.loads(BUNDLE.read_text(encoding="utf-8"));issues=[];data={}
 for s in bundle["productSets"]:
  key=s["key"];sid=int(s["sourceSetId"]);expected=s["expectedCards"]
  cards,bad=collect(key,sid,expected);data[key]=cards;issues.extend(bad)
 rookies,bad=collect("rookies",9460,30,rookie=True);issues.extend(bad)
 for n,(name,team) in rookies.items():
  if data["base"].get(n)!=(name,team):issues.append(f"RC #{n}: {name!r} / {team!r} vs Base {data['base'].get(n)!r}")
 for key in ("classic","classic-black","gold"):
  for n,card in data[key].items():
   if data["base"].get(n)!=card:
    issues.append(f"{key} #{n}: identity differs from Base: {card!r} vs {data['base'].get(n)!r}")
 if issues:
  print("=== ALL SOURCE DISCREPANCIES ===")
  for item in issues:print("  "+item)
  raise SystemExit(f"{len(issues)} discrepancies; NO CSV written")
 rows=[]
 for s in bundle["productSets"]:
  key=s["key"]
  for number,(name,team) in data[key].items():
   if key=="base" and number in rookies:name+=" RC"
   rows.append((key,number,name,team,"",s["name"] if key!="base" else ""))
 expected=sum(s["expectedCards"] for s in bundle["productSets"])
 if len(rows)!=expected or len({(r[0],r[1]) for r in rows})!=expected:
  raise SystemExit("Card totals or identities invalid; NO CSV written")
 CSV.parent.mkdir(parents=True,exist_ok=True)
 with CSV.open("w",newline="",encoding="utf-8") as f:
  writer=csv.writer(f,lineterminator="\n")
  writer.writerow(("setKey","cardNumber","player","team","subset","variant"));writer.writerows(rows)
 print(f"GENERATED: {len(rows)} cards across {len(bundle['productSets'])} sets; 30 Base RCs")
 print(f"CSV: {CSV}; STATUS: UNRELEASED")
def self_test():
 assert clean("Yao Ming MVPR, RC")=="Yao Ming MVPR"
 assert clean("Kobe Bryant MEM")=="Kobe Bryant"
 assert CARD_NUM.fullmatch("CW-C")
 assert CARD_NUM.fullmatch("BD/SM")
 print("2002-03 MVP offline tests passed")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true")
 args=p.parse_args();self_test()
 if not args.self_test:main()
