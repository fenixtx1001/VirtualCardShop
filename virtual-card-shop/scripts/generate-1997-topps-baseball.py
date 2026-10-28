#!/usr/bin/env python3
"""Generate TCDB 1997 Topps complete checklist with fail-closed physical-card audit."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from collections import Counter,defaultdict
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1997-topps-baseball.bundle.json"
OUT=ROOT/"data/set-factory/1997-topps-baseball.cards.csv"
HEAD={"User-Agent":"Mozilla/5.0 (compatible; VCS TCDB checklist audit)","Accept":"text/html,application/xhtml+xml"}
NUMBER=re.compile(r"^(?:\d{1,3}[a-z]?|[A-Z]{1,6}[-]?\d{1,3}|NNO)$",re.I)
ANNO=re.compile(r"(?:,\s*|\s+)(?:RC|DPK|PROS|UER|ERR|COR|VAR|AU|SN\d+|PR\d+|SP)(?=:|,|\s|$)",re.I)
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
   if self.link and self.row:self.rows.append(self.row)
   self.row=None
def clean(s):
 s=" ".join(s.split()).strip()
 m=ANNO.search(s)
 return s[:m.start()].strip(" ,;") if m else s
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.2)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEAD),timeout=45) as response:return response.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code}; NO CSV WRITTEN: {url}")
   print(f"TCDB retryable HTTP {e.code} attempt {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*2**attempt)
  except Exception as e:raise SystemExit(f"TCDB fetch error {e}; NO CSV WRITTEN")
 raise SystemExit("TCDB retry limit; NO CSV WRITTEN")
def collect(key,sid,expected,rookies=False):
 raw=[]
 for page in range(1,11):
  mode="Rookies" if rookies else "Checklist"
  parsed=Rows();parsed.feed(fetch(f"https://www.tcdb.com/{mode}.cfm/sid/{sid}/1997-Topps?PageIndex={page}"))
  new=[]
  for row in parsed.rows:
   cells=[s.strip() for s in row if s.strip()]
   for i,n in enumerate(cells):
    if not NUMBER.fullmatch(n) or i+1>=len(cells):continue
    if rookies and not n.isdigit():continue
    cardno=str(int(n)) if n.isdigit() else n.upper()
    player=clean(cells[i+1]);team=cells[-1] if i+2<len(cells) else ""
    if team==cells[i+1]:team=""
    if player:new.append((cardno,player,team))
    break
  raw.extend(new)
  print(f"{key} page {page}: {len(new)} source rows; {len(raw)}/{expected}",flush=True)
  if len(raw)>=expected:break
  if page>1 and not new:break
 if len(raw)!=(expected+2 if key=="base" else expected):raise SystemExit(f"{key}: {len(raw)} source rows, expected {expected+2 if key=='base' else expected}; NO CSV WRITTEN")
 return raw
def collapse(key,raw):
 out={};problems=[]
 if key=="base":
  duplicates=defaultdict(list)
  for number,player,team in raw:
   # Error/correction variations #101 and #102 appear twice in TCDB.
   # They are one checklist identity each, unlike the two distinct
   # subjects printed as #61 and #276.
   normalized=number
   if re.fullmatch(r"10[12][AB]",number,re.I):normalized=number[:-1]
   duplicates[normalized].append((player,team))
  for number,entries in duplicates.items():
   if len(entries)==1:out[number]=entries[0]
   elif number in ("61","276") and len(entries)==2 and entries[0]!=entries[1]:
    for suffix,entry in zip("ab",entries):out[number+suffix]=entry
   elif number in ("101","102") and len(entries)==2:
    if entries[0]!=entries[1]:
     problems.append(f"Unexpected identity difference in #{number} ERR/COR: {entries!r}")
    else:out[number]=entries[0]
   else:problems.append(f"Unexpected duplicate Base #{number}: {entries!r}")
 else:
  nno=0
  for number,player,team in raw:
   if number=="NNO":nno+=1;number=f"NNO-{nno:02d}"
   if number in out and out[number]!=(player,team):problems.append(f"{key} #{number}: conflicting players {out[number]} vs {(player,team)}")
   elif number in out:problems.append(f"{key} #{number}: duplicated source ID")
   else:out[number]=(player,team)
 return out,problems
def self_test():
 assert clean("Matt Halloran / Gil Meche DPK, RC")=="Matt Halloran / Gil Meche"
 assert NUMBER.fullmatch("AS22") and NUMBER.fullmatch("HM1")
 a,e=collapse("base",[("61","Kevin Elster","New York Mets"),("61","Mike Fetters","Milwaukee Brewers"),("276","Checklist",""),("276","Chipper Jones","Atlanta Braves")])
 assert not e and set(a)=={"61a","61b","276a","276b"}
 b,e=collapse("base",[("101","Al Leiter SH","Florida Marlins"),("101","Al Leiter SH","Florida Marlins"),("102","John Mabry SH","St. Louis Cardinals"),("102","John Mabry SH","St. Louis Cardinals")])
 assert not e and set(b)=={"101","102"}
 print("1997 Topps offline self-tests passed")
def main():
 bundle=json.loads(BUNDLE.read_text(encoding="utf-8"))
 source={};errors=[]
 for spec in bundle["productSets"]:
  raw=collect(spec["key"],spec["sourceSetId"],spec["expectedCards"])
  cards,problems=collapse(spec["key"],raw)
  source[spec["key"]]=cards;errors+=problems
  if len(cards)!=spec["expectedCards"]:errors.append(f"{spec['key']}: {len(cards)} physical IDs not {spec['expectedCards']}")
 rookies=collect("rookies",1048,30,True)
 base=source["base"]
 physical={str(n) for n in range(1,497) if n not in (7,61,84,276,277)}|{"61a","61b","276a","276b"}
 if len(physical)!=495 or set(base)!=physical:errors.append(f"Base physical numbering mismatch; missing {sorted(physical-set(base))[:20]}, extras {sorted(set(base)-physical)[:20]}")
 rookie_ids=set()
 for number,player,team in rookies:
  options=[(k,v) for k,v in base.items() if k==number or (number in ("61","276") and k.startswith(number))]
  match=[k for k,v in options if v==(player,team)]
  if len(match)!=1:errors.append(f"Rookie #{number}: {(player,team)} does not uniquely match Base {options!r}")
  else:rookie_ids.add(match[0])
 if len(rookie_ids)!=30:errors.append(f"Only {len(rookie_ids)} unique rookie IDs; expected 30")
 if errors:
  print("=== SOURCE DISCREPANCIES ===")
  for item in errors[:120]:print(" ",item)
  raise SystemExit(f"{len(errors)} source discrepancies; NO CSV WRITTEN")
 output=[]
 for spec in bundle["productSets"]:
  key=spec["key"]
  for number,(player,team) in source[key].items():
   if key=="base" and number in rookie_ids:player+=" RC"
   subset=""
   if key=="base":subset="Series 1" if (number=="276a" or int(re.match(r"\d+",number).group())<=276 and number!="276b") else "Series 2"
   output.append((key,number,player,team,subset,spec["name"] if key!="base" else ""))
 expected=Counter({s["key"]:s["expectedCards"] for s in bundle["productSets"]})
 if Counter(r[0] for r in output)!=expected or len(output)!=sum(expected.values()) or len({(r[0],r[1]) for r in output})!=len(output):raise SystemExit("Output mismatch; NO CSV WRITTEN")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",newline="",encoding="utf-8") as f:
  writer=csv.writer(f,lineterminator="\n");writer.writerow(("setKey","cardNumber","player","team","subset","variant"));writer.writerows(output)
 print(f"GENERATED {len(output)} cards across {len(expected)} ProductSets; {len(rookie_ids)} Base rookies; UNRELEASED")
 print(f"CSV: {OUT}")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");args=p.parse_args()
 self_test()
 if not args.self_test:main()
