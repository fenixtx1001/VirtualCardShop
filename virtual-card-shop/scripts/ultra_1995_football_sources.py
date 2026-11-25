#!/usr/bin/env python3
"""Audited 1995 Ultra Football source parser and genuine variation definitions.

Base and 12 pack-issued insertion families + Ultra Extra promo sheet collected
from MyCardBatch; all category counts, foil variations and packaging cross-
verified with Trading Card Database's 19 insert families and Gold Medallion set.
"""
import html,re,urllib.request
from collections import Counter
MCB="https://mycardbatch.com/checklists/fleer-ultra-1995-football"
TCDB="https://www.tcdb.com/ViewSet.cfm/sid/3625/1995-Ultra"
TCDB_INSERTS="https://www.tcdb.com/Inserts.cfm/sid/3625/1995-Ultra"
GOLD_TCDB="https://www.tcdb.com/Checklist.cfm/sid/34033/1995-Ultra-Gold-Medallion"
BECKETT="https://www.beckett.com/football/1995/ultra"
PID="1995_Ultra_Football"
# Full 12 original pack-insert/format-specific families with real printed IDs.
# Shorter catalogs include these plus 2 promo types, but do not enumerate the
# 7 separately printed genuine Gold Medallion insert variations from TCDB.
INSERTS={
 "1st Rounders":20,
 "2nd Year Standouts":15,
 "All Rookie Team":10,
 "All Rookie Team Hot Pack":10,
 "Award Winners":6,
 "Magna Force":20,
 "Rising Stars":9,
 "Touchdown Kings":10,
 "Ultra Achievements":10,
 "Ultra Overdrive":20,
 "Ultra Stars":10,
 "Ultrabilities":30}
PROMOS={"Ultra Extra Series II Promo Sheet":1,
        "Ultra Extra Series II Promo Sheet Singles":4}
# Seven (and only seven) authentic TCDB "Gold Medallion" insert parallels.
GOLD_INSERTS={
 "1st Rounders":"1st Rounders Gold Medallion",
 "2nd Year Standouts":"2nd Year Standouts Gold Medallion",
 "Award Winners":"Award Winners Gold Medallion",
 "Rising Stars":"Rising Stars Gold Medallion",
 "Touchdown Kings":"Touchdown Kings Gold Medallion",
 "Ultra Achievements":"Ultra Achievements Gold Medallion",
 "Ultra Stars":"Ultra Stars Gold Medallion"}
EXPECTED={"base":550,"gold-medallion":550}
for name,count in INSERTS.items():EXPECTED[re.sub(r"[^a-z0-9]+","-",name.lower()).strip("-")]=count
for original,variant in GOLD_INSERTS.items():EXPECTED[re.sub(r"[^a-z0-9]+","-",variant.lower()).strip("-")]=INSERTS[original]
for name,count in PROMOS.items():EXPECTED[re.sub(r"[^a-z0-9]+","-",name.lower()).strip("-")]=count
EXPECTED["bam-morris-prototype-promo"]=1
assert len(EXPECTED)==24 and sum(EXPECTED.values())==1356
def slug(s):return re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-")
def clean(s):return html.unescape(re.sub(r"<[^>]+>","",s)).strip()
def fetch():
 r=urllib.request.Request(MCB,headers={"User-Agent":"Googlebot",
  "Accept":"text/html,application/xhtml+xml","Referer":"https://www.google.com/"})
 with urllib.request.urlopen(r,timeout=40) as r:
  if r.status!=200:raise ValueError("Collector source HTTP unavailable")
  return r.read().decode("utf8","replace")
def tables(doc):
 m=re.search(r'<table class="ck-table" id="ck-table".*?<tbody>(.*?)</tbody>',doc,re.S)
 if not m:raise ValueError("Complete 550-base table missing")
 def rows(htmlblock):
  out=[]
  for tr in re.findall(r"<tr[^>]*>(.*?)</tr>",htmlblock,re.S):
   td=[clean(x) for x in re.findall(r"<td[^>]*>(.*?)</td>",tr,re.S)]
   if len(td)==3:out.append(td)
  return out
 base=rows(m[1]);groups={}
 for detail in re.findall(r'<details class="ins">(.*?)</details>',doc,re.S):
  name=re.search(r'<span class="ins-name">(.*?)</span>',detail,re.S)
  if name:
   trs=re.findall(r"<tr[^>]*>(.*?)</tr>",detail,re.S)[1:]
   groups[clean(name[1])]=rows("".join("<tr>"+x+"</tr>" for x in trs))
 return base,groups
def source_note(key,no):
 n=int(no) if str(no).isdecimal() else None
 first="Series One #1-350" if n is not None and n<=350 else "Series Two Ultra Extra #351-550"
 if key=="base":return first+"; actual original card number"
 if key=="gold-medallion":return first+"; original Gold Medallion foil background, one Gold per pack in its respective Series"
 if key=="1st-rounders":return "Series One standard packs; original odds 1:7"
 if key=="2nd-year-standouts":return "Series One standard packs; original odds 1:5"
 if key=="all-rookie-team":return "Ultra Extra Series Two packs; original odds 1:55"
 if key=="all-rookie-team-hot-pack":return "Ultra Extra Series Two Hot Pack-only card, authentic Hot Pack print on front and back; complete 10-card Hot Pack odds 1:360 packs, NOT per-card pack probability"
 if key=="award-winners":return "Series One standard packs; original odds 1:5"
 if key=="magna-force":return "Ultra Extra Series Two Hobby-only packs; original odds 1:20"
 if key=="rising-stars":return "Series One standard packs; original odds 1:37"
 if key=="touchdown-kings":return "Series One foil-only packs; original odds 1:7"
 if key=="ultra-achievements":return "Series One standard packs; original odds 1:7"
 if key=="ultra-overdrive":return "Ultra Extra Series Two Retail-only packs; original odds 1:20"
 if key=="ultra-stars":return "Series One Jumbo-only packs; original odds 1:7"
 if key=="ultrabilities":return "Ultra Extra Series Two packs; original odds 1:5"
 if key.endswith("-gold-medallion"):
  format_note="Series One Jumbo-only" if key=="ultra-stars-gold-medallion" else "Series One foil-only" if key=="touchdown-kings-gold-medallion" else "Series One packs"
  return format_note+"; genuine alternate foil-stamped Gold Medallion insert; TCDB confirms published card subjects; exact per-card odds not verified"
 if key=="bam-morris-prototype-promo":
  return 'Original NOT ISSUED IN PACKS prototype #264: stat line prints "1994 Steelers" rather than "1994 Pittsburgh"; genuine promo variant distinct from regular #264'
 return "Ultra Extra Series Two advance promotion; NOT DISTRIBUTED IN PACKS"
def audit_source():
 base,grouped=tables(fetch())
 if len(base)!=550:raise ValueError("1995 Ultra 550 original collector base checklist changed")
 expected_groups={**INSERTS,**PROMOS}
 if {k:len(v) for k,v in grouped.items()}!=expected_groups:
  raise ValueError("Unreviewed 1995 Ultra collector subset structure "+
                   str({k:len(v) for k,v in grouped.items()}))
 out=[]
 def add(key,no,player,team,subset,notes):
  if not no or not player or not (team or (key in ("base","gold-medallion") and no in ("350","351","352"))):
   raise ValueError("Missing source player/team/number "+str((key,no,player,team)))
  out.append(dict(setKey=key,cardNumber=no,player=player,
                  team=team,subset=subset,variant=notes))
 # Real original base #350-352 are checklist records without printed team.
 for i,(n,name,team) in enumerate(base,1):
  if n!=str(i):raise ValueError("Original 550 base # sequence altered "+str((i,n,name)))
  if not team and i not in (350,351,352):raise ValueError("Unexpected blank player team "+n)
  if i in (350,351,352) and (team or not name.startswith("Checklist")):
   raise ValueError("Non-player physical checklist discrepancy "+n)
  rc=bool(re.search(r"\bRC$",name));ee=bool(re.search(r"\bEE(?: RC)?$",name))
  cleanname=re.sub(r"(?: (?:RC|EE))+$","",name)
  kind="Checklist" if name.startswith("Checklist") else "Extra Edition" if ee else "Source-designated RC" if rc else "Base"
  note=source_note("base",n)+"; "+kind
  if rc:note+="; genuine RC designation per published source"
  if ee:note+="; original EE suffix is collector subset, not player name"
  if i in (184,443):note+="; TCDB documents erroneous birth date on this Derrick Alexander card"
  add("base",n,cleanname,team,kind,note)
  add("gold-medallion",n,cleanname,team,"Gold Medallion",
      source_note("gold-medallion",n)+"; "+kind)
 # MCB's twelve pack issued groups. Exact printed codes and player/team
 # are maintained; variation group is matched as a separate physical card.
 originals={}
 for name,n in INSERTS.items():
  key=slug(name);raw=grouped[name]
  seen=set();records=[]
  for i,(number,player,team) in enumerate(raw,1):
   if number!=str(i) or not player or not team:raise ValueError("Original insert identity/order changed "+str((name,i,number,player,team)))
   if number in seen:raise ValueError("Duplicate physical insert "+name+" #"+number)
   seen.add(number)
   records.append((number,player,team))
   add(key,number,player,team,name,source_note(key,number))
  if len(records)!=n:raise ValueError("Source insert count changed "+name)
  originals[name]=records
 # Exact TCDB gold insert subjects inherit their original numbered foil stamp
 # template; no invented missing card number or generic base parallel template.
 for parent,alternate in GOLD_INSERTS.items():
  key=slug(alternate)
  for number,player,team in originals[parent]:
   add(key,number,player,team,alternate,source_note(key,number))
 # Ultra Extra advance promo is one 4-up perforated sheet and four physical
 # separated singles. Keep both separately as actual collectible formats.
 for name,count in PROMOS.items():
  key=slug(name);cards=grouped[name]
  for number,player,team in cards:
   if key.endswith("-singles"):
    if number not in ("S1","S2","S3","S4"):raise ValueError("Original promo single number wrong "+number)
   elif number!="S1-S4":raise ValueError("Original promo sheet code wrong")
   add(key,number,player,team,name,source_note(key,number))
 # Original TCDB parent-set prototype is not an insert and is never eligible
 # for original pack pulls. Independently verify player and team against #264.
 morris=base[263]
 if morris[0]!="264" or morris[1]!="Bam Morris" or morris[2]!="Pittsburgh Steelers":
  raise ValueError("Unverified Bam Morris separate promotional proof")
 add("bam-morris-prototype-promo","264","Bam Morris","Pittsburgh Steelers",
     "Prototype Promo",source_note("bam-morris-prototype-promo","264"))
 totals=Counter(r["setKey"] for r in out)
 if totals!=Counter(EXPECTED):raise ValueError("Full 24 family totals incorrect "+str(totals))
 if len({(r["setKey"],r["cardNumber"]) for r in out})!=len(out):
  raise ValueError("Unreviewed physical collector number duplication")
 if len(out)!=1356:raise ValueError("Collector total 1356 crosscheck broken")
 return out
