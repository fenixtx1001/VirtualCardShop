"""Generate the 1999 Upper Deck Black Diamond Baseball Set Factory card CSV.

Numerical checklists are parsed from BaseballCardPedia. Team assignments are
frozen below from the linked TCDB base checklist; no TCDB pages are fetched.
"""

from __future__ import annotations

import argparse
import csv
from html import unescape
from pathlib import Path
import re
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://baseballcardpedia.com/index.php/1999_Black_Diamond"
OUTPUT = ROOT / "data/set-factory/1999-black-diamond-baseball.cards.csv"

# Number ranges are inclusive, as shown on the two TCDB checklist pages.
TEAM_RANGES = [
    (1, 3, "Anaheim Angels"), (4, 6, "Arizona Diamondbacks"),
    (7, 10, "Atlanta Braves"), (11, 14, "Baltimore Orioles"),
    (15, 17, "Boston Red Sox"), (18, 19, "Chicago Cubs"),
    (20, 22, "Chicago White Sox"), (23, 24, "Cincinnati Reds"),
    (25, 28, "Cleveland Indians"), (29, 31, "Colorado Rockies"),
    (32, 33, "Detroit Tigers"), (34, 35, "Florida Marlins"),
    (36, 39, "Houston Astros"), (40, 41, "Kansas City Royals"),
    (42, 44, "Los Angeles Dodgers"), (45, 47, "Milwaukee Brewers"),
    (48, 49, "Minnesota Twins"), (50, 51, "Montreal Expos"),
    (52, 55, "New York Mets"), (56, 59, "New York Yankees"),
    (60, 62, "Oakland Athletics"), (63, 65, "Philadelphia Phillies"),
    (66, 68, "Pittsburgh Pirates"), (69, 72, "San Diego Padres"),
    (73, 75, "San Francisco Giants"), (76, 79, "Seattle Mariners"),
    (80, 82, "St. Louis Cardinals"), (83, 84, "Tampa Bay Devil Rays"),
    (85, 87, "Texas Rangers"), (88, 89, "Toronto Blue Jays"),
    (90, 90, "New York Yankees"),
    (91, 92, "Anaheim Angels"), (93, 93, "Arizona Diamondbacks"),
    (94, 94, "Atlanta Braves"), (95, 96, "Chicago White Sox"),
    (97, 97, "Chicago Cubs"), (98, 98, "Kansas City Royals"),
    (99, 101, "Detroit Tigers"), (102, 102, "Florida Marlins"),
    (103, 103, "Houston Astros"), (104, 105, "Los Angeles Dodgers"),
    (106, 106, "Milwaukee Brewers"), (107, 107, "Minnesota Twins"),
    (108, 108, "Montreal Expos"), (109, 109, "Oakland Athletics"),
    (110, 110, "New York Yankees"), (111, 111, "Oakland Athletics"),
    (112, 112, "Philadelphia Phillies"), (113, 113, "Pittsburgh Pirates"),
    (114, 114, "St. Louis Cardinals"), (115, 115, "San Diego Padres"),
    (116, 116, "Florida Marlins"), (117, 117, "St. Louis Cardinals"),
    (118, 118, "Seattle Mariners"), (119, 119, "Tampa Bay Devil Rays"),
    (120, 120, "Atlanta Braves"),
]

NAME_FIXES = {
    "Cal Ripken, Jr.": "Cal Ripken Jr.",
    "Ken Griffey, Jr.": "Ken Griffey Jr.",
    "Sandy Alomar": "Sandy Alomar Jr.",
    "Jose Cruz": "Jose Cruz Jr.",
}

# Cards #18, #76, and #80 have special numbering in every Diamond parallel.
EXCEPTION_LIMITS = {
    "double": {18: 1998, 76: 1998, 80: 1998},
    "triple": {18: 273, 76: 350, 80: 457},
    "quadruple": {18: 66, 76: 56, 80: 70},
}
PARALLEL_LIMITS = {
    "double": (3000, 2500),
    "triple": (1500, 1000),
    "quadruple": (150, 100),
}


def checklist(html: str, heading: str, pattern: str) -> list[tuple[str, str]]:
    marker = re.search(rf'<h[23] id="{re.escape(heading)}">', html)
    if not marker:
        raise ValueError(f"Missing source section: {heading}")
    content = html[marker.end():]
    next_heading = re.search(r'<h[23] id="', content)
    content = content[:next_heading.start()] if next_heading else content
    source_list = re.search(r'<ul style="list-style-type:none;">(.*?)</ul>', content, re.S)
    if not source_list:
        raise ValueError(f"Missing numbered checklist in {heading}")
    result = []
    for li in re.findall(r'<li>(.*?)</li>', source_list.group(1), re.S):
        value = unescape(re.sub(r'<[^>]*>', '', li)).strip()
        match = re.fullmatch(pattern, value)
        if not match:
            raise ValueError(f"Unexpected card in {heading}: {value}")
        result.append(match.groups())
    return result


def clean(name: str) -> str:
    return NAME_FIXES.get(name.strip(), name.strip())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-html", type=Path, help="Saved BaseballCardPedia HTML")
    args = parser.parse_args()
    if args.source_html:
        html = args.source_html.read_text(encoding="utf-8")
    else:
        with urlopen(Request(SOURCE, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as response:
            html = response.read().decode("utf-8")

    teams = {}
    for start, end, team in TEAM_RANGES:
        for number in range(start, end + 1):
            if number in teams:
                raise ValueError(f"Duplicate team assignment for #{number}")
            teams[number] = team
    if set(teams) != set(range(1, 121)):
        raise ValueError("Team assignments must cover #1-120 exactly")

    short = checklist(html, "Base_Set", r"(\d+)\s+(.+)")
    debut = checklist(html, "Diamond_Debut", r"(\d+)\s+(.+)")
    base = short + debut
    if [int(n) for n, _ in base] != list(range(1, 121)):
        raise ValueError("Base and Diamond Debut checklists must form #1-120")
    by_name = {clean(name): teams[int(n)] for n, name in base}
    if len(by_name) != 120:
        raise ValueError("Expected unique base subjects for insert team lookup")

    rows: list[list[str]] = []
    def add(key: str, number: str, player: str, team: str, subset: str = "", variant: str = "") -> None:
        if not team:
            raise ValueError(f"Missing team for {key} #{number}: {player}")
        rows.append([key, number, player, team, subset, variant])

    for n, raw in base:
        number = int(n)
        name = clean(raw)
        subset = "Diamond Debut" if number > 90 else ""
        add("base", n, name, teams[number], subset)
        for key, (short_limit, debut_limit) in PARALLEL_LIMITS.items():
            limit = EXCEPTION_LIMITS[key].get(number, debut_limit if number > 90 else short_limit)
            foil = {"double": "Red", "triple": "Yellow", "quadruple": "Green"}[key]
            add(key, n, name, teams[number], subset, f"{foil} foil; SN{limit}")

    dominance = checklist(html, "Diamond_Dominance", r"(D\d+)\s+(.+)")
    mystery = checklist(html, "Mystery_Numbers", r"(M\d+)\s+(.+)")
    relics = checklist(html, "A_Piece_of_History", r"([A-Z]{2})\s+(.+)")
    if [n for n, _ in dominance] != [f"D{i}" for i in range(1, 31)]:
        raise ValueError("Dominance checklist must be D1-D30")
    if [n for n, _ in mystery] != [f"M{i}" for i in range(1, 31)]:
        raise ValueError("Mystery Numbers checklist must be M1-M30")
    if [n for n, _ in relics] != ["BW", "JG", "MM", "MV", "SS", "TG"]:
        raise ValueError("Unexpected A Piece of History checklist")

    for n, raw in dominance:
        name = clean(raw)
        for key, variant in (("dominance", "SN1500"), ("dominance-emerald", "Emerald; SN1")):
            add(key, n, name, by_name[name], "", variant)
    for n, raw in mystery:
        match = re.fullmatch(r"(.+)\s+(\d+)", raw)
        if not match:
            raise ValueError(f"Missing Mystery Numbers print limit: {n} {raw}")
        name, limit_text = match.groups()
        index = int(n[1:])
        if int(limit_text) != index * 100:
            raise ValueError(f"Incorrect Mystery Numbers print limit: {n} {raw}")
        name = clean(name)
        add("mystery-numbers", n, name, by_name[name], "", f"SN{index * 100}")
        add("mystery-numbers-emerald", n, name, by_name[name], "", f"Emerald; SN{index}")
    for n, raw in relics:
        name = clean(raw)
        add("a-piece-of-history", n, name, by_name[name], "", "Game-used bat; PR350; not serial numbered")

    if len(rows) != 606 or len({(r[0], r[1]) for r in rows}) != 606:
        raise ValueError(f"Expected 606 unique collector entries; got {len(rows)}")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(rows)
    print(f"Wrote {len(rows)} cards to {OUTPUT}")


if __name__ == "__main__":
    main()
