#!/usr/bin/env python3
"""1993 Stadium Club Baseball: complete, fail-closed VCS checklist generator."""
import argparse,csv,json,re,urllib.request
from pathlib import Path
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1993-stadium-club-baseball.bundle.json"
OUT=ROOT/"data/set-factory/1993-stadium-club-baseball.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory research import)","Accept":"text/html,application/xhtml+xml"}
META=re.compile(r"\s+(?:RC|UER|ERR|COR|VAR|SN\d+|RDM)(?=\s|,|:|$)",re.I)
NUM=re.compile(r"^(?:\d{1,3}|NNO)$",re.I)
class Rows(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None;self.link=False
 def handle_starttag(self,tag,attrs):
  if tag=="tr":self.row=[];self.link=False
  elif tag=="td" and self.row is not None:self.cell=[]
  elif tag=="a" and self.row is not None and any(k=="href" and "ViewCard.cfm" in (v or "") for k,v in attrs):self.link=True
 def handle_data(self,data):
  if self.cell is not None:self.cell.append(data)
 def handle_endtag(self,tag):
  if tag=="td" and self.cell is not None:
   self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  elif tag=="tr" and self.row is not None:
   if self.row and self.link:self.rows.append(self.row)
   self.row=None
def clean(text):
 name=" ".join(text.split()).strip()
 m=META.search(name)
 if m:name=name[:m.start()].strip(" ,;")
 return name
def get(url):
 try:
  req=urllib.request.Request(url,headers=HEADERS)
  with urllib.request.urlopen(req,timeout=40) as r:return r.read().decode("utf-8","replace")
 except Exception as exc:raise SystemExit(f"TCDB unavailable: {url}: {exc}; NO CSV written")
def collect(key,sid,count,rookie=False):
 cards={};issues=[];unnumbered=0
 for page in range(1,12):
  route="Rookies" if rookie else "Checklist"
  doc=Rows();doc.feed(get(f"https://www.tcdb.com/{route}.cfm/sid/{sid}/1993-Stadium-Club?PageIndex={page}"))
  parsed=added=0
  for row in doc.rows:
   values=[x.strip() for x in row if x.strip()]
   for i,v in enumerate(values):
    if not NUM.fullmatch(v) or i+1>=len(values):continue
    if v.upper()=="NNO" and key not in ("master-photos-redemptions-series-1","master-photos-redemptions-series-2","master-photos-redemptions-series-3"):continue
    name=clean(values[i+1]);team=values[-1] if i+2<len(values) else ""
    if not name:continue
    if team==values[i+1]:team=""
    parsed+=1
    if v.upper()=="NNO":
     unnumbered+=1
     number=f"NNO-{unnumbered:02d}"
    else:number=v
    if number in cards and cards[number]!=(name,team):issues.append(f"{key} #{number}: {cards[number]!r} vs {(name,team)!r}")
    if number not in cards:cards[number]=(name,team);added+=1
    break
  print(f"{key} page {page}: {parsed} rows; +{added}; {len(cards)}/{count}",flush=True)
  if len(cards)>=count:break
  if page>1 and parsed==0:break
 if len(cards)!=count:issues.append(f"{key}: expected {count}, found {len(cards)}")
 if key in ("base","first-day-production"):
  missing={str(n) for n in range(1,751)}-set(cards)
  if missing:issues.append(f"{key} missing numbers: {sorted(missing,key=int)[:30]}")
 return cards,issues
def main():
 config=json.loads(BUNDLE.read_text(encoding="utf-8"));found={};issues=[]
 for spec in config["productSets"]:
  cards,problems=collect(spec["key"],spec["sourceSetId"],spec["expectedCards"])
  found[spec["key"]]=cards;issues.extend(problems)
 rookies,problems=collect("rookies",280,45,True);issues.extend(problems)
 for n,v in rookies.items():
  if found["base"].get(n)!=v:issues.append(f"RC #{n}: {v!r} differs from Base {found['base'].get(n)!r}")
 for n,v in found["first-day-production"].items():
  if found["base"].get(n)!=v:issues.append(f"First Day #{n}: {v!r} differs from Base {found['base'].get(n)!r}")
 if issues:
  print("=== ALL SOURCE DISCREPANCIES ===")
  for issue in issues:print("  "+issue)
  raise SystemExit(f"{len(issues)} discrepancies; NO CSV written")
 output=[]
 for spec in config["productSets"]:
  key=spec["key"]
  for no,(name,team) in found[key].items():
   if key=="base" and no in rookies:name+=" RC"
   output.append((key,no,name,team,"",spec["name"] if key!="base" else ""))
 target=sum(s["expectedCards"] for s in config["productSets"])
 if len(output)!=target or len({(r[0],r[1]) for r in output})!=target:raise SystemExit("Identity count failed; NO CSV written")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",newline="",encoding="utf-8") as f:
  w=csv.writer(f,lineterminator="\n")
  w.writerow(("setKey","cardNumber","player","team","subset","variant"));w.writerows(output)
 print(f"GENERATED {len(output)} cards in {len(config['productSets'])} ProductSets; 45 true Base RCs")
 print(f"CSV: {OUT}; UNRELEASED")
def self_test():
 assert clean("Ken Boswell")=="Ken Boswell"
 assert clean("Ken Boswell RC")=="Ken Boswell"
 assert clean("Marshall")=="Marshall"
 assert clean("John Hall")=="John Hall"
 assert clean("John Hall UER")=="John Hall"
 print("1993 Stadium Club offline tests passed")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");a=p.parse_args()
 self_test()
 if not a.self_test:main()
