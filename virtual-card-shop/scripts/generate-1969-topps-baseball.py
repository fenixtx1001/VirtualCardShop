#!/usr/bin/env python3
"""1969 Topps Baseball — cautious fail-closed TCDB checklist generator."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from html.parser import HTMLParser
from collections import defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1969-topps-baseball.bundle.json"
OUT=ROOT/"data/set-factory/1969-topps-baseball.cards.csv"
HEAD={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory source validator)","Accept":"text/html,application/xhtml+xml"}
NUMBER=re.compile(r"^(?:\d{1,3}[ab]?|NNO)$",re.I)
ANNOT=re.compile(r"(?:,\s*|\s+)(?:RC|RS|ASR|LL|UER|ERR|COR|VAR|SP|SN\d+|PR\d+)(?=\s|,|:|$)",re.I)
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
def clean(v):
 v=" ".join(v.split()).strip()
 v=re.sub(r"(?<=\s)(?:RCUER|RSRCUER)(?=:|,|\s|$)","RC UER",v,flags=re.I)
 v=re.sub(r"(?<=\s)(VARVAR|ERRERR|CORCOR)(?=:)",lambda m: m.group(1)[:3],v,flags=re.I)
 match=ANNOT.search(v)
 return v[:match.start()].strip(" ,;") if match else v
def normalize(key,number,player,team):
 # Variant copy is not part of the player identity.
 if key in ("base","rookies") and number in ("47","57","77","107","151","208","440","441","444","447","451","452","461","470","471","473","482","485","486","493","500","501","505","511","582"):
  player=re.split(r"\s+(?:VAR|ERR|COR)(?=:)",player,maxsplit=1)[0]
  # For variant cards with different team labels, record the
  # player without discarding the source-team distinction in a hidden way.
  if number=="151":team="Philadelphia Phillies"
  if number=="208":team="Houston Astros"
 if number=="491" and team=="MInnesota Twins":team="Minnesota Twins"
 return player,team
def fetch(url):
 for attempt in range(4):
  try:
   time.sleep(1.5)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEAD),timeout=40) as r:return r.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):raise SystemExit(f"TCDB HTTP {e.code}; NO CSV WRITTEN: {url}")
   print(f"TCDB temporary HTTP {e.code}, retry {attempt+1}/4",flush=True)
   if attempt<3:time.sleep(10*2**attempt)
  except Exception as e:raise SystemExit(f"TCDB request failed {e}; NO CSV WRITTEN")
 raise SystemExit("TCDB retries exhausted; NO CSV WRITTEN")
def collect(key,sid,expected,rookies=False):
 raw=[];previous=set()
 for page in range(1,17):
  mode="Rookies" if rookies else "Checklist"
  parsed=Rows();parsed.feed(fetch(f"https://www.tcdb.com/{mode}.cfm/sid/{sid}/1969-Topps?PageIndex={page}"))
  new=[]
  for row in parsed.rows:
   cells=[c.strip() for c in row if c.strip()]
   for i,num in enumerate(cells):
    if not NUMBER.fullmatch(num) or i+1>=len(cells):continue
    if (key=="base" or rookies) and (not num[:len(num.rstrip("abAB"))].isdigit() or not 1<=int(re.match(r"\d+",num).group())<=664):continue
    number=num.lower() if key=="deckle" else ("NNO" if num.upper()=="NNO" else str(int(re.match(r"\d+",num).group())))
    player=clean(cells[i+1]);team=cells[-1] if i+2<len(cells) else ""
    if not player:continue
    if team==cells[i+1]:team=""
    player,team=normalize(key,number,player,team)
    new.append((number,player,team));break
  raw.extend(new)
  identities=set(n for n,_,_ in raw)
  print(f"{key} page {page}: {len(new)} rows; {len(identities)} numbered positions / {expected}",flush=True)
  if (len(identities)>=expected and not rookies) or (key=="magic-rub-offs" and len(raw)>=expected):break
  if rookies and len(raw)>=98:break
  if page>1 and not new:break
 if rookies and len(raw)!=98:raise SystemExit(f"Rookie source rows {len(raw)} != 98; NO CSV WRITTEN")
 if not rookies and key!="magic-rub-offs" and len(set(n for n,_,_ in raw))!=expected:raise SystemExit(f"{key}: wrong unique count; NO CSV WRITTEN")
 if key=="magic-rub-offs" and len(raw)!=expected:raise SystemExit(f"Decals: expected 48 rows, got {len(raw)}; NO CSV WRITTEN")
 return raw
def collapse(raw,key):
 out={};problems=[];count=0
 for number,player,team in raw:
  if number=="NNO":
   count+=1;number=f"NNO-{count:02d}"
  if number in out and out[number]!=(player,team):
   problems.append(f"{key} #{number}: {out[number]!r} conflicts with {(player,team)!r}")
  elif number not in out:out[number]=(player,team)
 return out,problems
def run():
 bundle=json.loads(BUNDLE.read_text(encoding="utf-8"))
 data={};problems=[]
 for s in bundle["productSets"]:
  raw=collect(s["key"],s["sourceSetId"],s["expectedCards"])
  parsed,errors=collapse(raw,s["key"])
  data[s["key"]]=parsed;problems+=errors
 rookies,errors=collapse(collect("rookies",69,98,True),"rookies");problems+=errors
 base=data["base"]
 if set(base)!={str(i) for i in range(1,665)}:problems.append("Base numbering must be exactly 1-664")
 if set(data["magic-rub-offs"])!={f"NNO-{i:02d}" for i in range(1,49)}:problems.append("Unnumbered decals must have 48 stable IDs")
 deckle_expected={str(i) for i in range(1,34) if i not in (11,22)}|{"11a","11b","22a","22b"}
 if set(data["deckle"])!=deckle_expected:problems.append(f"Deckle physical numbering differs: {sorted(set(data['deckle'])^deckle_expected)}")
 for number,identity in rookies.items():
  if identity!=base.get(number):problems.append(f"Rookie #{number}: {identity!r} differs from Base {base.get(number)!r}")
 if problems:
  print("=== SOURCE DISCREPANCIES ===")
  for item in problems[:120]:print("  "+item)
  raise SystemExit(f"{len(problems)} source discrepancies; NO CSV WRITTEN")
 rows=[]
 for spec in bundle["productSets"]:
  key=spec["key"]
  for number,(player,team) in data[key].items():
   if key=="base" and number in rookies:player+=" RC"
   rows.append((key,number,player,team,"",spec["name"] if key!="base" else ""))
 if len(rows)!=747 or len(set((r[0],r[1]) for r in rows))!=747:raise SystemExit("Count/identity mismatch; NO CSV WRITTEN")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",newline="",encoding="utf-8") as file:
  writer=csv.writer(file,lineterminator="\n");writer.writerow(("setKey","cardNumber","player","team","subset","variant"));writer.writerows(rows)
 print(f"GENERATED 747 cards across 3 ProductSets; {len(rookies)} unique Base RCs; UNRELEASED")
 print(f"CSV: {OUT}")
def test():
 assert clean("Reggie Jackson RC")=="Reggie Jackson"
 assert clean("Rookie Stars (A / B) RS, RC")=="Rookie Stars (A / B)"
 assert NUMBER.fullmatch("11a") and NUMBER.fullmatch("NNO")
 assert normalize("base","500","Mickey Mantle VAR: Last name in yellow","New York Yankees")==("Mickey Mantle","New York Yankees")
 assert normalize("base","151","Clay Dalrymple VAR: Portrait, Orioles on front (2nd version)","Baltimore Orioles")==("Clay Dalrymple","Philadelphia Phillies")
 assert len({str(n) for n in range(1,34) if n not in (11,22)}|{"11a","11b","22a","22b"})==35
 print("1969 Topps offline self-tests passed")
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");args=p.parse_args()
 test()
 if not args.self_test:run()
