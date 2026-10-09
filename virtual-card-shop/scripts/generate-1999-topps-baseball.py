from __future__ import annotations
import csv
import re
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data/set-factory/1999-topps-baseball.cards.csv"
SETS = [
    ("base",1340,462),("all-matrix",11709,30),
    ("mystery-finest",11710,33),("mystery-finest-refractors",11711,33),
    ("autographs",11712,16),("hall-of-fame",11713,10),
    ("lords-of-diamond",11714,15),("mvp-promotion",11715,416),
    ("new-breed",11717,15),("ryan-reprints",1347,27),
    ("ryan-reprints-autographs",11725,27),("ryan-reprints-finest",1346,27),
    ("ryan-reprints-finest-refractors",11726,27),
    ("picture-perfect",11720,10),("power-brokers",11721,20),
    ("power-brokers-refractors",11722,20),
    ("record-numbers",11723,10),("record-numbers-gold",11724,10),
]
TAG = re.compile(r"\s+(?:RC|UER|ERR|COR|VAR|CL|ASR|HL|LL|TC|MGR|SN\d+)(?=$|[ ,;:])", re.I)
TAIL = re.compile(r"\s+(?:UER|ERR|COR|VAR)(?:\s*:\s*.*)?$", re.I)
NUM = re.compile(r"(?:[A-Za-z]{0,4}\d{1,3}[A-Za-z]?|\d{1,3}[A-Za-z]{1,3}|NNO)",re.I)
class Reader(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[];self.row=None;self.cell=None
    def handle_starttag(self,tag,attrs):
        if tag=="tr": self.row=[]
        if tag=="td" and self.row is not None: self.cell=[]
    def handle_data(self,data):
        if self.cell is not None:self.cell.append(data)
    def handle_endtag(self,tag):
        if tag=="td" and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell=None
        if tag=="tr" and self.row is not None:
            if self.row:self.rows.append(self.row)
            self.row=None

def get(url):
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0","Accept":"text/html"})
    with urllib.request.urlopen(req,timeout=35) as r:
        return r.read().decode("utf-8","replace")

def cleaned(name):
    x=" ".join(name.split()).strip()
    x=re.sub(r"\s*;\s*(?:UER|ERR|COR|VAR)\s*:.*$","",x,flags=re.I)
    x=TAIL.sub("",x)
    for _ in range(6):
        y=TAG.sub(" ",x).strip(" ,;")
        if y==x:break
        x=y
    return x

def collect(sid,label,max_pages=16):
    url=f"https://www.tcdb.com/Checklist.cfm/sid/{sid}/1999-Topps"
    found={}
    for page in range(1,max_pages+1):
        reader=Reader()
        reader.feed(get(f"{url}?PageIndex={page}"))
        added=0
        for raw in reader.rows:
            row=[c.strip() for c in raw if c.strip()]
            for i,value in enumerate(row):
                if not NUM.fullmatch(value) or i+1>=len(row):continue
                if value.isdigit() and int(value)>999:continue
                subject=cleaned(row[i+1])
                if subject.lower() in ("add","options","edit") or not subject:continue
                team=row[-1] if len(row)>i+2 else ""
                if team==row[i+1]:team=""
                number=value
                # Base numbered print variations are a single VCS card.
                if label=="base":
                    m=re.fullmatch(r"(\d{1,3})[A-Za-z]?",value)
                    if not m:continue
                    number=m.group(1)
                    if int(number)==7:raise SystemExit("Unexpected retired #7")
                entry=(subject,team)
                if number in found:
                    if found[number]!=entry:
                        raise SystemExit(f"{label} #{number} variant mismatch: {found[number]!r} vs {entry!r}")
                else:found[number]=entry;added+=1
                break
        print(f"{label} page {page}: +{added}, unique {len(found)}")
        if page>1 and added==0:break
    return found

def main():
    # Pull rookies via same numbered checklist extraction logic.
    rookie_url="https://www.tcdb.com/Rookies.cfm/sid/1340/1999-Topps?PageIndex=1"
    r=Reader();r.feed(get(rookie_url))
    rookies=set()
    for row in r.rows:
        for item in row:
            m=re.fullmatch(r"(\d{1,3})[A-Za-z]?",item.strip())
            if m and int(m.group(1))<=463:rookies.add(m.group(1));break
    if not rookies:raise SystemExit("No verified TCDB rookie-index rows found")
    print(f"TCDB rookie card numbers: {len(rookies)}")
    lines=[]
    multi_review=[]
    for key,sid,expected in SETS:
        items=collect(sid,key)
        if len(items)!=expected:
            raise SystemExit(f"{key}: expected {expected}, found {len(items)}; no CSV written")
        if key=="base" and set(map(int,items))!=(set(range(1,464))-{7}):
            raise SystemExit("Base numbering differs from #1-463 excluding retired #7")
        for number,(name,team) in items.items():
            if key=="base" and number in rookies:
                if "/" in name:multi_review.append((number,name))
                else:name+=" RC"
            if not team and key=="base" and re.search(r"\b(?:Checklist|Highlights|League Leaders)\b",name,re.I):
                team="MLB"
            if not team:
                raise SystemExit(f"{key} #{number} {name!r}: missing team")
            if re.search(r"(?:^|\s)(?:UER|ERR|COR|VAR)\b",name,re.I):
                raise SystemExit(f"{key} #{number}: source annotation leaked")
            variant="Refractor" if "refractors" in key else ("Gold" if key=="record-numbers-gold" else "")
            lines.append((key,number,name,team,"",variant))
    if len(lines)!=sum(x[2] for x in SETS):raise SystemExit("Total mismatch")
    OUT.parent.mkdir(parents=True,exist_ok=True)
    with OUT.open("w",newline="",encoding="utf-8") as f:
        w=csv.writer(f,lineterminator="\n")
        w.writerow(("setKey","cardNumber","player","team","subset","variant"))
        w.writerows(lines)
    print(f"=== 1999 TOPPS BASEBALL GENERATED: {len(SETS)} Product Sets, {len(lines)} cards ===")
    print(f"True RC multi-player cards requiring player-level review: {multi_review}")
    print(f"Output: {OUT} / UNRELEASED")

if __name__=="__main__":main()
