#!/usr/bin/env python3
"""1995 Zenith Baseball: TCDB-backed, fail-closed 5-family Set Factory."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1995-zenith-baseball.bundle.json"
OUT=ROOT/"data/set-factory/1995-zenith-baseball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory)","Accept":"text/html,application/xhtml+xml"}
TOKEN=re.compile(r"(?:,\s*|\s+)(?:ROO|RC|CL|UER(?:UER)?|ERR(?:ERR)?|COR(?:COR)?|VAR(?:VAR)?|SP|SAM)(?=\s|,|:|$)",re.I)
CARDNO=re.compile(r"^(?:\d{1,3}|NNO)$",re.I)
ROOKIE_NUMBERS={"112","122","124","129","131","149"}
class CardRows(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None;self.link=False
 def handle_starttag(self,tag,attrs):
  if tag=="tr":self.row=[];self.link=False
  elif tag=="td" and self.row is not None:self.cell=[]
  elif tag=="a" and self.row is not None and any(k=="href" and "ViewCard.cfm" in (v or "") for k,v in attrs):self.link=True
 def handle_data(self,value):
  if self.cell is not None:self.cell.append(value)
 def handle_endtag(self,tag):
  if tag=="td" and self.cell is not None:self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  elif tag=="tr" and self.row is not None:
   if self.row and self.link:self.rows.append(self.row)
   self.row=None
def clean(value):
 value=" ".join(value.split()).strip()
 token=TOKEN.search(value)
 return value[:token.start()].strip(" ,;") if token else value
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.5)
   req=urllib.request.Request(url,headers=HEADERS)
   with urllib.request.urlopen(req,timeout=40) as response:return response.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code} {url}; NO CSV WRITTEN")
   print(f"TCDB transient HTTP {e.code}, retry {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*2**attempt)
  except Exception as e:raise SystemExit(f"TCDB unavailable: {e}; NO CSV WRITTEN")
 raise SystemExit(f"TCDB rate limiting persisted: {url}; NO CSV WRITTEN")
def collect(key,sid,count,rookies=False):
 cards={};issues=[];nno=0
 for page in range(1,8):
  route="Rookies" if rookies else "Checklist"
  parser=CardRows()
  parser.feed(fetch(f"https://www.tcdb.com/{route}.cfm/sid/{sid}/1995-Zenith?PageIndex={page}"))
  parsed=added=0
  for row in parser.rows:
   cells=[part.strip() for part in row if part.strip()]
   for i,num in enumerate(cells):
    if not CARDNO.fullmatch(num) or i+1>=len(cells):continue
    if key=="base" or rookies:
     if not num.isdecimal() or not 1<=int(num)<=150:continue
    if key=="checklists" and num.upper()=="NNO":
     nno+=1;num=f"NNO-{nno:02d}"
    elif num.isdecimal():num=str(int(num))
    player=clean(cells[i+1])
    if not player:continue
    team=cells[-1] if i+2<len(cells) else ""
    if team==cells[i+1]:team=""
    identity=(player,team)
    parsed+=1
    if num in cards and cards[num]!=identity:issues.append(f"{key} #{num}: conflicting identities {cards[num]!r} vs {identity!r}")
    if num not in cards:cards[num]=identity;added+=1
    break
  print(f"{key} page {page}: {parsed} rows, +{added}; {len(cards)}/{count}",flush=True)
  if len(cards)>=count:break
  if page>1 and parsed==0:break
 if len(cards)!=count:issues.append(f"{key}: expected {count}, found {len(cards)}")
 return cards,issues
def generate():
 config=json.loads(BUNDLE.read_text(encoding="utf-8"))
 data={};issues=[]
 for spec in config["productSets"]:
  cards,errors=collect(spec["key"],spec["sourceSetId"],spec["expectedCards"])
  data[spec["key"]]=cards;issues.extend(errors)
 rookies,errors=collect("rookies",626,6,True);issues.extend(errors)
 base=data["base"]
 if set(base)!={str(n) for n in range(1,151)}:issues.append("Base numbers must be exactly 1-150")
 if set(rookies)!=ROOKIE_NUMBERS:issues.append(f"Unexpected Base RC numbers {sorted(rookies)}")
 for number,identity in rookies.items():
  if base.get(number)!=identity:issues.append(f"Rookie #{number}: {identity!r} differs from Base {base.get(number)!r}")
 if set(data["checklists"])!={"NNO-01","NNO-02"}:issues.append("Two pack-issued NNO checklists expected")
 if issues:
  print("=== SOURCE DISCREPANCIES ===")
  for issue in issues:print("  "+issue)
  raise SystemExit(f"{len(issues)} discrepancies; NO CSV WRITTEN")
 rows=[]
 for spec in config["productSets"]:
  key=spec["key"]
  for number,(player,team) in data[key].items():
   if key=="base" and number in rookies:player+=" RC"
   rows.append((key,number,player,team,"",spec["name"] if key!="base" else ""))
 expected=sum(s["expectedCards"] for s in config["productSets"])
 if expected!=206 or len(rows)!=206 or len({(r[0],r[1]) for r in rows})!=206:
  raise SystemExit("Card count/identity mismatch; NO CSV WRITTEN")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",newline="",encoding="utf-8") as f:
  writer=csv.writer(f,lineterminator="\n")
  writer.writerow(("setKey","cardNumber","player","team","subset","variant"));writer.writerows(rows)
 print("GENERATED 206 cards across 5 ProductSets; 6 true Base RCs; UNRELEASED")
 print(f"CSV: {OUT}")
def self_test():
 assert clean("Ken Boswell")=="Ken Boswell"
 assert clean("Armando Benitez ROO, RC")=="Armando Benitez"
 assert clean("Marty Cordova UERUER: Larger photo actually Kevin Maas")=="Marty Cordova"
 assert clean("Checklist: 1-150 CL")=="Checklist: 1-150"
 assert clean("Barry Bonds / Cal Ripken Jr.")=="Barry Bonds / Cal Ripken Jr."
 assert CARDNO.fullmatch("NNO")
 assert len(ROOKIE_NUMBERS)==6
 print("1995 Zenith offline self-tests passed")
if __name__=="__main__":
 parser=argparse.ArgumentParser();parser.add_argument("--self-test",action="store_true");args=parser.parse_args()
 self_test()
 if not args.self_test:generate()
