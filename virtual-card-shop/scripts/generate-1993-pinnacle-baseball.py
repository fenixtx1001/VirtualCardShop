#!/usr/bin/env python3
"""Set Factory for 1993 Pinnacle Baseball, audited against independent checklists.

Normal usage: python3 scripts/generate-1993-pinnacle-baseball.py
Offline audit: python3 scripts/generate-1993-pinnacle-baseball.py --check
No data files are written until the sources pass the historical reconciliation.
"""
from __future__ import annotations
import argparse
import csv
import gzip
import html
import io
import json
import re
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data/set-factory"
BUNDLE = DATA / "1993-pinnacle-baseball.bundle.json"
CSV = DATA / "1993-pinnacle-baseball.cards.csv.gz"
BCP = "https://baseballcardpedia.com/index.php/1993_Pinnacle"
CC = "https://www.collectioncount.com/checklists/1993-score-pinnacle-baseball/"
TCDB_ROOKIES = "https://www.tcdb.com/Rookies.cfm/sid/259/1993-Pinnacle"
FIELDS = ("setKey", "cardNumber", "player", "team", "subset", "variant")
EXPECTED = {
    "base": 620, "team-pinnacle": 11, "rookie-team-pinnacle": 10,
    "expansion-opening-day": 9, "tribute": 10,
    "team-2001": 30, "slugfest": 30,
}
TOTAL = sum(EXPECTED.values())
# All 53 individually numbered, independently cataloged TCDB True Rookie Cards.
ROOKIES = {
    215,229,239,246,250,256,263,265,269,270,273,274,277,278,279,283,288,
    455,457,458,460,461,462,463,464,465,468,469,496,518,567,
    576,579,583,584,585,587,590,592,595,596,598,599,600,606,607,608,
    609,610,614,616,619,620
}
assert len(ROOKIES)==53
# Identity/name differences checked against BaseballCardPedia, not fuzzy merged.
# 230 is missing from BCP's list, confirmed by independent catalogs and images.
BCP_MISSING = {230}
BCP_NAME_DIFFERENCES = {20,96,110,211,280,305,471,493}
BCP_INSERT_GROUPS = {
    "team-pinnacle": 14, "rookie-team-pinnacle": 15,
    "expansion-opening-day": 16, "tribute": 17,
    "team-2001": 18, "slugfest": 19,
}
EXPECTED_GROUP_LENGTHS = [8,229,9,49,8,7,7,144,15,7,7,7,84,46,11,10,9,10,30,30]

def fetch(url):
    headers={"User-Agent":"Mozilla/5.0 (compatible; VCS historical set checklist audit)",
             "Accept":"text/html,application/xhtml+xml"}
    req=urllib.request.Request(url,headers=headers)
    with urllib.request.urlopen(req,timeout=45) as resp:
        if resp.status!=200:raise ValueError(f"Source failure HTTP {resp.status}: {url}")
        return resp.read().decode("utf-8","replace")

def js_array(html_source,name):
    m=re.search(r"\bvar\s+"+re.escape(name)+r"\s*=\s*(\[[\s\S]*?\]);",html_source)
    if not m:raise ValueError(f"Source array {name} missing")
    return json.loads(m.group(1))

def bcp_lists(page):
    blocks=re.findall(r'<ul\s+style="list-style-type:none;"\s*>(.*?)</ul>',page,re.S|re.I)
    result=[[html.unescape(re.sub(r"<[^>]+>","",entry)).strip()
             for entry in re.findall(r"<li[^>]*>(.*?)</li>",block,re.S|re.I)]
            for block in blocks]
    if [len(g) for g in result]!=EXPECTED_GROUP_LENGTHS:
        raise ValueError(f"Unexpected BaseballCardPedia page structure {[len(g) for g in result]}")
    return result

def strip_annotation(name):
    name=name.strip()
    # Formatting annotations must not pollute the printed player/subject field.
    name=re.sub(r"\s+(?:RP|ED|DPK|DP|EXP|RC\*?|UER|ERR|COR|VAR)(?=:|[,\s]|$).*$","",name,flags=re.I)
    return name.strip(" ;,")

def comparable(name):
    name=re.sub(r"\s*\(UER:.*$","",name).strip()
    return strip_annotation(name)

def clean_name(name):
    # A player's canonical collector identity is preferred over informal spellings.
    aliases={"Cal Ripken Jr.":"Cal Ripken, Jr.",
             "Ken Griffey Jr.":"Ken Griffey, Jr.",
             "Sandy Alomar Jr.":"Sandy Alomar, Jr.",
             "Doc Gooden":"Dwight Gooden",
             "Wil Cordero":"Wilfredo Cordero",
             "Manuel Lee":"Manny Lee"}
    return aliases.get(name,name)

def key_name(name):
    return re.sub(r"[^a-z0-9]+","",name.lower().replace("jr.","jr"))

def append_row(rows,key,number,name,team,subset="",variant=""):
    number=str(number)
    if not name.strip() or not team.strip():raise ValueError(f"Missing subject/team {key} #{number}: {name}, {team}")
    rows.append(dict(zip(FIELDS,(key,number,name.strip(),team.strip(),subset,variant))))

def determine_subset(n):
    if 230<=n<=239:return "1992 Expansion Draft"
    if 240<=n<=288 or 575<=n<=620:return "'93 Rookie Prospects"
    if 289<=n<=296 or 470<=n<=476:return "Now & Then"
    if 297<=n<=303 or 477<=n<=483:return "Idols"
    if 304<=n<=310 or 484<=n<=490:return "Hometown Heroes"
    if 455<=n<=469:return "Draft Picks"
    return ""

def assemble():
    base_source=fetch(CC)
    bcp_source=fetch(BCP)
    teams=js_array(base_source,"TEAMS")
    cc=js_array(base_source,"BASE")
    groups=bcp_lists(bcp_source)
    if len(teams)!=29 or len(set(teams))!=29 or len(cc)!=620:
        raise ValueError("Source team/base sizes changed")
    catalog={}
    for group in groups[1:14]:
        for line in group:
            m=re.fullmatch(r"(\d{1,3})\s+(.+)",line)
            if not m:raise ValueError(f"Unexpected BCP base row {line!r}")
            n=int(m.group(1))
            if n in catalog:raise ValueError(f"Duplicate BCP base #{n}")
            catalog[n]=m.group(2)
    if set(range(1,621))-set(catalog)!=BCP_MISSING:
        raise ValueError(f"New missing BCP numbers: {sorted(set(range(1,621))-set(catalog))}")
    if set(catalog)-set(range(1,621)):raise ValueError("BCP unexpected IDs")
    differences=set()
    found_rc=set()
    single_team=defaultdict(set)
    rows=[]
    for index,raw in enumerate(cc,1):
        if len(raw) not in (3,4,5) or str(raw[0])!=str(index):
            raise ValueError(f"Malformed base entry {index}: {raw}")
        n=int(raw[0]);orig_name=raw[1];idx=raw[2]
        if not isinstance(idx,int) or idx<0 or idx>=len(teams):
            raise ValueError(f"Invalid team index for #{n}")
        cc_name=clean_name(comparable(orig_name))
        bcp_raw=catalog.get(n)
        if bcp_raw:
            bcp_name=clean_name(strip_annotation(bcp_raw))
            # Source disagreement must be independently audited and explicitly allowed.
            if cc_name!=bcp_name:
                differences.add(n)
                raise ValueError(f"Unreviewed subject discrepancy #{n}: {cc_name!r} vs {bcp_name!r}")
        else:
            if n!=230 or cc_name!="Mo Sanford" or teams[idx]!="Colorado Rockies":
                raise ValueError("Missing BCP #230 identity not independently corroborated")
        # Compare original source names too to detect silently changed spelling differences.
        if bcp_raw and comparable(orig_name)!=strip_annotation(bcp_raw):
            differences.add(n)
        flag=raw[3] if len(raw)>3 else 0
        if flag==1:found_rc.add(n)
        if (flag==1)!=(n in ROOKIES):
            raise ValueError(f"TCDB rookie disagreement #{n} {orig_name!r} flag={flag}")
        if len(raw)==5 and flag!=0:raise ValueError(f"Multisubject RC unexpected: #{n}")
        team="Multiple Teams" if " / " in cc_name else teams[idx]
        if " / " not in cc_name:
            single_team[key_name(cc_name)].add(team)
        name=cc_name + (" RC" if n in ROOKIES else "")
        remarks=[]
        # Historical correction/printing details are separate metadata.
        if "UER:" in orig_name:remarks.append(orig_name[orig_name.index("UER:"):].rstrip(")"))
        if bcp_raw:
            m=re.search(r"\b(?:UER|ERR|COR|VAR):.+$",bcp_raw)
            if m:remarks.append(m.group(0).strip())
        if n==230:remarks.append("Base #230 absent from BaseballCardPedia list; independently confirmed as Mo Sanford")
        if n in BCP_NAME_DIFFERENCES:remarks.append("Historical source name spelling normalized")
        if " / " in cc_name:remarks.append("Composite image; not a single-club card")
        append_row(rows,"base",n,name,team,determine_subset(n),"; ".join(dict.fromkeys(remarks)))
    if differences!=BCP_NAME_DIFFERENCES:
        raise ValueError(f"BCP/CC name reconciliation changed: expected {BCP_NAME_DIFFERENCES}, got {differences}")
    if found_rc!=ROOKIES:raise ValueError("Rookie index disagreement")
    # All insert families verified card-for-card against source issue and numbering.
    for key,group_idx in BCP_INSERT_GROUPS.items():
        items=groups[group_idx]
        for idx,line in enumerate(items,1):
            m=re.fullmatch(r"(B11|\d{1,2})\s+(.+)",line)
            if not m:raise ValueError(f"Unrecognized {key}: {line}")
            num,description=m.groups()
            if key=="team-pinnacle" and idx==11:
                if num!="B11":raise ValueError("Mail-in Team Pinnacle should be B11")
            elif num!=str(idx):raise ValueError(f"{key}: numbering changed at {line}")
            if key in ("team-pinnacle","rookie-team-pinnacle","expansion-opening-day"):
                player=description;team="Multiple Teams"
                variant=("Mail-in redemption bonus; not found in packs" if num=="B11"
                         else "Hobby Series Two box-topper; not inserted inside wax packs" if key=="expansion-opening-day"
                         else "Dual-sided player pairing")
            elif key=="tribute":
                m2=re.fullmatch(r'(.+?)\s+"(.+)"',description)
                if not m2:raise ValueError(f"Bad Tribute caption: {description}")
                player,caption=m2.groups()
                variant="Tribute subject: "+caption
                team="Kansas City Royals" if player=="George Brett" else "Texas Rangers" if player=="Nolan Ryan" else ""
            else:
                player=clean_name(strip_annotation(description))
                mapped=single_team.get(key_name(player),set())
                if len(mapped)!=1:
                    raise ValueError(f"Could not verify team for {key} #{num} {player}: {mapped}")
                team=next(iter(mapped))
                variant="Series One SuperPack exclusive" if key=="team-2001" else "Series Two SuperPack exclusive"
            if not team:raise ValueError(f"Could not resolve {key} #{num}")
            append_row(rows,key,num,player,team,key.replace("-"," ").title(),variant)
    return rows

def check():
    bundle=json.loads(BUNDLE.read_text(encoding="utf-8"))
    if bundle["schemaVersion"]!=2 or bundle["status"]!="DRAFT" or bundle["product"]["released"] is not False:
        raise ValueError("Bundle must be schema v2 and unreleased DRAFT")
    if bundle["product"]["id"]!="1993_Pinnacle_Baseball":raise ValueError("Unexpected product ID")
    if bundle["cardsFile"]!=CSV.name:raise ValueError("Wrong CSV path")
    if {x["key"]:x["expectedCards"] for x in bundle["productSets"]} != EXPECTED:
        raise ValueError("Bundle checklist counts mismatch")
    if len(bundle["productSets"])!=7:raise ValueError("Unexpected ProductSet count")
    with gzip.open(CSV,"rt",encoding="utf-8",newline="") as f:rows=list(csv.DictReader(f))
    counts=Counter(x["setKey"] for x in rows)
    if counts!=Counter(EXPECTED) or len(rows)!=TOTAL:
        raise ValueError(f"Count mismatch: {counts} expected {EXPECTED}")
    if len(set((x["setKey"],x["cardNumber"]) for x in rows))!=len(rows):
        raise ValueError("Duplicate card ID in ProductSet")
    if any(not x["team"].strip() or not x["player"].strip() for x in rows):
        raise ValueError("Missing player/team")
    base={int(r["cardNumber"]):r for r in rows if r["setKey"]=="base"}
    if set(base)!=set(range(1,621)):raise ValueError("Base not numbered 1–620")
    actual_rc={n for n,row in base.items() if row["player"].endswith(" RC")}
    if actual_rc!=ROOKIES:raise ValueError(f"RC tags do not match TCDB ({len(actual_rc)})")
    for num,player,team in [
        (230,"Mo Sanford","Colorado Rockies"),
        (457,"Derek Jeter RC","New York Yankees"),
        (458,"Jason Kendall RC","Pittsburgh Pirates"),
        (462,"Shannon Stewart RC","Toronto Blue Jays"),
        (259,"Pedro Martinez","Los Angeles Dodgers"),
    ]:
        if base[num]["player"]!=player or base[num]["team"]!=team:
            raise ValueError(f"Important identity mismatch #{num}: {base[num]}")
    byset={x["key"]:x for x in bundle["productSets"]}
    if any(s["oddsPerPack"] is not None for s in byset.values()):
        raise ValueError("Series/pack-channel odds must remain null until VCS models series-aware packs")
    mailed=[x for x in rows if x["setKey"]=="team-pinnacle" and x["cardNumber"]=="B11"]
    if len(mailed)!=1 or "Mail-in" not in mailed[0]["variant"]:
        raise ValueError("Team Pinnacle redemption bonus missing")
    print("PASS: 1993 Pinnacle: 620 base, 100 inserts/bonuses = 720 unique checklist entries")
    print("PASS: 53 TCDB true RC flags; key Jeter/Kendall/Stewart; #230 Mo Sanford restored")
    print("PASS: All insert and mail-in numbering; no duplicate IDs; full team assignments")
    print("PASS: Series wax/superpack odds gated; product unreleased")

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--check",action="store_true")
    args=p.parse_args()
    if not args.check:
        rows=assemble()
        DATA.mkdir(parents=True,exist_ok=True)
        buf=io.StringIO(newline="")
        w=csv.DictWriter(buf,fieldnames=FIELDS,lineterminator="\n")
        w.writeheader();w.writerows(rows)
        CSV.write_bytes(gzip.compress(buf.getvalue().encode("utf-8"),compresslevel=9,mtime=0))
    check()

if __name__=="__main__":main()
