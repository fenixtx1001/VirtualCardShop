#!/usr/bin/env python3
"""Generate and audit the complete 1991 Upper Deck Baseball draft, offline by default.

The committed source snapshot contains the retrieved TCDB rows and independent
BCP/Cardboard Connection checklists. --refresh-sources retrieves all sources;
any retrieval, identity, numbering, rookie or metadata failure prevents writes.
--check verifies the committed CSV without changing it. --self-test also runs
negative tests against the full dataset. No database access occurs here.
"""
from __future__ import annotations
import argparse
import copy
import csv
import hashlib
import html
import io
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
STEM = "1991-upper-deck-baseball"
BUNDLE = DATA / (STEM + ".bundle.json")
SOURCE = DATA / (STEM + ".source.json")
OUT = DATA / (STEM + ".cards.csv")
HEADER = ["setKey", "cardNumber", "player", "team", "subset", "variant"]
TOTAL = 878
KNOWN_CLUBS = {
    "Atlanta Braves", "Baltimore Orioles", "Boston Red Sox",
    "California Angels", "Chicago Cubs", "Chicago White Sox",
    "Cincinnati Reds", "Cleveland Indians", "Detroit Tigers",
    "Houston Astros", "Kansas City Royals", "Los Angeles Dodgers",
    "Milwaukee Brewers", "Minnesota Twins", "Montreal Expos",
    "New York Mets", "New York Yankees", "Oakland Athletics",
    "Philadelphia Phillies", "Pittsburgh Pirates", "St. Louis Cardinals",
    "San Diego Padres", "San Francisco Giants", "Seattle Mariners",
    "Texas Rangers", "Toronto Blue Jays", "Milwaukee Braves",
    "American League", "National League",
}
class Rows(HTMLParser):
    """Retain captions separately, including when source markup omits spaces."""

    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None
        self.caption = False
        self.link = False

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.row = []
            self.link = False
        elif tag == 'td' and self.row is not None:
            self.cell = {'label': [], 'note': []}
        elif tag == 'figcaption' and self.cell is not None:
            self.caption = True
        elif tag == 'br' and self.cell is not None:
            self.cell['note' if self.caption else 'label'].append(' ')
        elif tag == 'a' and self.row is not None:
            if 'ViewCard.cfm' in dict(attrs).get('href', ''):
                self.link = True

    def handle_data(self, data):
        if self.cell is not None:
            self.cell['note' if self.caption else 'label'].append(data)

    def handle_endtag(self, tag):
        if tag == 'figcaption':
            self.caption = False
        elif tag == 'td' and self.cell is not None:
            self.row.append({k: ' '.join(''.join(v).split()) for k, v in self.cell.items()})
            self.cell = None
            self.caption = False
        elif tag == 'tr' and self.row is not None:
            if self.link:
                self.rows.append(self.row)
            self.row = None


NUM = re.compile(r'^(?:\d{1,3}[a-z]?|SS\d{1,2}|H\d|SP[12]|HH1|NNO)$', re.I)


def parse(raw):
    parser = Rows()
    parser.feed(raw)
    out = []
    for row in parser.rows:
        cells = [c for c in row if c['label']]
        for i, cell in enumerate(cells):
            if NUM.fullmatch(cell['label']) and i + 1 < len(cells):
                label = cells[i + 1]
                rest = cells[i + 2:]
                if len(rest) > 1:
                    raise ValueError(f'Unexpected checklist columns: {rest}')
                out.append([cell['label'].upper(), label['label'],
                            rest[0]['label'] if rest else '', label['note']])
                break
    return out

# Only a complete trailing token is removed; names such as Boswell/Hall survive.
TAGS = r"(?:RC|SR|TP|TC|CL|CPC|HDR|SP|VAR|UER|ERR|COR|AU|SN\d+)"
TRAILING = re.compile(r"\s+(" + TAGS + r"(?:,?\s+" + TAGS + r")*)$", re.I)

def require(condition, message):
    if not condition:
        raise ValueError(message)


def split_label(label):
    label = " ".join(label.split())
    match = TRAILING.search(label)
    if not match:
        return label, set()
    return label[:match.start()], set(re.split(r",?\s+", match[1].upper()))


def clean_name(label):
    return split_label(label)[0]


def is_checklist(player, subset=""):
    return "checklist" in (player + " " + subset).lower()


def is_team(value):
    return bool(value) and all(x in KNOWN_CLUBS for x in value.split(" / "))


def source_url(sid, page=1, rookie=False):
    kind = "Rookies" if rookie else "Checklist"
    extra = "&BasicID=17" if sid == 171 and not rookie else ""
    return f"https://www.tcdb.com/{kind}.cfm/sid/{sid}/1991-Upper-Deck?PageIndex={page}{extra}"


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; VCS checklist audit)"})
    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            return response.read().decode("utf-8", "replace")
    except Exception as exc:
        raise RuntimeError(f"Source unavailable: {url}: {exc}; no output written") from exc


def independent_base(raw, site):
    if site == "bcp":
        part = raw[raw.index('id="Low-Series"'):raw.index('id="Variations"')]
        return [html.unescape(re.sub('<[^>]+>', '', x)).strip()
                for x in re.findall(r'<li>(.*?)</li>', part, re.S)]
    part = raw[raw.index('>1 Star Rookie Checklist'):]
    part = part[:part.index('800 Checklist') + len('800 Checklist')]
    lines = [html.unescape(re.sub('<[^>]+>', '', x)).strip('> \n')
             for x in re.split(r'<br\s*/?>|</div>', part)]
    return [x for x in lines if re.match(r'^\d{1,3} ', x)]


BCP_SECTIONS = {
    "special-prints": "SP", "ryan-heroes": "Nolan_Ryan_Baseball_Heroes",
    "aaron-heroes": "Hank_Aaron_Baseball_Heroes", "aaron-hologram": "Heroes_of_Baseball_Hologram",
    "silver-sluggers": "Silver_Sluggers", "heroes-event": "Heroes_of_Baseball",
    "heroes-event-autos": "Heroes_of_Baseball_Autograph", "autos": "Ryan/Aaron_Autographed_Baseball_Heroes",
}


def refresh_sources(bundle):
    urls = {f"base-{i}": source_url(171, i) for i in range(1, 10)}
    urls.update({f"rookies-{i}": source_url(171, i, True) for i in range(1, 4)})
    urls.update({s["key"]: source_url(s["sourceSetId"]) for s in bundle["productSets"]
                 if s["key"] not in ("base", "special-prints", "aaron-hologram")})
    urls["singles"] = "https://www.tcdb.com/Inserts.cfm/sid/171/1991-Upper-Deck"
    sources = {}
    for key, url in urls.items():
        raw = fetch(url)
        sources[key] = {"url": url, "sha256": hashlib.sha256(raw.encode()).hexdigest(), "records": parse(raw)}
        print(f"Retrieved {key}: {len(sources[key]['records'])} rows", flush=True)
    for site, url in [("bcp", "https://baseballcardpedia.com/index.php/1991_Upper_Deck"),
                      ("ccc", "https://www.cardboardconnection.com/1991-upper-deck-baseball-cards")]:
        raw = fetch(url)
        digest = hashlib.sha256(raw.encode()).hexdigest()
        sources[site + "-base"] = {"url": url, "sha256": digest, "records": independent_base(raw, site)}
        if site == "bcp":
            for key, heading in BCP_SECTIONS.items():
                part = raw[raw.index('id="' + heading + '"'):]
                boundary = re.search(r'<h[234]', part)
                if boundary:
                    part = part[:boundary.start()]
                rows = [html.unescape(re.sub('<[^>]+>', '', x)).strip()
                        for x in re.findall(r'<li>(.*?)</li>', part, re.S)]
                sources['bcp-' + key] = {"url": url + '#' + heading, "sha256": digest, "records": rows}
    return {"schemaVersion": 1, "retrievedAt": datetime.now(timezone.utc).date().isoformat(), "sources": sources}


def source_records(snapshot, key):
    entry = snapshot["sources"][key]
    require(entry["url"].startswith("https://"), f"Missing source URL: {key}")
    return entry["records"]


def canonical_base(snapshot):
    # TCDB BasicID=17 still contains 231a/b and 636a/b. Preserve printed
    # numbering; choose corrected 231b and dated 636a, not a missing-row patch.
    raw = [row for i in range(1, 10) for row in source_records(snapshot, f"base-{i}")]
    require(len(raw) == 802, f"TCDB base retrieval incomplete/unexpected: {len(raw)}")
    result = {}
    for number, label, team, note in raw:
        if number in ("231A", "636B"):
            continue
        number = {"231B": "231", "636A": "636"}.get(number, number)
        require(number.isdigit(), f"Unreviewed base variation: {number}")
        require(number not in result, f"Duplicate base number {number}")
        result[number] = (number, label, team, note)
    require(set(result) == {str(i) for i in range(1, 801)}, "Base must contain each printed number 1..800")
    return [result[str(i)] for i in range(1, 801)]


def recognized_rookies(snapshot, base):
    index = {}
    for page in range(1, 4):
        for number, label, team, _ in source_records(snapshot, f"rookies-{page}"):
            require(number.isdigit() and 1 <= int(number) <= 800, f"Bad RC index number: {number}")
            name, tags = split_label(label)
            require("RC" in tags, f"RC index row lacks explicit RC: {label}")
            require(number not in index or index[number] == (name, team), f"RC identity conflict: {number}")
            index[number] = (name, team)
    require(not source_records(snapshot, "rookies-3"), "RC pagination grew; review required")
    require(len(index) == 70, f"RC index incomplete/unreviewed: {len(index)}")
    # TCDB erroneously labels only Chuck Carr's hologram variations RC. His
    # recognized RC is 1990 Fleer Update U-34 (TCDB + Beckett), not 1991 UD.
    require(index.pop("514") == ("Chuck Carr", "New York Mets"), "Chuck Carr RC exception changed")
    canonical = {n: (clean_name(label), team) for n, label, team, _ in base if "RC" in split_label(label)[1]}
    require(index == canonical, "Base RC tags differ from independently retrieved rookie index (after reviewed #514 exclusion)")
    return index


def row_for(key, number, label, team, note="", rookie=False):
    player, tags = split_label(label)
    subset, notes = "", [note] if note else []
    if key == "base":
        n = int(number)
        if n in (1, 50):
            subset = "Star Rookies Checklist" if n == 1 else "Top Prospects Checklist"
        elif 2 <= n <= 27:
            subset = "Star Rookies"
        elif 51 <= n <= 76:
            subset = "Top Prospects"
        elif n in list(range(28, 35)) + list(range(43, 50)) + list(range(77, 83)) + list(range(94, 100)):
            subset = "Team Checklist"
        elif n % 100 == 0:
            subset = "Checklist"
            notes.append(player.removeprefix("Checklist: "))
            player = "Checklist"
        elif n == 617:
            subset = "Team Card"
        # TCDB titles these cards by caption. BCP and Cardboard Connection
        # independently identify their pictured subjects.
        if n in (93, 656, 677):
            notes.append(player.strip('"'))
            player = {93: "Bobby Thigpen", 656: "Mark McGwire", 677: "Carlton Fisk / Robin Ventura"}[n]
        if n == 83:
            notes = ["Fielder's Feat"]
        if n == 572:
            notes.append("Also pictured: Ken Griffey Jr.")
        if n == 309:
            notes.append("Known printing variation: bullseye over 1986 statistics")
        if n in (636, 702, 725):
            match = re.fullmatch(r"(.+) \((.+)\)", player)
            require(bool(match), f"Unrecognized composite card: {label}")
            subset, player = match.groups()
        if n == 231:
            notes = ["Corrected: DH position on front; error version omits position"]
        elif n == 636:
            notes = ["Dated May 1, 1991 version; undated printing variation also exists"]
    elif key in ("ryan-heroes", "aaron-heroes"):
        if number == "NNO":
            player = ("Nolan Ryan" if key == "ryan-heroes" else "Hank Aaron") + " Baseball Heroes Header"
            subset = "Header"
            notes.append("Unnumbered short-printed header; no team affiliation shown")
        else:
            name = "Nolan Ryan" if key == "ryan-heroes" else "Hank Aaron"
            require(player.startswith(name), f"Unexpected Heroes subject: {player}")
            caption = player[len(name):].strip()
            player = name
            if caption:
                notes.append(caption)
            if "CL" in tags:
                subset = "Checklist"
    elif key == "heroes-event" and number == "H4":
        player = "Harmon Killebrew / Gaylord Perry / Ferguson Jenkins"
        subset = "Header"
        notes.append("Heroes of Baseball header artwork")
    elif key == "team-holograms":
        # League logos have an actual league subject, not an invented filler team.
        if player in ("American League", "National League"):
            team = player
        notes.append("Unnumbered logo hologram; NNO identifier is VCS-only")
    elif key in ("ryan-auto", "aaron-auto", "heroes-event-autos"):
        require("AU" in tags and ("SN3000" if key == "heroes-event-autos" else "SN2500") in tags, f"Unverified autograph numbering: {label}")
        subset = "Checklist" if "CL" in tags else ""
        notes.append("Autograph; hand-numbered /" + ("3000" if key == "heroes-event-autos" else "2500"))
    elif key == "aaron-hologram":
        notes.append("Hologram")
    elif key == "special-prints" and number == "SP2":
        notes.append("A Day to Remember")
    # Set-wide odds and distribution text do not belong in individual variants.
    if key in ("special-prints", "aaron-hologram"):
        notes = [n for n in notes if not re.search(r"(?:Inserted|Issued in)", n, re.I)]
        if number == "SP2":
            notes = ["A Day to Remember"]
    require(player and not re.search(r"\b(?:UER|ERR|COR|VAR|AU|SN\d+)\b", player), f"Dirty subject: {player}")
    if rookie:
        player += " RC"
    require(not team or is_team(team), f"Unrecognized team: {key} #{number} {team}")
    allowed_header = key in ("ryan-heroes", "aaron-heroes") and number == "NNO"
    require(team or is_checklist(player, subset) or allowed_header, f"Missing team: {key} #{number} {player}")
    return [key, number, player, team, subset, "; ".join(dict.fromkeys(n for n in notes if n))]


def assemble(bundle, snapshot):
    require(snapshot["schemaVersion"] == 1, "Unexpected source snapshot schema")
    base = canonical_base(snapshot)
    rookies = recognized_rookies(snapshot, base)
    singles = {r[0]: r for r in source_records(snapshot, "singles") if r[0] in ("SP1", "SP2", "HH1")}
    require(set(singles) == {"SP1", "SP2", "HH1"}, "Incomplete singles checklist")
    cards = []
    for spec in bundle["productSets"]:
        key = spec["key"]
        if key == "base":
            records = base
        elif key == "special-prints":
            records = [singles["SP1"], singles["SP2"]]
        elif key == "aaron-hologram":
            records = [singles["HH1"]]
        else:
            records = source_records(snapshot, key)
        if key == "team-holograms":
            records = sorted(records, key=lambda r: r[1].casefold())
            require({r[1] for r in records} == KNOWN_CLUBS - {"Milwaukee Braves"}, "Incomplete team/league logo subjects")
        out = []
        for i, (number, label, team, note) in enumerate(records, 1):
            if key == "team-holograms":
                require(number == "NNO", "Unexpected printed logo number")
                number = f"NNO-{i:02d}"
            out.append(row_for(key, number, label, team, note, key == "base" and number in rookies))
        require(len(out) == spec["expectedCards"], f"{key}: wrong count {len(out)}")
        cards.extend(out)
    validate(bundle, cards)
    verify_independent(snapshot, cards)
    return cards


def validate(bundle, cards):
    require(bundle["schemaVersion"] == 2 and bundle["status"] == "DRAFT" and bundle["product"]["released"] is False, "Must remain an unreleased draft")
    require(bundle["product"]["cardsPerPack"] == 16 and bundle["product"]["packsPerBox"] == 36, "Pack configuration changed; review required")
    expected_odds = {"special-prints": 72, "ryan-heroes": 12, "aaron-heroes": 12, "team-holograms": 1}
    require(sum(s['kind'] == 'BASE' for s in bundle['productSets']) == 1, "Exactly one BASE checklist required")
    for spec in bundle['productSets']:
        require(spec.get('oddsPerPack') == expected_odds.get(spec['key']), f"Unreviewed odds: {spec['key']}")
        require(spec['kind'] == ('BASE' if spec['key'] == 'base' else 'INSERT'), 'Incorrect set kind')
    expected = {
        "base": {str(i) for i in range(1, 801)}, "special-prints": {"SP1", "SP2"},
        "aaron-hologram": {"HH1"}, "ryan-heroes": {str(i) for i in range(10, 19)} | {"NNO"},
        "aaron-heroes": {str(i) for i in range(19, 28)} | {"NNO"},
        "silver-sluggers": {f"SS{i}" for i in range(1, 19)},
        "team-holograms": {f"NNO-{i:02d}" for i in range(1, 29)},
        "heroes-event": {f"H{i}" for i in range(1, 5)}, "ryan-auto": {"18"},
        "aaron-auto": {"27"}, "heroes-event-autos": {"H1", "H2", "H3"},
    }
    require({s["key"] for s in bundle["productSets"]} == set(expected), "Unreviewed Product Set inventory")
    require(len({s['id'] for s in bundle['productSets']}) == 11, "Duplicate set IDs")
    require(len(cards) == len({(r[0], r[1]) for r in cards}) == TOTAL, "Expected 878 unique card identities")
    for spec in bundle["productSets"]:
        require({r[1] for r in cards if r[0] == spec["key"]} == expected[spec["key"]], f"Wrong IDs in {spec['key']}")
        odds = spec.get("oddsPerPack")
        require(odds is None or type(odds) is int and odds > 0, "Invalid odds")
    base = {int(r[1]): r for r in cards if r[0] == "base"}
    for n, name in {2: "Phil Plantier RC", 24: "Eric Karros RC", 55: "Chipper Jones RC", 65: "Mike Mussina RC", 514: "Chuck Carr", 567: "Luis Gonzalez RC", 755: "Jeff Bagwell RC"}.items():
        require(base[n][2] == name, f"Base identity/RC anchor #{n}")
    require(sum(r[2].endswith(" RC") for r in cards) == 69, "Expected 69 verified true RCs")
    blanks = {(r[0], r[1]) for r in cards if not r[3] and not is_checklist(r[2], r[4])}
    require(blanks == {("ryan-heroes", "NNO"), ("aaron-heroes", "NNO")}, "Unexpected non-team subjects")
    require(bundle['review']['teamData'] == 'PENDING', "Generic headers require explicit pending-team import")
    for row in cards:
        require(len(row) == 6 and all(isinstance(v, str) for v in row), "Invalid CSV row")
        require(not re.search(r"\b1\s*:\s*\d+", row[5]), "Set odds leaked into variant")
        require(row[0] == "base" or not row[2].endswith(" RC"), "Insert incorrectly marked RC")
        require(not row[3] or is_team(row[3]), "Invalid team")
        require(row[3] != "MLB", "Invented team")


def independent_subject(label):
    # The independent checklist has achievement captions and uncorrected-error
    # descriptions inline. This is comparison-only; output uses TCDB cell fields.
    label = re.split(r'\s+(?:UER|ERR|COR|NPOF|SR|TP|RC|CL|3X)\b|\s+["“]|\s+-\s+|\s+Team\s+CL\b|\s+\(w/', label, maxsplit=1)[0]
    return label.strip()


def normalized(name):
    aliases = {
        "Mo Vaughn": "Maurice Vaughn", "Wil Cordero": "Wilfredo Cordero", "Manuel Lee": "Manny Lee", "Mike A. Marshall": "Mike Marshall", "Teddy Higuera": "Ted Higuera",
        "David Justice": "Dave Justice", "David West": "Dave West",
        "Oil Can Boyd": "Dennis Boyd", "Dennis Oil Can Boyd": "Dennis Boyd",
        "Bud Black": "Buddy Black", "Ken Dayley": "Ken Dayley",
    }
    name = aliases.get(name, name)
    return re.sub(r'[^a-z0-9]', '', name.lower())


def verify_independent(snapshot, cards):
    base = {int(r[1]): r for r in cards if r[0] == 'base'}
    for source in ('bcp-base', 'ccc-base'):
        seen = set()
        for line in source_records(snapshot, source):
            match = re.match(r'^(\d{1,3})[ab]?\s+(.+)$', line, re.I)
            require(bool(match), f"Unparsed independent row: {line}")
            n, label = int(match[1]), match[2]
            seen.add(n)
            actual = base[n][2].removesuffix(' RC')
            candidate = independent_subject(label)
            # Reviewed source formatting: checklist ranges are metadata; composite
            # cards list the same people in a different order or as a caption.
            if n in (1, 50) or n % 100 == 0:
                require('checklist' in candidate.lower() and 'checklist' in actual.lower(), f'Checklist mismatch #{n}')
            elif n in (636, 702, 725):
                expected = {636: ('Lou Brock', 'Rickey Henderson'), 702: ('Jeff Bagwell', 'Luis Gonzalez', 'Karl Rhodes'), 725: ('Andre Dawson', 'George Bell', 'Ryne Sandberg')}[n]
                require(all(x in label and x in actual for x in expected), f'Composite mismatch #{n}: {label}')
            elif n == 617:
                require('1917' in label or 'Chicago White Sox' in label, 'Missing 1917 Revisited card')
                require(base[n][3] == 'Chicago White Sox', 'Incorrect #617 team')
            else:
                require(normalized(candidate) == normalized(actual), f'{source} name mismatch #{n}: {candidate!r} vs {actual!r}')
        require(seen == set(range(1, 801)), f'Independent checklist incomplete: {source}')
    # Explicit independent support for every non-base numbered subject. Teams
    # are retained from TCDB; BCP does not publish team assignments in its list.
    for key in BCP_SECTIONS:
        if key == 'autos':
            rows = [r for r in cards if r[0] in ('ryan-auto', 'aaron-auto')]
        else:
            rows = [r for r in cards if r[0] == key]
        source = [x for x in source_records(snapshot, 'bcp-' + key) if re.match(r'^(?:NNO|HH1|SP\d|SS\d+|H\d|\d+)\s+', x)]
        expected = {r[1]: r for r in rows}
        require(len(source) == len(expected), f'Independent insert count mismatch: {key}')
        for line in source:
            number, label = line.split(' ', 1)
            require(number in expected, f'Independent insert ID mismatch: {line}')
            actual = expected[number][2]
            if number == 'NNO':
                require('Header' in label and 'Header' in actual, 'Header mismatch')
            elif key == 'heroes-event' and number == 'H4':
                require(all(x in label and x in actual for x in ('Harmon Killebrew', 'Gaylord Perry', 'Ferguson Jenkin')), 'Event header mismatch')
            elif key in ('ryan-heroes', 'aaron-heroes'):
                require(label.startswith(actual), f'Heroes subject mismatch: {line}')
            else:
                require(normalized(label) == normalized(actual), f'Independent insert subject mismatch: {line} vs {actual}')
    # BCP omits seven RC labels. CCC confirms the five high-series RCs; #538
    # and #629 are explicitly RC in both the TCDB checklist and rookie index.
    bcp_rc = {int(re.match(r'\d+', x)[0]) for x in source_records(snapshot, 'bcp-base') if re.search(r'\bRC\b', x)}
    ccc_rc = {int(re.match(r'\d+', x)[0]) for x in source_records(snapshot, 'ccc-base') if re.search(r'\bRC\b', x)}
    actual_rc = {n for n, r in base.items() if r[2].endswith(' RC')}
    require(actual_rc - bcp_rc == {538, 629, 761, 767, 771, 777, 797} and not bcp_rc - actual_rc, 'BCP RC discrepancy changed')
    require(actual_rc - ccc_rc == {538, 629} and not ccc_rc - actual_rc, 'CCC RC discrepancy changed')


def self_test(bundle, snapshot):
    fixture = "<table><tr><td><a href='ViewCard.cfm/sid/171'>231b</a></td><td>Brian Downing COR<br><figcaption>COR: DH on front</figcaption></td><td>California Angels</td></tr></table>"
    require(parse(fixture) == [['231B', 'Brian Downing COR', 'California Angels', 'COR: DH on front']], 'HTML parser regression')
    for raw, expected in [('Ken Boswell', 'Ken Boswell'), ('Marshall', 'Marshall'), ('Jim Hall', 'Jim Hall'), ('John Marshall CL', 'John Marshall'), ('Jim Hall CL', 'Jim Hall'), ('Chipper Jones TP, RC', 'Chipper Jones'), ('Harmon Killebrew AU, SN3000', 'Harmon Killebrew')]:
        require(clean_name(raw) == expected, f'Trailing-token regression: {raw}')
    cards = assemble(bundle, snapshot)
    # Negative tests prove that a count-correct but corrupted source fails.
    for label, mutate in [
        ('missing source row', lambda s: s['sources']['base-1']['records'].pop()),
        ('wrong player', lambda s: s['sources']['base-2']['records'][30].__setitem__(1, 'Wrong Player')),
        ('invalid team', lambda s: s['sources']['base-2']['records'][30].__setitem__(2, 'MLB')),
        ('missing team', lambda s: s['sources']['base-2']['records'][30].__setitem__(2, '')),
        ('false RC', lambda s: s['sources']['base-1']['records'][4].__setitem__(1, 'Maurice Vaughn SR, RC')),
        ('changed independent source', lambda s: s['sources']['bcp-base']['records'].__setitem__(130, '131 Wrong Player')),
    ]:
        changed = copy.deepcopy(snapshot)
        mutate(changed)
        try:
            assemble(bundle, changed)
        except (ValueError, KeyError):
            pass
        else:
            raise ValueError(f'Negative test did not fail: {label}')
    require(len([r for r in cards if r[4] == 'Team Checklist']) == 26, 'Team checklist subset count')
    require(sum(r[4] == 'Star Rookies' for r in cards) == 26, 'Star Rookies subset count')
    require(sum(r[4] == 'Top Prospects' for r in cards) == 26, 'Top Prospects subset count')
    print('PASS: parser, token boundaries, full source comparisons, RC audit, subset audit and six negative tests')


def csv_text(cards):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(HEADER)
    writer.writerows(cards)
    return stream.getvalue()


def atomic_write(path, text):
    temporary = path.with_suffix(path.suffix + '.tmp')
    try:
        temporary.write_text(text, encoding='utf-8')
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--refresh-sources', action='store_true')
    args = parser.parse_args()
    bundle = json.loads(BUNDLE.read_text())
    snapshot = refresh_sources(bundle) if args.refresh_sources else json.loads(SOURCE.read_text())
    self_test(bundle, snapshot)
    cards = assemble(bundle, snapshot)
    text = csv_text(cards)
    if args.check:
        require(OUT.read_text() == text, 'Committed CSV differs from fully validated generation')
    elif not args.self_test:
        if args.refresh_sources:
            atomic_write(SOURCE, json.dumps(snapshot, indent=2, ensure_ascii=False) + '\n')
        atomic_write(OUT, text)
    print(f'PASS: {len(cards)} verified records / {len(bundle["productSets"])} checklists / 69 true RCs; released=false')
    for spec in bundle['productSets']:
        print(f"  {spec['key']}: {spec['expectedCards']}")


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'FAIL CLOSED: {exc}; no partial checklist written', file=sys.stderr)
        sys.exit(1)
