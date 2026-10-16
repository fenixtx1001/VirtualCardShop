#!/usr/bin/env python3
"""1984 Topps Football Set Factory: source-verified, atomic, unreleased draft."""
from __future__ import annotations
import argparse,csv,re,urllib.request
from html.parser import HTMLParser
from pathlib import Path

OUT=Path(__file__).resolve().parents[1]/"data/set-factory/1984-topps-football.cards.csv"
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; VCS Set Factory research import)","Accept":"text/html,application/xhtml+xml"}
SOURCES=(("base",3235,396),("glossy-nfl-stars",33400,11),("super-play-game-cards",33401,27))
ROOKIE_EXPECTED=60
ANNOTATION=re.compile(r"\s+(?:UER|ERR|COR|VAR|RC)(?=\b|[A-Z]|[,;:])",re.I)
SHORT_TAGS=re.compile(r"\s+(?:PB|IR|TL|LL|RB|CCG|SBXVIII)\s*$",re.I)
NUMBER=re.compile(r"^(\d{1,3})(?:[a-z])?$",re.I)

class Rows(HTMLParser):
    def __init__(self):
        super().__init__();self.rows=[];self.row=None;self.cell=None
    def handle_starttag(self,tag,attrs):
        if tag=="tr":self.row=[]
        elif tag=="td" and self.row is not None:self.cell=[]
    def handle_data(self,data):
        if self.cell is not None:self.cell.append(data)
    def handle_endtag(self,tag):
        if tag=="td" and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()));self.cell=None
        elif tag=="tr" and self.row is not None:
            if self.row:self.rows.append(self.row)
            self.row=None

def fetch(url):
    try:
        request=urllib.request.Request(url,headers=HEADERS)
        with urllib.request.urlopen(request,timeout=35) as response:
            return response.read().decode("utf-8",errors="replace")
    except Exception as e:
        raise SystemExit(f"TCDB unavailable at {url}: {e}; NO CSV written") from e

def clean(raw):
    text=" ".join(raw.split()).strip()
    m=ANNOTATION.search(text)
    if m:text=text[:m.start()].strip(" ,;")
    if not text:raise SystemExit(f"Invalid subject {raw!r}; NO CSV written")
    return text

def parse_page(html,max_number):
    p=Rows();p.feed(html)
    result=[]
    for row in p.rows:
        values=[s.strip() for s in row if s.strip()]
        for i,v in enumerate(values):
            match=NUMBER.fullmatch(v)
            if not match or i+1>=len(values):continue
            n=int(match.group(1))
            if not 1<=n<=max_number:continue
            raw=values[i+1]
            if raw.lower() in ("edit","add","options"):continue
            team=values[-1] if i+2<len(values) else ""
            if team==raw:team=""
            result.append((n,clean(raw),team,raw))
            break
    return result

def collect(label,sid,expected,rookie=False):
    cards={};issues=[];source_rows=0
    for page in range(1,9):
        path="Rookies" if rookie else "Checklist"
        url=f"https://www.tcdb.com/{path}.cfm/sid/{sid}/1984-Topps?PageIndex={page}"
        rows=parse_page(fetch(url),396 if rookie else expected)
        source_rows+=len(rows)
        added=0
        for n,name,team,raw in rows:
            existing=cards.get(n)
            if existing and existing[:2]!=(name,team):
                issues.append(f"{label} #{n}: variants disagree: {existing[:2]!r} vs {(name,team)!r}")
            if not existing:
                cards[n]=(name,team,raw);added+=1
        print(f"{label} page {page}: {len(rows)} rows; +{added}; {len(cards)} unique",flush=True)
        if len(cards)==expected and (not rookie or page>=2):break
        if page>1 and not rows:break
    if len(cards)!=expected:
        issues.append(f"{label}: expected {expected} unique, found {len(cards)}")
    if not rookie:
        missing=set(range(1,expected+1))-set(cards)
        extra=set(cards)-set(range(1,expected+1))
        if missing or extra:issues.append(f"{label}: missing {sorted(missing)[:20]}, extra {sorted(extra)[:20]}")
    return cards,issues

def self_test():
    assert clean("Dan Marino PB, RC")=="Dan Marino PB"
    assert clean("Rohn Stark UER: birth date wrong")=="Rohn Stark"
    assert NUMBER.fullmatch("11a").group(1)=="11"
    print("1984 Topps Football self-tests passed")

def main():
    source={};issues=[]
    for key,sid,count in SOURCES:
        cards,problems=collect(key,sid,count)
        source[key]=cards;issues.extend(problems)
    rookies,problems=collect("rookies",3235,ROOKIE_EXPECTED,rookie=True)
    issues.extend(problems)
    for n,(name,team,raw) in rookies.items():
        base=source["base"].get(n)
        if not base or clean(name)!=clean(base[0]):
            issues.append(f"RC #{n}: {name!r} differs from Base {base!r}")
    for key,cards in source.items():
        for n,(name,team,raw) in cards.items():
            if not team and not (key=="base" and "checklist" in name.lower()):
                issues.append(f"{key} #{n}: missing team for {name!r}")
    if issues:
        print("=== ALL SOURCE DISCREPANCIES ===",flush=True)
        for issue in issues:print("  "+issue,flush=True)
        raise SystemExit(f"{len(issues)} issues; NO CSV written")
    rows=[]
    for key,_,count in SOURCES:
        for n in range(1,count+1):
            name,team,raw=source[key][n]
            subset=""
            if key=="base":
                m=SHORT_TAGS.search(name)
                if m:
                    subset=m.group(0).strip().upper();name=name[:m.start()].strip()
                if n in rookies:name+=" RC"
                if "checklist" in name.lower() and not team:team="NFL"
            if key=="super-play-game-cards":
                # Team is the collectible subject; printed play result is
                # preserved as subset to distinguish similar team cards.
                if team and raw.startswith(team):
                    play=raw[len(team):].strip()
                    if play:subset=play
                if not name:name=team
            variant="Glossy NFL Stars" if key=="glossy-nfl-stars" else ""
            rows.append((key,str(n),name,team,subset,variant))
    if len(rows)!=434 or len(set((r[0],r[1]) for r in rows))!=434:
        raise SystemExit("Total/identity check failed; NO CSV written")
    OUT.parent.mkdir(parents=True,exist_ok=True)
    with OUT.open("w",newline="",encoding="utf-8") as f:
        writer=csv.writer(f,lineterminator="\n")
        writer.writerow(("setKey","cardNumber","player","team","subset","variant"))
        writer.writerows(rows)
    print("=== 1984 TOPPS FOOTBALL GENERATED ===")
    print("Base: 396; Glossy NFL Stars: 11; Super Play Game Cards: 27")
    print("Total: 434; true Base RCs: 60")
    print(f"CSV: {OUT}; STATUS: UNRELEASED")

if __name__=="__main__":
    ap=argparse.ArgumentParser();ap.add_argument("--self-test",action="store_true")
    args=ap.parse_args();self_test()
    if not args.self_test:main()
