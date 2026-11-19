#!/usr/bin/env python3
"""Audit and generate 1999 SkyBox Premium Baseball VCS cards.
Source checklists: BaseballCardPedia and CollectionCount.
TCDB corroborates 32 true base rookie cards, set structure, and serial numbering.
NO automatic source substitution, guessed odds or inferred rookie tags.
"""
import argparse
import csv
import gzip
import html
import io
import json
import re
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/set-factory"
BUNDLE = DATA / "1999-skybox-premium-baseball.bundle.json"
CSV = DATA / "1999-skybox-premium-baseball.cards.csv.gz"
PRIMARY = "https://baseballcardpedia.com/index.php/1999_Skybox_Premium"
TEAMS_SOURCE = "https://www.collectioncount.com/checklists/1999-skybox-premium-baseball/"
EXPECTED = {
    "base":300, "action":50, "star-rubies":300, "star-rubies-action":50,
    "live-bats":15, "soul-of-the-game":15, "diamond-debuts":15,
    "show-business":15, "intimidation-nation":15,
    "autographics":52, "autographics-blue-ink":52,
}
TOTAL = sum(EXPECTED.values())
SECTIONS = {
    "base":("BASE", "base"),
    "action":("ACTIONVARIATIONS", "action"),
    "live-bats":("LIVEBATS", "live-bats"),
    "soul-of-the-game":("SOULOFTHEGAME", "soul-of-the-game"),
    "diamond-debuts":("DIAMONDDEBUTS", "diamond-debuts"),
    "show-business":("SHOWBUSINESS", "show-business"),
    "intimidation-nation":("INTIMIDATIONNATION", "intimidation-nation"),
    "autographics":("AUTOGRAPHICS", "autographics"),
}
TCDB_RC_NUMBERS = {223,224,225,226,227,228,229,232,233,234,235,236,237,238,240,242,
                   244,245,246,247,248,250,254,255,256,257,258,259,261,262,265,268}
COLS = ["setKey","cardNumber","player","team","subset","variant"]

def get(url):
    headers={"User-Agent":"Mozilla/5.0 (compatible; VCS historically verified set import)"}
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=45) as res:
        if res.status != 200: raise ValueError(f"HTTP {res.status}: {url}")
        return res.read().decode("utf-8","replace")

def collection_array(page,key):
    m=re.search(r"\bvar\s+"+re.escape(key)+r"\s*=\s*(\[[\s\S]*?\]);",page)
    if not m:raise ValueError(f"Missing upstream JS array {key}")
    return json.loads(m.group(1))

def bcp_lists(page):
    blocks = re.findall(r'<ul\s+style="list-style-type:none;"\s*>(.*?)</ul>',page,re.S|re.I)
    return [[html.unescape(re.sub(r"<[^>]*>","",x)).strip() for x in
             re.findall(r"<li[^>]*>(.*?)</li>",block,re.S|re.I)] for block in blocks]

def normalize_name(s):
    return (s.replace(" (Action)","").replace(" RC","")
             .replace(" SP","").split(" UER:")[0].split(" CL #")[0]
             .strip().replace("Bobby Higginson","Bob Higginson"))

def source_validation(collection, lists):
    assert len(lists) == 11, f"BCP source layout changed: {len(lists)} lists"
    assert [len(b) for b in lists] == [1,222,50,25,3,15,15,15,15,15,52]
    base=collection_array(collection,"BASE")
    action=collection_array(collection,"ACTIONVARIATIONS")
    expected_base=[(str(n),normalize_name(name)) for n,name,*_ in base]
    bcp_base=[]
    for section in lists[1:5]:
        for entry in section:
            m=re.fullmatch(r"(\d{1,3})\s+(.+)",entry)
            if not m:raise ValueError(f"Unrecognized BCP base: {entry!r}")
            bcp_base.append((m.group(1),normalize_name(m.group(2))))
    diffs=[(x,y) for x,y in zip(expected_base,bcp_base) if x!=y]
    if len(expected_base)!=300 or len(bcp_base)!=300 or diffs:
        raise ValueError(f"BCP vs CollectionCount base mismatch: {diffs[:12]}")
    tagged_rc={int(re.match(r"(\d+)",x).group(1)) for x in lists[2] if x.endswith(" RC")}
    if tagged_rc != TCDB_RC_NUMBERS:
        raise ValueError(f"BCP vs TCDB true RC mismatch: {tagged_rc ^ TCDB_RC_NUMBERS}")
    for key, index in [("live-bats",5),("soul-of-the-game",6),("diamond-debuts",7),
                        ("show-business",8),("intimidation-nation",9),("autographics",10)]:
        data=collection_array(collection,SECTIONS[key][0])
        for i,(number,name,*_) in enumerate(data):
            entry=lists[index][i]
            if key=="autographics":
                bcp_name=normalize_name(entry)
                if normalize_name(name)!=bcp_name:raise ValueError(f"{key} {i}: {name} != {entry}")
            else:
                match=re.fullmatch(r"\s*(\d+)\s*([A-Za-z]{2})\s+(.+)",entry)
                if not match:raise ValueError(f"{key} malformed BCP entry {entry!r}")
                ref_n=match.group(1)+match.group(2)
                if str(number)!=ref_n or normalize_name(name)!=normalize_name(match.group(3)):
                    raise ValueError(f"{key} #{number} {name} != BCP {entry}")
    assert len(action)==50 and [str(x[0]) for x in action]==[str(i) for i in range(223,273)]
    for entry in action:
        n=int(entry[0])
        if normalize_name(entry[1]) != normalize_name(base[n-1][1]):
            raise ValueError(f"Action #{n} does not match base card")
    return base

def make_rows():
    collection=get(TEAMS_SOURCE)
    bcp=get(PRIMARY)
    lists=bcp_lists(bcp)
    base=source_validation(collection,lists)
    teams=collection_array(collection,"TEAMS")
    assert len(teams)==30 and len(set(teams))==30
    rows=[]
    def emit(key,n,name,team,subset="",variant=""):
        teamname=teams[team] if isinstance(team,int) and 0<=team<len(teams) else None
        if not teamname: raise ValueError(f"Missing team for {key} #{n} {name}")
        rows.append(dict(zip(COLS,[key,str(n),name,teamname,subset,variant])))
    for number,name,team,*_ in base:
        n=int(number)
        if n in TCDB_RC_NUMBERS:name+=" RC"
        subset="Prospects" if 223<=n<=272 else ("Spring Fling" if 273<=n<=297 else ("Checklist" if 298<=n<=300 else ""))
        variant=("Portrait photo" if 223<=n<=272 else "")
        if n==271:variant += "; UER: birthplace printed BC, actually Washington"
        emit("base",n,name,team,subset,variant)
    for number,name,team in collection_array(collection,"ACTIONVARIATIONS"):
        n=int(number)
        canonical=normalize_name(name)
        if n in TCDB_RC_NUMBERS:canonical+=" RC"
        emit("action",n,canonical,team,"Prospects","Action photograph; alternate base variation")
    for key in ("live-bats","soul-of-the-game","diamond-debuts","show-business","intimidation-nation","autographics"):
        for number,name,team in collection_array(collection,SECTIONS[key][0]):
            if key=="autographics":
                variant="Unnumbered original; AU code is VCS alphabetical inventory ID"
                if name=="Juan Gonzalez":variant+="; SP"
            elif key=="intimidation-nation":variant="Serial numbered /99"
            else:variant=""
            emit(key,number,name,team,key.replace("-"," ").title(),variant)
    # Explicit rows only: remaining variants derived idempotently by importer
    assert len(rows)==477, len(rows)  # 300 + 50 + 75 + 52
    return rows

def validate_file():
    bundle=json.loads(BUNDLE.read_text())
    assert bundle["product"]["released"] is False and bundle["status"]=="DRAFT"
    counts=Counter((s["key"],s["expectedCards"]) for s in bundle["productSets"])
    assert len(bundle["productSets"])==len(EXPECTED)
    for key,num in EXPECTED.items():
        assert (key,num) in counts,(key,num)
    assert sum(s["expectedCards"] for s in bundle["productSets"])==TOTAL
    with gzip.open(CSV, "rt", encoding="utf-8", newline="") as f:rows=list(csv.DictReader(f))
    assert list(rows[0])==COLS
    explicit={k:n for k,n in EXPECTED.items() if k not in
              ("star-rubies","star-rubies-action","autographics-blue-ink")}
    observed=Counter(r["setKey"] for r in rows)
    assert observed==Counter(explicit),(observed,explicit)
    assert len(set((r["setKey"],r["cardNumber"]) for r in rows))==len(rows)
    assert all(r["team"] for r in rows)
    rookies={int(r["cardNumber"]) for r in rows if r["setKey"]=="base" and r["player"].endswith(" RC")}
    assert rookies==TCDB_RC_NUMBERS
    action={r["cardNumber"]:r["player"] for r in rows if r["setKey"]=="action"}
    prospect={r["cardNumber"]:r["player"] for r in rows if r["setKey"]=="base" and 223<=int(r["cardNumber"])<=272}
    assert action==prospect
    assert next(r for r in rows if r["setKey"]=="base" and r["cardNumber"]=="271")["player"]=="Stan Spencer"
    assert next(r for r in rows if r["setKey"]=="base" and r["cardNumber"]=="271")["variant"].find("UER:") >= 0
    assert any(r["cardNumber"]=="AU52" and r["player"]=="Robin Ventura" for r in rows)
    print(f"PASS: {TOTAL} total modeled cards across {len(EXPECTED)} product sets, "
          f"{len(rows)} explicit CSV rows, {len(TCDB_RC_NUMBERS)} verified base RCs.")
    for key,n in EXPECTED.items():print(" ",key,n)

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--verify",action="store_true",help="Offline checks of committed bundle and CSV")
    a=p.parse_args()
    if not a.verify:
        rows=make_rows()
        DATA.mkdir(parents=True,exist_ok=True)
        with gzip.open(CSV, "wt", compresslevel=9,encoding="utf-8",newline="") as f:
            writer=csv.DictWriter(f,fieldnames=COLS,lineterminator="\n")
            writer.writeheader();writer.writerows(rows)
    validate_file()

if __name__=="__main__":main()

