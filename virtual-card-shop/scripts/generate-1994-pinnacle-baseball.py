#!/usr/bin/env python3
"""Fail-closed 1994 Pinnacle Baseball Set Factory.

Generate against independent published checklists (BaseballCardPedia and
CollectionCount), cross-validated TCDB rookie index; verify committed
compressed CSV without network via --check. No invented set/pack odds.
"""
from __future__ import annotations
import argparse,csv,gzip,html,io,json,re,urllib.request
from collections import Counter,defaultdict
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data/set-factory"
BUNDLE=DATA/"1994-pinnacle-baseball.bundle.json"
CARDS=DATA/"1994-pinnacle-baseball.cards.csv.gz"
SOURCE_BCP="https://baseballcardpedia.com/index.php/1994_Pinnacle"
SOURCE_CC="https://www.collectioncount.com/checklists/1994-score-pinnacle-baseball/"
FIELDS=("setKey","cardNumber","player","team","subset","variant")
COUNTS={
  "base":540,"museum-collection":540,"artists-proof":540,
  "rookie-team-pinnacle":9,"team-pinnacle":9,"super-rookie":1,
  "tribute":18,"run-creators":44,"museum-redemptions":5
}
EXPLICIT={k:v for k,v in COUNTS.items() if k not in ("museum-collection","artists-proof")}
TRUE_RC={
 226,227,230,233,237,241,262,264,265,266,267,268,270,
 377,401,407,411,416,420,430,431,432,433,434,435,437,438,
 441,527,530,533,538
}
assert len(TRUE_RC)==32
CC_FALSE_RC={436} # CC lists Kirk Presley RC; TCDB rookie index does not
BCP_RAW_DISCREPANCIES={
 9,11,28,44,50,62,81,89,100,239,253,280,378,385,424,446
}
EXPECTED_GROUP_COUNTS=[12,223,38,9,159,9,102,5,9,9,1,18,44]
INSERT_SECTIONS={
 "museum-redemptions":7,"rookie-team-pinnacle":8,"team-pinnacle":9,
 "super-rookie":10,"tribute":11,"run-creators":12
}
MANUAL_NAMING={
 "Cal Ripken Jr.":"Cal Ripken, Jr.","Ken Griffey Jr.":"Ken Griffey, Jr.",
 "Sandy Alomar Jr.":"Sandy Alomar, Jr.","Doc Gooden":"Dwight Gooden",
 "Wil Cordero":"Wilfredo Cordero","Javier Lopez":"Javy Lopez",
 "Carl Wills":"Carl Willis",
}
def get(url):
 req=urllib.request.Request(url,headers={
  "User-Agent":"Mozilla/5.0 (compatible; VirtualCardShop historic checklist audit)",
  "Accept":"text/html,application/xhtml+xml"})
 with urllib.request.urlopen(req,timeout=45) as r:
  if r.status!=200:raise ValueError(f"Source HTTP {r.status}: {url}")
  return r.read().decode("utf-8","replace")
def get_js(src,key):
 m=re.search(r"\bvar\s+"+re.escape(key)+r"\s*=\s*(\[[\s\S]*?\]);",src)
 if not m:raise ValueError(f"Source array missing: {key}")
 return json.loads(m.group(1))
def groups(src):
 blocks=re.findall(r'<ul\s+style="list-style-type:none;"\s*>(.*?)</ul>',src,re.S|re.I)
 ls=[[html.unescape(re.sub(r"<[^>]*>","",line)).strip()
      for line in re.findall(r"<li[^>]*>(.*?)</li>",block,re.S|re.I)]
     for block in blocks]
 if [len(g) for g in ls]!=EXPECTED_GROUP_COUNTS:
  raise ValueError(f"Source group sizes changed: {[len(g) for g in ls]}")
 return ls
def normalize(name):
 name=re.sub(r"\s*\(UER:.*$","",name).strip()
 name=name.replace("’","'").replace("‘","'")
 name=re.sub(r'\s+"NL Batting Champion"$',"",name)
 name=re.sub(r"\s+(?:AL ROY|NL CY|NL ROY)$","",name)
 name=re.sub(r"\s+(?:PROS|DP|DPK|RC|UER|ERR|COR|VAR)\b.*$","",name).strip()
 return MANUAL_NAMING.get(name,name)
def match_key(name):return re.sub(r"[^a-z0-9]","",name.lower())
def add(rows,key,num,player,team,subset="",variant=""):
 if not player.strip() or not team.strip():raise ValueError(f"Blank subject/team {key} {num}: {player}/{team}")
 rows.append(dict(zip(FIELDS,[key,str(num),player,team,subset,variant])))
def produce():
 cc_page=get(SOURCE_CC);bcp_page=get(SOURCE_BCP)
 cc=get_js(cc_page,"BASE");teams=get_js(cc_page,"TEAMS");gs=groups(bcp_page)
 if len(cc)!=540 or len(teams)!=28 or len(set(teams))!=28:
  raise ValueError("Source base or team counts changed")
 base_src={}
 for block in gs[1:7]:
  for line in block:
   m=re.fullmatch(r"(\d{1,3})\s+(.+)",line)
   if not m:raise ValueError(f"Unrecognized BCP base row {line!r}")
   n=int(m.group(1))
   if n in base_src:raise ValueError(f"Repeated base number #{n}")
   base_src[n]=m.group(2)
 if set(base_src)!=set(range(1,541)):raise ValueError("BCP base missing/extra numbers")
 rows=[];team_by_name=defaultdict(set);raw_differences=set();flags=set()
 for number,row in enumerate(cc,1):
  if len(row) not in (3,4) or int(row[0])!=number:raise ValueError(f"Malformed CC #{number}")
  _,name,idx,*extras=row
  if not isinstance(idx,int) or not 0<=idx<len(teams):
   raise ValueError(f"Bad team index #{number}")
  raw_bcp=base_src[number]
  raw_name=re.sub(r"\s*\(UER:.*$","",name).strip()
  if raw_name!=raw_bcp:raw_differences.add(number)
  cname=normalize(name);bname=normalize(raw_bcp)
  if cname!=bname:
   raise ValueError(f"Unreviewed identity mismatch #{number}: {cname!r} != {bname!r}")
  is_rc=bool(extras and extras[0]==1)
  if is_rc:flags.add(number)
  if is_rc!=(number in (TRUE_RC|CC_FALSE_RC)):
   raise ValueError(f"CC rookie metadata changed #{number} {is_rc}")
  subset=("Rookie Prospects" if 224<=number<=261 or "PROS" in raw_bcp else
          "Draft Picks" if 262<=number<=270 or 430<=number<=438 or re.search(r"\bDP\b",raw_bcp) else
          "")
  variant=[]
  award=re.search(r"\b(AL ROY|NL CY|NL ROY)\b",raw_bcp)
  if award:variant.append("Printed award: "+award.group(1))
  for s in (name,raw_bcp):
   annot=re.search(r"\bUER:.+",s)
   if annot:variant.append(annot.group(0).strip(" )"))
  if number==378:variant.append("Source correction: Carl Willis (BCP typo Carl Wills)")
  if number==436:variant.append("CC marks RC; TCDB does not recognize as a true rookie card")
  if number==446:variant.append('Printed subset title: "NL Batting Champion"')
  display=cname+(" RC" if number in TRUE_RC else "")
  add(rows,"base",number,display,teams[idx],subset,"; ".join(dict.fromkeys(variant)))
  team_by_name[match_key(cname)].add(teams[idx])
 if raw_differences!=BCP_RAW_DISCREPANCIES:
  raise ValueError("New CC/BCP display differences: "+repr(sorted(raw_differences^BCP_RAW_DISCREPANCIES)))
 if flags!=(TRUE_RC|CC_FALSE_RC):raise ValueError(f"CC/TCDB RC flags changed {flags^(TRUE_RC|CC_FALSE_RC)}")
 # All five voucher numbers correspond to existing base cards; these are
 # separate cardboard redemption vouchers, not extra physical Museum prints.
 for key,ix in INSERT_SECTIONS.items():
  for i,line in enumerate(gs[ix],1):
   m=re.fullmatch(r"([A-Z]{0,2}\d{1,3})\s+(.+)",line)
   if not m:raise ValueError(f"Bad insert number {key}: {line!r}")
   n,raw_player=m.groups()
   if key=="museum-redemptions":
    if not n.isdigit() or int(n) not in {279,313,328,382,387}:
     raise ValueError(f"Museum redemption source drift {n}")
    base_card=rows[int(n)-1]
    if normalize(raw_player)!=base_card["player"].removesuffix(" RC"):
     raise ValueError(f"Museum redemption identity mismatch {n}")
    player,team=base_card["player"],base_card["team"]
    variant="Physical redemption voucher for Museum Collection #"+n+"; expired December 31, 1994; not actual foil card"
   elif key in ("rookie-team-pinnacle","team-pinnacle"):
    if n!=str(i) or " / " not in raw_player:raise ValueError(f"Bad dual-sided insert {line}")
    player,team=raw_player,"Multiple Teams"
    variant="Painted American League / National League front-and-back pairing"
   elif key=="super-rookie":
    if n!="SR1" or raw_player!="Carlos Delgado":
     raise ValueError("Super Rookie one-card checklist changed")
    player,team="Carlos Delgado","Toronto Blue Jays"
    variant="Series Two hobby/retail foilboard case hit (1:360)"
   else:
    prefix="TR" if key=="tribute" else "RC"
    if n!=prefix+str(i):raise ValueError(f"Unexpected {key} number {n}")
    player=normalize(raw_player)
    resolved=team_by_name.get(match_key(player),set())
    if len(resolved)!=1:raise ValueError(f"Unresolved insert team {key} {n} {player}: {resolved}")
    team=next(iter(resolved))
    variant=("Tribute Series One" if i<=9 else "Tribute Series Two") if key=="tribute" else (
        "Series One SuperPack only" if i<=22 else "Series Two SuperPack only")
   add(rows,key,n,player,team,key.replace("-"," ").title(),variant)
 return rows

def check():
 b=json.loads(BUNDLE.read_text(encoding="utf8"))
 if b["schemaVersion"]!=2 or b["status"]!="DRAFT" or b["product"]["released"] is not False:
  raise ValueError("Manifest must be unreleased v2 draft")
 if b["product"]["id"]!="1994_Pinnacle_Baseball" or b["cardsFile"]!=CARDS.name:
  raise ValueError("Wrong product identifier/cardsFile")
 if {x["key"]:x["expectedCards"] for x in b["productSets"]}!=COUNTS:
  raise ValueError("ProductSet count mismatch")
 if len(b["productSets"])!=9 or sum(COUNTS.values())!=1706:
  raise ValueError("Expected nine groups, 1706 total cards")
 derived={x["key"]:x["deriveCardsFrom"] for x in b["productSets"] if x.get("deriveCardsFrom")}
 if derived!={"museum-collection":"base","artists-proof":"base"}:
  raise ValueError("Parallel derivation mismatch")
 if any(x["oddsPerPack"] is not None for x in b["productSets"]):
  raise ValueError("Pack odds must not be mixed across series/channels")
 with gzip.open(CARDS,"rt",encoding="utf8",newline="") as f:
  cards=list(csv.DictReader(f))
 if list(cards[0])!=list(FIELDS):raise ValueError("Wrong CSV columns")
 if Counter(x["setKey"] for x in cards)!=Counter(EXPLICIT):
  raise ValueError("Explicit checklist set mismatch")
 if len(cards)!=626 or len(set((r["setKey"],r["cardNumber"]) for r in cards))!=len(cards):
  raise ValueError("Wrong explicit card count or duplicates")
 if any(not x["team"].strip() or not x["player"].strip() for x in cards):
  raise ValueError("Missing subject/team")
 base={int(x["cardNumber"]):x for x in cards if x["setKey"]=="base"}
 if set(base)!=set(range(1,541)):raise ValueError("Base must number 1-540")
 rookies={n for n,x in base.items() if x["player"].endswith(" RC")}
 if rookies!=TRUE_RC:raise ValueError(f"TCDB true rookie tag discrepancy: {rookies^TRUE_RC}")
 checks=[(1,"Frank Thomas","Chicago White Sox"),(3,"Sammy Sosa","Chicago Cubs"),
  (100,"Ken Griffey, Jr.","Seattle Mariners"),(267,"Torii Hunter RC","Minnesota Twins"),
  (270,"Trot Nixon RC","Boston Red Sox"),(378,"Carl Willis","Minnesota Twins"),
  (430,"John Wasdin RC","Oakland Athletics"),(438,"Derrek Lee RC","San Diego Padres"),
  (527,"Chan Ho Park RC","Los Angeles Dodgers")]
 for n,player,team in checks:
  row=base[n]
  if row["player"]!=player or row["team"]!=team:
   raise ValueError(f"Key card #{n}: {row['player']}/{row['team']} expected {player}/{team}")
 assert base[436]["player"]=="Kirk Presley"
 vouchers={int(x["cardNumber"]) for x in cards if x["setKey"]=="museum-redemptions"}
 if vouchers!={279,313,328,382,387}:raise ValueError("Museum voucher checklist mismatch")
 print("PASS: 1994 Pinnacle 540 base + 1080 derived parallels + 86 inserts/vouchers = 1706 cards")
 print("PASS: 32 verified TCDB true RCs; #436 excluded; 28-team original issue")
 print("PASS: 9 ProductSets; source numbering, voucher list, subset/insert identities")
 print("PASS: historical series/channel odds gated; product unreleased")
def main():
 p=argparse.ArgumentParser()
 p.add_argument("--check",action="store_true",help="Offline check only, no network")
 args=p.parse_args()
 if not args.check:
  cards=produce()
  DATA.mkdir(parents=True,exist_ok=True)
  out=io.StringIO(newline="")
  writer=csv.DictWriter(out,fieldnames=FIELDS,lineterminator="\n")
  writer.writeheader();writer.writerows(cards)
  CARDS.write_bytes(gzip.compress(out.getvalue().encode("utf8"),compresslevel=9,mtime=0))
 check()
if __name__=="__main__":main()
