#!/usr/bin/env python3
"""1991-92 SkyBox Basketball: full-source, fail-closed Set Factory generator."""
import argparse,csv,re,urllib.request
from html.parser import HTMLParser
from pathlib import Path

OUT=Path(__file__).resolve().parents[1]/"data/set-factory/1991-92-skybox-basketball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory research import)","Accept":"text/html,application/xhtml+xml"}
ROMANS={"i","ii","iii","iv","v","vi"}
NOTE=re.compile(r"\s+(?:UER|ERR|COR|VAR|RC)(?=\b|[A-Z]|[,;:])",re.I)
SUBSET=re.compile(r"\s+(?:USA|CO|DFT|AS|TL|LL|CL|TC)\s*$",re.I)

class Rows(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None
 def handle_starttag(self,t,a):
  if t=="tr":self.row=[]
  if t=="td" and self.row is not None:self.cell=[]
 def handle_data(self,d):
  if self.cell is not None:self.cell.append(d)
 def handle_endtag(self,t):
  if t=="td" and self.cell is not None:
   self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  if t=="tr" and self.row is not None:
   if self.row:self.rows.append(self.row)
   self.row=None
def fetch(url):
 try:
  request=urllib.request.Request(url,headers=HEADERS)
  with urllib.request.urlopen(request,timeout=40) as r:return r.read().decode("utf-8","replace")
 except Exception as e:raise SystemExit(f"TCDB unavailable: {url}: {e}; NO CSV written")
def clean(s):
 s=" ".join(s.split()).strip();m=NOTE.search(s)
 if m:s=s[:m.start()].strip(" ,;")
 return s
def collect(label,sid,expected,mode):
 found={};issues=[]
 for page in range(1,12):
  route="Rookies" if mode=="rookies" else "Checklist"
  parser=Rows();parser.feed(fetch(f"https://www.tcdb.com/{route}.cfm/sid/{sid}/1991-92-SkyBox?PageIndex={page}"))
  parsed=0;added=0
  for row in parser.rows:
   v=[x.strip() for x in row if x.strip()]
   for i,numtext in enumerate(v):
    if mode=="blister":
     match=numtext.lower() in ROMANS
     number=numtext.lower()
    else:
     match=bool(re.fullmatch(r"\d{1,3}",numtext)) and 1<=int(numtext)<=659
     number=numtext
    if not match or i+1>=len(v):continue
    name=clean(v[i+1]);team=v[-1] if i+2<len(v) else ""
    if team==v[i+1]:team=""
    if not name:continue
    parsed+=1
    if number in found and found[number]!=(name,team):
     issues.append(f"{label} #{number}: {found[number]!r} vs {(name,team)!r}")
    if number not in found:found[number]=(name,team);added+=1
    break
  print(f"{label} page {page}: {parsed} rows; +{added}; {len(found)}/{expected}",flush=True)
  if len(found)>=expected:break
  if page>1 and parsed==0:break
 if len(found)!=expected:issues.append(f"{label}: expected {expected}, got {len(found)}")
 if mode=="base":
  missing={str(n) for n in range(1,660)}-set(found)
  if missing:issues.append(f"Base missing numbers: {sorted(missing,key=int)[:25]}")
 if mode=="blister":
  missing=ROMANS-set(found)
  if missing:issues.append(f"Blister inserts missing: {sorted(missing)}")
 return found,issues
def main():
 base,issues=collect("base",2089,659,"base")
 inserts,problems=collect("blister",25540,6,"blister");issues+=problems
 rookies,problems=collect("rookies",2089,47,"rookies");issues+=problems
 for n,(name,team) in rookies.items():
  if n not in base or base[n][0]!=name:
   issues.append(f"RC #{n}: {name!r} differs from Base {base.get(n)!r}")
 for n,(name,team) in base.items():
  if not team and "checklist" not in name.lower():
   issues.append(f"Base #{n}: missing team for {name!r}")
 if issues:
  print("=== ALL SOURCE DISCREPANCIES ===")
  for issue in issues:print("  "+issue)
  raise SystemExit(f"{len(issues)} problems; NO CSV written")
 rows=[]
 for n in range(1,660):
  name,team=base[str(n)];subset=""
  m=SUBSET.search(name)
  if m:subset=m.group(0).strip();name=name[:m.start()].strip()
  if str(n) in rookies:name+=" RC"
  if not team and "checklist" in name.lower():team="NBA"
  rows.append(("base",str(n),name,team,subset,""))
 for roman in ("i","ii","iii","iv","v","vi"):
  name,team=inserts[roman]
  rows.append(("blister-inserts",roman,name,team or "NBA","", "Blister Insert"))
 if len(rows)!=665 or len({(r[0],r[1]) for r in rows})!=665:
  raise SystemExit("Count/identity check failed; NO CSV written")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",newline="",encoding="utf-8") as f:
  w=csv.writer(f,lineterminator="\n")
  w.writerow(("setKey","cardNumber","player","team","subset","variant"));w.writerows(rows)
 print("=== 1991-92 SKYBOX BASKETBALL GENERATED ===")
 print("Base: 659; Blister Inserts: 6; Total: 665; True RCs: 47")
 print("Unreleased; blister-pack insert odds require normalization.")
 print(f"CSV: {OUT}")
def self_test():
 assert clean("Rumeal Robinson UER: Drafted 11th")=="Rumeal Robinson"
 assert clean("Larry Johnson DFT, RC")=="Larry Johnson DFT"
 assert len(ROMANS)==6
 print("1991-92 SkyBox offline tests passed")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");a=p.parse_args()
 self_test()
 if not a.self_test:main()
