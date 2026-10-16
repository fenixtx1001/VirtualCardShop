#!/usr/bin/env python3
"""1992-93 Topps Hockey Set Factory; fail closed on partial source data."""
from __future__ import annotations
import argparse
import csv
import re
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/set-factory/1992-93-topps-hockey.cards.csv"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; VCS Set Factory research import)",
           "Accept": "text/html,application/xhtml+xml"}
EXPECTED_ROOKIES = {"50","67","88","112","372","373","426","514","516","517"}
META = re.compile(r"\s+(?:UER|ERR|COR|VAR|RC)(?:\b|(?=[A-Z])|[,;:])", re.I)
SUBSET = re.compile(r"\s+(HL|SR|CL|AS|LL|TC|PB|DP)\s*$", re.I)

class Rows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows=[];self.row=None;self.cell=None
    def handle_starttag(self, tag, attrs):
        if tag=="tr":self.row=[]
        elif tag=="td" and self.row is not None:self.cell=[]
    def handle_data(self, data):
        if self.cell is not None:self.cell.append(data)
    def handle_endtag(self, tag):
        if tag=="td" and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()));self.cell=None
        elif tag=="tr" and self.row is not None:
            if self.row:self.rows.append(self.row)
            self.row=None

def fetch(url):
    try:
        req=urllib.request.Request(url,headers=HEADERS)
        with urllib.request.urlopen(req,timeout=35) as response:
            return response.read().decode("utf-8",errors="replace")
    except Exception as exc:
        raise SystemExit(f"TCDB access failed: {url}: {exc}; NO CSV written")

def clean(raw):
    result=" ".join(raw.split()).strip()
    m=META.search(result)
    if m:result=result[:m.start()].strip(" ,;")
    if not result:raise SystemExit(f"Missing subject in {raw!r}")
    return result

def read(sid,label,expected):
    cards={}
    for page in range(1,9):
        url=f"https://www.tcdb.com/Checklist.cfm/sid/{sid}/1992-93-Topps?PageIndex={page}"
        parser=Rows();parser.feed(fetch(url))
        count=0
        for row in parser.rows:
            vals=[v.strip() for v in row if v.strip()]
            for i,val in enumerate(vals):
                if not re.fullmatch(r"\d{1,3}",val) or i+1>=len(vals):continue
                number=int(val)
                if not 1<=number<=529:continue
                raw=vals[i+1]
                if raw.lower() in ("edit","add","options"):continue
                name=clean(raw)
                team=vals[-1] if i+2<len(vals) else ""
                if team==raw:team=""
                card=(name,team,raw)
                if number in cards and cards[number][:2]!=card[:2]:
                    raise SystemExit(f"{label} duplicate conflicting #{number}; NO CSV written")
                if number not in cards:count+=1;cards[number]=card
                break
        print(f"{label} page {page}: +{count}; {len(cards)}/{expected}",flush=True)
        if len(cards)==expected:break
        if page>1 and count==0:break
    if set(cards)!=set(range(1,expected+1)):
        missing=sorted(set(range(1,expected+1))-set(cards))
        raise SystemExit(f"{label} incomplete; got {len(cards)}/{expected}; missing {missing[:20]}; NO CSV written")
    return cards

def rookies():
    parser=Rows()
    parser.feed(fetch("https://www.tcdb.com/Rookies.cfm/sid/4919/1992-93-Topps"))
    found={}
    for row in parser.rows:
        vals=[v.strip() for v in row if v.strip()]
        for i,val in enumerate(vals):
            if val not in EXPECTED_ROOKIES or i+1>=len(vals):continue
            found[val]=clean(vals[i+1]);break
    if set(found)!=EXPECTED_ROOKIES:
        raise SystemExit(f"Rookie index incomplete: {sorted(found)}; NO CSV written")
    return found

def main():
    base=read(4919,"base",529)
    gold=read(48461,"gold",529)
    rookie=rookies()
    issues=[]
    for n in range(1,530):
        bname,bteam,_=base[n];gname,gteam,_=gold[n]
        if n not in range(525,529) and (bname,bteam)!=(gname,gteam):
            issues.append(f"#{n}: Base {bname!r}/{bteam!r} vs Gold {gname!r}/{gteam!r}")
        if n in range(525,529) and bname==gname:
            issues.append(f"#{n}: expected Gold replacement subject, got same name")
        if not bteam and "checklist" not in bname.lower():issues.append(f"Base #{n} missing team")
        if not gteam and "checklist" not in gname.lower():issues.append(f"Gold #{n} missing team")
        if str(n) in rookie and rookie[str(n)]!=bname:
            issues.append(f"RC #{n} {rookie[str(n)]!r} vs Base {bname!r}")
    if issues:
        print("=== ALL SOURCE DISCREPANCIES ===")
        for issue in issues:print("  "+issue)
        raise SystemExit(f"{len(issues)} issues; NO CSV written")
    rows=[]
    for key,cards in (("base",base),("gold",gold)):
        for n in range(1,530):
            name,team,raw=cards[n]
            variant="Gold" if key=="gold" else ""
            subset=""
            # Preserve printed subsets as metadata, not player-name suffixes.
            m=SUBSET.search(name)
            if m:
                subset=m.group(1).upper()
                name=name[:m.start()].strip()
            if key=="base" and str(n) in rookie:name+=" RC"
            if n==529:variant=(variant+"; " if variant else "")+"Factory Set Only"
            rows.append((key,str(n),name,team,subset,variant))
    if len(rows)!=1058 or len({(r[0],r[1]) for r in rows})!=1058:
        raise SystemExit("Invalid total or duplicate keys; NO CSV written")
    OUT.parent.mkdir(parents=True,exist_ok=True)
    with OUT.open("w",encoding="utf-8",newline="") as f:
        writer=csv.writer(f,lineterminator="\n")
        writer.writerow(["setKey","cardNumber","player","team","subset","variant"])
        writer.writerows(rows)
    print(f"GENERATED: {len(rows)} cards; Base 529; Gold 529; true RCs 10")
    print(f"CSV: {OUT}")
    print("UNRELEASED: #529 factory-only pack exclusion must be implemented before release.")

def self_test():
    assert clean("Brett Hull UER Home: location incorrect")=="Brett Hull"
    assert clean("Todd Nelson RC")=="Todd Nelson"
    assert len(EXPECTED_ROOKIES)==10
    print("1992-93 Topps offline tests passed")

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--self-test",action="store_true")
    args=parser.parse_args()
    self_test()
    if not args.self_test:main()
