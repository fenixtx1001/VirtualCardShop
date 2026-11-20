#!/usr/bin/env python3
"""1999 Fleer Ultra Baseball Set Factory: live cross-source audit and deterministic CSV.

Sources: BaseballCardPedia, independent CollectionCount and TCDB; respects
single-series 250-base checklist, three numbered parallels, six inserts,
six actual dealer promotional sample singles and true /99 /50 /65 tiers.
"""
from __future__ import annotations
import argparse,csv,gzip,html,io,json,re,urllib.request
from collections import Counter
from pathlib import Path

DATA=Path(__file__).resolve().parents[1]/"data/set-factory"
BUNDLE=DATA/"1999-ultra-baseball.bundle.json"
CARDS=DATA/"1999-ultra-baseball.cards.csv.gz"
BCP="https://baseballcardpedia.com/index.php/1999_Ultra"
CC="https://www.collectioncount.com/checklists/1999-fleer-ultra-baseball/"
FIELDS=("setKey","cardNumber","player","team","subset","variant")
SIZES=(0,210,5,10,25,30,20,15,15,15,10)
INSERTS=(
 ("rbi-kings",5,"RBIKINGS",30,"RK","Retail only: one per retail pack"),
 ("the-book-on",6,"THEBOOKON",20,"BO","Hobby or retail 1:6"),
 ("world-premiere",7,"WORLDPREMIERE",15,"WP","Hobby or retail 1:18"),
 ("thunderclap",8,"THUNDERCLAP",15,"TC","Hobby or retail 1:36"),
 ("damage-inc",9,"DAMAGEINC",15,"DI","Hobby or retail 1:72"),
 ("diamond-producers",10,"DIAMONDPRODUCERS",10,"DP","Hobby or retail 1:288, die-cut")
)
PROMOS=("Kerry Wood","Mark McGwire","Nomar Garciaparra","Andruw Jones","Alex Rodriguez","Kenny Lofton")
GROUPS={"base":250,"gold-medallion":250,"platinum-medallion":250,"masterpiece":250,
        **{k:count for k,ix,a,count,prefix,odds in INSERTS},"promotional-samples":6}
EXPLICIT={k:v for k,v in GROUPS.items() if k!="masterpiece"}
NAME_DIFFERENCES={178:("Sandy Alomar","Sandy Alomar, Jr."),
 213:("Cal Ripken","Cal Ripken, Jr."),215:("Ken Griffey","Ken Griffey, Jr.")}
assert len(GROUPS)==11 and sum(GROUPS.values())==1111
def fetch(url):
 req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (VCS cross-source historical trading-card audit)"})
 with urllib.request.urlopen(req,timeout=45) as r:
  if r.status!=200:raise ValueError(f"{url} returned HTTP {r.status}")
  return r.read().decode("utf8","replace")
def list_groups(source):
 groups=[[html.unescape(re.sub(r"<[^>]+>","",v)).strip()
  for v in re.findall(r"<li[^>]*>(.*?)</li>",b,re.I|re.S)]
  for b in re.findall(r'<ul\s+style="list-style-type:none;"\s*>(.*?)</ul>',source,re.I|re.S)]
 if tuple(len(g) for g in groups)!=SIZES:
  raise ValueError(f"BCP checklist structure/counts changed: {tuple(len(g) for g in groups)}")
 return groups
def array(source,key):
 m=re.search(r"\bvar\s+"+key+r"\s*=\s*(\[[\s\S]*?\]);",source)
 if not m:raise ValueError("Missing independent source array "+key)
 return json.loads(re.sub(r"/\*[\s\S]*?\*/","",m.group(1)))
def add(out,key,n,name,team,subset="",variant=""):
 if not str(n) or not name or not team:raise ValueError(f"Missing identity {key} {n}")
 out.append(dict(zip(FIELDS,(key,str(n),name,team,subset,variant))))
def emit():
 cc=fetch(CC);bcp=fetch(BCP);g=list_groups(bcp)
 teams=array(cc,"TEAMS");base=array(cc,"BASE")
 if len(teams)!=30 or len(set(teams))!=30 or len(base)!=250:
  raise ValueError("Independent 250-base, 30-team checklist changed")
 indexed={}
 for section in g[1:5]:
  for line in section:
   m=re.fullmatch(r"(\d{1,3})\s+(.+)",line)
   if not m:raise ValueError("Unparsed base card "+line)
   n=int(m.group(1))
   if n in indexed:raise ValueError(f"Duplicate base #{n}")
   indexed[n]=m.group(2)
 if set(indexed)!=set(range(1,251)):raise ValueError("Base missing cards")
 out=[];parents={};byname={}
 for number,row in enumerate(base,1):
  if len(row)!=3 or int(row[0])!=number:raise ValueError(f"CC entry #{number} malformed")
  _,name,ti=row
  bname=indexed[number]
  if number in NAME_DIFFERENCES:
   if (bname,name)!=NAME_DIFFERENCES[number]:raise ValueError(f"Unreviewed published name correction #{number}")
  elif name!=bname:raise ValueError(f"Source name mismatch #{number}: {bname}/{name}")
  if not isinstance(ti,int) or not 0<=ti<len(teams):raise ValueError(f"Invalid team index #{number}")
  team=teams[ti]
  subset=("Checklist" if 211<=number<=215 else
          "Season Crowns" if 216<=number<=225 else
          "Prospects" if 226<=number<=250 else "")
  note=("Original short-printed subset, not regular base collation" if number>=216 else "")
  if number in NAME_DIFFERENCES:note+=(("; " if note else "")+"BCP abbreviated Jr. suffix normalized to independent CC")
  add(out,"base",number,name,team,subset,note)
  parents[number]=(name,team,subset)
  byname.setdefault(name,set()).add(team)
 # Gold printed 'G' suffix; Platinum printed 'P' suffix; regular
 # counterparts all 250 original player and team identities.
 for n,(name,team,subset) in parents.items():
  if n<=215:
   gnote="Original Gold Medallion 1G–215G, hobby one per pack"
   printcap=99
  elif n<=225:
   gnote="Short-print Gold Medallion Season Crowns 216G–225G, hobby 1:80"
   printcap=50
  else:
   gnote="Short-print Gold Medallion Prospects 226G–250G, hobby 1:40"
   printcap=65
  add(out,"gold-medallion",f"{n}G",name,team,subset,gnote+"; gold matte foil + foil-stamped back")
  add(out,"platinum-medallion",f"{n}P",name,team,subset,
      f"Platinum Medallion original card #{n}P; serialized /{printcap} on back; metallic gray matte foil; hobby only")
 # Six separate inserts. The number suffix (e.g. '1 RK') reflects
 # the physical checklists, not an invented sequential base number.
 for key,groupid,arr_name,count,prefix,odds in INSERTS:
  ca=array(cc,arr_name)
  if len(ca)!=count or len(g[groupid])!=count:
   raise ValueError(f"Source insert length changed {key}")
  for ix,(raw,reference) in enumerate(zip(g[groupid],ca),1):
   m=re.fullmatch(r"(\d{1,2})\s+(?:(RK|BO|TC|DI|DP)\s+)?\s*(.+)",raw)
   if not m:raise ValueError(f"Unparsed insert {key}: {raw}")
   n=int(m.group(1));pr=m.group(2) or "";bname=m.group(3).strip()
   if n!=ix or pr not in ("",prefix) or len(reference)<3 or int(reference[0])!=ix or reference[1]!=bname:
    raise ValueError(f"Insert #{ix} mismatch for {key}: {raw}/{reference}")
   ti=reference[2]
   if not isinstance(ti,int) or not 0<=ti<len(teams):raise ValueError(f"Invalid insert team {key} #{ix}")
   team=teams[ti]
   if bname in byname and team not in byname[bname]:
    raise ValueError(f"Insert club conflicts with same player's base {key} #{ix}")
   add(out,key,f"{ix} {prefix}",bname,team,key.replace("-"," ").title(),
       f"{odds}; original printed checklist suffix {prefix}; pack format exclusive where noted")
 # Six actual individual cut dealer samples. The sheet is a single
 # uncut item and is therefore not fabricated as six *extra* cards.
 for i,name in enumerate(PROMOS,1):
  ts=byname.get(name,set())
  if len(ts)!=1:raise ValueError(f"Promo subject not unambiguous in base checklist {name}: {ts}")
  add(out,"promotional-samples",f"SAMPLE-{i:02d}",name,next(iter(ts)),"Dealer Promotional Samples",
     "Genuine individual PROMOTIONAL SAMPLE cut from original six-card dealer sheet; virtual VCS number, not printed numbering; not found in wax")
 return out
def check():
 b=json.loads(BUNDLE.read_text("utf8"))
 if b["schemaVersion"]!=2 or b["status"]!="DRAFT" or b["product"]["released"] is not False:
  raise ValueError("Draft release gate changed")
 if b["product"]["id"]!="1999_Ultra_Baseball" or b["cardsFile"]!=CARDS.name:
  raise ValueError("Product ID/CSV mismatch")
 if len(b["productSets"])!=11 or {s["key"]:s["expectedCards"] for s in b["productSets"]}!=GROUPS:
  raise ValueError("ProductSet family/count mismatch")
 if {s["key"]:s["deriveCardsFrom"] for s in b["productSets"] if s.get("deriveCardsFrom")}!={"masterpiece":"base"}:
  raise ValueError("Masterpiece should derive solely from verified 250 base")
 if any(s["oddsPerPack"] is not None for s in b["productSets"]):
  raise ValueError("Unsafe mixed retail and hobby odds")
 with gzip.open(CARDS,"rt",encoding="utf8",newline="") as f:rows=list(csv.DictReader(f))
 c=Counter(x["setKey"] for x in rows)
 if c!=Counter(EXPLICIT) or len(rows)!=861:raise ValueError(f"Expected 861 source-listed rows {c}")
 if len(set((x["setKey"],x["cardNumber"]) for x in rows))!=len(rows):
  raise ValueError("Duplicate numbered entries")
 if any(not x["team"] or not x["player"] for x in rows):
  raise ValueError("Missing subject/team")
 base={int(x["cardNumber"]):x for x in rows if x["setKey"]=="base"}
 if set(base)!=set(range(1,251)):raise ValueError("Base #1–250 incomplete")
 if any(x["player"].endswith(" RC") for x in base.values()):
  raise ValueError("No true RCs designated by source")
 for n,name in [(1,"Greg Maddux"),(211,"Kerry Wood"),(213,"Cal Ripken, Jr."),
                (215,"Ken Griffey, Jr."),(216,"Alex Rodriguez"),(241,"J.D. Drew"),
                (249,"Eric Chavez"),(250,"Corey Koskie")]:
  if base[n]["player"]!=name:raise ValueError(f"Incorrect iconic #{n} {base[n]['player']}")
 for key,suffix in (("gold-medallion","G"),("platinum-medallion","P")):
  x={v["cardNumber"] for v in rows if v["setKey"]==key}
  if x!={f"{i}{suffix}" for i in range(1,251)}:raise ValueError(f"{key} numbering not original")
 plat={int(x["cardNumber"][:-1]):x for x in rows if x["setKey"]=="platinum-medallion"}
 if any(f"/{99 if n<=215 else 50 if n<=225 else 65}" not in p["variant"] for n,p in plat.items()):
  raise ValueError("Platinum original tiers not preserved")
 if len(rows)+250!=1111:raise ValueError("Final 1111 collector entries mismatch")
 print("PASS 1999 Fleer Ultra: 250 base, 250 Gold, 250 Platinum, 250 Masterpiece")
 print("PASS six cross-audited inserts = 105 cards; six authentic individual dealer promos")
 print("PASS 11 ProductSets; 861 explicit + 250 Masterpiece derived = 1,111 distinct records")
 print("PASS 0 source-designated RCs; 35 short-printed base and Gold variations, all Platinum /99 /50 /65 tiers")
 print("PASS single-series 10×24 hobby original, retail-only RBI Kings, original pack odds gated")
 print("PASS product remains DRAFT and unreleased")
def main():
 ap=argparse.ArgumentParser()
 ap.add_argument("--check",action="store_true")
 args=ap.parse_args()
 if not args.check:
  rows=emit()
  DATA.mkdir(parents=True,exist_ok=True)
  buf=io.StringIO(newline="")
  writer=csv.DictWriter(buf,fieldnames=FIELDS,lineterminator="\n")
  writer.writeheader();writer.writerows(rows)
  CARDS.write_bytes(gzip.compress(buf.getvalue().encode("utf8"),compresslevel=9,mtime=0))
 check()
if __name__=="__main__":main()
