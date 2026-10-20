#!/usr/bin/env python3
"""1998 Collector's Edge Masters Football. Source-verified, fail-closed Set Factory."""
from __future__ import annotations
import argparse,csv,json,re,time,urllib.request,urllib.error
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote
ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/1998-collectors-edge-masters-football.bundle.json"
OUT=ROOT/"data/set-factory/1998-collectors-edge-masters-football.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory source validation)","Accept":"text/html,application/xhtml+xml"}
FAMILIES=[
 ("base","Base","BASE",4203,199,None),
 ("50-point","50-Point","PARALLEL",34609,199,None),
 ("50-point-gold","50-Point Gold","PARALLEL",34610,199,None),
 ("hologold","HoloGold","PARALLEL",34613,199,None),
 ("1996-game-ball-jerry-rice-autographed","1996 Collector's Edge Advantage Game Ball Jerry Rice Autographed","INSERT",None,None,None),
 ("gold-set-redemption","Gold Set Redemption","INSERT",None,None,6000),
 ("legends","Legends","INSERT",34614,30,None),
 ("main-event","Main Event","INSERT",34615,20,None),
 ("prodigies-autographs","Prodigies Autographs","INSERT",None,None,None),
 ("rookie-masters","Rookie Masters","INSERT",34617,30,None),
 ("sentinels","Sentinels","INSERT",34618,10,None),
 ("super-masters","Super Masters","INSERT",None,None,None),
 ("super-masters-autographs","Super Masters Autographs","INSERT",131616,9,None),
]
NUM=re.compile(r"^(?:\d{1,3}|[A-Z]{1,4}\d{1,3}[a-z]?|NNO)$",re.I)
TAIL=re.compile(r"(?:,\s*|\s+)(?:SN\d+|RC|UER(?:UER)?|ERR|COR|VAR|AU|MEM|PR\d+|PROMO)(?=\s|,|:|$)",re.I)
class Parser(HTMLParser):
 def __init__(self):
  super().__init__();self.rows=[];self.row=None;self.cell=None;self.has_link=False
  self.links=[];self.active_link=None;self.all_text=[]
 def handle_starttag(self,t,a):
  if t=="tr":self.row=[];self.has_link=False
  if t=="td" and self.row is not None:self.cell=[]
  if t=="a":
   href=next((v for k,v in a if k=="href"),"")
   self.active_link=[href,[]]
   if self.row is not None and "ViewCard.cfm" in href:self.has_link=True
 def handle_data(self,d):
  self.all_text.append(d)
  if self.cell is not None:self.cell.append(d)
  if self.active_link is not None:self.active_link[1].append(d)
 def handle_endtag(self,t):
  if t=="a" and self.active_link is not None:
   href,parts=self.active_link
   self.links.append((href," ".join("".join(parts).split())))
   self.active_link=None
  if t=="td" and self.cell is not None:
   self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  if t=="tr" and self.row is not None:
   if self.row and self.has_link:self.rows.append(self.row)
   self.row=None
def source(url):
 # TCDB periodically rate-limits checklist fetches. Throttle requests,
 # retry only transient HTTP errors, and fail closed after bounded attempts.
 for attempt in range(5):
  if attempt:time.sleep(min(12*(2**(attempt-1)),60))
  try:
   time.sleep(2)
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=40) as r:return r.read().decode("utf-8","replace")
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504):
    raise SystemExit(f"TCDB unavailable {url}: HTTP {e.code}; NO FILES WRITTEN")
   print(f"TCDB transient HTTP {e.code}; retry {attempt+1}/5 for {url}",flush=True)
  except Exception as e:raise SystemExit(f"TCDB unavailable {url}: {e}; NO FILES WRITTEN")
 raise SystemExit(f"TCDB rate limit persisted at {url}; NO FILES WRITTEN")
def clean(s):
 s=" ".join(s.split()).strip()
 # TCDB occasionally concatenates checklist explanatory text immediately
 # after the separate SN token: "CL, SN150Checklist: 1-100; ...".
 # Only remove the serial token here; keep the meaningful checklist title.
 s=re.sub(r"(?:,\s*|\s+)SN\d+(?=Checklist:)", "", s, flags=re.I)
 match=TAIL.search(s)
 return s[:match.start()].strip(" ,;") if match else s
def page(url):
 p=Parser();p.feed(source(url));return p
def discover_sid(name,links):
 candidates=[]
 for href,text in links:
  if text.strip().casefold()!=name.casefold():continue
  m=re.search(r"/sid/(\d+)",href)
  if m:candidates.append(int(m.group(1)))
 if len(set(candidates))!=1:raise ValueError(f"Could not uniquely resolve TCDB source sid for {name}: {candidates}")
 return candidates[0]
def set_count(sid):
 p=page(f"https://www.tcdb.com/ViewSet.cfm/sid/{sid}/1998-Collectors-Edge-Masters")
 txt=" ".join(" ".join(p.all_text).split())
 m=re.search(r"Total Cards:\s*(\d+)",txt,re.I)
 if not m:raise ValueError(f"Missing official Total Cards for sid {sid}")
 return int(m.group(1))
def collect(name,sid,count,rookies=False):
 found={};issues=[];nno=0;duplicate_numbers={}
 for idx in range(1,12):
  route="Rookies" if rookies else "Checklist"
  p=page(f"https://www.tcdb.com/{route}.cfm/sid/{sid}/1998-Collectors-Edge-Masters?PageIndex={idx}")
  parsed=added=0
  for row in p.rows:
   cells=[v.strip() for v in row if v.strip()]
   for i,number in enumerate(cells):
    if not NUM.fullmatch(number) or i+1>=len(cells):continue
    player=clean(cells[i+1])
    team=cells[-1] if i+2<len(cells) else ""
    if team==cells[i+1]:team=""
    if not player:continue
    parsed+=1
    if number=="NNO":
     nno+=1;number=f"NNO-{nno:02d}"
    elif number in found and found[number]!=(player,team):
     # Preserve real double-numbered Super Masters cards separately.
     if name=="Super Masters" and number=="SM20":
      number="SM20-2"
     else:issues.append(f"{name} #{number}: {found[number]!r} vs {(player,team)!r}")
    if number not in found:found[number]=(player,team);added+=1
    break
  print(f"{name} page {idx}: {parsed} rows; +{added}; {len(found)}/{count}",flush=True)
  if len(found)>=count:break
  if idx>1 and parsed==0:break
 if len(found)!=count:issues.append(f"{name}: expected {count}, found {len(found)}")
 return found,issues
def execute():
 config=json.loads(BUNDLE.read_text(encoding="utf-8"))
 links=page(config["source"]["insertsUrl"]).links
 sets=[];data={};issues=[]
 for key,name,kind,known_sid,known_count,odds in FAMILIES:
  sid=known_sid if known_sid else discover_sid(name,links)
  official_count=set_count(sid)
  if known_count and official_count!=known_count:issues.append(f"{name}: TCDB count changed {official_count} vs {known_count}")
  count=known_count or official_count
  if count<=0:issues.append(f"{name}: invalid count {count}");continue
  cardset,bad=collect(name,sid,count)
  data[key]=cardset;issues.extend(bad)
  sets.append(dict(key=key,id="1998_Collectors_Edge_Masters_Football_"+key.replace("-","_"),name=name,kind=kind,oddsPerPack=odds,expectedCards=count,sourceSetId=sid,sourceUrl=f"https://www.tcdb.com/Checklist.cfm/sid/{sid}/1998-Collectors-Edge-Masters",defaultGradeability="COMMON"))
 rookies,bad=collect("rookies",4203,34,True);issues.extend(bad)
 base=data.get("base",{})
 expected_base={str(i) for i in range(1,171) if i!=28}|{f"S{i}" for i in range(171,199)}|{"CK1","CK2"}
 if set(base)!=expected_base:issues.append(f"Base numbering mismatch: missing={sorted(expected_base-set(base))}; extra={sorted(set(base)-expected_base)}")
 for no,v in rookies.items():
  if base.get(no)!=v:issues.append(f"Rookie #{no}: {v} != Base {base.get(no)}")
 for key in ("50-point","50-point-gold","hologold"):
  if set(data[key])!=set(base):issues.append(f"{key}: different numbering than Base")
  for no,(player,team) in data[key].items():
   if base.get(no)!=(player,team):issues.append(f"{key} #{no}: {(player,team)} vs {base.get(no)}")
 if issues:
  print("=== SOURCE DISCREPANCIES ===")
  for msg in issues:print("  "+msg)
  raise SystemExit(f"{len(issues)} discrepancies; NO FILES WRITTEN")
 rows=[]
 for spec in sets:
  key=spec["key"]
  for no,(player,team) in data[key].items():
   if key=="base" and no in rookies:player+=" RC"
   rows.append((key,no,player,team,"",spec["name"] if key!="base" else ""))
 if len(rows)!=sum(s["expectedCards"] for s in sets) or len(set((r[0],r[1]) for r in rows))!=len(rows):
  raise SystemExit("Duplicate or incomplete identities; NO FILES WRITTEN")
 # Update bundle only after source validation. No partial CSV or partial bundle.
 config["productSets"]=sets
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",encoding="utf-8",newline="") as fh:
  writer=csv.writer(fh,lineterminator="\n");writer.writerow(("setKey","cardNumber","player","team","subset","variant"));writer.writerows(rows)
 BUNDLE.write_text(json.dumps(config,indent=2)+"\n",encoding="utf-8")
 print(f"GENERATED {len(rows)} cards in {len(sets)} ProductSets; 34 true Base rookies; UNRELEASED")
 print(f"CSV: {OUT}")
def tests():
 assert clean("Ken Boswell")=="Ken Boswell"
 assert clean("Ken Boswell SN5000")=="Ken Boswell"
 assert clean("Marshall")=="Marshall"
 assert clean("Michael Pittman RC, SN5000")=="Michael Pittman"
 assert clean("Jerry Rice AU, SN50")=="Jerry Rice"
 assert clean("Peyton Manning CL, SN150Checklist: 1-100; Listed as #199 on checklist card")=="Peyton Manning CLChecklist: 1-100; Listed as #199 on checklist card"
 assert clean("Ryan Leaf CL, SN10Checklist: 101-200; Listed as #200 on checklist card")=="Ryan Leaf CLChecklist: 101-200; Listed as #200 on checklist card"
 assert NUM.fullmatch("S171") and NUM.fullmatch("CK1") and NUM.fullmatch("SM20")
 assert NUM.fullmatch("SM20a") and NUM.fullmatch("SM20b")
 print("1998 Masters offline tests passed")
if __name__=="__main__":
 ap=argparse.ArgumentParser();ap.add_argument("--self-test",action="store_true");a=ap.parse_args()
 tests()
 if not a.self_test:execute()
