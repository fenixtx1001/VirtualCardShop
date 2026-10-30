#!/usr/bin/env python3
"""1991 Upper Deck Baseball: full-checklist, fail-closed Set Factory generator.

Creates the CSV for the 11-set draft manifest. No network is used with --self-test.
Regular runs fetch canonical checklist pages at TCDB (not image content) and
validate counts, numbering, source identities, team names and rookie markers.
NO CSV is written when any source is blocked, partial or inconsistent.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
STEM = "1991-upper-deck-baseball"
BUNDLE = DATA / (STEM + ".bundle.json")
OUT = DATA / (STEM + ".cards.csv")
BASE_SID = 171
TOTAL = 878
HEADER = ["setKey", "cardNumber", "player", "team", "subset", "variant"]

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
NUMBER = re.compile(r"^(?:\d{1,3}|SS\d{1,2}|H\d|SP[12]|HH1|NNO)$", re.I)
ANNOTATION = re.compile(
    r"(?:\s+|,\s*)(?:RC|SR|TP|TC|CL|CPC|HDR|SP|VAR|UER|ERR|COR|AU|SN\d+)"
    r"(?=\s|,|;|:|$)", re.I
)
BAD_NAME = re.compile(r"\b(?:UER|ERR|COR|VAR|AU|SN\d+)\b", re.I)
KEY_CARDS = {
    2: "Phil Plantier",
    24: "Eric Karros",
    55: "Chipper Jones",
    65: "Mike Mussina",
    132: "Ryne Sandberg",
    345: "Nolan Ryan",
    525: "George Brett",
    567: "Luis Gonzalez",
    700: "Checklist",
    755: "Jeff Bagwell",
    800: "Checklist",
}
MISSING_TEAM_OK = {
    ("base", "1"), ("base", "50"), ("base", "100"),
    ("base", "200"), ("base", "300"), ("base", "400"),
    ("base", "500"), ("base", "600"), ("base", "700"),
    ("base", "800"),
}

class CardRows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None
        self.linked_card = False

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
            self.linked_card = False
        elif tag == "td" and self.row is not None:
            self.cell = []
        elif tag == "a" and self.row is not None:
            if any(k == "href" and "ViewCard.cfm" in (v or "") for k, v in attrs):
                self.linked_card = True

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag == "td" and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if self.linked_card and self.row:
                self.rows.append(self.row)
            self.row = None


def is_team(value):
    if not value:
        return False
    return all(part.strip() in KNOWN_CLUBS for part in value.split(" / "))


def parse(html):
    parser = CardRows()
    parser.feed(html)
    found = []
    for row in parser.rows:
        cells = [v for v in row if v.strip()]
        for i, number in enumerate(cells):
            if not NUMBER.fullmatch(number) or i + 1 >= len(cells):
                continue
            player = cells[i + 1]
            if player.lower() in {"options", "edit", "add"}:
                continue
            rest = cells[i + 2:]
            team = rest[-1] if rest and is_team(rest[-1]) else ""
            notes = " ".join(rest[:-1] if team else rest).strip()
            found.append((number.upper(), player, team, notes))
            break
    return found


def fetch(url):
    request = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (compatible; VCS checklist audit)",
                      "Accept": "text/html,application/xhtml+xml"}
    )
    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            return response.read().decode("utf-8", "replace")
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError(f"Checklist source unavailable ({url}): {exc}. NO CSV WRITTEN") from exc


def source_url(sid, page=1, rookie=False):
    kind = "Rookies" if rookie else "Checklist"
    extra = "&BasicID=17" if sid == BASE_SID and not rookie else ""
    return f"https://www.tcdb.com/{kind}.cfm/sid/{sid}/1991-Upper-Deck?PageIndex={page}{extra}"


def get_records(sid, expected, key):
    seen = {}
    result = []
    for page in range(1, 13):
        parsed = parse(fetch(source_url(sid, page)))
        added = 0
        for item in parsed:
            number, label, team, notes = item
            if key == "team-holograms" and number == "NNO":
                if any(previous[1] == label for previous in result):
                    continue
                result.append(item)
                added += 1
                continue
            if number in seen:
                if seen[number] != item:
                    raise RuntimeError(f"{key}: conflicting #{number}: {seen[number]} vs {item}")
                continue
            seen[number] = item
            result.append(item)
            added += 1
        print(f"{key} source page {page}: {len(parsed)} rows, +{added}, {len(result)}/{expected}", flush=True)
        if len(result) >= expected:
            break
        if page > 1 and not added:
            break
        time.sleep(0.2)
    if len(result) != expected:
        raise RuntimeError(f"{key}: required {expected} records, found {len(result)}. NO CSV WRITTEN")
    return result


def recognized_rookies():
    rookies = {}
    for page in range(1, 8):
        rows = parse(fetch(source_url(BASE_SID, page, rookie=True)))
        added = 0
        for number, raw, _team, _notes in rows:
            if number.isdigit() and 1 <= int(number) <= 800:
                normalized = str(int(number))
                name = clean_name(raw)
                if normalized in rookies and rookies[normalized] != name:
                    raise RuntimeError(f"RC source conflict #{normalized}")
                if normalized not in rookies:
                    added += 1
                rookies[normalized] = name
        print(f"RC index page {page}: +{added}, {len(rookies)} unique", flush=True)
        if page > 1 and not added:
            break
        time.sleep(0.2)
    required = {"24", "55", "65", "567", "755"}
    if not required.issubset(rookies) or not 20 <= len(rookies) <= 150:
        raise RuntimeError(f"RC source incomplete or inconsistent: {len(rookies)} rows; missing {required - set(rookies)}")
    return rookies


def clean_name(name):
    value = " ".join(name.split())
    match = ANNOTATION.search(value)
    if match:
        value = value[:match.start()]
    return value.strip(" ,;:-")


def row_for(key, number, label, team, note="", rookie=False):
    player = clean_name(label)
    if not player:
        raise RuntimeError(f"{key} #{number}: empty player/subject")
    if key == "ryan-heroes" and number == "NNO":
        player, team = "Nolan Ryan Baseball Heroes Header", "MLB"
        note = "; ".join(filter(None, [note, "Unnumbered short-printed header"]))
    elif key == "aaron-heroes" and number == "NNO":
        player, team = "Hank Aaron Baseball Heroes Header", "MLB"
        note = "; ".join(filter(None, [note, "Unnumbered short-printed header"]))
    elif key == "heroes-event" and number == "H4":
        player = "Upper Deck Heroes of Baseball Header"
        team = team or "MLB"
    elif key == "base" and number == "617":
        team = team or "MLB"
    elif key == "team-holograms":
        team = team or player
        note = "; ".join(filter(None, [note, "Unnumbered team/league logo hologram"]))
    if rookie:
        player += " RC"
    if key in ("ryan-auto", "aaron-auto"):
        note = "; ".join(filter(None, [note, "Autograph; hand-numbered /2500"]))
    elif key == "heroes-event-autos":
        note = "; ".join(filter(None, [note, "Autograph; numbered /3000; event pack only"]))
    elif key == "special-prints" and number == "SP1":
        player, team = "Michael Jordan", "Chicago White Sox"
    elif key == "special-prints" and number == "SP2":
        player, team = "Nolan Ryan / Rickey Henderson", "Texas Rangers / Oakland Athletics"
        note = "; ".join(filter(None, [note, "A Day to Remember"]))
    elif key == "aaron-hologram":
        player, team = "Hank Aaron", "Atlanta Braves"
        note = "; ".join(filter(None, [note, "Hologram"]))
    if key == "base" and number in ("231", "309", "636"):
        variation = {
            "231": "Known variations: Brian Downing with/without DH on front",
            "309": "Known variations: Milt Thompson back stat printing",
            "636": "Known variations: Rickey Henderson / Lou Brock with/without May 1, 1991 date",
        }[number]
        note = "; ".join(filter(None, [note, variation]))
    if BAD_NAME.search(player):
        raise RuntimeError(f"{key} #{number}: annotation leaked into player: {player}")
    if not team and (key, number) not in MISSING_TEAM_OK:
        raise RuntimeError(f"{key} #{number}: missing team for {player}")
    return [key, number, player, team, "", note]


def assemble(bundle, source, rookies):
    cards = []
    by_key = {}
    for spec in bundle["productSets"]:
        key = spec["key"]
        records = list(source[key])
        if key == "team-holograms":
            records.sort(key=lambda record: clean_name(record[1]).casefold())
        out = []
        for i, (number, label, team, note) in enumerate(records, 1):
            if key == "team-holograms":
                number = f"NNO-{i:02d}"
            n = str(int(number)) if number.isdigit() else number
            if key == "base":
                name = clean_name(label)
                if n in rookies and name != rookies[n]:
                    raise RuntimeError(f"Base #{n} RC identity differs from rookie index: {name} / {rookies[n]}")
                rookie = n in rookies
            else:
                rookie = False
            line = row_for(key, n, label, team, note, rookie)
            if key == "base":
                if n == "1" or 2 <= int(n) <= 27:
                    line[4] = "Star Rookies"
                elif n == "50" or 51 <= int(n) <= 76:
                    line[4] = "Top Prospects"
                elif "Team Checklist" in label or bool(re.search(r"\bTC\b", label)):
                    line[4] = "Team Checklist"
                elif "Checklist" in name:
                    line[4] = "Checklist"
                elif n == "702":
                    line[4] = "Rookie Threats"
                elif n == "725":
                    line[4] = "MVP Lineup"
            out.append(line)
        by_key[key] = out
        cards.extend(out)
    validate(bundle, by_key, cards, rookies)
    return cards


def validate(bundle, by_key, cards, rookies):
    for spec in bundle["productSets"]:
        key = spec["key"]
        out = by_key[key]
        actual = len(out)
        if actual != spec["expectedCards"]:
            raise RuntimeError(f"{key}: {actual} != {spec['expectedCards']}")
        numbers = [row[1] for row in out]
        if len(numbers) != len(set(numbers)):
            raise RuntimeError(f"{key}: duplicate checklist number")
    if {int(r[1]) for r in by_key["base"]} != set(range(1, 801)):
        raise RuntimeError("Base checklist MUST contain every number from 1 through 800")
    base = {int(r[1]): r for r in by_key["base"]}
    for number, player in KEY_CARDS.items():
        if base[number][2].removesuffix(" RC") != player:
            raise RuntimeError(f"Base anchor #{number}: {base[number][2]!r} != {player!r}")
    required = {"24", "55", "65", "567", "755"}
    if not required.issubset(rookies):
        raise RuntimeError("Incomplete verified rookie set")
    assert base[55][2] == "Chipper Jones RC"
    assert base[65][2] == "Mike Mussina RC"
    assert base[755][2] == "Jeff Bagwell RC"
    expected = {
        "special-prints": {"SP1", "SP2"},
        "aaron-hologram": {"HH1"},
        "ryan-heroes": set(map(str, range(10, 19))) | {"NNO"},
        "aaron-heroes": set(map(str, range(19, 28))) | {"NNO"},
        "silver-sluggers": {"SS" + str(i) for i in range(1, 19)},
        "team-holograms": {"NNO-" + str(i).zfill(2) for i in range(1, 29)},
        "heroes-event": {"H1", "H2", "H3", "H4"},
        "ryan-auto": {"18"},
        "aaron-auto": {"27"},
        "heroes-event-autos": {"H1", "H2", "H3"},
    }
    for key, numbers in expected.items():
        present = {row[1] for row in by_key[key]}
        if present != numbers:
            raise RuntimeError(f"{key}: unexpected IDs missing={numbers-present}; extra={present-numbers}")
    if len(cards) != TOTAL or len({(r[0], r[1]) for r in cards}) != TOTAL:
        raise RuntimeError("Total must equal 878 unique (setKey, cardNumber) rows")
    for row in cards:
        if re.search(r"\b1\s*:\s*\d+", row[5]):
            raise RuntimeError(f"{row[0]} #{row[1]}: odds leaked into Variant")
    if any(row[2].endswith(" RC") and row[0] != "base" for row in cards):
        raise RuntimeError("Inserts incorrectly marked RC")


def self_test():
    fixture = (
        "<table><tr><td><a href='ViewCard.cfm/sid/171'>55</a></td>"
        "<td><a href='ViewCard.cfm/sid/171'>Chipper Jones TP, RC</a></td>"
        "<td>Atlanta Braves</td></tr>"
        "<tr><td><a href='ViewCard.cfm/sid/94496'>NNO</a></td>"
        "<td>American League</td><td></td></tr></table>"
    )
    parsed = parse(fixture)
    assert parsed == [
        ("55", "Chipper Jones TP, RC", "Atlanta Braves", ""),
        ("NNO", "American League", "", ""),
    ], parsed
    assert clean_name("Chipper Jones TP, RC") == "Chipper Jones"
    assert clean_name("Harmon Killebrew AU, SN3000") == "Harmon Killebrew"
    assert clean_name("Ken Boswell") == "Ken Boswell"
    assert row_for("team-holograms", "NNO-01", "American League", "")[3] == "American League"
    assert row_for("ryan-heroes", "NNO", "Header Card HDR, SP", "")[2] == "Nolan Ryan Baseball Heroes Header"
    assert row_for("special-prints", "SP1", "Michael Jordan SP", "Chicago White Sox")[2] == "Michael Jordan"
    bundle = json.loads(BUNDLE.read_text(encoding="utf-8"))
    assert bundle["schemaVersion"] == 2 and bundle["product"]["released"] is False
    assert len(bundle["productSets"]) == 11
    assert sum(s["expectedCards"] for s in bundle["productSets"]) == TOTAL
    assert len({s["key"] for s in bundle["productSets"]}) == 11
    assert len({s["id"] for s in bundle["productSets"]}) == 11
    print("PASS: offline source parser, cleaning, manifest and 878-card expectations")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    self_test()
    if args.self_test:
        return
    bundle = json.loads(BUNDLE.read_text(encoding="utf-8"))
    sources = {}
    try:
        rookies = recognized_rookies()
        for spec in bundle["productSets"]:
            key = spec["key"]
            if key == "special-prints":
                # TCDB indexes the SP cards with HH1 and a magazine, not as a separate set.
                continue
            if key == "aaron-hologram":
                continue
            sources[key] = get_records(spec["sourceSetId"], spec["expectedCards"], key)
        special_rows = parse(fetch("https://www.tcdb.com/Inserts.cfm/sid/171/1991-Upper-Deck"))
        # The short-print singles are in the TCDB insert table, not the numbered base checklist.
        singles = {}
        for n, player, team, notes in special_rows:
            if n in ("SP1", "SP2", "HH1"):
                singles[n] = (n, player, team, notes)
        if set(singles) != {"SP1", "SP2", "HH1"}:
            raise RuntimeError(f"Unverified singles in inserts page: {sorted(singles)}")
        sources["special-prints"] = [singles["SP1"], singles["SP2"]]
        sources["aaron-hologram"] = [singles["HH1"]]
        cards = assemble(bundle, sources, rookies)
    except Exception as exc:
        print(f"FAIL CLOSED: {exc}\nNo output checklist was written.", file=sys.stderr)
        sys.exit(1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUT.with_suffix(".csv.tmp")
    try:
        with temporary.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.writer(fh, lineterminator="\n")
            writer.writerow(HEADER)
            writer.writerows(cards)
        temporary.replace(OUT)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"PASS: {TOTAL} verified checklist records across 11 collector sets.")
    for spec in bundle["productSets"]:
        print(f"  {spec['key']}: {spec['expectedCards']}")
    print(f"  True Base RCs: {len(rookies)}")
    print(f"  CSV written: {OUT}")


if __name__ == "__main__":
    main()
