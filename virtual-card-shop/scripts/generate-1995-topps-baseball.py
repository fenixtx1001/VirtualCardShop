#!/usr/bin/env python3
"""1995 Topps Baseball: complete fail-closed source checklist generator."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1995-topps-baseball.bundle.json"
CSV=ROOT/"data/set-factory/1995-topps-baseball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory checklist verifier)","Accept":"text/html,application/xhtml+xml"}
TOKEN=re.compile(r"(?:,\s*|\s+)(?:DPK|DP|PROS|ST|CL|RC(?:RC)?|UER(?:UER)?|ERR(?:ERR)?|COR(?:COR)?|VAR(?:VAR)?|SP|SN\d+)(?=\s|,|:|$)",re.I)
NUMBER=re.compile(r"^(?:\d{1,3}[a-z]?|[A-Z]{1,5}\d{1,3}[a-z]?|NNO)$",re.I)
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
def clean(s):
 s=" ".join(s.split()).strip()
 # TCDB sometimes concatenates VAR and its explanatory annotation.
 # Restrict this repair to documented VAR+word forms, not player names.
 s=re.sub(r"(?:,\s*|\s+)VAR(?:VAR)?(?=Randomly|Random\s|:).*$", "", s, flags=re.I)
 m=TOKEN.search(s)
 return s[:m.start()].strip(" ,;") if m else s
def get(url):
 for retry in range(4):
  try:
   time.sleep(1.8)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=40) as r:return r.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code} {url}; NO CSV WRITTEN")
   print(f"TCDB transient HTTP {e.code}, attempt {retry+1}/4",flush=True)
   if retry<3:time.sleep(10*(2**retry))
  except Exception as e:raise SystemExit(f"TCDB source unavailable: {e}; NO CSV WRITTEN")
 raise SystemExit(f"TCDB temporary block persisted at {url}; NO CSV WRITTEN")
def normalize_number(s,key):
 if s.upper()=="NNO":return s.upper()
 m=re.fullmatch(r"(\d{1,3})([ab])",s,re.I)
 if m:return str(int(m.group(1)))
 if s.isdecimal():return str(int(s))
 return s.upper()
def collect(key,sid,count,rookie=False):
 found={};issues=[];numberless=0
 sweepstakes_variations=0
 for page in range(1,12):
  route="Rookies" if rookie else "Checklist"
  p=Rows();p.feed(get(f"https://www.tcdb.com/{route}.cfm/sid/{sid}/1995-Topps?PageIndex={page}"))
  parsed=added=0
  for row in p.rows:
   parts=[x.strip() for x in row if x.strip()]
   for pos,raw_no in enumerate(parts):
    if not NUMBER.fullmatch(raw_no) or pos+1>=len(parts):continue
    if key=="base" or rookie:
     m=re.fullmatch(r"(\d{1,3})(?:[ab])?",raw_no,re.I)
     if not m or not 1<=int(m.group(1))<=660:continue
    no=normalize_number(raw_no,key)
    if key=="walmart-sweepstakes-entry":
     # Five different TCDB entry-card source rows map to one
     # conceptual sweepstakes entry, never a prize card.
     sweepstakes_variations+=1
     no="ENTRY"
    elif no=="NNO":
     numberless+=1;no=f"NNO-{numberless:02d}"
    subject=clean(parts[pos+1])
    if not subject:continue
    team=parts[-1] if pos+2<len(parts) else ""
    if team==parts[pos+1]:team=""
    identity=(subject,team);parsed+=1
    if no in found and found[no]!=identity:
     if key=="stadium-club-first-day-issue" and no=="79" and team=="Kansas City Royals" and found[no][1]==team and subject in ("Bob Hamelin","Bob Hamelin ROY") and found[no][0] in ("Bob Hamelin","Bob Hamelin ROY"):
      print("First Day #79: collapsed verified Series 1/2 Bob Hamelin ROY wording variation",flush=True)
     else:issues.append(f"{key} #{no}: conflicting source identities {found[no]!r} vs {identity!r}")
    if no not in found:found[no]=identity;added+=1
    break
  print(f"{key} page {page}: {parsed} source rows, +{added}; {len(found)}/{count}",flush=True)
  if len(found)>=count:break
  if page>1 and parsed==0:break
 if key=="walmart-sweepstakes-entry" and sweepstakes_variations!=5:
  issues.append(f"Expected five documented Walmart entry-card stock/color variations, found {sweepstakes_variations}")
 if len(found)!=count:issues.append(f"{key}: expected {count}, found {len(found)}")
 return found,issues
def run():
 config=json.loads(BUNDLE.read_text(encoding="utf-8"));data={};issues=[]
 for spec in config["productSets"]:
  result,bad=collect(spec["key"],spec["sourceSetId"],spec["expectedCards"])
  data[spec["key"]]=result;issues.extend(bad)
 rookies,bad=collect("rookies",594,38,True);issues.extend(bad)
 if set(data["base"])!={str(n) for n in range(1,661)}:issues.append("Base card numbering must be exactly 1-660")
 if len(rookies)!=38:issues.append("Rookie index count mismatch")
 for n,identity in rookies.items():
  if data["base"].get(n)!=identity:issues.append(f"Rookie #{n}: {identity!r} != Base {data['base'].get(n)!r}")
 if issues:
  print("=== SOURCE DISCREPANCIES ===")
  for issue in issues[:60]:print("  "+issue)
  raise SystemExit(f"{len(issues)} discrepancies; NO CSV WRITTEN")
 rows=[]
 for spec in config["productSets"]:
  key=spec["key"]
  for no,(subject,team) in data[key].items():
   if key=="base" and no in rookies:subject+=" RC"
   rows.append((key,no,subject,team,"",spec["name"] if key!="base" else ""))
 expected=sum(spec["expectedCards"] for spec in config["productSets"])
 if len(rows)!=expected or len(set((r[0],r[1]) for r in rows))!=expected:raise SystemExit("Incomplete or duplicate checklist; NO CSV WRITTEN")
 CSV.parent.mkdir(parents=True,exist_ok=True)
 with CSV.open("w",newline="",encoding="utf-8") as f:
  w=csv.writer(f,lineterminator="\n");w.writerow(("setKey","cardNumber","player","team","subset","variant"));w.writerows(rows)
 print(f"GENERATED {len(rows)} cards across {len(config['productSets'])} ProductSets; {len(rookies)} true Base rookies; UNRELEASED")
 print(f"CSV: {CSV}")
def tests():
 assert clean("Ken Boswell")=="Ken Boswell"
 assert clean("Ken Boswell RC")=="Ken Boswell"
 assert clean("Jacob Shumate DPK, RC")=="Jacob Shumate"
 assert clean("Babe Ruth ERRERR: No Topps logo")=="Babe Ruth"
 assert normalize_number("3b","base")=="3"
 assert normalize_number("001","cyberstats")=="1"
 assert clean("Bob Hamelin VARRandomly inserted into Series 1 Hobby packs, does not mention Rookie of the Year award")=="Bob Hamelin"
 assert clean("Bob Hamelin ROY, VARRandomly inserted into Series 2 Hobby packs, mentions Rookie of the Year award")=="Bob Hamelin ROY"
 assert clean("Steve Kline / Herb Perry OD, RCRC for Kline only")=="Steve Kline / Herb Perry OD"
 assert clean("Eddy Diaz / Desi Relaford OD, RCRC for Diaz only")=="Eddy Diaz / Desi Relaford OD"
 assert clean("Roger Cedeno / Ron Coomer OD,RCRC for Coomer only.")=="Roger Cedeno / Ron Coomer OD"
 assert clean("Win the World\u0027s Most Valuable Card Official Entry Card VARVAR: Orange on upper front")=="Win the World\u0027s Most Valuable Card Official Entry Card"
 assert clean("Win the World\u0027s Most Valuable Card Official Entry Card VARRandom stock detail")=="Win the World\u0027s Most Valuable Card Official Entry Card"
 print("1995 Topps offline self-tests passed")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");a=p.parse_args();tests()
 if not a.self_test:run()
