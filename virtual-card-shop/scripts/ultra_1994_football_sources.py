#!/usr/bin/env python3
"""Crosschecked collector checklist data for 1994 Fleer Ultra Football.

Sources:
  TCDB 1994 Ultra (base=525, 12 actual inserts, one Rick Mirer promo)
  MyCardBatch 525-item original base table and 12 complete insert tables.
No fabricated variants/print runs/pull rates.
"""
import re,html,urllib.request
from collections import Counter
MCB="https://mycardbatch.com/checklists/fleer-ultra-1994-football"
TCDB="https://www.tcdb.com/ViewSet.cfm/sid/3466/1994-Ultra"
TCDB_INSERTS="https://www.tcdb.com/Inserts.cfm/sid/3466/1994-Ultra"
PID="1994_Ultra_Football"
# Checked separately against the original TCDB /Inserts.cfm and 12 TCDB
# /Checklist.cfm pages. TCDB IDs are per original printed insert.
GROUPS=[
 ("second-year-standouts","2nd Year Standouts",15,3474),
 ("award-winners","Award Winners",5,3468),
 ("first-rounders","First Rounders",20,3469),
 ("flair-hot-numbers","Flair Hot Numbers",15,3470),
 ("flair-scoring-power","Flair Scoring Power",6,3471),
 ("flair-wave-of-the-future","Flair Wave of the Future",6,3472),
 ("rick-mirer-rookie-of-the-year","Rick Mirer Rookie of the Year",12,3473),
 ("rick-mirer-rookie-of-the-year-autographed","Rick Mirer Rookie of the Year Autographed",8,33824),
 ("touchdown-kings","Touchdown Kings",9,3476),
 ("ultra-achievement-awards","Ultra Achievement Awards",10,3467),
 ("ultra-achievement-awards-jumbo","Ultra Achievement Awards Jumbo",10,33823),
 ("ultra-stars","Ultra Stars",9,3475)
]
EXPECTED={"base":525,**{key:count for key,_,count,_ in GROUPS},"rick-mirer-promo":1}
assert len(GROUPS)==12 and len(EXPECTED)==14 and sum(EXPECTED.values())==651

def clean(s):
 return html.unescape(re.sub(r"<[^>]*>","",s)).strip()
def fetch():
 request=urllib.request.Request(MCB,headers={
  "User-Agent":"Googlebot","Accept":"text/html,application/xhtml+xml","Referer":"https://www.google.com/"})
 with urllib.request.urlopen(request,timeout=40) as r:
  if r.status!=200:raise ValueError("MCB source unavailable")
  return r.read().decode("utf-8","replace")
def extract_tables(doc):
 base=re.search(r'<table class="ck-table" id="ck-table".*?<tbody>(.*?)</tbody>',doc,re.S)
 if not base:raise ValueError("Missing MCB original base table")
 def parse(raw):
  out=[]
  for tr in re.findall(r"<tr[^>]*>(.*?)</tr>",raw,re.S):
   td=[clean(t) for t in re.findall(r"<td[^>]*>(.*?)</td>",tr,re.S)]
   if len(td)==3:out.append(td)
  return out
 b=parse(base[1]);groups={}
 for block in re.findall(r'<details class="ins">(.*?)</details>',doc,re.S):
  name=re.search(r'<span class="ins-name">(.*?)</span>',block,re.S)
  if name:
   data=re.findall(r"<tr[^>]*>(.*?)</tr>",block,re.S)[1:]
   groups[clean(name[1])]=parse("".join("<tr>"+d+"</tr>" for d in data))
 return b,groups
def provenance(group,num):
 n=int(num)
 if group=="base":return "Series I" if n<=325 else "Series II"
 if group.startswith("flair-"):return "Series II packs (TCDB)"
 if group=="rick-mirer-rookie-of-the-year":
  return "Original mail-in wrapper exchange; NOT PACK-ISSUED" if n in (11,12) else "Original pack insert; TCDB"
 if group=="rick-mirer-rookie-of-the-year-autographed":
  return "Original autograph with Fleer embossed symbol; randomly inserted in packs according to TCDB"
 if group=="touchdown-kings":return "Original foil packs only; TCDB"
 if group=="ultra-stars":return "Original jumbo packs only; TCDB"
 if group=="ultra-achievement-awards-jumbo":return 'Oversized 3.5x5 card, one per Hobby CASE; not regular pack card'
 if group=="rick-mirer-promo":return "Official original pre-release promo; NOT ISSUED IN PACKS"
 return "Original random pack insert; exact Series and odds not independently confirmed"
def group_label(group):
 if group=="base":return "Base Set"
 if group=="rick-mirer-promo":return "Rick Mirer Promotional Sample"
 return next(label for key,label,count,tcdb_id in GROUPS if key==group)
def audit_source():
 b,groups=extract_tables(fetch())
 if len(b)!=525 or {name:len(cards) for name,cards in groups.items()}!={name:n for _,name,n,_ in GROUPS}:
  raise ValueError("Independent source count changed; stop")
 out=[]
 def add(group,no,player,team,subset,variant):
  if not no or not player:raise ValueError(f"Missing original printed subject {group}/{no}")
  if not team and not (group=="base" and int(no) in (320,325)):
   raise ValueError(f"Missing original printed team {group}/{no}")
  out.append({"setKey":group,"cardNumber":str(no),"player":player,
              "team":team,"subset":subset,"variant":variant})
 for i,record in enumerate(b,1):
  number,rawname,team=record
  if str(i)!=number:raise ValueError(f"Original 525 base numbering mismatch: #{i}: {record}")
  if i in (320,325):
   if team or not (rawname=="NFL 75th Anniversary" if i==320 else rawname.startswith("Checklist")):
    raise ValueError("Printed non-player/blank team identity changed "+str(record))
  elif not team:raise ValueError("Unexpected empty source team "+number)
  cleanname=re.sub(r"\s+RC$","",rawname)
  if 321<=i<=325 or 523<=i<=525:kind="Physical Checklist"
  elif i==320:kind="NFL 75th Anniversary (non-player)"
  elif rawname.endswith(" RC"):kind="Rookie (source-designated)"
  else:kind="Base"
  note=provenance("base",number)+"; original printed collector card number; "+kind
  if rawname.endswith(" RC"):note+="; original MCB rookie designation"
  add("base",number,cleanname,team,kind,note)
 for key,label,count,tcdbid in GROUPS:
  source=groups[label]
  if len(source)!=count:raise ValueError("Insert length mismatch "+label)
  seen=set()
  for index,(number,player,team) in enumerate(source,1):
   if not number.isdecimal() or int(number)<1 or int(number)>count+5:
    raise ValueError("Unexpected TCDB insert numbering "+str((label,number)))
   if number in seen:raise ValueError("Duplicate authentic insert number "+str((label,number)))
   seen.add(number)
   if key not in ("rick-mirer-rookie-of-the-year-autographed",) and int(number)!=index:
    raise ValueError("Unexpected numbered source order "+str((label,index,number)))
   if not player or not team:raise ValueError("Invalid original insert player/team "+str((label,number)))
   if key in ("rick-mirer-rookie-of-the-year","rick-mirer-rookie-of-the-year-autographed") and player!="Rick Mirer":
    raise ValueError("Original Mirer subject mismatch")
   note=provenance(key,number)+"; catalog crosschecked against TCDB "+str(tcdbid)
   if key=="first-rounders" and int(number)==17:
    note+="; TCDB notes original DeWayne misspelling (Dewayne Washington)"
   if key=="rick-mirer-rookie-of-the-year-autographed":note+="; authentic autograph variant, not base card"
   if key=="ultra-achievement-awards-jumbo":note+="; genuine oversized variant, not foil/base parallel"
   add(key,number,player,team,label,note)
  if key=="rick-mirer-rookie-of-the-year-autographed" and seen!={"2","4","5","6","8","9","11","12"}:
   raise ValueError("Unreviewed eight-card authentic Mirer auto list")
 # TCDB /Inserts.cfm lists one Rick Mirer PROMO #1 as separate parent-set promo.
 # Source roster confirmed (printed #1, Rick Mirer, Seattle Seahawks).
 add("rick-mirer-promo","1","Rick Mirer","Seattle Seahawks",
     "Promotional Sample","TCDB parent-set promo #1; outside 650-card pack+insert checklist; NOT pack issued")
 result=Counter(x["setKey"] for x in out)
 if result!=Counter(EXPECTED):raise ValueError("Original source group totals altered "+str(result))
 if len({(x["setKey"],x["cardNumber"]) for x in out})!=len(out):
  raise ValueError("Duplicate collector card keys")
 if len(out)!=651:raise ValueError("650 base and insert plus one promo not accounted")
 return out
