#!/usr/bin/env python3
"""Fail-closed 2000 Score Football Set Factory generator."""
import argparse,csv,json,re,urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/"data/set-factory/2000-score-football.bundle.json"
OUT=ROOT/"data/set-factory/2000-score-football.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory research import)","Accept":"text/html,application/xhtml+xml"}
CARD_NO=re.compile(r"^[A-Z0-9]{1,7}(?:\s+\d{1,3}|[-/][A-Z0-9]{1,7}){0,2}$",re.I)
NOTES={"RC","ROO","SP","PR500","UER","ERR","COR","VAR","SN","AU","AUTO","AUT","PRO","AP"}
TAIL=re.compile(r"^(.+?)\s+(RC|ROO|SP|PR500|UER|ERR|COR|VAR|SN\d+|AU|AUTO|AUT|AP)(?=\s|,|$)",re.I)

class CardRows(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None;self.card_link=False
 def handle_starttag(self,tag,attrs):
  if tag=="tr":self.row=[];self.card_link=False
  elif tag=="td" and self.row is not None:self.cell=[]
  elif tag=="a" and self.row is not None and any(k=="href" and "ViewCard.cfm" in (v or "") for k,v in attrs):self.card_link=True
 def handle_data(self,value):
  if self.cell is not None:self.cell.append(value)
 def handle_endtag(self,tag):
  if tag=="td" and self.cell is not None:self.row.append(" ".join("".join(self.cell).split()));self.cell=None
  elif tag=="tr" and self.row is not None:
   if self.row and self.card_link:self.rows.append(self.row)
   self.row=None

def clean_subject(source):
 text=" ".join(source.split()).strip()
 # Source annotation is removable only as a whitespace-delimited, whole token.
 # Never use endswith, rstrip or a substring search: preserve Boswell / Marshall.
 found=TAIL.match(text)
 if found:return found.group(1).strip(" ,;")
 return text

def get(url):
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=40) as response:return response.read().decode("utf-8","replace")
 except Exception as exc:raise SystemExit(f"TCDB source unavailable: {url}: {exc}; NO CSV written")

def collect(key,sid,expected,rookie=False):
 cards={};issues=[]
 for page in range(1,9):
  route="Rookies" if rookie else "Checklist"
  url=f"https://www.tcdb.com/{route}.cfm/sid/{sid}/2000-Score?PageIndex={page}"
  page_rows=CardRows();page_rows.feed(get(url));parsed=0;added=0
  for row in page_rows.rows:
   fields=[v.strip() for v in row if v.strip()]
   for i,value in enumerate(fields):
    if not CARD_NO.fullmatch(value) or i+1>=len(fields):continue
    if (rookie or key in ("base","final-score","scorecard")) and (not value.isdecimal() or not 1<=int(value)<=330):continue
    subject=clean_subject(fields[i+1])
    if not subject:continue
    team=fields[-1] if i+2<len(fields) else ""
    if team==fields[i+1]:team=""
    cardno=re.sub(r"\s+","",value).upper()
    parsed+=1
    prior=cards.get(cardno)
    if prior and prior!=(subject,team):issues.append(f"{key} #{cardno}: {prior!r} vs {(subject,team)!r}")
    if not prior:cards[cardno]=(subject,team);added+=1
    break
  print(f"{key} page {page}: {parsed} rows, +{added}; {len(cards)}/{expected}",flush=True)
  if len(cards)>=expected:break
  if page>1 and not parsed:break
 if len(cards)!=expected:issues.append(f"{key}: expected {expected} cards; received {len(cards)}")
 if key in ("base","final-score","scorecard"):
  missing={str(n) for n in range(1,331)}-set(cards)
  if missing:issues.append(f"{key}: missing {sorted(missing,key=int)[:30]}")
 return cards,issues

def run():
 bundle=json.loads(BUNDLE.read_text(encoding="utf-8"));data={};issues=[]
 for pset in bundle["productSets"]:
  key=pset["key"];cards,errors=collect(key,pset["sourceSetId"],pset["expectedCards"])
  data[key]=cards;issues.extend(errors)
 rookies,errors=collect("rookies",4423,57,True);issues.extend(errors)
 for number,(subject,team) in rookies.items():
  if data["base"].get(number)!=(subject,team):issues.append(f"RC #{number}: {subject!r}/{team!r}, Base {data['base'].get(number)!r}")
 # TCDB may abbreviate subset flags differently in parallel sets; compare
 # canonical subjects, not extraneous SP/SN notation.
 for key in ("final-score","scorecard"):
  for number,subject_team in list(data[key].items()):
   base_identity=data["base"].get(number)
   # #115 uses a DP designation on Base but not on its parallels.
   # DP is a separate collector token, not part of Bledsoe's surname.
   if number=="115" and base_identity==("Drew Bledsoe DP","New England Patriots") and subject_team==("Drew Bledsoe","New England Patriots"):
    data[key][number]=base_identity
    print(f"{key} #115: normalized DP designation to Base")
    continue
   # #289 is listed with given name Daniel on Scorecard; Bubba is the
   # same Miami Hurricanes tight end. Standardize to the Base identity.
   if key=="scorecard" and number=="289" and base_identity==("Bubba Franks","Miami Hurricanes") and subject_team==("Daniel Franks","Miami Hurricanes"):
    data[key][number]=base_identity
    print("scorecard #289: normalized Daniel Franks to Bubba Franks")
    continue
   if base_identity!=subject_team:
    issues.append(f"{key} #{number}: identity differs from Base {subject_team!r} vs {base_identity!r}")
 if issues:
  print("=== ALL SOURCE DISCREPANCIES ===")
  for message in issues:print("  "+message)
  raise SystemExit(f"{len(issues)} discrepancies; NO CSV written")
 rows=[]
 for pset in bundle["productSets"]:
  key=pset["key"]
  for number,(subject,team) in data[key].items():
   if key=="base" and number in rookies:subject+=" RC"
   rows.append((key,number,subject,team,"",pset["name"] if key!="base" else ""))
 expected=sum(p["expectedCards"] for p in bundle["productSets"])
 if len(rows)!=expected or len({(x[0],x[1]) for x in rows})!=expected:
  raise SystemExit("Totals/card identities invalid; NO CSV written")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open("w",newline="",encoding="utf-8") as f:
  w=csv.writer(f,lineterminator="\n")
  w.writerow(("setKey","cardNumber","player","team","subset","variant"));w.writerows(rows)
 print(f"GENERATED {len(rows)} cards across {len(bundle['productSets'])} sets, 57 true Base rookies")
 print(f"CSV: {OUT}; status UNRELEASED")

def test():
 assert clean_subject("Ken Boswell")=="Ken Boswell"
 assert clean_subject("Ken Boswell LL")=="Ken Boswell LL"
 assert clean_subject("Marshall")=="Marshall"
 assert clean_subject("Tom Brady ROO, RC, SP")=="Tom Brady"
 assert clean_subject("Larry Johnson RC")=="Larry Johnson"
 assert clean_subject("John Hall")=="John Hall"
 assert CARD_NO.fullmatch("CP 1")
 assert CARD_NO.fullmatch("TM01")
 print("2000 Score offline self-tests passed")

if __name__=="__main__":
 parser=argparse.ArgumentParser();parser.add_argument("--self-test",action="store_true")
 options=parser.parse_args();test()
 if not options.self_test:run()
