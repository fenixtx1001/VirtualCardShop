#!/usr/bin/env python3
"""1990 Upper Deck Baseball TCDB checklist; fail closed before CSV generation."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1990-upper-deck-baseball.bundle.json"
OUT=ROOT/"data/set-factory/1990-upper-deck-baseball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory source validator)","Accept":"text/html,application/xhtml+xml"}
TAG=re.compile(r"(?:,\s*|\s+)(?:SR|RC|CL|HDR|AU|UER(?:UER)?|ERR(?:ERR)?|COR(?:COR)?|VAR(?:VAR)?|SP|SN\d+)(?=\s|,|:|$)",re.I)
CARDNO=re.compile(r"^(?:\d{1,3}|NNO)$",re.I)
RC_COUNT=101
class CardRows(HTMLParser):
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
 m=TAG.search(value)
 return value[:m.start()].strip(" ,;") if m else value
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.5)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=40) as r:return r.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code} at {url}; NO CSV WRITTEN")
   print(f"TCDB temporary HTTP {e.code}; retry {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*2**attempt)
  except Exception as e:raise SystemExit(f"TCDB unavailable: {e}; NO CSV WRITTEN")
 raise SystemExit(f"TCDB blocked after bounded retries: {url}; NO CSV WRITTEN")
def collect(key,sid,expected,rookies=False):
 found={};issues=[];unnumbered=0
 for page in range(1,14):
  endpoint="Rookies" if rookies else "Checklist"
  parser=CardRows()
  parser.feed(fetch(f"https://www.tcdb.com/{endpoint}.cfm/sid/{sid}/1990-Upper-Deck?PageIndex={page}"))
  parsed=added=0
  for row in parser.rows:
   cells=[c.strip() for c in row if c.strip()]
   for i,number in enumerate(cells):
    if not CARDNO.fullmatch(number) or i+1>=len(cells):continue
    if key=="base" or rookies:
     if not number.isdecimal() or not 1<=int(number)<=800:continue
    if number.upper()=="NNO":
     unnumbered+=1;number=f"NNO-{unnumbered:02d}"
    elif number.isdecimal():number=str(int(number))
    player=clean(cells[i+1])
    if not player:continue
    team=cells[-1] if i+2<len(cells) else ""
    if team==cells[i+1]:team=""
    identity=(player,team);parsed+=1
    if number in found and found[number]!=identity:
     issues.append(f"{key} #{number}: conflicting identities {found[number]!r} vs {identity!r}")
    if number not in found:found[number]=identity;added+=1
    break
  print(f"{key} page {page}: {parsed} rows, +{added}; {len(found)}/{expected}",flush=True)
  if len(found)>=expected:break
  if page>1 and parsed==0:break
 if len(found)!=expected:issues.append(f"{key}: expected {expected}; found {len(found)}")
 return found,issues
def run():
 cfg=json.loads(BUNDLE.read_text(encoding="utf-8"))
 data={};issues=[]
 for spec in cfg["productSets"]:
  cards,errors=collect(spec["key"],spec["sourceSetId"],spec["expectedCards"])
  data[spec["key"]]=cards;issues.extend(errors)
 rookies,errors=collect("rookies",149,RC_COUNT,True);issues.extend(errors)
 base=data["base"]
 if set(base)!={str(i) for i in range(1,801)}:issues.append("Base numbering must be exactly 1-800")
 if set(data["team-logo-holograms"])!={f"NNO-{i:02d}" for i in range(1,27)}:issues.append("Expected 26 NNO team holograms")
 if set(data["baseball-heroes-reggie-jackson"])!=({str(i) for i in range(1,10)}|{"NNO-01"}):
  issues.append("Heroes must be nine numbered cards plus one unnumbered header")
 if set(data["baseball-heroes-reggie-jackson-autograph"])!={"9"}:issues.append("Autograph must be Reggie Jackson #9")
 if set(rookies)-set(base):issues.append("Rookie index has cards not in Base")
 for number,identity in rookies.items():
  if identity!=base.get(number):issues.append(f"Rookie #{number}: {identity!r} does not match Base {base.get(number)!r}")
 if issues:
  print("=== SOURCE DISCREPANCIES ===")
  for issue in issues[:100]:print("  "+issue)
  raise SystemExit(f"{len(issues)} discrepancies; NO CSV WRITTEN")
 rows=[]
 for spec in cfg["productSets"]:
  key=spec["key"]
  for number,(player,team) in data[key].items():
   if key=="base" and number in rookies:player+=" RC"
   rows.append((key,number,player,team,"",spec["name"] if key!="base" else ""))
 if len(rows)!=837 or len({(r[0],r[1]) for r in rows})!=837:raise SystemExit("Card count or identity mismatch; NO CSV WRITTEN")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",newline="",encoding="utf-8") as f:
  w=csv.writer(f,lineterminator="\n")
  w.writerow(("setKey","cardNumber","player","team","subset","variant"));w.writerows(rows)
 print(f"GENERATED 837 cards across 4 ProductSets; {len(rookies)} true Base RCs; UNRELEASED")
 print(f"CSV: {OUT}")
def self_test():
 assert clean("Ken Griffey Jr.")=="Ken Griffey Jr."
 assert clean("Sammy Sosa SR, RC")=="Sammy Sosa"
 assert clean("Kevin Appier ERR, RC")=="Kevin Appier"
 assert clean("Reggie Jackson CL, AU, SN2500")=="Reggie Jackson"
 assert clean("Header Card HDR")=="Header Card"
 assert CARDNO.fullmatch("NNO") and CARDNO.fullmatch("800")
 print("1990 Upper Deck offline self-tests passed")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");args=p.parse_args()
 self_test()
 if not args.self_test:run()
