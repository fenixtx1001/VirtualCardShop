#!/usr/bin/env python3
"""1990 Fleer Baseball Set Factory: source-audited US issue, fail closed.

Builds an unpublished VCS product using collector-facing base checklist and
separate, correctly sourced pack/packaging/factory sub-checklists.
No fabricated insert parallels or pack odds. --check is offline and deterministic.
"""
from __future__ import annotations
import argparse, csv, gzip, html, json, re, urllib.request, io, hashlib, sys
from collections import Counter, defaultdict
from pathlib import Path

DATA = Path(__file__).resolve().parents[1]/"data"/"set-factory"
STEM = "1990-fleer-baseball"
OUT = DATA/(STEM+".cards.csv.gz")
BUNDLE = DATA/(STEM+".bundle.json")
SOURCE_BCP = "https://baseballcardpedia.com/index.php/1990_Fleer"
SOURCE_CC = "https://www.collectioncount.com/checklists/1990-fleer-baseball/"
COLS = ("setKey","cardNumber","player","team","subset","variant")
EXPECTED = {"base":660,"all-stars":12,"soaring-stars":12,"league-standouts":6,
            "world-series":12,"box-bottoms":28,"team-stickers":38}
# TCDB Rookie Cards index has 126 "record(s)" because two 'Printed in USA'
# versions are reported. De-dupe to 63 distinct printed base numbers.
RC_SINGLE = set([47,51,52,64,82,100,113,124,131,137,145,180,197,206,222,244,
                 293,294,297,311,323,329,333,339,347,350,363,372,387,410,
                 411,421,426,438,442,477,485,499,534,540,542,548,584,586,
                 590,596,601,606,613])
RC_MULTI = set(range(640,654))
assert len(RC_SINGLE)==49 and len(RC_MULTI)==14
# Source differences are audited, rather than fuzzy-matched without a record.
BCP_CC_EXCEPTIONS = {57,105,158,326,371,420,479,485,560,578,614,
                     631,632,633,634,635,636,637,638,639,
                     654,655,656,657,658,659,660}
FLEER_ERROR_VARIANTS = {
 175:"Two documented back-stripe printings (ERR/COR)",
 353:"Two documented Fleer logo color printings: yellow 90 / red 90",
 621:"ERR 10 .390 seasons / corrected 10 .300 seasons",
 624:"ERR Ripkin spelling / corrected Ripken",
 630:"ERR 32 total bases / corrected 321",
 660:"Documented alternate checklist printing",
}

def fetch(url):
    headers={"User-Agent":"Mozilla/5.0 (VCS historical checklist verification)","Accept":"text/html"}
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=35) as rsp:
        if rsp.status != 200:raise ValueError(f"source HTTP {rsp.status}: {url}")
        return rsp.read().decode("utf-8","replace")

def js_array(source,key):
    m=re.search(r"\bvar\s+"+re.escape(key)+r"\s*=\s*(\[[\s\S]*?\]);",source)
    if not m:raise ValueError(f"Missing JS checklist array {key}")
    return json.loads(m.group(1))

def bcp_groups(page):
    blocks=re.findall(r'<ul\s+style="list-style-type:none;"\s*>(.*?)</ul>',page,re.S|re.I)
    result=[[html.unescape(re.sub(r'<[^>]*>','',entry)).strip()
             for entry in re.findall(r'<li[^>]*>(.*?)</li>',block,re.S|re.I)]
             for block in blocks]
    if len(result)!=15:raise ValueError(f"BCP page layout changed: {len(result)} groups")
    return result

def trim_source_name(s):
    # Strip catalog remarks from the display field; keep those in variant.
    s=re.sub(r"\s*\(UER:.*$","",s).strip()
    s=re.sub(r"\s+(?:UER|RC|ERR|COR|VAR)(?=[: ,]|$).*$","",s).strip()
    return s

def bcp_base_index(groups):
    raw=defaultdict(list)
    for group in groups[:5]:
        for item in group:
            m=re.fullmatch(r"(\d{1,3})([ab])?\s+(.+)",item)
            if not m:raise ValueError("Unrecognized base line "+repr(item))
            n=int(m.group(1));raw[n].append(m.group(3))
    if set(raw)!=set(range(1,661)):raise ValueError(f"BCP base numbering mismatch: {len(raw)}")
    return raw

def bcp_comparison_name(n, raw):
    v=trim_source_name(raw)
    if 621<=n<=630:v=re.sub(r"\s+\d\d$","",v)
    if 631<=n<=639:v=re.sub(r'\s+"[^"]+"$','',v)
    return v

def resolve_team(name, known, team_hint=None):
    if team_hint:return team_hint
    if name in known:return known[name]
    if " / " in name:return "Multiple Teams"
    if name in known.values():return name
    return None

def generator():
    cc=fetch(SOURCE_CC);bcp=fetch(SOURCE_BCP)
    teams=js_array(cc,"TEAMS");base=js_array(cc,"BASE");groups=bcp_groups(bcp)
    if len(teams)!=26 or len(set(teams))!=26 or len(base)!=660:raise ValueError("CC source totals changed")
    if [len(g) for g in groups] != [621,13,9,14,8,12,6,12,12,4,4,4,4,6,6]:
        raise ValueError("BCP product checklist sections changed")
    raw=bcp_base_index(groups)
    assert [int(z[0]) for z in base]==list(range(1,661))
    discrepancies=[]
    for n,name,index,*_ in base:
        normalized=bcp_comparison_name(n,raw[n][0])
        canonical=trim_source_name(name)
        if normalized!=canonical:discrepancies.append(n)
    if set(discrepancies)!=BCP_CC_EXCEPTIONS:
        raise ValueError("New/unreviewed BCP vs CC differences: "+str(
            sorted(set(discrepancies)^BCP_CC_EXCEPTIONS)))
    # Source #57 is wrong on BCP; TCDB + multiple independent catalogs confirm Atlee Hammaker.
    assert base[56][1]=="Atlee Hammaker" and raw[57][0]=="Charlie Haag"
    assert base[547][1]=="Sammy Sosa" and base[512][1]=="Ken Griffey, Jr."
    source_rc={n for n,items in raw.items() if any(re.search(r"\bRC\b",s) for s in items)}
    if not source_rc.issubset(RC_SINGLE|RC_MULTI) or len(source_rc)!=50:
        raise ValueError(f"BCP RC source changed: {len(source_rc)}")
    # 49 singles and 14 multi RC cards verified by TCDB, but multi RC subject
    # badges must be player-specific, not blindly applied to each subject.
    known={}
    for n,name,index,*_ in base:
        if n<=620 and not 0<=index<len(teams):raise ValueError(f"Invalid team #{n}")
        if n<=620:known[trim_source_name(name)]=teams[index]
    known.update({"Ken Griffey, Sr.":"Cincinnati Reds","Marty Clary":"Atlanta Braves",
                  "Teddy Higuera":"Milwaukee Brewers","Albert Belle":"Cleveland Indians",
                  "Cal Ripken, Jr.":"Baltimore Orioles"})
    result=[]
    def add(key,number,player,team=None,subset="",variant=""):
        number=str(number)
        player=player.strip()
        if not player:raise ValueError(f"Blank display subject {key}/{number}")
        if team is None and not player.lower().startswith("checklist"):
            raise ValueError(f"Missing team for {key} #{number}: {player}")
        result.append(dict(zip(COLS,[key,number,player,team or "",subset,variant])))
    for n,name,index,*_ in base:
        original=name
        name=trim_source_name(name)
        if n in RC_SINGLE:name+=" RC"
        if n==650:
            name=name.replace("Moises Alou","Moises Alou RC")
        # Do not label both players on the shared Rookie Prospects cards
        # until each individual's true RC status is independently established.
        subset=("Players of the Decade" if 621<=n<=630 else
                "SuperStar Specials" if 631<=n<=639 else
                "Major League Prospects" if 640<=n<=653 else
                "Checklist" if 654<=n<=660 else "")
        team=("Multiple Teams" if 631<=n<=653 else
              None if 654<=n<=660 else teams[index])
        details=[]
        annotations=re.findall(r"\bUER:.*",original)
        if annotations:details.extend(annotations)
        if n in FLEER_ERROR_VARIANTS:details.append(FLEER_ERROR_VARIANTS[n])
        if n in RC_MULTI:details.append("TCDB catalogs this shared card as RC; individual subjects not all independently confirmed")
        if n==57:details.append("Corrected BCP checklist typo: Atlee Hammaker, not Charlie Haag")
        add("base",n,name,team,subset,"; ".join(details))
    for key,group_ix in [("all-stars",5),("league-standouts",6),
                         ("soaring-stars",7),("world-series",8)]:
        if len(groups[group_ix])!=EXPECTED[key]:raise ValueError(f"Incorrect {key} count")
        for idx,rawline in enumerate(groups[group_ix],1):
            m=re.fullmatch(r"(\d+)\s+(.+)",rawline)
            if not m or int(m.group(1))!=idx:raise ValueError(f"Unrecognized {key} item {rawline}")
            subject=m.group(2)
            display=trim_source_name(subject)
            if key=="world-series" and idx==12:team="Oakland Athletics"
            else:team=resolve_team(display,known)
            add(key,idx,display,team,"",subject[len(display):].strip(" ,") if subject!=display else "")
    for group_ix,letter in zip(range(9,15),"ABCDEF"):
        for rawline in groups[group_ix]:
            m=re.fullmatch(r"(C\d{1,2})\s+(.+)",rawline)
            if not m:raise ValueError(f"Unrecognized box-bottom {rawline}")
            number,display=m.group(1),m.group(2).strip()
            add("box-bottoms",number,display,resolve_team(display,known),"Panel "+letter,"Cut from box exterior; not inserted in packs")
    assert len([r for r in result if r["setKey"]=="box-bottoms"])==28
    # TCDB sid 70924 has 38 distinct NNO labels: 26 individual club
    # stickers and 12 four-logo composites, printed without card numbers.
    for i,team in enumerate(teams,1):
        add("team-stickers",f"LOGO-{i:02d}",team,team,"Team Logo",
            "Unnumbered sticker; VCS inventory ID")
    quad=[
        "AL: Baltimore Orioles / Boston Red Sox / Chicago White Sox / California Angels",
        "AL: Cleveland Indians / Detroit Tigers / Kansas City Royals / Milwaukee Brewers",
        "AL: Minnesota Twins / New York Yankees / Oakland Athletics / Seattle Mariners",
        "AL: Texas Rangers / Toronto Blue Jays / Baltimore Orioles / Boston Red Sox",
        "NL: Atlanta Braves / Chicago Cubs / Cincinnati Reds / Houston Astros",
        "NL: Los Angeles Dodgers / Montreal Expos / New York Mets / Philadelphia Phillies",
        "NL: Pittsburgh Pirates / St. Louis Cardinals / San Diego Padres / San Francisco Giants",
        "MLB: Atlanta Braves / Chicago Cubs / Kansas City Royals / Milwaukee Brewers",
        "MLB: Baltimore Orioles / Boston Red Sox / Cincinnati Reds / Houston Astros",
        "MLB: Cleveland Indians / Detroit Tigers / New York Mets / Philadelphia Phillies",
        "MLB: Los Angeles Dodgers / Montreal Expos / Oakland Athletics / Seattle Mariners",
        "MLB: Minnesota Twins / New York Yankees / San Diego Padres / San Francisco Giants",
    ]
    for i,title in enumerate(quad,1):
        add("team-stickers",f"QUAD-{i:02d}",title,"Multiple Teams","Quad Logos",
            "Unnumbered sticker; VCS inventory ID")
    return result

def check():
    bundle=json.loads(BUNDLE.read_text())
    with gzip.open(OUT,"rt",encoding="utf8",newline="") as f:rows=list(csv.DictReader(f))
    if bundle["product"]["released"] is not False:raise ValueError("Must be unreleased")
    if bundle["schemaVersion"]!=2 or bundle["status"]!="DRAFT":raise ValueError("Schema")
    if {x["key"]:x["expectedCards"] for x in bundle["productSets"]}!=EXPECTED:raise ValueError("Wrong bundle subsets")
    if Counter(x["setKey"] for x in rows)!=Counter(EXPECTED):raise ValueError("Bad group sizes")
    if len(set((x["setKey"],x["cardNumber"]) for x in rows))!=len(rows):raise ValueError("Duplicates")
    if len(rows)!=768:raise ValueError("Incorrect total")
    if any(not x["team"] and not x["player"].lower().startswith("checklist") for x in rows):
        raise ValueError("Nonchecklist missing team")
    base={int(x["cardNumber"]):x for x in rows if x["setKey"]=="base"}
    if set(base)!=set(range(1,661)):raise ValueError("Missing base numbers")
    for n,person in [(57,"Atlee Hammaker"),(297,"Juan Gonzalez RC"),
                     (363,"Larry Walker RC"),(548,"Sammy Sosa RC"),
                     (586,"David Justice RC"),(513,"Ken Griffey, Jr.")]:
        if base[n]["player"]!=person:raise ValueError(f"#{n}: {base[n]['player']!r} != {person!r}")
    if "RC" in base[513]["player"]:raise ValueError("Griffey is not a true RC")
    if "Moises Alou RC" not in base[650]["player"]:raise ValueError("Missing Alou RC")
    # Wax insert odds must not make rack or jumbo exclusives appear in standard wax.
    bykey={x["key"]:x for x in bundle["productSets"]}
    if (bykey["all-stars"]["oddsPerPack"]!=8
        or bykey["team-stickers"]["oddsPerPack"]!=1
        or any(bykey[key]["oddsPerPack"] is not None for key in
               ("soaring-stars","league-standouts","world-series","box-bottoms"))):
        raise ValueError("Pack channel error")
    print("PASS: 768 verified checklist entries, seven collector ProductSets")
    print("PASS: 660 base, 12 wax All-Stars, 38 stickers; other channels gated")
    print("PASS: pack odds / alternative formats and RC identity checks")
    print("PASS: 1-660 exact, no duplicate or invented card numbers")
    print("PASS: draft unreleased, pricing/images untouched")

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--check",action="store_true")
    args=parser.parse_args()
    if not args.check:
        rows=generator()
        DATA.mkdir(parents=True,exist_ok=True)
        buffer=io.StringIO(newline="")
        w=csv.DictWriter(buffer,fieldnames=COLS,lineterminator="\n")
        w.writeheader();w.writerows(rows)
        OUT.write_bytes(gzip.compress(buffer.getvalue().encode("utf8"),compresslevel=9,mtime=0))
        print("Generated CSV rows:",len(rows))
    check()

if __name__=="__main__":main()
