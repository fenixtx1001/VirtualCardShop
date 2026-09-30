"""Generate the 1998 Pacific Aurora Set Factory checklist from BaseballCardPedia.

The linked TCDB checklist and rookie index were checked separately. This script
uses BaseballCardPedia's published numerical lists; it does not fetch TCDB.
"""

from __future__ import annotations

import argparse
import csv
from html import unescape
from pathlib import Path
import re
from urllib.request import Request, urlopen


SOURCE = "https://baseballcardpedia.com/index.php/1998_Aurora"
OUTPUT = Path(__file__).resolve().parents[1] / "data/set-factory/1998-pacific-aurora-baseball.cards.csv"
TEAM_RANGES = [
    (8, "Anaheim Angels"), (15, "Baltimore Orioles"),
    (21, "Boston Red Sox"), (26, "Chicago White Sox"),
    (36, "Cleveland Indians"), (41, "Detroit Tigers"),
    (49, "Kansas City Royals"), (56, "Minnesota Twins"),
    (64, "New York Yankees"), (69, "Oakland Athletics"),
    (77, "Seattle Mariners"), (84, "Tampa Bay Devil Rays"),
    (90, "Texas Rangers"), (95, "Toronto Blue Jays"),
    (101, "Arizona Diamondbacks"), (109, "Atlanta Braves"),
    (117, "Chicago Cubs"), (122, "Cincinnati Reds"),
    (128, "Colorado Rockies"), (134, "Florida Marlins"),
    (141, "Houston Astros"), (149, "Los Angeles Dodgers"),
    (155, "Milwaukee Brewers"), (160, "Montreal Expos"),
    (168, "New York Mets"), (174, "Philadelphia Phillies"),
    (179, "Pittsburgh Pirates"), (187, "St. Louis Cardinals"),
    (194, "San Diego Padres"), (200, "San Francisco Giants"),
]
ROOKIES = {24, 78, 139, 168}
SECTIONS = [
    ("base", "Base_Set", 200),
    ("pennant-fever", "Pennant_Fever", 50),
    ("cubes", "Cubes", 20),
    ("on-deck-laser-cuts", "On-Deck_Laser_Cuts", 20),
    ("hardball-cel-fusions", "Hardball_Cel-Fusions", 20),
    ("kings-of-the-major-leagues", "Kings_of_the_Major_Leagues", 10),
]
NAME_FIXES = {
    "Cal Ripken, Jr.": "Cal Ripken Jr.",
    "Ken Griffey, Jr.": "Ken Griffey Jr.",
    "Sandy Alomar": "Sandy Alomar Jr.",
    "Sandy Alomar, Jr.": "Sandy Alomar Jr.",
    "Jose Cruz": "Jose Cruz Jr.",
    "Dave Justice": "David Justice",
}


def checklist(html: str, section_id: str, count: int) -> list[tuple[int, str]]:
    heading = re.search(rf'<h[23] id="{re.escape(section_id)}">', html)
    if not heading:
        raise ValueError(f"Missing source section {section_id}")
    first_list = re.search(r'<ul style="list-style-type:none;">(.*?)</ul>', html[heading.end():], re.S)
    if not first_list:
        raise ValueError(f"Missing numerical list in {section_id}")
    entries = re.findall(r"<li>(.*?)</li>", first_list.group(1), re.S)
    cards = []
    for entry in entries:
        match = re.fullmatch(r"\s*(\d+)\s+(.+?)\s*", unescape(re.sub(r"<[^>]+>", "", entry)))
        if not match:
            raise ValueError(f"Unexpected checklist entry in {section_id}: {entry}")
        number, name = int(match.group(1)), match.group(2).strip()
        cards.append((number, NAME_FIXES.get(name, name)))
    if len(cards) != count or [number for number, _ in cards] != list(range(1, count + 1)):
        raise ValueError(f"{section_id}: expected consecutive 1-{count}, got {len(cards)} entries")
    return cards


def team_for_base_number(number: int) -> str:
    for upper, team in TEAM_RANGES:
        if number <= upper:
            return team
    raise ValueError(f"Unmapped base card {number}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-html", type=Path, help="Use a saved BaseballCardPedia HTML response")
    args = parser.parse_args()
    if args.source_html:
        html = args.source_html.read_text(encoding="utf-8")
    else:
        request = Request(SOURCE, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=30) as response:
            html = response.read().decode("utf-8")

    base = checklist(html, "Base_Set", 200)
    team_by_name: dict[str, str] = {}
    for number, name in base:
        team = team_for_base_number(number)
        if name in team_by_name and team_by_name[name] != team:
            raise ValueError(f"Ambiguous team for {name}")
        team_by_name[name] = team

    rows: list[list[str]] = []
    for key, heading, count in SECTIONS:
        for number, name in (base if key == "base" else checklist(html, heading, count)):
            team = team_for_base_number(number) if key == "base" else team_by_name.get(name)
            if not team:
                raise ValueError(f"Card {key} #{number} {name} is missing team data")
            player = f"{name} RC" if key == "base" and number in ROOKIES else name
            rows.append([key, str(number), player, team, "", ""])

    # TCDB lists three separate signed variants with the same printed AU1 number.
    # Suffixes are import-only keys; the printed number is kept in variant metadata.
    for suffix, parallel in [("C", "Copper"), ("PB", "Platinum Blue"), ("S", "Silver")]:
        rows.append(["tony-gwynn-autographs", f"AU1-{suffix}", "Tony Gwynn", "San Diego Padres", "Pennant Fever", f"AU; printed AU1; signed {parallel} parallel; one-of-one"])

    if len(rows) != 323 or any(not row[3] for row in rows):
        raise ValueError(f"Expected 323 explicit rows with complete teams, got {len(rows)}")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(rows)
    print(f"Wrote {len(rows)} cards to {OUTPUT}")


if __name__ == "__main__":
    main()
