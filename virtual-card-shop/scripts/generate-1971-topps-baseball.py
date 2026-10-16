#!/usr/bin/env python3
"""Generate 1971 Topps Baseball Set Factory draft. No partial CSV imports."""
from __future__ import annotations
import argparse,csv,re,urllib.request
from pathlib import Path
from html.parser import HTMLParser

OUT=Path(__file__).resolve().parents[1]/"data/set-factory/1971-topps-baseball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory research import)","Accept":"text/html,application/xhtml+xml"}
SOURCES={"base":(71,752),"coins":(10106,153),"scratch-offs":(10107,24)}
TAGS=re.compile(r"\s+(?:UER|ERR|COR|VAR|RC)(?=\b|[A-Z]|[,;:])",re.I)
SUBSETS=re.compile(r"\s+(?:RS|ASR|ALCS|NLCS|LL|TC|CL|MGR)\s*$",re.I)
class Rows(HTMLParser):
 def __init__(self):
  super().__init__();self.rows=[];self.row=None;self.cell=None
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
  req=urllib.request.Request(url,headers=HEADERS)
  with urllib.request.urlopen(req,timeout=35) as r:return r.read().decode("utf-8","replace")
 except Exception as e:raise SystemExit(f"TCDB access error: {url}: {e}; NO CSV written")
def clean(s):
 s=" ".join(s.split()).strip()
 # TCDB sometimes concatenates its comma-prefixed error marker and note.
 s=re.sub(r",\s*(?:UER|ERR|COR|VAR)(?=\d|[A-Z])[^,;]*$", "", s, flags=re.I)
 m=TAGS.search(s)
 if m:s=s[:m.start()].strip(" ,;")
 if not s:raise SystemExit("Blank TCDB subject; NO CSV written")
 return s
def collect(key,sid,count,rookie=False):
 found={};issues=[];nno=[]
 for page in range(1,12):
  path="Rookies" if rookie else "Checklist"
  p=Rows();p.feed(fetch(f"https://www.tcdb.com/{path}.cfm/sid/{sid}/1971-Topps?PageIndex={page}"))
  added=0;parsed=0
  for row in p.rows:
   vals=[v.strip() for v in row if v.strip()]
   for i,v in enumerate(vals):
    numbered=re.fullmatch(r"(\d{1,3})([a-z]?)",v,re.I)
    valid=(v.upper()=="NNO" if key=="scratch-offs" else numbered is not None and 1<=int(numbered.group(1))<=752)
    if not valid or i+1>=len(vals):continue
    name=clean(vals[i+1]);team=vals[-1] if i+2<len(vals) else ""
    if team==vals[i+1]:team=""
    parsed+=1
    if key=="scratch-offs":
     if name in {x[0] for x in nno}:issues.append(f"Duplicate Scratch-Off subject {name}")
     else:nno.append((name,team))
    else:
     num=int(numbered.group(1))
     # TCDB #619 has two printing variants. The error-commentary row
     # may contain text separated across HTML cells rather than in the
     # same subject cell. Both explicitly verified checklist printings
     # are the same collector card and must not become separate items.
     if key=="base" and num==619 and re.fullmatch(
      r"Checklist:\s*644\s*[-–]\s*752\s+CL(?:\s*,?\s*ERR.*)?",
      name, re.I
     ) and not team:
      name="Checklist: 644-752 CL"
     prior=found.get(num)
     if prior and prior[:2]!=(name,team):
      issues.append(f"{key} #{num}: {prior[:2]!r} vs {(name,team)!r}")
     if not prior:found[num]=(name,team);added+=1
    break
  current=len(nno) if key=="scratch-offs" else len(found)
  print(f"{key} page {page}: {parsed} rows; +{added}; {current}/{count}",flush=True)
  if current>=count:break
  if page>1 and parsed==0:break
 if key=="scratch-offs":
  if len(nno)!=count:issues.append(f"Scratch-Offs expected {count} distinct NNO subjects; got {len(nno)}")
  return {i+1:x for i,x in enumerate(nno)},issues
 if len(found)!=count:issues.append(f"{key}: expected {count}, got {len(found)}")
 if not rookie and set(found)!=set(range(1,count+1)):
  issues.append(f"{key}: numbering missing {sorted(set(range(1,count+1))-set(found))[:20]}")
 return found,issues
def main():
 data={};issues=[]
 for key,(sid,count) in SOURCES.items():
  data[key],bad=collect(key,sid,count);issues.extend(bad)
 rookies,bad=collect("rookies",71,89,rookie=True);issues.extend(bad)
 for n,(name,team) in rookies.items():
  if n not in data["base"] or data["base"][n][0]!=name:
   issues.append(f"Rookie #{n}: {name!r} disagrees with Base {data['base'].get(n)}")
 for key,cards in data.items():
  for n,(name,team) in cards.items():
   if not team and "checklist" not in name.lower():issues.append(f"{key} #{n} {name!r}: missing team")
 if issues:
  print("=== ALL SOURCE DISCREPANCIES ===")
  for issue in issues:print("  "+issue)
  raise SystemExit(f"{len(issues)} discrepancies; NO CSV written")
 rows=[]
 for key in SOURCES:
  for n,(name,team) in sorted(data[key].items()):
   subset=""
   if key=="base":
    m=SUBSETS.search(name)
    if m:subset=m.group(0).strip();name=name[:m.start()].strip()
    if n in rookies:name+=" RC"
   if not team and "checklist" in name.lower():team="MLB"
   number=str(n) if key!="scratch-offs" else f"NNO-{n:02d}"
   variant="Metal Coin" if key=="coins" else ("Scratch-Off" if key=="scratch-offs" else "")
   rows.append((key,number,name,team,subset,variant))
 if len(rows)!=929 or len({(r[0],r[1]) for r in rows})!=929:raise SystemExit("Identity/card totals failed; NO CSV")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",newline="",encoding="utf-8") as f:
  w=csv.writer(f,lineterminator="\n");w.writerow(("setKey","cardNumber","player","team","subset","variant"));w.writerows(rows)
 print("=== 1971 TOPPS BASEBALL GENERATED ===")
 print("Base 752 / Coins 153 / Scratch-Offs 24 = 929; True RCs 89")
 print("Unreleased; insert odds and artwork pending verification.")
 print(f"CSV: {OUT}")
def self_test():
 assert clean("Bert Blyleven RC")=="Bert Blyleven"
 assert clean("Al Kaline UER: birth date")=="Al Kaline"
 assert clean("Checklist: 644-752 CL, ERR6th Series")=="Checklist: 644-752 CL"
 assert re.fullmatch(r"(\d{1,3})([a-z]?)","42a",re.I).group(1)=="42"
 assert re.fullmatch(r"(\d{1,3})([a-z]?)","619b",re.I).group(1)=="619"
 print("1971 Topps self-tests passed")
if __name__=="__main__":
 a=argparse.ArgumentParser();a.add_argument("--self-test",action="store_true");args=a.parse_args()
 self_test()
 if not args.self_test:main()
