#!/usr/bin/env python3
"""Fail-closed 1992 Playoff Football checklist generator."""
from __future__ import annotations
import argparse,csv,json,re,urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1992-playoff-football.bundle.json"
OUT=ROOT/"data/set-factory/1992-playoff-football.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory research import)","Accept":"text/html,application/xhtml+xml"}
METADATA=re.compile(r"(?:,\s*|\s+)(?:UER|ERR|COR|VAR|RC)(?=\s|,|:|$)",re.I)

class Rows(HTMLParser):
 def __init__(self):
  super().__init__();self.rows=[];self.row=None;self.cell=None;self.link=False
 def handle_starttag(self,tag,attrs):
  if tag=="tr":self.row=[];self.link=False
  elif tag=="td" and self.row is not None:self.cell=[]
  elif tag=="a" and self.row is not None and any(k=="href" and "ViewCard.cfm" in (v or "") for k,v in attrs):self.link=True
 def handle_data(self,txt):
  if self.cell is not None:self.cell.append(txt)
 def handle_endtag(self,tag):
  if tag=="td" and self.cell is not None:
   self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  elif tag=="tr" and self.row is not None:
   if self.row and self.link:self.rows.append(self.row)
   self.row=None

def clean(value):
 s=" ".join(value.split()).strip()
 m=METADATA.search(s)
 if m:s=s[:m.start()].strip(" ,;")
 return s

def fetch(url):
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=40) as r:return r.read().decode("utf-8","replace")
 except Exception as ex:raise SystemExit(f"TCDB source unavailable: {url}: {ex}; NO CSV written")

def collect(rookie=False):
 name="rookies" if rookie else "base"
 target=10 if rookie else 150
 result={};issues=[]
 for page in range(1,5):
  route="Rookies" if rookie else "Checklist"
  url=f"https://www.tcdb.com/{route}.cfm/sid/3296/1992-Playoff?PageIndex={page}"
  parser=Rows();parser.feed(fetch(url))
  parsed=added=0
  for raw in parser.rows:
   row=[x.strip() for x in raw if x.strip()]
   for i,number in enumerate(row):
    if not number.isdecimal() or not 1<=int(number)<=150 or i+1>=len(row):continue
    subject=clean(row[i+1])
    if not subject:continue
    team=row[-1] if i+2<len(row) else ""
    if team==row[i+1]:team=""
    parsed+=1
    prev=result.get(number)
    if prev and prev!=(subject,team):issues.append(f"{name} #{number}: inconsistent identities {prev!r} vs {(subject,team)!r}")
    if not prev:result[number]=(subject,team);added+=1
    break
  print(f"{name} page {page}: {parsed} rows; +{added}; {len(result)}/{target}",flush=True)
  if len(result)>=target:break
  if page>1 and not parsed:break
 if len(result)!=target:issues.append(f"{name}: expected {target}; found {len(result)}")
 if not rookie:
  missing={str(n) for n in range(1,151)}-set(result)
  if missing:issues.append(f"Base missing card numbers: {sorted(missing,key=int)}")
 return result,issues

def main():
 bundle=json.loads(BUNDLE.read_text(encoding="utf-8"))
 base,issues=collect()
 rookies,bad=collect(True);issues.extend(bad)
 for number,(name,team) in rookies.items():
  if base.get(number)!=(name,team):issues.append(f"RC #{number}: {name!r}/{team!r} differs from Base {base.get(number)!r}")
 for number,(name,team) in base.items():
  if not team and "checklist" not in name.lower():issues.append(f"Base #{number}: no team for {name!r}")
 if issues:
  print("=== SOURCE DISCREPANCIES ===")
  for issue in issues:print("  "+issue)
  raise SystemExit(f"{len(issues)} discrepancies; NO CSV written")
 output=[]
 for number in range(1,151):
  subject,team=base[str(number)]
  if str(number) in rookies:subject+=" RC"
  output.append(("base",str(number),subject,team,"",""))
 assert len(output)==150 and sum(x[2].endswith(" RC") for x in output)==10
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",newline="",encoding="utf-8") as f:
  writer=csv.writer(f,lineterminator="\n")
  writer.writerow(("setKey","cardNumber","player","team","subset","variant"));writer.writerows(output)
 print("GENERATED: 150 Base cards; 10 true RCs; 1 ProductSet")
 print(f"CSV: {OUT}; STATUS UNRELEASED")

def tests():
 assert clean("Ken Boswell")=="Ken Boswell"
 assert clean("Ken Boswell RC")=="Ken Boswell"
 assert clean("Jim Hall")=="Jim Hall"
 assert clean("Marshall")=="Marshall"
 assert clean("Rich Gannon UER: note")=="Rich Gannon"
 assert clean("Hassan Jones UER")=="Hassan Jones"
 print("1992 Playoff offline self-tests passed")

if __name__=="__main__":
 parser=argparse.ArgumentParser();parser.add_argument("--self-test",action="store_true")
 args=parser.parse_args();tests()
 if not args.self_test:main()
