#!/usr/bin/env python3
"""1990 Leaf Baseball Set Factory. Verify every source row; never write partial CSV."""
from __future__ import annotations
import argparse,csv,re,urllib.request
from html.parser import HTMLParser
from pathlib import Path

OUT=Path(__file__).resolve().parents[1]/"data/set-factory/1990-leaf-baseball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory research import)","Accept":"text/html,application/xhtml+xml"}
NOTE=re.compile(r"(?:,\s*|\s+)(?:UER|ERR|COR|VAR|RC|PUZ)(?=\b|[A-Z]|[,;:])",re.I)
NUMBER=re.compile(r"^\d{1,3}$")
PANEL=re.compile(r"^(\d{1,2})-(\d{1,2})$")
class CardRows(HTMLParser):
 def __init__(self):
  super().__init__();self.rows=[];self.row=None;self.cell=None;self.link=False
 def handle_starttag(self,t,attrs):
  if t=="tr":self.row=[];self.link=False
  elif t=="td" and self.row is not None:self.cell=[]
  elif t=="a" and self.row is not None and any(k=="href" and "ViewCard.cfm" in (v or "") for k,v in attrs):
   self.link=True
 def handle_data(self,d):
  if self.cell is not None:self.cell.append(d)
 def handle_endtag(self,t):
  if t=="td" and self.cell is not None:
   self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  elif t=="tr" and self.row is not None:
   if self.row and self.link:self.rows.append(self.row)
   self.row=None
def get(url):
 try:
  req=urllib.request.Request(url,headers=HEADERS)
  with urllib.request.urlopen(req,timeout=35) as r:return r.read().decode("utf-8","replace")
 except Exception as exc:raise SystemExit(f"TCDB unavailable: {url}: {exc}; NO CSV written")
def clean(value):
 s=" ".join(value.split()).strip()
 m=NOTE.search(s)
 if m:s=s[:m.start()].strip(" ,;")
 return s
def collect(label,sid,expected,mode):
 found={};issues=[]
 for page in range(1,10):
  path="Rookies" if mode=="rookies" else "Checklist"
  url=f"https://www.tcdb.com/{path}.cfm/sid/{sid}/1990-Leaf?PageIndex={page}"
  doc=CardRows();doc.feed(get(url));rows=0;added=0
  for row in doc.rows:
   vals=[x.strip() for x in row if x.strip()]
   for i,number in enumerate(vals):
    if mode=="puzzle":
     m=PANEL.fullmatch(number)
     valid=bool(m and 1<=int(m.group(1))<=61 and int(m.group(2))==int(m.group(1))+2 and (int(m.group(1))-1)%3==0)
    else:valid=bool(NUMBER.fullmatch(number) and 1<=int(number)<=528)
    if not valid or i+1>=len(vals):continue
    name=clean(vals[i+1])
    if not name:continue
    team=vals[-1] if i+2<len(vals) else ""
    if team==vals[i+1]:team=""
    rows+=1
    previous=found.get(number)
    if previous and previous!=(name,team):issues.append(f"{label} #{number}: {previous!r} vs {(name,team)!r}")
    if not previous:found[number]=(name,team);added+=1
    break
  print(f"{label} page {page}: {rows} rows; +{added}; {len(found)}/{expected}",flush=True)
  if len(found)>=expected:break
  if page>1 and not rows:break
 if len(found)!=expected:issues.append(f"{label}: expected {expected}, got {len(found)}")
 if mode=="base":
  missing={str(n) for n in range(1,529)}-set(found)
  if missing:issues.append(f"Base missing card numbers {sorted(missing,key=int)}")
 if mode=="puzzle":
  correct={f"{n}-{n+2}" for n in range(1,64,3)}
  if set(found)!=correct:issues.append(f"Puzzle panels missing {sorted(correct-set(found))}; extra {sorted(set(found)-correct)}")
 return found,issues
def main():
 base,issues=collect("base",143,528,"base")
 puzzle,bad=collect("yogi-berra-puzzle",99847,21,"puzzle");issues.extend(bad)
 rookies,bad=collect("rookies",143,56,"rookies");issues.extend(bad)
 for number,(name,team) in rookies.items():
  if base.get(number)!=(name,team):
   issues.append(f"RC #{number}: {name!r}/{team!r} vs Base {base.get(number)!r}")
 for number,(name,team) in base.items():
  if not team and name.lower() not in ("the leaf set",) and "checklist" not in name.lower():
   issues.append(f"Base #{number}: missing team for {name!r}")
 for number,(name,team) in puzzle.items():
  if name!="Yogi Berra" or team!="New York Yankees":
   issues.append(f"Puzzle #{number}: unexpected {name!r}/{team!r}")
 if issues:
  print("=== ALL SOURCE DISCREPANCIES ===")
  for issue in issues:print("  "+issue)
  raise SystemExit(f"{len(issues)} discrepancies; NO CSV written")
 rows=[]
 for number in range(1,529):
  name,team=base[str(number)]
  if str(number) in rookies:name+=" RC"
  if not team and name.lower()=="the leaf set":team="MLB"
  rows.append(("base",str(number),name,team,"",""))
 for n in range(1,64,3):
  number=f"{n}-{n+2}";name,team=puzzle[number]
  rows.append(("yogi-berra-puzzle",number,name,team,"","Yogi Berra Puzzle"))
 if len(rows)!=549 or len({(r[0],r[1]) for r in rows})!=549:
  raise SystemExit("Identity count failed; NO CSV written")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",newline="",encoding="utf-8") as f:
  writer=csv.writer(f,lineterminator="\n")
  writer.writerow(("setKey","cardNumber","player","team","subset","variant"))
  writer.writerows(rows)
 print("GENERATED: 549 collectibles; Base 528; Yogi Berra puzzle panels 21; true RCs 56")
 print(f"CSV: {OUT}; STATUS: UNRELEASED")
def tests():
 assert clean("Frank Thomas RC, UER")=="Frank Thomas"
 assert clean("Yogi Berra PUZ")=="Yogi Berra"
 assert PANEL.fullmatch("61-63")
 print("1990 Leaf offline self-tests passed")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true")
 args=p.parse_args();tests()
 if not args.self_test:main()
