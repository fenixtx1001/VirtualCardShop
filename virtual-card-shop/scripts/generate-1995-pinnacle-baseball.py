#!/usr/bin/env python3
"""VCS Set Factory: 1995 Pinnacle Baseball.

Cross-checks 450 base card identities against BaseballCardPedia and the
independent CollectionCount catalog. Generates explicit insert/redemption
checklists with original printed numbering and clear virtual identifiers for
unnumbered items. 450-card base parallels are derived by the v2 importer.

Run: python3 scripts/generate-1995-pinnacle-baseball.py
Offline check: python3 scripts/generate-1995-pinnacle-baseball.py --check
"""
from __future__ import annotations
import argparse,csv,gzip,html,io,json,re,urllib.request
from collections import Counter,defaultdict
from pathlib import Path

DIR=Path(__file__).resolve().parents[1]/"data"/"set-factory"
BUNDLE=DIR/"1995-pinnacle-baseball.bundle.json"
CARDS=DIR/"1995-pinnacle-baseball.cards.csv.gz"
BCP="https://baseballcardpedia.com/index.php/1995_Pinnacle"
CC="https://www.collectioncount.com/checklists/1995-pinnacle-baseball/"
FIELDS=("setKey","cardNumber","player","team","subset","variant")
COUNTS={
 "base":450,"museum-collection":450,"artists-proof":450,
 "museum-redemptions":7,"eta-95":6,"gate-attractions":18,
 "new-blood":9,"pinnacle-performers":18,
 "red-hot":25,"white-hot":25,
 "team-pinnacle-front":9,"team-pinnacle-back":9,
 "pin-redemptions":18,"pin-exchanges":18,"upstarts":30
}
EXPLICIT={k:v for k,v in COUNTS.items() if k not in ("museum-collection","artists-proof")}
RC={167,169,171,174,176}
RAW_DIFF={39,55,128,204,304,305,376,447,450}
GROUP_LENGTHS=[9,130,36,10,4,45,50,30,140,5,7,6,18,9,18,25,9,18,30]
INSERT_GROUPS={
 "museum-redemptions":10,
 "eta-95":11,
 "gate-attractions":12,
 "new-blood":13,
 "pinnacle-performers":14,
 "red-hot":15,
 "team-pinnacle-front":16,
 "pin-redemptions":17,
 "upstarts":18,
}
VOUCHERS={410,413,416,420,423,426,444}
PROSPECT_TEAMS={
 "Ben Grieve":"Oakland Athletics",
 "Alex Ochoa":"Baltimore Orioles", # Series One (before July 1995 trade to Mets)
 "Johnny Damon":"Kansas City Royals",
 "Trey Beamon":"Pittsburgh Pirates",
 "Brooks Kieschnick":"Chicago Cubs",
}
ALIASES={
 "Sandy Alomar Jr.":"Sandy Alomar, Jr.",
 "Ken Griffey Jr.":"Ken Griffey, Jr.",
 "Cal Ripken Jr.":"Cal Ripken, Jr.",
 "Dave Weathers":"David Weathers",
 "Mel Nieves":"Melvin Nieves",
 "Dave Justice":"David Justice",
}
assert len(RC)==5 and len(VOUCHERS)==7

def fetch(url):
 req=urllib.request.Request(url,headers={
   "User-Agent":"Mozilla/5.0 (VCS historical checklist verification)",
   "Accept":"text/html"})
 with urllib.request.urlopen(req,timeout=40) as r:
  if r.status!=200:raise ValueError(f"Source HTTP {r.status}: {url}")
  return r.read().decode("utf-8","replace")

def arr(src,key):
 m=re.search(r"\bvar\s+"+re.escape(key)+r"\s*=\s*(\[[\s\S]*?\]);",src)
 if not m:raise ValueError("Independent source changed: "+key)
 return json.loads(m.group(1))

def lists(page):
 raw=re.findall(r'<ul\s+style="list-style-type:none;"\s*>(.*?)</ul>',page,re.S|re.I)
 groups=[[html.unescape(re.sub(r"<[^>]+>","",x)).strip()
          for x in re.findall(r"<li[^>]*>(.*?)</li>",block,re.S|re.I)]
          for block in raw]
 if [len(g) for g in groups]!=GROUP_LENGTHS:
  raise ValueError(f"BCP source group layout/counts changed: {[len(g) for g in groups]}")
 return groups

def display(name):
 name=re.sub(r"\s+(?:DP|RC)(?=\s|[*:]|$).*$","",name).strip()
 return ALIASES.get(name,name)

def norm_key(s):return re.sub(r"[^a-z0-9]","",s.lower())

def add(rows,key,num,name,team,subset="",variant=""):
 if not name or not name.strip():raise ValueError(f"Missing subject {key} {num}")
 if team is None and subset!="Checklist":raise ValueError(f"Missing team {key} {num}: {name}")
 rows.append(dict(zip(FIELDS,[key,str(num),name,team or "",subset,variant])))

def parsed_line(s):
 m=re.fullmatch(r"([A-Za-z]{0,3}\d{1,3})\s+(.+)",s)
 if not m:raise ValueError("Unrecognized checklist item "+repr(s))
 return m.group(1),m.group(2)

def build():
 cc_html=fetch(CC);bcp_html=fetch(BCP)
 teams=arr(cc_html,"TEAMS");cards=arr(cc_html,"BASE");gr=lists(bcp_html)
 if len(teams)!=28 or len(set(teams))!=28 or len(cards)!=450:
  raise ValueError("Independent 450-card or 28-team source changed")
 bcp_base={}
 for g in gr[1:10]:
  for line in g:
   number,name=parsed_line(line)
   n=int(number)
   if n in bcp_base:raise ValueError(f"Duplicate BCP #{n}")
   bcp_base[n]=name
 if set(bcp_base)!=set(range(1,451)):raise ValueError("Base #1–450 incomplete in BCP")
 result=[];differences=set();rc_seen=set();known=defaultdict(set)
 for n,row in enumerate(cards,1):
  if len(row) not in (3,4) or int(row[0])!=n:
   raise ValueError(f"Malformed base source entry #{n}: {row}")
  _,cc_name,team_index,*extras=row
  if cc_name!=display(bcp_base[n]):differences.add(n)
  canonical=display(cc_name)
  if canonical!=display(bcp_base[n]):
   raise ValueError(f"Unreviewed identity mismatch #{n}: {canonical} / {display(bcp_base[n])}")
  flagged=bool(extras and extras[0]==1)
  if flagged:rc_seen.add(n)
  if flagged!=(n in RC):raise ValueError(f"Wrong RC flag on #{n}")
  if not isinstance(team_index,int) or not -1<=team_index<len(teams):
   raise ValueError(f"Invalid team index #{n}")
  if team_index==-1:
   if n not in {177,178,179,180,446,447,448,449,450}:
    raise ValueError(f"Nonchecklist card #{n} has no team")
   team=None
  else:team=teams[team_index]
  sub=("Rookies" if 131<=n<=166 or 406<=n<=444 else
       "Draft Picks" if 167<=n<=176 else
       "Swing Men" if 276<=n<=305 else
       "Checklist" if n in {177,178,179,180,446,447,448,449,450} else "")
  subject=canonical+(" RC" if n in RC else "")
  notes="Independent source display spelling normalized" if n in RAW_DIFF else ""
  add(result,"base",n,subject,team,sub,notes)
  if team is not None and " / " not in canonical: known[norm_key(canonical)].add(team)
 if differences!=RAW_DIFF:raise ValueError(f"BCP/CC audit changes: {sorted(differences^RAW_DIFF)}")
 if rc_seen!=RC:raise ValueError("Source true-rookie five-card index changed")
 for key,i in INSERT_GROUPS.items():
  for pos,line in enumerate(gr[i],1):
   if key=="pin-redemptions":
    # The redemption cardboard is unnumbered. Use virtual VCS IDs
    # while preserving the actual printed NNO nature in its metadata.
    name=display(line)
    number=f"PIN-{pos:02d}"
    variant="Physical unnumbered pin redemption card; claim + $1.95 by Nov 15, 1995; virtual VCS inventory number"
   else:
    number,name=parsed_line(line)
    name=display(name)
    variant=""
   if key=="museum-redemptions":
    if not number.isdigit() or int(number) not in VOUCHERS:
     raise ValueError(f"Museum Collection voucher source mismatch: {number}")
    expected_card=result[int(number)-1]
    if name!=expected_card["player"].removesuffix(" RC"):
     raise ValueError("Museum redemption subject mismatch "+number)
    variant="Physical redemption voucher, not the finished Museum Collection Dufex parallel; expired Dec 31, 1995"
    team=expected_card["team"]
   elif key=="team-pinnacle-front":
    if number!="TP"+str(pos) or " / " not in name:
     raise ValueError("Team Pinnacle two-sided checklist mismatch")
    team="Multiple Teams"
    variant="Original dual-sided card: AL/front Dufex; NL/back plain. One of two documented print variations"
   else:
    expected_prefix={"eta-95":"ETA","gate-attractions":"GA",
      "new-blood":"NB","pinnacle-performers":"PP",
      "red-hot":"RH","upstarts":"US"}.get(key)
    if expected_prefix and number!=expected_prefix+(str(pos).zfill(2) if key=="gate-attractions" else str(pos)):
     raise ValueError(f"Insert printed number mismatch {key}: {number}/{pos}")
    mapped=known.get(norm_key(name),set())
    if not mapped and name in PROSPECT_TEAMS:mapped={PROSPECT_TEAMS[name]}
    if len(mapped)!=1:raise ValueError(f"Unable to verify team {key} {number}: {name} mapped={mapped}")
    team=next(iter(mapped))
    if key=="eta-95":variant="Series One hobby-exclusive; not retail or jumbo"
    if key=="gate-attractions":variant="Series Two jumbo-only"
    if key=="new-blood":variant="Series Two hobby/retail"
    if key=="pinnacle-performers":variant="Series One jumbo-only"
    if key=="red-hot":variant="Series Two hobby/retail; fire-themed foil"
    if key=="upstarts":variant="Series One hobby/retail"
   add(result,key,number,name,team,key.replace("-"," ").title(),variant)
 # White Hot parallels mirror Red Hot player/number order, but originals have
 # their own WH-prefix identifiers, which must never be derived with RH IDs.
 red=[r for r in result if r["setKey"]=="red-hot"]
 if len(red)!=25:raise ValueError("Expected 25 Red Hot subjects")
 for pos,r in enumerate(red,1):
  add(result,"white-hot","WH"+str(pos),r["player"],r["team"],"White Hot",
      "Series Two hobby-exclusive Dufex foil parallel to Red Hot; no verified per-pack odds")
 # Team Pinnacle exists as two different, deliberately printed, Dufex-side versions.
 team=[r for r in result if r["setKey"]=="team-pinnacle-front"]
 if len(team)!=9:raise ValueError("Expected 9 Team Pinnacle pairs")
 for item in team:
  add(result,"team-pinnacle-back",item["cardNumber"],item["player"],
      "Multiple Teams","Team Pinnacle",
      "Original dual-sided card: NL/back Dufex; AL/front plain. Other documented print variation")
 # Redeemed PIN cards generated from the same 18 subjects, as physical mail-in
 # exchange items; no claim they came from wax.
 pins=[r for r in result if r["setKey"]=="pin-redemptions"]
 if len(pins)!=18:raise ValueError("Expected 18 pin redemption cards")
 for pos,r in enumerate(pins,1):
  add(result,"pin-exchanges",f"EX-{pos:02d}",r["player"],r["team"],"Pin Exchange",
      "Mail-in-only exchange issue received for redeemed pin card; unnumbered in original, VCS virtual identifier; never inside wax")
 return result

def check():
 bundle=json.loads(BUNDLE.read_text("utf-8"))
 if bundle["schemaVersion"]!=2 or bundle["status"]!="DRAFT" or bundle["product"]["released"] is not False:
  raise ValueError("Unsafe draft/release configuration")
 if bundle["product"]["id"]!="1995_Pinnacle_Baseball" or bundle["cardsFile"]!=CARDS.name:
  raise ValueError("Product ID or attached checklist wrong")
 if len(bundle["productSets"])!=15 or {s["key"]:s["expectedCards"] for s in bundle["productSets"]}!=COUNTS:
  raise ValueError("Set group definition changed")
 derives={s["key"]:s["deriveCardsFrom"] for s in bundle["productSets"] if s.get("deriveCardsFrom")}
 if derives!={"museum-collection":"base","artists-proof":"base"}:
  raise ValueError("Incorrect full 450-card parallel derivation")
 if any(s["oddsPerPack"] is not None for s in bundle["productSets"]):
  raise ValueError("Must gate series/channel-specific pack odds")
 with gzip.open(CARDS,"rt",encoding="utf8",newline="") as f:rows=list(csv.DictReader(f))
 actual=Counter(x["setKey"] for x in rows)
 if actual!=Counter(EXPLICIT) or len(rows)!=642:
  raise ValueError(f"Explicit card count mismatch: {actual}")
 if len(set((r["setKey"],r["cardNumber"]) for r in rows))!=len(rows):
  raise ValueError("Duplicate ProductSet + card ID")
 if any(not r["player"].strip() for r in rows):raise ValueError("Missing player")
 no_team={int(r["cardNumber"]) for r in rows if r["setKey"]=="base" and not r["team"]}
 if no_team!={177,178,179,180,446,447,448,449,450}:
  raise ValueError("Unexpected lack of team assignment")
 if any(not r["team"] and r["setKey"]!="base" for r in rows):
  raise ValueError("Insert team missing")
 b={int(r["cardNumber"]):r for r in rows if r["setKey"]=="base"}
 if set(b)!=set(range(1,451)):raise ValueError("Base numbers not 1–450")
 found={n for n,v in b.items() if v["player"].endswith(" RC")}
 if found!=RC:raise ValueError("True RC tag mismatch")
 for n,name in [(1,"Jeff Bagwell"),(128,"Ken Griffey, Jr."),(132,"Alex Rodriguez"),
                (167,"McKay Christensen RC"),(170,"Paul Konerko"),
                (171,"Scott Elarton RC"),(204,"Cal Ripken, Jr."),
                (226,"Frank Thomas"),(304,"Ken Griffey, Jr.")]:
  if b[n]["player"]!=name:raise ValueError(f"Incorrect base #{n}: {b[n]['player']}")
 vouchers={int(r["cardNumber"]) for r in rows if r["setKey"]=="museum-redemptions"}
 if vouchers!=VOUCHERS:raise ValueError("Redemption checklist wrong")
 if len(rows)+900!=1542:raise ValueError("Final modeled total incorrect")
 print("PASS: 1995 Pinnacle 450 base + 900 full parallels + 192 inserts/redemption/variants = 1,542 cards")
 print("PASS: 15 ProductSets, 642 explicit CSV rows, seven Museum vouchers and five true RCs")
 print("PASS: nine intentionally teamless original checklist cards, no missing insert teams")
 print("PASS: pin NNO, two-sided Dufex variations, series- and channel-specific odds gated")
 print("PASS: product UNRELEASED; no fabricated odds or print runs")

def main():
 p=argparse.ArgumentParser()
 p.add_argument("--check",action="store_true")
 args=p.parse_args()
 if not args.check:
  rows=build()
  DIR.mkdir(parents=True,exist_ok=True)
  out=io.StringIO(newline="")
  writer=csv.DictWriter(out,fieldnames=FIELDS,lineterminator="\n")
  writer.writeheader();writer.writerows(rows)
  CARDS.write_bytes(gzip.compress(out.getvalue().encode("utf8"),compresslevel=9,mtime=0))
 check()
if __name__=="__main__":main()
