#!/usr/bin/env python3
"""2001 Fleer Ultra Baseball Set Factory, audited against BCP and MyCardBatch."""
import argparse,csv,gzip,html,io,json,re,urllib.request
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data/set-factory"
BUNDLE=DATA/"2001-ultra-baseball.bundle.json"
CARDS=DATA/"2001-ultra-baseball.cards.csv.gz"
BCP="https://baseballcardpedia.com/index.php/2001_Ultra"
MCB="https://mycardbatch.com/checklists/fleer-ultra-2001-baseball"
PID="2001_Ultra_Baseball"
HEAD=("setKey","cardNumber","player","team","subset","variant")
COUNTS={"base":275,"gold-medallion":275,"platinum-medallion":275,
"platinum-rc-2001-fleer-platinum":5,
"decade-of-dominance":15,"decade-of-dominance-platinum":15,
"greatest-hits-of":10,"greatest-hits-of-platinum":10,
"power-plus":10,"power-plus-platinum":10,
"tomorrows-legends":15,"tomorrows-legends-platinum":15,
"fall-classics":37,"fall-classics-memorabilia":26,"fall-classics-memorabilia-autograph":9}
INS=[("decade-of-dominance","Decade_of_Dominance","Decade of Dominance","DD",15,"1:8"),
("greatest-hits-of","Greatest_Hits_Of...","Greatest Hits","GH",10,"1:12"),
("power-plus","Power_Plus","Power Plus","PP",10,"1:24"),
("tomorrows-legends","Tomorrow's_Legends","Tomorrow s Legends","TL",15,"1:4")]
EX={39:("Bob Abreu","Bobby Abreu","Bobby Abreu"),47:("Dave Justice","David Justice","David Justice"),70:("Bob Higginson","Bobby Higginson","Bobby Higginson"),270:("Timo Perez","Timoniel Perez","Timo Perez")}
def get(url):
 req=urllib.request.Request(url,headers={"User-Agent":"Googlebot","Accept":"text/html,application/xhtml+xml","Referer":"https://www.google.com/"})
 with urllib.request.urlopen(req,timeout=35) as r: return r.read().decode("utf-8","replace")
def clean(x):return html.unescape(re.sub(r"<[^>]+>","",x)).strip()
def norm(x):return re.sub("[^a-z0-9]","",x.lower())
def section(s,id):
 h=re.search(r'<h[23][^>]*id="'+re.escape(id)+r'"',s)
 if not h:raise ValueError("Missing BCP "+id)
 u=re.search(r"<ul[^>]*>(.*?)</ul>",s[h.start():],re.S)
 if not u:raise ValueError("Missing list "+id)
 return [clean(v) for v in re.findall(r"<li[^>]*>(.*?)</li>",u.group(1),re.S)]
def nsplit(x):
 m=re.fullmatch(r"\s*(\d{1,3})\s+(.*?)\s*",x)
 if not m:raise ValueError("Bad numbered card "+x)
 return int(m[1]),m[2]
def mcb(s):
 block=re.search(r'<table class="ck-table" id="ck-table".*?<tbody>(.*?)</tbody>',s,re.S)
 if not block:raise ValueError("Missing independent base")
 rows=[]
 for x in re.findall(r"<tr>(.*?)</tr>",block.group(1),re.S):
  v=[clean(y) for y in re.findall(r"<td>(.*?)</td>",x,re.S)]
  if len(v)!=3:raise ValueError("Bad independent base entry")
  rows.append((int(v[0]),v[1],v[2]))
 groups={}
 for block in re.findall(r'<details class="ins">(.*?)</details>',s,re.S):
  title=re.search(r'<span class="ins-name">(.*?)</span>',block,re.S)
  if not title:continue
  name=clean(title[1])
  lines=[]
  for t in re.findall(r"<tr>(.*?)</tr>",block,re.S)[1:]:
   v=[clean(y) for y in re.findall(r"<td>(.*?)</td>",t,re.S)]
   if len(v)==3:lines.append(v)
  groups[name]=lines
 return rows,groups
def record(out,key,no,player,team,subset="",variant=""):
 if not player or not no:raise ValueError("Blank identity")
 out.append(dict(zip(HEAD,(key,str(no),player.strip(),(team or "").strip(),subset,variant))))
def generate():
 b=get(BCP);m=get(MCB)
 sources,mg=mcb(m)
 if len(sources)!=275 or [n for n,*_ in sources]!=list(range(1,276)):raise ValueError("MCB original 275 numbering")
 ib={n:(p,t) for n,p,t in sources}
 original=[]
 for label,count in (("Base_Set",225),("Dual-Player_Prospects",25),("Single-Player_Prospects",25)):
  lines=section(b,label)
  if len(lines)!=count:raise ValueError("BCP base count changed "+label)
  original.extend(nsplit(v) for v in lines)
 if [n for n,_ in original]!=list(range(1,276)):raise ValueError("BCP original 275 incomplete")
 out=[]
 for n,name in original:
  other,team=ib[n]
  if n in EX:
   if (name,other)!=EX[n][:2]:raise ValueError("Unreviewed source difference "+str(n))
   canonical=EX[n][2]
  elif norm(name)!=norm(other):raise ValueError("Original base mismatch "+str(n)+": "+name+"/"+other)
  else:canonical=other
  if not team:raise ValueError("Missing team in base "+str(n))
  sub="" if n<=225 else ("Dual-Player Prospects" if n<=250 else "Single-Player Prospects")
  var="Single-player prospect SP, one every four packs" if n>250 else ""
  if n in EX:var+=("; " if var else "")+"Published name discrepancy normalized"
  record(out,"base",n,canonical,team,sub,var)
  record(out,"gold-medallion",str(n)+"G",canonical,team,sub,
   "Original G-suffix Gold Medallion; "+("short-print single-player Prospects 1:24" if n>250 else "regular Gold Medallion one per pack"))
  record(out,"platinum-medallion",str(n)+"P",canonical,team,sub,
   "Original P-suffix Platinum Medallion; serial-numbered /"+str(25 if n>250 else 50))
 for key,heading,label,prefix,count,odds in INS:
  lines=section(b,heading)
  independent=mg.get(label,[])
  if len(lines)!=count or len(independent)!=count:raise ValueError("Insert count disagreement "+key)
  for i,(entry,ref) in enumerate(zip(lines,independent),1):
   n,rest=nsplit(entry)
   bp=re.sub("^"+prefix+r"\b\s*","",rest).strip()
   refno,player,team=ref
   if n!=i or re.sub(r"[^0-9]","",refno)!=str(i) or norm(bp)!=norm(player) or not team:
    raise ValueError("BCP/MCB insert identity disagreement "+key+" "+str(i))
   record(out,key,f"{i} {prefix}",player,team,key.replace("-"," ").title(),"Original numbered "+prefix+" issue")
 lines=section(b,"Fall_Classics");mr=mg.get("Fall Classics",[])
 if len(lines)!=37 or len(mr)!=37:raise ValueError("Fall Classics checklist count mismatch")
 clubs={}
 for i,(entry,ref) in enumerate(zip(lines,mr),1):
  n,rest=nsplit(entry);p=re.sub(r"^FC\b\s*","",rest).strip()
  refno,player,team=ref
  if n!=i or re.sub("[^0-9]","",refno)!=str(i) or norm(p)!=norm(player) or not team:
   raise ValueError("Fall Classics identity mismatch "+str(i))
  record(out,"fall-classics",f"{i} FC",player,team,"Fall Classics")
  clubs[norm(player)]=team
 for i,line in enumerate(section(b,"Fall_Classics_Memorabilia"),1):
  mm=re.fullmatch(r"(.+?)\s+(BAT|JSY|PANT)",line)
  if not mm:raise ValueError("Unknown original memorabilia "+line)
  p,material=mm.groups();team=clubs.get(norm(p))
  if not team:raise ValueError("Memorabilia missing verified Fall Classics team "+p)
  record(out,"fall-classics-memorabilia",f"FCM-{i:02d}",p,team,"Fall Classics Memorabilia",
   f"Original game-used {material}; FCM number is VCS registry identifier, not a printed card number")
 for i,line in enumerate(section(b,"Fall_Classics_Memorabilia_Autographed"),1):
  mm=re.fullmatch(r"(.+?)(?:\s+(EXCH|UER))?\s+(\d+)",line)
  if not mm:raise ValueError("Unparsed autograph cap "+line)
  p,annotation,cap=mm.groups();team=clubs.get(norm(p))
  if not team:raise ValueError("Autographed memorabilia identity not in Fall Classics "+p)
  note=f"Original signed game-used memorabilia, individual serial /{cap}; FCMA number is VCS-only registry identifier"
  if annotation:note+="; original issue annotation "+annotation
  record(out,"fall-classics-memorabilia-autograph",f"FCMA-{i:02d}",p,team,"Fall Classics Memorabilia Autograph",note)
 external=section(b,"Platinum_RC_Series")
 if len(external)!=5:raise ValueError("Later Platinum RC source count mismatch")
 for i,entry in enumerate(external,276):
  n,p=nsplit(entry)
  if n!=i or not p.endswith(" RC"):raise ValueError("Later Platinum RC source identity changed")
  record(out,"platinum-rc-2001-fleer-platinum",n,p[:-3],"","Platinum RC Series (2001 Fleer Platinum)",
   "Original Ultra-design continuation, only in 2001 Fleer Platinum packs; serial /1499; printed RC not automatically true RC for both subjects; team pending")
 expected={k:v for k,v in COUNTS.items() if not k.endswith("-platinum") or k=="platinum-medallion" or k=="platinum-rc-2001-fleer-platinum"}
 if Counter(r["setKey"] for r in out)!=Counter(expected):raise ValueError("Source counts wrong "+str(Counter(r["setKey"] for r in out)))
 if len(out)!=952 or len({(r["setKey"],r["cardNumber"]) for r in out})!=952:raise ValueError("Duplicate/missing collector item")
 return out
def manifest():
 def setdef(key,name,kind,notes,source=BCP,derived=None):
  x=dict(key=key,id=PID+"_"+key.replace("-","_"),name=name,kind=kind,
         expectedCards=COUNTS[key],oddsPerPack=None,sourceUrl=source,notes=notes)
  if derived:x.update(deriveCardsFrom=derived,derivedVariant="Original 2001 Ultra insert Platinum parallel; serial-numbered /10.")
  return x
 sets=[
 setdef("base","Base Set","BASE","Original 275 Ultra wax cards: 1-225 regular, 226-250 dual-player Prospects normal, 251-275 single-player Prospects SP 1:4. Platinum RC 276-280 were not Ultra wax."),
 setdef("gold-medallion","Gold Medallion","PARALLEL","Full original 275 G suffix. Gold 1G-250G standard one per pack; 251G-275G Prospects SP 1:24."),
 setdef("platinum-medallion","Platinum Medallion","PARALLEL","Full original 275 P suffix. 1P-250P /50, 251P-275P /25."),
 setdef("platinum-rc-2001-fleer-platinum","Platinum RC Series (Fleer Platinum Only)","INSERT","Five continuation cards #276-280 /1499 issued in later 2001 Fleer Platinum; excluded from Ultra wax.")
 ]
 for key,_,_,_,count,odds in INS:
  label=key.replace("-"," ").title()
  sets.append(setdef(key,label,"INSERT",f"Authentic numbered {count}-card checklist; original Ultra {odds} physical hobby rate. VCS odds null until format-aware collation."))
  sets.append(setdef(key+"-platinum",label+" Platinum","PARALLEL",f"Authentic {count}-card serial /10 insert Platinum parallel; same printed insert numbers.",derived=key))
 sets.extend([
 setdef("fall-classics","Fall Classics","INSERT","37 numbered FC cards, original pack rate 1:20."),
 setdef("fall-classics-memorabilia","Fall Classics Memorabilia","INSERT","26 physical subjects; game-used BAT/JSY/PANT materials. Hobby 1:144, retail 1:576, no invented single-rate odds."),
 setdef("fall-classics-memorabilia-autograph","Fall Classics Memorabilia Autograph","INSERT","Nine original autographed memorabilia subjects, individually distinct serial caps.")
 ])
 if {x["key"]:x["expectedCards"] for x in sets}!=COUNTS:raise ValueError("Manifest group count mismatch")
 return dict(schemaVersion=2,status="DRAFT",source={"BCP":BCP,"independentMCB":MCB,
 "TCDB":"https://www.tcdb.com/ViewSet.cfm/sid/1505/2001-Ultra",
 "TCDBInserts":"https://www.tcdb.com/Inserts.cfm/sid/1505/2001-Ultra"},
 decisions={
 "verified":"Two original full 275-card BCP/MCB lists independently reconciled, plus five complete original numbered insert lists and corresponding teams.",
 "names":"Four reviewed variants #39 Bobby Abreu, #47 David Justice, #70 Bobby Higginson and #270 Timo Perez.",
 "baseShortPrint":"Only single-player Prospects #251-275 were SP, one every four packs; 226-250 duals were regular.",
 "medallions":"Original 275 Gold G suffix (251G-275G SP 1:24); 275 Platinum P suffix 1P-250P /50, 251P-275P /25.",
 "inserts":"Four numbered insert groups total 50; corresponding true Platinum /10 variants total 50; Fall Classics 37, 26 game-used, nine signed memorabilia.",
 "platinumRC":"Five /1499 cards #276-280 were in 2001 Fleer Platinum, not original Ultra; isolated outside base checklist; two-player printed RC never proves both individual true rookies.",
 "sharedPrograms":"2001 Fleer Autographics, Feel the Game and Season Pass span multiple Fleer brands; omit until individual Ultra-channel checklists and allocation are verified.",
 "collation":"10 cards/hobby pack, 24 packs/box; guaranteed Gold, range-specific SP, serialed, cross-product exclusions and hobby/retail split cannot all be represented by single oddsPerPack integer. Null rather than fabricated odds.",
 "design":"No scans, cards, relic images, logos, autographs or pack art invented; released false until original imagery, prices and odds reviewed."
 },product=dict(id=PID,year=2001,brand="Ultra",sport="Baseball",cardsPerPack=10,packsPerBox=24,
 packPriceCents=0,autoPackPricing=True,packImageUrl=None,boxImageUrl=None,released=False),
 review=dict(teamData="PENDING",checklists="VERIFIED_BCP_MCB",trueRookies="PENDING",
 cardImages="PENDING",packImage="PENDING",pricing="PENDING",collation="BLOCKED_FORMAT_SPECIFIC",release="UNRELEASED"),
 cardsFile=CARDS.name,productSets=sets)
def check():
 b=json.loads(BUNDLE.read_text("utf8"))
 if b["schemaVersion"]!=2 or b["status"]!="DRAFT" or b["product"]["released"] is not False:raise ValueError("Draft safety gate")
 if b["product"]["id"]!=PID or {x["key"]:x["expectedCards"] for x in b["productSets"]}!=COUNTS:raise ValueError("Manifest count issue")
 if any(x["oddsPerPack"] is not None for x in b["productSets"]):raise ValueError("Unsupported physical odds")
 with gzip.open(CARDS,"rt",encoding="utf8",newline="") as f:rs=list(csv.DictReader(f))
 if len(rs)!=952 or len({(r["setKey"],r["cardNumber"]) for r in rs})!=952:raise ValueError("Source csv duplicate or invalid")
 base={int(r["cardNumber"]):r for r in rs if r["setKey"]=="base"}
 if set(base)!=set(range(1,276)):raise ValueError("Base numbering invalid")
 for n,name in ((1,"Pedro Martinez"),(39,"Bobby Abreu"),(47,"David Justice"),(70,"Bobby Higginson"),(251,"Barry Zito"),(270,"Timo Perez"),(275,"Alfonso Soriano")):
  if norm(base[n]["player"])!=norm(name):raise ValueError(f"Anchor #{n}: {base[n]['player']}")
 for key,suffix in (("gold-medallion","G"),("platinum-medallion","P")):
  if {x["cardNumber"] for x in rs if x["setKey"]==key}!={f"{n}{suffix}" for n in range(1,276)}:raise ValueError("Medallion original suffix wrong")
 if sum(COUNTS.values())!=1002:raise ValueError("Incorrect full collector count")
 print("PASS 2001 Ultra: 275 base, 275 Gold, 275 Platinum, 50 numbered inserts + 50 Platinum /10, 37 Fall Classics, 26 game-used, nine autos, five later Platinum-only cards = 1,002")
 print("PASS 15 groups, 952 source rows + 50 derived, original numbers/teams/source discrepancies verified")
 print("PASS DRAFT unreleased; no fictional pack odds; five Platinum-only teams pending")
def main():
 parser=argparse.ArgumentParser();parser.add_argument("--check",action="store_true")
 a=parser.parse_args()
 if not a.check:
  rows=generate();DATA.mkdir(parents=True,exist_ok=True)
  stream=io.StringIO(newline="");w=csv.DictWriter(stream,HEAD,lineterminator="\n");w.writeheader();w.writerows(rows)
  CARDS.write_bytes(gzip.compress(stream.getvalue().encode("utf8"),mtime=0,compresslevel=9))
  BUNDLE.write_text(json.dumps(manifest(),ensure_ascii=False,indent=2)+"\n",encoding="utf8")
 check()
if __name__=="__main__":main()
