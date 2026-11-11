#!/usr/bin/env python3
"""Fail-closed TCDB audit for 1994-95 Topps Premier Hockey."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1994-95-topps-premier-hockey.bundle.json"
OUT=ROOT/"data/set-factory/1994-95-topps-premier-hockey.cards.csv"
HEADER={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory verification)","Accept":"text/html,application/xhtml+xml"}
NUMBER=re.compile(r"^\d{1,3}$")
ANNOT=re.compile(r"(?:,\s*|\s+)(?:RC|UER|ERR|COR|VAR|CL|AS[12]|GD|PROS|TOTG|HOF|SH|SP|SN\d+)(?=:|,|\s|$)",re.I)
class TableRows(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None;self.card=False
 def handle_starttag(self,t,a):
  if t=="tr":self.row=[];self.card=False
  elif t=="td" and self.row is not None:self.cell=[]
  elif t=="a" and self.row is not None and any(k=="href" and "ViewCard.cfm" in (v or "") for k,v in a):self.card=True
 def handle_data(self,s):
  if self.cell is not None:self.cell.append(s)
 def handle_endtag(self,t):
  if t=="td" and self.cell is not None:self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  elif t=="tr" and self.row is not None:
   if self.card and self.row:self.rows.append(self.row)
   self.row=None
def clean(s):
 s=" ".join(s.split()).strip()
 s=re.sub(r",?\s*(?:UERUER|ERRERR|CORCOR|RCRC|VARVAR):.*$","",s,flags=re.I)
 m=ANNOT.search(s)
 return s[:m.start()].strip(" ,;") if m else s
def same_subjects(number,a,b):
 if a==b:return True
 if not a or not b or a[1]!=b[1]:return False
 if number not in {"80","84","346","347"}:return False
 def players(name):
  # Strip TCDB subset notation, then compare participant identities
  name=re.sub(r"\s+TT$", "", name)
  return sorted(part.strip() for part in name.split(" / "))
 return players(a[0])==players(b[0])
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.2)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEADER),timeout=45) as response:return response.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code}; NO CSV WRITTEN")
   print(f"TCDB retry HTTP {e.code} ({attempt+1}/4)",flush=True)
   if attempt<3:time.sleep(10*2**attempt)
  except Exception as e:raise SystemExit(f"TCDB read failed: {e}; NO CSV WRITTEN")
 raise SystemExit(f"TCDB retry limit exceeded: {url}; NO CSV WRITTEN")
def collect(key,sid,expected,rookies=False):
 found={};errors=[]
 for page in range(1,9):
  mode="Rookies" if rookies else "Checklist"
  parser=TableRows();parser.feed(fetch(f"https://www.tcdb.com/{mode}.cfm/sid/{sid}/1994-95-Topps-Premier?PageIndex={page}"))
  new=0
  for row in parser.rows:
   cells=[s.strip() for s in row if s.strip()]
   for i,raw in enumerate(cells):
    if not NUMBER.fullmatch(raw) or i+1>=len(cells):continue
    number=str(int(raw));player=clean(cells[i+1]);team=cells[-1] if i+2<len(cells) else ""
    if team==cells[i+1]:team=""
    if not player:continue
    new+=1;value=(player,team)
    if number in found:errors.append(f"{key}: duplicate #{number} ({value!r})")
    else:found[number]=value
    break
  print(f"{key} page {page}: {new} source rows; {len(found)}/{expected}",flush=True)
  if len(found)>=expected:break
  if page>1 and not new:break
 if len(found)!=expected:errors.append(f"{key}: found {len(found)}, expected {expected}")
 return found,errors
def test():
 assert clean("Mikhail Shtalenkov RC")=="Mikhail Shtalenkov"
 assert clean("Dean Chynoweth RC, UERUER: Listed with Whalers")=="Dean Chynoweth"
 assert clean("Grant Fuhr / Dominik Hasek GD")=="Grant Fuhr / Dominik Hasek"
 assert clean("Checklist: 1-136 CL")=="Checklist: 1-136"
 assert same_subjects("80",("Dominik Hasek / Grant Fuhr","Buffalo Sabres"),("Grant Fuhr / Dominik Hasek","Buffalo Sabres"))
 assert same_subjects("346",("Rick Tocchet / Luc Robitaille TT","Team A / Team B"),("Luc Robitaille / Rick Tocchet TT","Team A / Team B"))
 assert not same_subjects("80",("Dominik Hasek / Someone Else","Buffalo Sabres"),("Grant Fuhr / Dominik Hasek","Buffalo Sabres"))
 assert not same_subjects("81",("Dominik Hasek / Grant Fuhr","Buffalo Sabres"),("Grant Fuhr / Dominik Hasek","Buffalo Sabres"))
 print("1994-95 Topps Premier offline self-tests passed")
def main():
 bundle=json.loads(BUNDLE.read_text(encoding="utf-8"))
 expected={"base":550,"special-effects":550,"finest-top-goal-scorers":23,"finest-the-go-to-guy":15}
 if {x["key"]:x["expectedCards"] for x in bundle["productSets"]}!=expected:raise SystemExit("Bundle structure changed; NO CSV WRITTEN")
 source={};errors=[]
 for spec in bundle["productSets"]:
  found,issues=collect(spec["key"],spec["sourceSetId"],spec["expectedCards"]);source[spec["key"]]=found;errors+=issues
 rookies,issues=collect("rookies",5076,23,True);errors+=issues
 all_numbers={str(i) for i in range(1,551)}
 for key in ("base","special-effects"):
  if set(source[key])!=all_numbers:errors.append(f"{key}: missing {sorted(all_numbers-set(source[key]))[:15]}, extra {sorted(set(source[key])-all_numbers)[:15]}")
 for key,count in (("finest-top-goal-scorers",23),("finest-the-go-to-guy",15)):
  if set(source[key])!={str(i) for i in range(1,count+1)}:errors.append(f"{key}: insert numbering not 1-{count}")
 for n,v in rookies.items():
  if v!=source["base"].get(n):errors.append(f"Rookie #{n}: {v!r} != Base {source['base'].get(n)!r}")
 if set(rookies)-all_numbers:errors.append("Rookie numbering outside Base")
 if len(rookies)!=23:errors.append(f"Expected 23 distinct rookies, got {len(rookies)}")
 for n,v in source["special-effects"].items():
  if n in {"274","275","549","550"}:
   if not v[0] or v[0].startswith("Checklist"):errors.append(f"Special Effects #{n}: player replacement expected, found {v!r}")
  elif not same_subjects(n,v,source["base"].get(n)):errors.append(f"Special Effects #{n}: {v!r} != Base {source['base'].get(n)!r}")
 for n in ("274","275","549","550"):
  if not source["base"].get(n,("",))[0].startswith("Checklist"):errors.append(f"Base #{n} is not checklist")
 if errors:
  print("=== SOURCE DISCREPANCIES ===")
  for issue in errors[:100]:print(" ",issue)
  raise SystemExit(f"{len(errors)} source discrepancies; NO CSV WRITTEN")
 output=[]
 for spec in bundle["productSets"]:
  key=spec["key"]
  for n,(player,team) in source[key].items():
   if key=="base" and n in rookies:player+=" RC"
   subset="Series 1" if key in ("base","special-effects") and int(n)<=275 else "Series 2" if key in ("base","special-effects") else ""
   output.append((key,n,player,team,subset,spec["name"] if key!="base" else ""))
 if len(output)!=1138 or len({(c[0],c[1]) for c in output})!=1138 or Counter(c[0] for c in output)!=Counter(expected):raise SystemExit("Output validation failed; NO CSV WRITTEN")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",encoding="utf-8",newline="") as f:
  w=csv.writer(f,lineterminator="\n");w.writerow(("setKey","cardNumber","player","team","subset","variant"));w.writerows(output)
 print("GENERATED 1138 cards across 4 ProductSets; 23 Base rookies; UNRELEASED")
 print(f"CSV: {OUT}")
if __name__=="__main__":
 a=argparse.ArgumentParser();a.add_argument("--self-test",action="store_true");args=a.parse_args();test()
 if not args.self_test:main()
