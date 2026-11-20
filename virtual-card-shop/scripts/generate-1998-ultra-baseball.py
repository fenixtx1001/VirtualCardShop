#!/usr/bin/env python3
"""Source-audited 1998 Fleer Ultra Baseball Set Factory.

Reconciles 501 base and 16 inserts against BaseballCardPedia and
CollectionCount, 14 TCDB-verified rookies, and 1997-98 cross-brand
Million Dollar Moments. Platinum explicitly excludes unprinted #473–475.
All generated assets are deterministic and reviewed offline via --check.
No real pack odds are invented from blended series/channel probabilities.
"""
from __future__ import annotations
import argparse,csv,gzip,html,io,json,re,urllib.request
from collections import Counter
from pathlib import Path

DATA=Path(__file__).resolve().parents[1]/"data/set-factory"
BUNDLE=DATA/"1998-ultra-baseball.bundle.json"
CARDS=DATA/"1998-ultra-baseball.cards.csv.gz"
BCP="https://baseballcardpedia.com/index.php/1998_Ultra"
CC="https://www.collectioncount.com/checklists/1998-fleer-ultra-baseball/"
MDM="https://baseballcardpedia.com/index.php/1997_Fleer_Million_Dollar_Moments"
FIELDS=("setKey","cardNumber","player","team","subset","variant")
GROUPS=(210,10,25,5,202,20,3,25,1,15,20,15,18,12,15,10,18,15,30,20,15,15,20,15,15,1)
INSERTS=[
 ("big-shots",9,"BIGSHOTS",15,"BS","S1 hobby/retail 1:4"),
 ("double-trouble",10,"TROUBLE",20,"DT","S1 hobby/retail 1:4"),
 ("back-to-the-future",11,"FUTURE",15,"BF","S1 hobby/retail 1:6"),
 ("artistic-talents",12,"ARTISTIC",18,"AT","S1 hobby/retail 1:8"),
 ("kid-gloves",13,"KIDGLOVES",12,"KG","S1 hobby/retail 1:8"),
 ("fall-classics",14,"FALL",15,"FC","S1 hobby/retail 1:18"),
 ("power-plus",15,"POWER",10,"PP","S1 hobby/retail 1:36"),
 ("prime-leather",16,"PRIME",18,"PL","S1 hobby/retail 1:144"),
 ("diamond-producers",17,"PRODUCERS",15,"DP","S1 hobby/retail 1:288"),
 ("top-30",18,"TOP30",30,"T3","S2 retail-exclusive one per pack"),
 ("notables",19,"NOTABLES",20,"N","S2 hobby 1:4 retail 1:6"),
 ("rocket-to-stardom",20,"STAR",15,"RS","S2 hobby 1:15 retail 1:30; die-cut"),
 ("millennium-men",21,"MILLENNIUM",15,"MM","S2 hobby-exclusive 1:35; fold-out"),
 ("win-now",22,"WINNOW",20,"WN","S2 hobby 1:72 retail 1:104"),
 ("ticket-studs",23,"TICKET",15,"TS","S2 hobby 1:144 retail 1:206; oversized ticket"),
 ("diamond-immortals",24,"IMMORTALS",15,"DI","S2 hobby 1:288 retail 1:412")
]
TRUE_RC={121,144,192,223,232,235,281,293,313,338,375,380,403,466}
CC_RC={144,223,281,293,313,380,466}
SOURCE_DISAGREEMENTS={
 21,53,121,144,192,223,232,235,238,243,266,281,293,313,338,375,380,403,466
}
EXPLICIT={"base":501,"platinum-medallion":498,
          **{key:n for key,ix,src,n,pref,odds in INSERTS},
          "million-dollar-moments":50,"platinum-redemptions":2,
          "fleer-tradition-promo-autograph":1}
COUNTS={"base":501,"gold-medallion":501,"platinum-medallion":498,
        "masterpiece":501,**{key:n for key,ix,src,n,pref,odds in INSERTS},
        "million-dollar-moments":50,"million-dollar-moments-exchange":50,
        "platinum-redemptions":2,"fleer-tradition-promo-autograph":1}
assert len(TRUE_RC)==14 and sum(EXPLICIT.values())==1320 and sum(COUNTS.values())==2372

def fetch(url):
 req=urllib.request.Request(url,headers={
  "User-Agent":"Mozilla/5.0 (Virtual Card Shop historic checklist audit)",
  "Accept":"text/html,application/xhtml+xml"})
 with urllib.request.urlopen(req,timeout=40) as r:
  if r.status!=200:raise ValueError(f"Source HTTP {r.status}: {url}")
  return r.read().decode("utf8","replace")
def jsarr(source,key):
 m=re.search(r"\bvar\s+"+re.escape(key)+r"\s*=\s*(\[[\s\S]*?\]);",source)
 if not m:raise ValueError("Independent checklist array changed: "+key)
 return json.loads(re.sub(r"/\*[\s\S]*?\*/","",m.group(1)))
def groups(source):
 blocks=re.findall(r'<ul\s+style="list-style-type:none;"\s*>(.*?)</ul>',source,re.I|re.S)
 result=[[html.unescape(re.sub(r"<[^>]*>","",v)).strip()
  for v in re.findall(r"<li[^>]*>(.*?)</li>",b,re.S|re.I)] for b in blocks]
 if tuple(len(x) for x in result)!=GROUPS:
  raise ValueError(f"Source group sizes changed: {tuple(len(x) for x in result)}")
 return result
def add(rows,key,num,player,team,subset="",variant=""):
 if not str(num).strip() or not player or not team:
  raise ValueError(f"Blank identity/team: {key} #{num} {player} / {team}")
 rows.append(dict(zip(FIELDS,[key,str(num),player,team,subset,variant])))
def clean_base(raw):
 raw=re.sub(r"\s+(?:SP\s+)?PROS(?:\s+RC)?$","",raw)
 raw=re.sub(r"\s+RC$","",raw)
 raw=re.sub(r"\s+CL\s+.*$","",raw)
 raw=re.sub(r"\s+LA$","",raw)
 return raw.strip()
def parse_insert(raw):
 m=re.fullmatch(r"(\d{1,3})\s*([A-Z0-9]{1,2})?\s+(.+)",raw)
 if not m:raise ValueError("Unparseable Ultra insert: "+repr(raw))
 n,prefix,name=m.groups()
 name=re.sub(r"\s+(?:FLA|UER)$","",name).strip()
 return int(n),prefix or "",name
def produce():
 cc=fetch(CC);bp=fetch(BCP);mdm_page=fetch(MDM)
 teams=jsarr(cc,"TEAMS");base=jsarr(cc,"BASE");g=groups(bp)
 if len(teams)!=30 or len(set(teams))!=30 or len(base)!=501:raise ValueError("501-card base / 30 team source changed")
 bcp={}
 for group in g[:9]:
  for line in group:
   m=re.fullmatch(r"(\d{1,3})\s+(.+)",line)
   if not m:raise ValueError("Base source number missing: "+line)
   n=int(m.group(1))
   if n in bcp:raise ValueError(f"Duplicate BCP card #{n}")
   bcp[n]=m.group(2)
 if set(bcp)!=set(range(1,502)):raise ValueError("BCP base 1..501 not complete")
 rows=[];base_rows=[];diff=set();cc_rc=set()
 for pos,row in enumerate(base,1):
  if len(row) not in (3,4) or int(row[0])!=pos:raise ValueError(f"Independent base row #{pos} malformed: {row}")
  n,name,ti,*extra=row
  source_name=bcp[pos];normalized=clean_base(source_name)
  if name!=normalized:diff.add(pos)
  if pos==21:
   if (source_name,name)!=("Bob Higginson","Bobby Higginson"):raise ValueError("Unreviewed #21 name correction")
  elif pos==266:
   if (source_name,name)!=("Dennis Reyes","Dennys Reyes"):raise ValueError("Unreviewed #266 name correction")
  elif name!=normalized:
   raise ValueError(f"Unreviewed BCP/CC subject mismatch #{pos}: {name}/{source_name}")
  if pos==248:
   if ti is not None or name!="Diamond Ink":raise ValueError("Program checklist #248 changed")
   team="Not Applicable"
  elif not isinstance(ti,int) or not 0<=ti<len(teams):
   raise ValueError(f"Unrecognized team #{pos}: {ti}")
  else:team=teams[ti]
  if extra:
   if extra!=[1]:raise ValueError("Unknown rookie metadata #{pos}")
   cc_rc.add(pos)
  subset=("Season Crowns" if 211<=pos<=220 else
    "Prospects" if 221<=pos<=245 else
    "Series One Checklists" if 246<=pos<=250 else
    "New Horizons" if 453<=pos<=472 else
    "Series Two Checklists" if 473<=pos<=475 else
    "Pizzazz" if 476<=pos<=500 else "")
  tags=[]
  if pos in TRUE_RC:tags.append("TCDB verified true rookie; original BCP RC tag")
  if pos in (238,243):tags.append("Source notes unusually short-printed Prospects, not a verified individual rate")
  if pos in (53,485,501):tags.append({53:"Mike Piazza photographed as LA Dodger",
        485:"Mike Piazza photographed as Florida Marlin",
        501:"Late Mike Piazza New York Mets addition"}[pos])
  if pos==21:tags.append("BCP Bob / CC Bobby Higginson name variation")
  if pos==266:tags.append("BCP Dennis / CC Dennys Reyes name variation")
  if pos==248:tags.append("Checklist program card, explains cross-product Diamond Ink point redemptions; NOT point card itself")
  if pos in list(range(211,251))+list(range(473,476))+list(range(476,501)):
   tags.append("Originally short-printed subset; preserve true source rarity")
  player=name+(" RC" if pos in TRUE_RC else "")
  add(rows,"base",pos,player,team,subset,"; ".join(tags))
  base_rows.append(rows[-1])
 if diff!=SOURCE_DISAGREEMENTS:
  raise ValueError(f"New checklist/source name disagreements: {sorted(diff^SOURCE_DISAGREEMENTS)}")
 if cc_rc!=CC_RC:raise ValueError("Independent CC rookie-flag set changed")
 if {n for n in TRUE_RC if " RC" not in bcp[n]}:raise ValueError("BCP true rookie index changed")
 if [base_rows[n-1]["team"] for n in (53,485,501)]!=["Los Angeles Dodgers","Florida Marlins","New York Mets"]:
  raise ValueError("Mike Piazza team/photo sequence changed")
 # Platinum numbering appends P. These are distinct from ordinary base IDs.
 # #473P-475P were never manufactured. Separate explicit rows keep the
 # normal Set Factory importer fully reproducible without custom exclusions.
 for base_row in base_rows:
  n=int(base_row["cardNumber"])
  if n in (473,474,475):continue
  series=1 if n<=250 else 2
  tag=f"Platinum Medallion #{n}P; serial-numbered /{100 if series==1 else 98}; only {90 if series==1 else 88} inserted in packs, 10 withheld for each series-set redemption; S{series} hobby"
  add(rows,"platinum-medallion",f"{n}P",base_row["player"],base_row["team"],base_row["subset"],tag)
 # Sixteen independent insert checklists. Compare every card with
 # CollectionCount source, including original design prefixes and team.
 for key,ix,arr_name,expected,prefix,channel in INSERTS:
  independent=jsarr(cc,arr_name)
  if len(independent)!=expected or len(g[ix])!=expected:
   raise ValueError(f"{key} checklist size changed")
  for pos,(line,check) in enumerate(zip(g[ix],independent),1):
   num,pref,who=parse_insert(line)
   if num!=pos or (pref not in ("",prefix)):
    raise ValueError(f"Unusual printed number/prefix {key} #{pos}: {line}")
   if len(check)<3 or str(check[0])!=str(pos) or check[1]!=who:
    raise ValueError(f"Insert source mismatch {key} #{pos}: {who} vs {check}")
   ti=check[2]
   if " / " in who:team="Multiple Teams"
   elif not isinstance(ti,int) or not 0<=ti<len(teams):raise ValueError(f"Insert missing team {key} #{pos}")
   else:team=teams[ti]
   if who=="Mike Piazza" and ix>=18 and team!="Florida Marlins":
    raise ValueError(f"Series Two Mike Piazza image-era team wrong {key}")
   numstr=str(pos)+(pref if pref else "")
   tags=[channel,"Original printed source numbering/prefix verified"]
   if key=="fall-classics" and pos==15 and pref=="":tags.append("BCP card #15 omits FC prefix; preserve as printed in checklist")
   if key=="top-30" and pos==14:tags.append("Mike Piazza Florida Marlins variation")
   add(rows,key,numstr,who,team,key.replace("-"," ").title(),"; ".join(tags))
 # Cross-brand 50-card game, one per pack of Series One Ultra.
 # #46-50 are progressively scarcer, *not* a uniform one-of-one group.
 mdmgs=re.findall(r'<ul\s+style="list-style-type:none;"\s*>(.*?)</ul>',mdm_page,re.I|re.S)
 mdmrows=[[html.unescape(re.sub(r"<[^>]*>","",v)).strip()
   for v in re.findall(r"<li[^>]*>(.*?)</li>",b,re.I|re.S)] for b in mdmgs]
 if [len(x) for x in mdmrows]!=[50]:raise ValueError("Cross-brand MDM historical checklist not exactly 50")
 # Team inferred only for unambiguous active player from the verified
 # Ultra base checklist; retired moment subjects have no club invented.
 by_name={}
 for row in base_rows:
  name=row["player"].removesuffix(" RC")
  if row["team"] not in ("Not Applicable","Multiple Teams"):
   by_name.setdefault(name,set()).add(row["team"])
 for pos,line in enumerate(mdmrows[0],1):
  m=re.fullmatch(r"(\d{1,2})\s+(.+)",line)
  if not m or int(m.group(1))!=pos:raise ValueError(f"MDM #{pos} source changed")
  raw=m.group(2)
  who=re.sub(r"\s+SP$","",raw)
  choices=by_name.get(who,set())
  team=next(iter(choices)) if len(choices)==1 else "Historical / Multiple Teams"
  if who=="Checklist":team="Not Applicable"
  note="Cross-brand 1997-98 Fleer Million Dollar Moments game card, seeded in Ultra Series One one per pack"
  if pos>=46:note+="; progressively short-printed contest card; DO NOT assign normal 1:50 odds"
  add(rows,"million-dollar-moments",pos,who,team,"Million Dollar Moments",note)
 # Two real physical redemption certificates (10 made per series) exchange
 # for complete 250-card and 248-card Platinum sets.
 for s in (1,2):
  add(rows,"platinum-redemptions",f"S{s}","Complete Series "+str(s)+" Platinum Medallion Set",
      "Not Applicable","Platinum Exchange",
      f"Virtual VCS S{s} inventory ID for original ten printed whole-series Platinum redemption cards; S{s} certificate, not a regular pack card number; full set contains {250 if s==1 else 248} physical Platinum cards")
 # Authentic 1998 Fleer Tradition promotional design, actually signed and
 # inserted into 1998 Ultra Series Two hobby packs; no Ultra autograph design.
 if g[25]!=["100 Alex Rodriguez AU 750"]:raise ValueError("Alex Rodriguez promotional autograph list changed")
 add(rows,"fleer-tradition-promo-autograph",100,"Alex Rodriguez","Seattle Mariners",
     "Fleer Tradition Promo",
     "Signed 1998 Fleer Tradition promotional card randomly inserted in 1998 Ultra Series Two HOBBY packs; 750 hand-numbered on front; NOT 1998 Ultra design")
 return rows

def check():
 b=json.loads(BUNDLE.read_text("utf8"))
 if b["schemaVersion"]!=2 or b["status"]!="DRAFT" or b["product"]["released"] is not False:
  raise ValueError("Manifest not unreleased schema-v2 draft")
 if b["product"]["id"]!="1998_Ultra_Baseball" or b["cardsFile"]!=CARDS.name:
  raise ValueError("Product identifier / file wrong")
 sets=b["productSets"]
 if {x["key"]:x["expectedCards"] for x in sets}!=COUNTS or len(sets)!=24:
  raise ValueError("ProductSet count and names changed")
 deriv={x["key"]:x["deriveCardsFrom"] for x in sets if x.get("deriveCardsFrom")}
 if deriv!={"gold-medallion":"base","masterpiece":"base","million-dollar-moments-exchange":"million-dollar-moments"}:
  raise ValueError("Incorrect parallel source set")
 if any(x["oddsPerPack"] is not None for x in sets):
  raise ValueError("Must not blend S1/S2 and retail/hobby odds in current rip engine")
 with gzip.open(CARDS,"rt",encoding="utf8",newline="") as f:cards=list(csv.DictReader(f))
 counts=Counter(x["setKey"] for x in cards)
 if counts!=Counter(EXPLICIT) or len(cards)!=1320:
  raise ValueError(f"Explicit checklist rows don't match manifest: {counts}")
 if len(set((x["setKey"],x["cardNumber"]) for x in cards))!=len(cards):
  raise ValueError("Duplicate (ProductSet, printed number)")
 if any(not x["player"] or not x["team"] for x in cards):
  raise ValueError("Blank player/team assignments")
 base={int(x["cardNumber"]):x for x in cards if x["setKey"]=="base"}
 if set(base)!=set(range(1,502)):raise ValueError("Missing base 1..501")
 found={i for i,x in base.items() if x["player"].endswith(" RC")}
 if found!=TRUE_RC:raise ValueError(f"14 TCDB rookies changed {found^TRUE_RC}")
 for n,who,team in [(1,"Ken Griffey, Jr.","Seattle Mariners"),
    (53,"Mike Piazza","Los Angeles Dodgers"),(121,"Kevin Millwood RC","Atlanta Braves"),
    (380,"Magglio Ordonez RC","Chicago White Sox"),(485,"Mike Piazza","Florida Marlins"),
    (501,"Mike Piazza","New York Mets")]:
  if base[n]["player"]!=who or base[n]["team"]!=team:
   raise ValueError(f"Key card #{n} mismatch {base[n]['player']}/{base[n]['team']}")
 platinum={x["cardNumber"] for x in cards if x["setKey"]=="platinum-medallion"}
 target={str(n)+"P" for n in range(1,502) if n not in (473,474,475)}
 if platinum!=target:raise ValueError("Platinum #473P-475P are fictional")
 if b["product"]["cardsPerPack"]!=10 or b["product"]["packsPerBox"]!=24:
  raise ValueError("Wrong standard hobby pack dimensions")
 print("PASS 1998 Fleer Ultra: 501 base; 501 Gold; 498 actual Platinum; 501 unique Masterpieces")
 print("PASS 16 original inserts 268 cards, all identity/number/team reconciled with BCP/CollectionCount")
 print("PASS 14 TCDB rookies and team/photo-correct Piazza LA #53 / Florida #485 / NY Mets #501")
 print("PASS Million Dollar Moments 50 physical cross-brand + 50 exchanged variant cards")
 print("PASS 2 authentic set-level Platinum exchange vouchers and /750 1998 Tradition A-Rod promo autograph")
 print("PASS 24 ProductSets; 1,320 explicit + 1,052 derived = 2,372 total; release FALSE")
def main():
 p=argparse.ArgumentParser();p.add_argument("--check",action="store_true")
 args=p.parse_args()
 if not args.check:
  cards=produce();DATA.mkdir(parents=True,exist_ok=True)
  out=io.StringIO(newline="")
  writer=csv.DictWriter(out,fieldnames=FIELDS,lineterminator="\n");writer.writeheader();writer.writerows(cards)
  CARDS.write_bytes(gzip.compress(out.getvalue().encode("utf8"),compresslevel=9,mtime=0))
 check()
if __name__=="__main__":main()
