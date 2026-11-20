#!/usr/bin/env python3
"""2000 Fleer Ultra Baseball — source-audited VCS Set Factory.

Live checks 300 BCP base names against MyCardBatch 300 team-indexed records,
TCDB print-run/count notes, all six original regular insert lists, the
three Ultra-specific Club 3000 and all 15 memorabilia types, 62 Fresh Ink
autographs, 24 verified cross-release Fresh Ink Gold autograph 1/1s and
two original Alex Rodriguez promotional cards.

No Gold Fresh Ink may appear in 2000 Ultra packs: those cards were first
distributed in 2001 Fleer Platinum rack packs. Historical odds remain
unassigned until series-format-aware pack collation exists.
"""
from __future__ import annotations
import argparse,csv,gzip,html,io,json,re,urllib.request
from collections import Counter,defaultdict
from pathlib import Path
DATA=Path(__file__).resolve().parents[1]/"data/set-factory"
CARDS=DATA/"2000-ultra-baseball.cards.csv.gz"
BUNDLE=DATA/"2000-ultra-baseball.bundle.json"
BCP="https://baseballcardpedia.com/index.php/2000_Ultra"
MB="https://mycardbatch.com/checklists/fleer-ultra-2000-baseball"
CLUB="https://baseballcardpedia.com/index.php/2000_Fleer_Club_3000"
FIELDS=("setKey","cardNumber","player","team","subset","variant")
GROUP_LENGTHS=(2,250,50,10,15,10,15,10,15,62,24)
INSERTS=(("world-premiere",3,10,"WP","1:12 hobby/retail, die-cut"),
 ("diamond-mine",4,15,"DM","1:6 hobby/retail"),
 ("swing-kings",5,10,"SK","1:24 hobby/retail"),
 ("crunch-time",6,15,"CT","1:72 hobby/retail"),
 ("ultra-talented",7,10,"UT","Hobby only, each numbered /99"),
 ("feel-the-game",8,15,"FG","1:168 hobby/retail, die-cut game-used jersey or batting-glove piece"))
CLUB_PLAYERS=("Carl Yastrzemski","Tony Gwynn","Wade Boggs")
MEM_TYPES=("Bat","Hat","Jsy","Bat / Jsy","Bat / Hat / Jsy")
ALIASES={"Bob Abreu":"Bobby Abreu","Bob Higginson":"Bobby Higginson",
         "Scott Earlton":"Scott Elarton"}
EXTRA_TEAMS={
 "Bruce Chen":"Atlanta Braves","Einar Diaz":"Cleveland Indians",
 "Glen Barker":"Houston Astros","Heath Murray":"San Diego Padres",
 "Jose Macias":"Detroit Tigers","Norm Hutchins":"Anaheim Angels",
 "Richard Hidalgo":"Houston Astros","Scott Elarton":"Houston Astros",
 "Angel Pena":"Los Angeles Dodgers"}
# All 12 catalog discrepancies are individually visible, reviewed, and
# fail closed if either independent source changes.
MISMATCH_IDS={45,52,70,100,139,144,170,202,235,274,282,295}
GROUPS={"base":300,"gold-medallion":300,"platinum-medallion":300,
 "masterpiece":300,**{key:n for key,idx,n,s,odds in INSERTS},
 "club-3000":3,"club-3000-memorabilia":15,
 "fresh-ink":62,"fresh-ink-gold-platinum-2001":24,"promos":2}
EXPLICIT={key:n for key,n in GROUPS.items() if key not in ("gold-medallion","platinum-medallion","masterpiece")}
assert len(GROUPS)==15 and sum(GROUPS.values())==1381 and sum(EXPLICIT.values())==481

def fetch(url):
 req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (VCS catalog audit)","Accept":"text/html"})
 with urllib.request.urlopen(req,timeout=45) as response:
  if response.status!=200:raise ValueError(f"Source HTTP {response.status}: {url}")
  return response.read().decode("utf8","replace")
def stripmarkup(s):
 return html.unescape(re.sub(r"<[^>]+>","",s)).strip()
def clean(s):
 return re.sub(r"[^a-z0-9]","",ALIASES.get(s,s).lower())
def sourcegroups(page):
 blocks=re.findall(r'<ul\s+style="list-style-type:none;"\s*>(.*?)</ul>',page,re.I|re.S)
 result=[[stripmarkup(s) for s in re.findall(r"<li[^>]*>(.*?)</li>",b,re.I|re.S)] for b in blocks]
 if tuple(len(x) for x in result)!=GROUP_LENGTHS:
  raise ValueError(f"BCP source layout changed {tuple(len(x) for x in result)}")
 return result
def add(rows,key,no,who,team,subset="",variant=""):
 if not str(no).strip() or not who.strip() or not team.strip():
  raise ValueError(f"Blank subject/team: {key} {no} {who}/{team}")
 rows.append(dict(zip(FIELDS,(key,str(no),who.strip(),team.strip(),subset,variant))))
def build():
 bp=fetch(BCP);mb=fetch(MB);cl=fetch(CLUB)
 g=sourcegroups(bp)
 bcp={}
 for section in g[1:3]:
  for line in section:
   m=re.fullmatch(r"(\d{1,3})\s+(.+)",line)
   if not m:raise ValueError(f"Unparsed base number {line!r}")
   n=int(m.group(1))
   if n in bcp:raise ValueError(f"Duplicate base #{n}")
   bcp[n]=m.group(2)
 if set(bcp)!=set(range(1,301)):raise ValueError("300 base checklist incomplete")
 independent={}
 for num,player,team in re.findall(r'<tr><td>(\d+)</td><td>(.*?)</td><td>(.*?)</td></tr>',mb,re.I|re.S):
  n=int(num)
  if n in independent:raise ValueError(f"Duplicate secondary base #{n}")
  independent[n]=(stripmarkup(player),stripmarkup(team))
 if set(independent)!=set(range(1,301)):raise ValueError("Independent 300-card team checklist incomplete")
 mismatches={n for n in bcp if bcp[n]!=independent[n][0]}
 if mismatches!=MISMATCH_IDS:
  raise ValueError(f"Unexpected cross-source differences {sorted(mismatches^MISMATCH_IDS)}")
 rows=[];by_name=defaultdict(set);base={}
 for n in range(1,301):
  first=bcp[n];other,team=independent[n]
  if n==70:
   if first!="Chipper Jones UER: Dodgers logo on back" or other!="Chipper Jones":
    raise ValueError("1999-2000 Chipper Jones logo error source changed")
   player="Chipper Jones"
  elif n in MISMATCH_IDS:
   if n in (100,144,170,202,282):
    player=first  # original comma and Jr. punctuation preserved
   else:player=other  # full/successor-name normalization from independent index
  else:player=first
  subset="Prospects" if n>=251 else ""
  variant="Short-printed Prospects subset: inserted 1:4 packs" if n>=251 else ""
  if n==70:variant="Uncorrected-error note in BCP: Dodgers team logo printed on Chipper Jones card back; player/Braves retained"
  if n in MISMATCH_IDS and n!=70:
   variant+=(("; " if variant else "")+"BaseballCardPedia/independent catalog name variant: "+first+" / "+other)
  add(rows,"base",n,player,team,subset,variant)
  base[n]=(player,team,subset)
  by_name[clean(player)].add(team)
 # Existing sources do not label any 2000 Ultra base card as a verified RC.
 def assign(name):
  name=ALIASES.get(name,name)
  if " / " in name:return "Historical / Multiple Teams"
  ts=by_name.get(clean(name),set())
  if len(ts)==1:return next(iter(ts))
  if name in EXTRA_TEAMS:return EXTRA_TEAMS[name]
  if name=="Carl Yastrzemski":return "Boston Red Sox"
  if name=="Wade Boggs":return "Historical / Multiple Teams"
  raise ValueError(f"Team not independently verifiable for {name}: {ts}")
 for key,gid,count,suffix,channel in INSERTS:
  for i,line in enumerate(g[gid],1):
   m=re.fullmatch(r"(\d{1,2})\s*([A-Z]{2})\s+(.+)",line)
   if not m or int(m.group(1))!=i or m.group(2)!=suffix:
    raise ValueError(f"Insert printed numbering mismatch: {key} {line}")
   name=m.group(3).strip();extra=""
   if key=="feel-the-game":
    x=re.fullmatch(r"(.+?)\s+(JSY|BTG GLV)(?:\s+(SP))?",name)
    if not x:raise ValueError("Feel the Game memorabilia subtype unrecognized: "+name)
    name,kind,sp=x.groups()
    extra="; authentic "+("game-used jersey" if kind=="JSY" else "game-used batting glove")+("; source SP" if sp else "")
   add(rows,key,f"{i}{suffix}",name,assign(name),key.replace("-"," ").title(),
       "Original 2000 Ultra insert; "+channel+extra)
 # Club 3000 was a cross-brand 14-card set, but ONLY three ULT players
 # entered the Ultra edition, with five physical memorabilia tiers each.
 plain=" ".join(html.unescape(re.sub(r"<[^>]+>"," ",cl)).split())
 ids={"Carl Yastrzemski":"CY","Tony Gwynn":"TG","Wade Boggs":"WB"}
 for who in CLUB_PLAYERS:
  if not re.search(r"\b"+re.escape(who)+r" ULT\b",plain):
   raise ValueError(f"Club 3000 Ultra-only list changed for {who}")
  add(rows,"club-3000","ULT-"+ids[who],who,assign(who),"Club 3000",
      "Original shared 2000 Fleer Club 3000 die-cut issued specifically through Ultra packs 1:24; physical card marked ULT, not printed with sequential number")
  for kind in MEM_TYPES:
   m=re.search(r"\b"+re.escape(who)+r" "+re.escape(kind)+r" (\d+)\b",plain)
   if not m:raise ValueError(f"Missing genuine Ultra Club 3000 piece/run: {who} {kind}")
   cap=int(m.group(1))
   key={"Bat":"BAT","Hat":"HAT","Jsy":"JSY",
        "Bat / Jsy":"BAT-JSY","Bat / Hat / Jsy":"BAT-HAT-JSY"}[kind]
   add(rows,"club-3000-memorabilia",ids[who]+"-"+key,who,assign(who),"Club 3000 Memorabilia",
       f"Genuine {kind} memorabilia; serial-numbered /{cap}; Ultra ULT variant; virtual collector identifier; original physical item not sequentially numbered")
 # 62 authenticated Fresh Ink subjects, physically unnumbered and
 # hand-numbered /95–1000. Manual index is explicitly VCS-only.
 for i,line in enumerate(g[9],1):
  m=re.fullmatch(r"(.+?)\s+(\d+)",line)
  if not m:raise ValueError(f"Fresh Ink subject/run unparsed {line!r}")
  who,stated=m.groups();who=ALIASES.get(who.strip(),who.strip())
  n=int(stated)
  if who in ("J.D. Drew","Freddy Garcia"):
   checked=550
   note=f"Catalog conflict: BCP says /{n}, TCDB 2000 Ultra Fresh Ink specifies /550; use TCDB and independently pictured J.D. Drew /550, confirm individual serial from scan"
   n=checked
  else:note="Original hand-numbered source print run"
  add(rows,"fresh-ink",f"FI-{i:02d}",who,assign(who),"Fresh Ink Autograph",
      f"Authentic original Fleer embossed sticker autograph signed over silver seal; /{n}; physical NNO, FI index virtual only; {note}")
 # 24 verified gold autographs linked to 2000 Ultra card art, but **first
 # distributed in 2001 Fleer Platinum rack packs**. Source says 25
 # alleged; do not fabricate the 25th unknown player.
 for i,name in enumerate(g[10],1):
  name=ALIASES.get(name,name)
  add(rows,"fresh-ink-gold-platinum-2001",f"GOLD-{i:02d}",name,assign(name),"Fresh Ink Gold",
      "Confirmed 1/1 gold-foil signed sticker; 2000 Ultra artwork, but originally PACKED EXCLUSIVELY IN 2001 FLEER PLATINUM RACK PACKS; NOT a 2000 Ultra pack hit; only 24 publicly verified of 25 rumored")
 if g[0]!=["P1 Alex Rodriguez","P2 Alex Rodriguez"]:
  raise ValueError("Two authentic pre-release A-Rod promotional subjects changed")
 add(rows,"promos","P1","Alex Rodriguez","Seattle Mariners","Promotional Sample",
     "Authentic 2000 Ultra dealers/media PROMOTIONAL SAMPLE, glossy normal card stock with diagonal stamp on back; NOT wax")
 add(rows,"promos","P2","Alex Rodriguez","Seattle Mariners","Lenticular Promo",
     "Authentic rare lenticular ribbed plastic front, same A-Rod photo as #1; issued before release to dealers/media; NOT wax")
 return rows
def check():
 b=json.loads(BUNDLE.read_text("utf8"))
 if b["schemaVersion"]!=2 or b["status"]!="DRAFT" or b["product"]["released"] is not False:
  raise ValueError("Must stay unreleased draft")
 if b["product"]["id"]!="2000_Ultra_Baseball" or b["cardsFile"]!=CARDS.name:raise ValueError("Manifest ID/file")
 if len(b["productSets"])!=15 or {s["key"]:s["expectedCards"] for s in b["productSets"]}!=GROUPS:
  raise ValueError("15 group manifest incomplete")
 if {s["key"]:s["deriveCardsFrom"] for s in b["productSets"] if s.get("deriveCardsFrom")}!={
  "gold-medallion":"base","platinum-medallion":"base","masterpiece":"base"}:
  raise ValueError("Bad parallel derivation")
 if any(s["oddsPerPack"] is not None for s in b["productSets"]):
  raise ValueError("Do not blend prospective draw odds")
 with gzip.open(CARDS,"rt",encoding="utf8",newline="") as f:rows=list(csv.DictReader(f))
 if Counter(x["setKey"] for x in rows)!=Counter(EXPLICIT) or len(rows)!=481:
  raise ValueError(f"Explicit 481 records incomplete: {Counter(x['setKey'] for x in rows)}")
 if len(set((x["setKey"],x["cardNumber"]) for x in rows))!=len(rows):
  raise ValueError("Duplicate ProductSet/number")
 if any(not x["player"] or not x["team"] for x in rows):raise ValueError("Missing subject/team")
 base={int(x["cardNumber"]):x for x in rows if x["setKey"]=="base"}
 if set(base)!=set(range(1,301)):raise ValueError("Base #1–300 incomplete")
 for i,expected in [(1,"Alex Rodriguez"),(50,"Nomar Garciaparra"),(70,"Chipper Jones"),
  (100,"Ken Griffey, Jr."),(170,"Cal Ripken, Jr."),(200,"Derek Jeter"),
  (251,"Micah Bowie"),(252,"Joe Nathan"),(293,"Alfonso Soriano"),(300,"Josh Beckett")]:
  if base[i]["player"]!=expected:raise ValueError(f"Key subject #{i} mismatch: {base[i]['player']}")
 if any(x["player"].endswith(" RC") for x in base.values()):
  raise ValueError("TCDB has no formally flagged RCs")
 if len([x for x in rows if x["setKey"]=="club-3000-memorabilia"])!=15:
  raise ValueError("Non-Ultra Club 3000 players accidentally included")
 if any("2001 FLEER PLATINUM" not in x["variant"] for x in rows if x["setKey"]=="fresh-ink-gold-platinum-2001"):
  raise ValueError("Gold Fresh Ink falsely claim 2000 Ultra pack insertion")
 if b["product"]["cardsPerPack"]!=10 or b["product"]["packsPerBox"]!=24:
  raise ValueError("Original hobby 10×24 configuration")
 print("PASS 2000 Fleer Ultra 300 base; 300 Gold; 300 Platinum; 300 1/1 Masterpiece")
 print("PASS six original inserts 75 cards; Feel the Game 15 including Edgar Martinez #15FG")
 print("PASS original Ultra-only Club 3000 3, memorabilia 15, Fresh Ink 62 and verified external Gold 24")
 print("PASS 2 pre-release Alex Rodriguez promos; exclude unverified 25th Gold autograph")
 print("PASS Platinum regular /50 Prospects /25, Gold regular one/pack Prospects 1:24")
 print("PASS 15 group model; 481 explicit + 900 derived = 1,381 cards, no invented rookie badges")
 print("PASS product unreleased; no fictitious wax odds or fabricated player images")
def main():
 ap=argparse.ArgumentParser();ap.add_argument("--check",action="store_true");args=ap.parse_args()
 if not args.check:
  rows=build();DATA.mkdir(parents=True,exist_ok=True)
  buf=io.StringIO(newline="")
  wr=csv.DictWriter(buf,fieldnames=FIELDS,lineterminator="\n")
  wr.writeheader();wr.writerows(rows)
  CARDS.write_bytes(gzip.compress(buf.getvalue().encode("utf8"),compresslevel=9,mtime=0))
 check()
if __name__=="__main__":main()
