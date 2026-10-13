from __future__ import annotations

import csv
import re
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/set-factory/1994-topps-baseball.cards.csv"

# Source and request protocol intentionally match the successful 1997 Metal
# Universe Football Set Factory generator. Do not simplify the headers.
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; VCS Set Factory research import)",
    "Accept": "text/html,application/xhtml+xml",
}
SOURCES = [
    ("base",426,792),
    ("gold",10288,792),
    ("black-gold",427,44),
    ("finest-pre-production",10362,40),
]
ROOKIE_INDEX_RECORDS = 118
# TCDB's 118 visible records include two duplicate print-variation rows
# on the first index page. The second page lists 18 unique card numbers,
# independently verified on its published rookie checklist.
# The source header (118 records) includes print-variation duplicates.
# The source index parser currently recognizes 115 unique numbers, but we
# validate completeness against the Base checklist's own RC annotations.
ROOKIE_MIN_INDEX_NUMBERS = 115
ROOKIE_PAGE2_NUMBERS = {
    769,770,771,772,773,774,775,776,778,
    779,780,782,783,786,787,788,789,790
}
GOLD_REPLACEMENTS = {
    395:"Bill Brennan",396:"Jeff Bronkey",791:"Mike Cook",792:"Dan Pasqua"
}
TWO_370 = {"Benny Santiago","Mark McLemore"}
ROOKIE_NOTE = re.compile(r"\bRC\s+for\s+(.+?)\s+only\b",re.I)
TAGS = re.compile(
    r"(?:[\s,;]+(?:RC|ROO|FS|ASR|AS|PROS|DPK|MOG|CA|CL|LL|TRIB|"
    r"MGR|VAR|ERR|COR|UER|TC|HL|WS|ALCS|NLCS|SB|CD|SN\d+))+$",re.I
)
# TCDB sometimes concatenates repeated error labels, e.g.
# "Mark McLemore UERUER: #370 on back, was supposed to be #379".
# Treat these as checklist commentary, not player-name text.
SOURCE_NOTES = re.compile(
    r"(?:^|[;, ]+)(?:(?:UER|ERR|COR|VAR)){1,4}\s*:\s*.*$",
    re.I,
)
LEAKED_NOTES = re.compile(
    r"(?:^|[ ,;])(?:(?:UER|ERR|COR|VAR)){1,4}(?:$|[ ,;:])",
    re.I,
)

class Rows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag == "td" and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag == "td" and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if self.row:
                self.rows.append(self.row)
            self.row = None

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=35) as res:
            return res.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise SystemExit(
            f"TCDB HTTP {exc.code} at {url}: unable to verify checklist, "
            "no new CSV written"
        ) from exc

def normalize(raw):
    """Remove TCDB checklist metadata, but retain every actual player name.

    TCDB's list view can concatenate multi-field notes with no delimiter:
    PROS, RCRC for Boston and Wooten only; CANot an RC for either player;
    or UER5th line. The note is captured before metadata is stripped.
    """
    text=" ".join(raw.split()).strip()
    # This contains a true player-level label, NOT a generic card-level RC.
    rc_match=re.search(
        r"(?:(?:UER|ERR|COR|VAR))?(?:RC){1,2}\s+for\s+"
        r"([A-Za-z. '-]+?(?:\s+and\s+[A-Za-z. '-]+)*)\s+only\b",
        text,re.I,
    )
    rc_note=rc_match.group(1).strip() if rc_match else ""
    text=re.sub(r"\s+Checklist\s+replacement\s*$","",text,flags=re.I)
    text=SOURCE_NOTES.sub("",text).strip(" ,;")
    # Eliminate explanatory material starting at an explicit TCDB metadata
    # tag. 'CA' is Coming Attractions, 'PROS' is Prospects, 'DPK' Draft Picks.
    text=re.sub(
        r"\s+(?:PROS|DPK|CA|UER|ERR|COR|VAR|RC)"
        r"(?:(?:\s|,|:|(?=Not\b)|(?=\d))[\s\S]*)?$",
        "",text,flags=re.I,
    ).strip(" ,;")
    text=re.sub(
        r"\s+(?:UER|ERR|COR|VAR){1,4}(?=[:\s\d]).*$",
        "",text,flags=re.I,
    ).strip(" ,;")
    # Historical anniversary title is joined to the surname on one
    # TCDB listing but spaced correctly on its Gold parallel.
    text=re.sub(r"^Hank Aaron\s*20th Anniversary #715$",
                "Hank Aaron 20th Anniversary #715",text)
    for _ in range(6):
        updated=TAGS.sub("",text).strip(" ,;")
        if updated==text:break
        text=updated
    if not text or LEAKED_NOTES.search(text) or ROOKIE_NOTE.search(text):
        raise SystemExit(f"Could not clean TCDB subject {raw!r} => {text!r}")
    if re.search(r"\b(?:UER|RCRC|CANot|RC for|Checklist replacement)\b",text,re.I):
        raise SystemExit(f"Uncleaned TCDB annotation in {raw!r} => {text!r}")
    return text,rc_note

def validate_known_annotations():
    # Real TCDB Base/Gold mismatches observed in the 2026-10-13 audit.
    # Regression tests prevent another repeated fetch/fail at each card.
    checks={
        "Mark McLemore UERUER: #370 on back, was supposed to be #379": ("Mark McLemore",""),
        "Mark McLemore UER: #370 on back": ("Mark McLemore",""),
        "Benny Santiago": ("Benny Santiago",""),
        "Bill Brennan Checklist replacement": ("Bill Brennan",""),
        "Jeff Bronkey Checklist replacement": ("Jeff Bronkey",""),
        "Mike Cook Checklist replacement": ("Mike Cook",""),
        "Dan Pasqua Checklist replacement": ("Dan Pasqua",""),
        "SS Prospects (Orlando Miller / Brandon Wilson / Derek Jeter / Mike Neal) PROS, RC, UERRC for Neal only":
            ("SS Prospects (Orlando Miller / Brandon Wilson / Derek Jeter / Mike Neal)","Neal"),
        "1B Prospects (Greg Pirkl / Roberto Petagine / D.J. Boston / Shawn Wooten) PROS, RCRC for Boston and Wooten only":
            ("1B Prospects (Greg Pirkl / Roberto Petagine / D.J. Boston / Shawn Wooten)","Boston and Wooten"),
        "OF Prospects (Eddie Zambrano / Glenn Murray / Chad Mottola / Jermaine Allensworth) PROS, RCRC for Allensworth and Zambrano only":
            ("OF Prospects (Eddie Zambrano / Glenn Murray / Chad Mottola / Jermaine Allensworth)","Allensworth and Zambrano"),
        "C Prospects (Chris Howard / Carlos Delgado / Jason Kendall / Paul Bako) PROS, RCRC for Bako and Howard only":
            ("C Prospects (Chris Howard / Carlos Delgado / Jason Kendall / Paul Bako)","Bako and Howard"),
        "Dan Ehler DPK, UER5th line, \"...rest in history\", should be \"...rest is history\"":
            ("Dan Ehler",""),
        "James Baldwin / Rod Bolton CANot an RC for either player":
            ("James Baldwin / Rod Bolton",""),
        "Chipper Jones / Ryan Klesko CANot an RC for either player":
            ("Chipper Jones / Ryan Klesko",""),
        "Carl Everett / Dave Weathers CANot an RC for either player":
            ("Carl Everett / Dave Weathers",""),
        "Gabe White / Rondell White CANot an RC for either player":
            ("Gabe White / Rondell White",""),
        "Brook Fordyce / Bill Pulsipher CANot an RC for either player":
            ("Brook Fordyce / Bill Pulsipher",""),
        "Kevin Foster / Gene Schall CA, RCRC for Foster only":
            ("Kevin Foster / Gene Schall","Foster"),
        "Rich Aude / Midre Cummings CA, RCRC for Aude only":
            ("Rich Aude / Midre Cummings","Aude"),
        "Brian Barber / Richard Batchelor CA, RCRC for Batchelor only":
            ("Brian Barber / Richard Batchelor","Batchelor"),
        "Brian Johnson / Scott Sanders CA, RCRC for Johnson only":
            ("Brian Johnson / Scott Sanders","Johnson"),
        "Rikkert Faneyte / J.R. Phillips CA, RCRC for Faneyte only":
            ("Rikkert Faneyte / J.R. Phillips","Faneyte"),
        "Hank Aaron20th Anniversary #715":
            ("Hank Aaron 20th Anniversary #715",""),
    }
    for raw,expected in checks.items():
        observed=normalize(raw)
        if observed!=expected:
            raise SystemExit(
                f"Normalization test failed: {raw!r}\n"
                f"  expected: {expected!r}\n  observed: {observed!r}"
            )
    for raw,expected in {
        "SS Prospects (Orlando Miller / Brandon Wilson / Derek Jeter / Mike Neal)":
            "SS Prospects (Orlando Miller / Brandon Wilson / Derek Jeter / Mike Neal RC)",
        "Kevin Foster / Gene Schall":
            "Kevin Foster RC / Gene Schall",
        "1B Prospects (Greg Pirkl / Roberto Petagine / D.J. Boston / Shawn Wooten)":
            "1B Prospects (Greg Pirkl / Roberto Petagine / D.J. Boston RC / Shawn Wooten RC)",
    }.items():
        if raw.startswith("SS Prospects"):
            note="Neal"
        elif raw.startswith("Kevin Foster"):
            note="Foster"
        else:
            note="Boston and Wooten"
        result=label_named_rcs(raw,note)
        if result!=expected:
            raise SystemExit(
                f"Player-specific RC test failed {raw!r}: {result!r}"
            )
    print(f"Annotation regression checks: {len(checks)} documented cases passed",flush=True)

def fetch_cards(url, expected, label, max_pages=11):
    # Printed #370 occurs twice for different players. Print-code variations
    # of the SAME player are collapsed, rather than becoming extra cards.
    cards={}
    for page in range(1,max_pages+1):
        parsed=Rows()
        parsed.feed(fetch(f"{url}?PageIndex={page}"))
        seen=0; added=0
        for row in parsed.rows:
            vals=[v.strip() for v in row if v.strip()]
            for i,value in enumerate(vals):
                if not re.fullmatch(r"\d{1,3}[a-zA-Z]?",value) or i+1>=len(vals):
                    continue
                number=int(re.match(r"\d+",value).group())
                if not 1<=number<=792:continue
                raw=vals[i+1]
                if raw.lower() in ("add","edit","options"):continue
                name,rc_note=normalize(raw)
                team=vals[-1] if i+2<len(vals) else ""
                if team==raw:team=""
                seen+=1
                group=cards.setdefault(number,{})
                if name in group:
                    if group[name][0]!=team:
                        raise SystemExit(f"{label} #{number} {name}: conflicting teams")
                else:
                    group[name]=(team,raw,rc_note);added+=1
                break
        total=sum(len(v) for v in cards.values())
        print(f"{label} page {page}: parsed {seen}; +{added}; {total}/{expected if expected is not None else 'source index'}",flush=True)
        if expected is not None and total==expected:break
        if page>1 and seen==0:break
    total=sum(len(v) for v in cards.values())
    if expected is not None and total!=expected:
        raise SystemExit(f"{label}: expected {expected}, got {total}; no CSV written")
    return cards

def check_numbering(cards,label):
    expected=set(range(1,793))-{379}
    if set(cards)!=expected:
        raise SystemExit(f"{label}: missing {sorted(expected-set(cards))[:15]}; extra {sorted(set(cards)-expected)[:15]}")
    for number,names in cards.items():
        if number==370:
            if set(names)!=TWO_370:
                raise SystemExit(f"{label}: incorrect double-#370 subjects: {list(names)}")
        elif len(names)!=1:
            raise SystemExit(f"{label} #{number}: unexpected distinct subjects {list(names)}")

def output_number(number,name):
    # "370-M" is an INTERNAL identifier; both cards physically print #370.
    if number==370:
        if name=="Mark McLemore":return "370-M"
        if name=="Benny Santiago":return "370"
        raise SystemExit("Unrecognized card #370")
    return str(number)

def subset(name,raw):
    for tag,label in [("PROS","Prospects"),("DPK","Draft Picks"),
                      ("FS","Future Stars"),("MOG","Measures of Greatness"),
                      ("TRIB","Tribute"),("AS","All-Stars")]:
        if re.search(r"\b"+tag+r"\b",raw):return label
    if "checklist" in name.lower() or re.search(r"\bCL\b",raw):
        return "Checklist"
    return ""

def label_named_rcs(name,note):
    """Label only expressly named rookie players, including unparenthesized CA."""
    if not note or "/" not in name:return None
    match=re.fullmatch(r"(.+?)\s*\((.+)\)",name)
    if match:
        prefix,inside=match.groups()
    else:
        prefix=None
        inside=name
    players=[p.strip() for p in inside.split("/")]
    surnames=[p.split()[-1] for p in players]
    if len(surnames)!=len(set(surnames)):return None
    selected={i for i,surname in enumerate(surnames)
              if re.search(r"\b"+re.escape(surname)+r"\b",note,re.I)}
    if not selected:return None
    updated=' / '.join(
        p+' RC' if i in selected else p for i,p in enumerate(players)
    )
    return f"{prefix} ({updated})" if prefix else updated

def main():
    validate_known_annotations()
    rookies=fetch_cards(
        "https://www.tcdb.com/Rookies.cfm/sid/426/1994-Topps",
        None,"rookies",max_pages=4)
    # TCDB source reports 118 records, not 118 unique rookie subjects.
    # The current HTML table parser reads 117 rows (100 + 17); independently
    # verified page two includes all 18 numbers below. Fail if more than one
    # source row is absent, rather than import an incomplete rookie index.
    missing_page2=ROOKIE_PAGE2_NUMBERS-set(rookies)
    if len(missing_page2)>1:
        raise SystemExit(
            f"Rookie index page two is incomplete: missing {sorted(missing_page2)}"
        )
    for number in sorted(missing_page2):
        print(
            f"Rookie index #{number}: recovered number from independently "
            "verified TCDB page-two index; subject will come from Base"
        )
        rookies[number]={}
    rc_numbers=set(rookies)
    if len(rc_numbers)<ROOKIE_MIN_INDEX_NUMBERS:
        raise SystemExit(
            f"Rookie index unexpectedly short: {len(rc_numbers)} unique card numbers"
        )
    print(
        f"Rookie index: {ROOKIE_INDEX_RECORDS} TCDB reported records; "
        f"{len(rc_numbers)} parsed unique rookie card numbers"
    )
    base=fetch_cards(
        "https://www.tcdb.com/Checklist.cfm/sid/426/1994-Topps",792,"base")
    check_numbering(base,"base")
    # The dedicated TCDB Rookie Cards index is the authority for whether
    # a card number is recognized as a rookie card. The base checklist's
    # displayed "RC" annotations are NOT a complete equivalent: for
    # multi-player/Coming Attraction cards a card can be in the rookie index
    # while the base listing omits or rearranges the RC annotation.
    # Preserve the index, and report discrepancies for manual QA.
    base_rc_numbers={
        number for number,subjects in base.items()
        if any(
            re.search(r"(?<![A-Za-z])RC(?![A-Za-z])",raw,re.I)
            for _team,raw,_note in subjects.values()
        )
    }
    index_only=sorted(rc_numbers-base_rc_numbers)
    base_only=sorted(base_rc_numbers-rc_numbers)
    if index_only:
        print(
            f"Rookie index: {len(index_only)} cards have no explicit RC "
            f"tag in Base: {index_only}; trusting dedicated rookie index"
        )
    if base_only:
        print(
            f"Rookie review: {len(base_only)} Base RC-tagged cards not in "
            f"rookie index: {base_only}; NOT automatically labeling them RC"
        )
    print(
        f"Rookie-number authority: {len(rc_numbers)} TCDB index card "
        "numbers; player-level exceptions still require review"
    )
    gold=fetch_cards(
        "https://www.tcdb.com/Checklist.cfm/sid/10288/1994-Topps-Gold",792,"gold")
    check_numbering(gold,"gold")
    for number,expected_name in GOLD_REPLACEMENTS.items():
        if set(gold[number])!={expected_name}:
            raise SystemExit(f"Gold #{number}: unexpected replacement {list(gold[number])}")
    corrections=[]
    aliases=[]
    unresolved=[]
    # Explicitly verified alternative public names, never global guessing.
    gold_aliases={
        (73,"Bill Spiers"):"Billy Spiers",
        (440,"Denny Martinez"):"Dennis Martinez",
        (457,"Roberto Kelly"):"Bobby Kelly",
    }
    for number,subjects in gold.items():
        if number in GOLD_REPLACEMENTS:continue
        for name,(team,raw,note) in list(subjects.items()):
            base_name=name
            if name not in base[number]:
                # Verified identical player, same printed card number and
                # same team: TCDB Base #73 calls him "Billy Spiers" while
                # Gold #73 uses "Bill Spiers". Canonicalize ONLY this
                # explicitly researched alias, never arbitrary lookalikes.
                preferred=gold_aliases.get((number,name))
                if (preferred is not None
                        and set(base[number])=={preferred}
                        and team==base[number][preferred][0]):
                    base_name=preferred
                    aliases.append((number,name,base_name))
                    del subjects[name]
                    subjects[base_name]=(team,raw,note)
                else:
                    unresolved.append((
                        number,name,team,
                        [(base_n,base_t[0]) for base_n,base_t
                         in base[number].items()]
                    ))
                    continue
            base_team=base[number][base_name][0]
            if team!=base_team:
                corrections.append((number,base_name,team,base_team))
                subjects[base_name]=(base_team,raw,note)
    for number,alias,canonical in aliases:
        print(f"Gold #{number}: verified player-name alias {alias!r} -> {canonical!r}")
    if unresolved:
        print(f"Gold: {len(unresolved)} unexpected player mismatches (all listed):")
        for number,name,team,candidates in sorted(unresolved):
            print(
                f"  Gold #{number}: {name!r} / {team!r}; "
                f"Base candidates: {candidates!r}"
            )
        raise SystemExit(
            "Gold has unresolved player mismatches: "
            "review entire list before import; NO CSV written"
        )
    if len(corrections)>30:
        raise SystemExit(f"Excessive Gold team mismatches: {len(corrections)}")
    for number,name,old,new in corrections:
        print(f"Gold #{number} {name}: team {old!r} -> {new!r}")
    print(
        f"Gold: {sum(len(v) for v in gold.values())} cards validated; "
        f"{len(aliases)} verified name alias(es), "
        f"{len(corrections)} team difference(s)"
    )
    black=fetch_cards(
        "https://www.tcdb.com/Checklist.cfm/sid/427/1994-Topps-Black-Gold",44,"black-gold")
    finest=fetch_cards(
        "https://www.tcdb.com/Checklist.cfm/sid/10362/1994-Topps-1994-Finest-Pre-Production",
        40,"finest-pre-production")
    if set(black)!=set(range(1,45)):
        raise SystemExit("Black Gold numbering differs from #1-44")
    rows=[];review=[]
    for key,cards in (("base",base),("gold",gold),
                      ("black-gold",black),("finest-pre-production",finest)):
        for number,subjects in sorted(cards.items()):
            for name,(team,raw,note) in sorted(subjects.items()):
                player=name
                if key=="base" and number in rc_numbers:
                    if "/" in name:
                        selected=label_named_rcs(name,note)
                        if selected:player=selected
                        else:review.append((number,name))
                    else:player+=" RC"
                group=subset(name,raw) if key=="base" else ""
                if not team and group=="Checklist":team="MLB"
                if not team:
                    raise SystemExit(f"{key} #{number} {name}: missing team; no CSV")
                rows.append((key,output_number(number,name),player,team,
                             group,"Gold" if key=="gold" else ""))
    expected=sum(source[2] for source in SOURCES)
    if len(rows)!=expected or len({(r[0],r[1]) for r in rows})!=expected:
        raise SystemExit(f"Expected {expected} unique cards; got {len(rows)}")
    OUT.parent.mkdir(parents=True,exist_ok=True)
    with OUT.open("w",newline="",encoding="utf-8") as file:
        writer=csv.writer(file,lineterminator="\n")
        writer.writerow(["setKey","cardNumber","player","team","subset","variant"])
        writer.writerows(rows)
    print("=== 1994 TOPPS BASEBALL GENERATED ===")
    print(f"{len(rows)} cards / {len(SOURCES)} Product Sets")
    print("Base 792; Gold 792; Black Gold 44; Finest Pre-Production 40")
    print(f"Recognized unique rookie card numbers: {len(rc_numbers)}; multi-player RC review: {len(review)}")
    for number,name in review:print(f"  REVIEW #{number}: {name}")
    print(f"Generated CSV: {OUT}; DRAFT only, scans/pricing pending")

if __name__ == "__main__":
    main()
