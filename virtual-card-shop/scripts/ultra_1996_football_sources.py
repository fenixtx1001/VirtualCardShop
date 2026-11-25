#!/usr/bin/env python3
"""Authentic 1996 Fleer Ultra Football checklists, reconciled MCB / TCDB.

Original 200-card TCDB base = 198 numbered cards from MyCardBatch plus TWO
real, unnumbered physical checklists that MCB omits.  Five original inserts
and separate three-card promo sheet/single formats. No invented parallels.
"""
import html,re,urllib.request
from collections import Counter
MCB="https://mycardbatch.com/checklists/fleer-ultra-1996-football"
TCDB="https://www.tcdb.com/ViewSet.cfm/sid/3875/1996-Ultra"
TCDB_CHECKLIST="https://www.tcdb.com/Checklist.cfm/sid/3875/1996-Ultra"
TCDB_INSERTS="https://www.tcdb.com/Inserts.cfm/sid/3875/1996-Ultra"
BECKETT="https://www.beckett.com/football/1996/ultra/"
PID="1996_Ultra_Football"
# TCDB printed base counts 200 (198 individually numbered cards and two NNO
# checklists), confirmed via TCDB page two after #198 David Palmer.
INSERTS={
 "All Rookies":10,
 "Mr Momentum":20,
 "Pulsating":10,
 "Sledgehammer":10,
 "Ultra Rookies":30,
}
PROMOS={"Sample Sheet Singles":3}
COUNTS={
 "base":200,
 "all-rookies":10,
 "mr-momentum":20,
 "pulsating":10,
 "sledgehammer":10,
 "ultra-rookies":30,
 "sample-sheet-singles":3,
 "dealer-promo-sheet":1,
}
assert sum(COUNTS.values())==284 and len(COUNTS)==8
NNO=[
 ("NNO-1","Checklist: 1-144","Original unnumbered checklist covering #1-144"),
 ("NNO-2","Checklist: 145-200 and Inserts","Original unnumbered checklist covering #145-200 and inserts")
]
def clean(s):return html.unescape(re.sub(r"<[^>]+>","",s)).strip()
def slug(s):return re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-")
def fetch():
 req=urllib.request.Request(MCB,headers={
 "User-Agent":"Googlebot","Accept":"text/html,application/xhtml+xml","Referer":"https://www.google.com/"})
 with urllib.request.urlopen(req,timeout=40) as resp:
  if resp.status!=200:raise ValueError("Checklist source HTTP failure")
  return resp.read().decode("utf8","replace")
def tables(doc):
 m=re.search(r'<table class="ck-table" id="ck-table".*?<tbody>(.*?)</tbody>',doc,re.S)
 if not m:raise ValueError("Original numbered base checklist missing")
 def parse(fragment):
  out=[]
  for row in re.findall(r"<tr[^>]*>(.*?)</tr>",fragment,re.S):
   cells=[clean(x) for x in re.findall(r"<td[^>]*>(.*?)</td>",row,re.S)]
   if len(cells)==3:out.append(cells)
  return out
 base=parse(m[1]);groups={}
 for detail in re.findall(r'<details class="ins">(.*?)</details>',doc,re.S):
  title=re.search(r'<span class="ins-name">(.*?)</span>',detail,re.S)
  if title:
   data=re.findall(r"<tr[^>]*>(.*?)</tr>",detail,re.S)[1:]
   groups[clean(title[1])]=parse("".join("<tr>"+x+"</tr>" for x in data))
 return base,groups
def source_info(group):
 return {
 "base":"1996 original 12-card packs: one 200-card issue including two unnumbered checklists; separately enumerated Rookie/Flash Impact/Seasoned Winners subsets",
 "all-rookies":"Authentic die-cut insert; published TCDB odds 1:180 packs",
 "mr-momentum":"Original insert; published TCDB odds 1:10 packs",
 "pulsating":"Original insert; published TCDB odds 1:20 packs",
 "sledgehammer":"Hobby ONLY; original published TCDB odds 1:15 Hobby packs",
 "ultra-rookies":"Original insert; published TCDB odds 1:3 packs; separate rookie inserts, not base RCs",
 "sample-sheet-singles":"Three separate dealer promotion singles, never issued in wax packs",
 "dealer-promo-sheet":"One original dealer promotional three-up sheet, printed S1 / S2 / S3; never pack-issued",
 }[group]
def audit_source():
 base,groups=tables(fetch())
 if len(base)!=198 or {k:len(x) for k,x in groups.items()}!={**INSERTS,**PROMOS}:
  raise ValueError("Original 198 numbered base/insert families have changed; stop")
 out=[]
 def add(key,no,name,team,subset,note):
  if not no or not name or (not team and not (key=="base" and no in ("NNO-1","NNO-2"))):
   raise ValueError("Incomplete authentic card identity "+str((key,no,name,team)))
  out.append(dict(setKey=key,cardNumber=str(no),player=name,team=team,subset=subset,variant=note))
 for i,(no,original,team) in enumerate(base,1):
  if no!=str(i) or not original or not team:raise ValueError("Missing original numbered base card #"+str(i))
  suf=re.search(r"\s+(RC|FI|SW)$",original)
  name=re.sub(r"\s+(?:RC|FI|SW)$","",original)
  if suf:
   subset={"RC":"1996 Rookies","FI":"Flash Impact","SW":"Seasoned Winners"}[suf[1]]
  else:subset="Base"
  if i in range(164,179) and subset!="1996 Rookies":raise ValueError("Rookies 164-178 source suffix changed")
  if i in range(179,189) and subset!="Flash Impact":raise ValueError("Flash Impact numbering changed")
  if i in range(189,199) and subset!="Seasoned Winners":raise ValueError("Seasoned Winners numbering changed")
  note=source_info("base")+"; physical printed #"+str(i)+"; "+subset
  if suf and suf[1]=="RC":note+="; source-designated true rookie status"
  add("base",no,name,team,subset,note)
 for no,name,note in NNO:
  # TCDB authentic printed # is NNO for both; distinguish the physical
  # cards with safe VCS internal suffixes so neither record is overwritten.
  add("base",no,name,"","Original NNO Checklist",
      note+"; authentic printed number NNO; NNO-1/2 are internal VCS identities, not fabricated numbering")
 for original,n in INSERTS.items():
  key=slug(original);group=groups[original]
  for i,(no,name,team) in enumerate(group,1):
   if no!=str(i) or not name or not team:raise ValueError("Original insert printed number/name/team altered "+str((key,i,no,name,team)))
   add(key,no,name,team,original,source_info(key))
 for i,(no,name,team) in enumerate(groups["Sample Sheet Singles"],1):
  if no!="S"+str(i):raise ValueError("Original promo sample S1-S3 numbering changed")
  add("sample-sheet-singles",no,name,team,"Dealer Promo",source_info("sample-sheet-singles"))
 # TCDB confirms dealer sheet S1/S2/S3, with team affiliations matching
 # the three original singles, which can each be collected independently.
 sheet=groups["Sample Sheet Singles"]
 add("dealer-promo-sheet","S1 / S2 / S3"," / ".join(r[1] for r in sheet),
     " / ".join(r[2] for r in sheet),"Dealer Three-up Promo Sheet",source_info("dealer-promo-sheet"))
 if Counter(r["setKey"] for r in out)!=Counter(COUNTS):
  raise ValueError("Original 8 collector groups incomplete")
 if len({(r["setKey"],r["cardNumber"]) for r in out})!=len(out):
  raise ValueError("Duplicate physical collector keys")
 if len(out)!=284:raise ValueError("Original total 284 changed")
 return out
