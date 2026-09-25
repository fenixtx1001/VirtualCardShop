"""Generate an unreleased 1993 Ultra Baseball Set Factory bundle.

BaseballCardPedia supplies the public numbered checklist and insert ratios.
TCDB is a manual structure cross-check; its terms prohibit automated extraction.
No card or packaging images are fetched.
"""

from __future__ import annotations

import csv
import html
import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "data" / "set-factory"
SOURCE = "https://baseballcardpedia.com/index.php/1993_Ultra"
STEM = "1993-ultra-baseball"
PRODUCT_ID = "1993_Ultra_Baseball"

# Both series are grouped by team. Ranges were checked against the published
# card order; the three checklist cards concluding each series have no team.
BLOCKS = [
    (1, 13, "Atlanta Braves"), (14, 25, "Chicago Cubs"),
    (26, 36, "Cincinnati Reds"), (37, 48, "Houston Astros"),
    (49, 60, "Los Angeles Dodgers"), (61, 71, "Montreal Expos"),
    (72, 81, "New York Mets"), (82, 94, "Philadelphia Phillies"),
    (95, 105, "Pittsburgh Pirates"), (106, 115, "St. Louis Cardinals"),
    (116, 125, "San Diego Padres"), (126, 137, "San Francisco Giants"),
    (138, 147, "Baltimore Orioles"), (148, 158, "Boston Red Sox"),
    (159, 169, "California Angels"), (170, 181, "Chicago White Sox"),
    (182, 193, "Cleveland Indians"), (194, 204, "Detroit Tigers"),
    (205, 216, "Kansas City Royals"), (217, 227, "Milwaukee Brewers"),
    (228, 239, "Minnesota Twins"), (240, 252, "New York Yankees"),
    (253, 264, "Oakland Athletics"), (265, 275, "Seattle Mariners"),
    (276, 285, "Texas Rangers"), (286, 297, "Toronto Blue Jays"),
    (301, 312, "Atlanta Braves"), (313, 324, "Chicago Cubs"),
    (325, 337, "Cincinnati Reds"), (338, 362, "Colorado Rockies"),
    (363, 388, "Florida Marlins"), (389, 397, "Houston Astros"),
    (398, 409, "Los Angeles Dodgers"), (410, 421, "Montreal Expos"),
    (422, 435, "New York Mets"), (436, 448, "Philadelphia Phillies"),
    (449, 459, "Pittsburgh Pirates"), (460, 468, "St. Louis Cardinals"),
    (469, 480, "San Diego Padres"), (481, 491, "San Francisco Giants"),
    (492, 504, "Baltimore Orioles"), (505, 517, "Boston Red Sox"),
    (518, 526, "California Angels"), (527, 537, "Chicago White Sox"),
    (538, 547, "Cleveland Indians"), (548, 555, "Detroit Tigers"),
    (556, 567, "Kansas City Royals"), (568, 578, "Milwaukee Brewers"),
    (579, 589, "Minnesota Twins"), (590, 602, "New York Yankees"),
    (603, 613, "Oakland Athletics"), (614, 626, "Seattle Mariners"),
    (627, 638, "Texas Rangers"), (639, 647, "Toronto Blue Jays"),
]
CHECKLISTS = {298, 299, 300, 648, 649, 650}

# VCS uses one pack across both physical series. Base cards are equally
# weighted, so series weights are 300/650 and 350/650 respectively. Odds are
# rounded to the closest available integer denominator in the VCS model.
SETS = [
    ("base", "Base", "BASE", None, 650),
    ("award-winners", "Award Winners", "INSERT", 13, 25),
    ("homerun-kings", "Homerun Kings", "INSERT", 39, 10),
    ("dennis-eckersley", "Dennis Eckersley Career Highlights", "INSERT", 18, 10),
    ("ultra-all-stars", "Ultra All-Stars", "INSERT", 17, 20),
    ("all-rookie-team", "All Rookie Team", "INSERT", 33, 10),
    ("strikeout-kings", "Strike Out Kings", "INSERT", 69, 5),
]

# Series One Award Winners depict 1992 honors, before these two changed
# clubs. Home Run Kings Barry Bonds likewise appears as a Pirate.
TEAM_OVERRIDES = {
    ("award-winners", "1"): "Chicago Cubs",
    ("award-winners", "7"): "Pittsburgh Pirates",
    ("award-winners", "22"): "Chicago Cubs",
    ("award-winners", "24"): "Pittsburgh Pirates",
    ("homerun-kings", "6"): "Pittsburgh Pirates",
}


def source_rows(doc: str, heading: str) -> list[tuple[str, str]]:
    headings = list(re.finditer(rf'<h[34] id="{re.escape(heading)}">', doc))
    if len(headings) != 1:
        raise ValueError(f"Missing or ambiguous heading {heading}")
    following = re.search(r"<ul\b[^>]*>(.*?)</ul>", doc[headings[0].end():], re.DOTALL)
    if following is None:
        raise ValueError(f"No list after heading {heading}")
    rows = []
    for li in re.findall(r"<li\b[^>]*>(.*?)</li>", following[1], re.DOTALL):
        value = " ".join(html.unescape(re.sub(r"<[^>]+>", "", li)).split())
        match = re.fullmatch(r"(\d+)\s+(.+)", value)
        if not match:
            raise ValueError(f"Unexpected {heading} row: {value}")
        rows.append((match[1], match[2]))
    return rows


def clean(raw: str) -> tuple[str, str]:
    rookie = bool(re.search(r"\sRC$", raw))
    raw = re.sub(r"\sRC$", "", raw)
    raw = re.sub(r"\sCL(?:\s+#\d+-\d+)?$", "", raw)
    name, separator, note = re.split(r"\s(UER|ERR|COR|VAR)\b", raw, maxsplit=1) if re.search(r"\s(?:UER|ERR|COR|VAR)\b", raw) else (raw, "", "")
    variant = separator + (": " + note.lstrip(" :") if note else "") if separator else ""
    name = name.strip()
    if name == "Terry Pendelton":
        name = "Terry Pendleton"
    return name + (" RC" if rookie else ""), variant


def team_for(number: int) -> str:
    if number in CHECKLISTS:
        return ""
    for first, last, team in BLOCKS:
        if first <= number <= last:
            return team
    raise ValueError(f"No team block for base #{number}")


def main() -> None:
    request = urllib.request.Request(SOURCE, headers={"User-Agent": "VCS checklist research (single page)"})
    with urllib.request.urlopen(request, timeout=30) as response:
        doc = response.read().decode("utf-8", errors="replace")

    first = source_rows(doc, "Series_One_2")
    second = source_rows(doc, "Series_Two_2")
    assert len(first) == 300 and len(second) == 350
    assert [int(number) for number, _ in first + second] == list(range(1, 651))
    records: list[dict[str, str]] = []
    by_player: dict[str, set[str]] = defaultdict(set)
    for number, raw in first + second:
        player, variant = clean(raw)
        team = team_for(int(number))
        subset = "Checklist" if int(number) in CHECKLISTS else ""
        records.append(dict(setKey="base", cardNumber=number, player=player,
                            team=team, subset=subset, variant=variant))
        if team:
            by_player[player.removesuffix(" RC")].add(team)

    insert_sources = {
        "award-winners": [
            ("Top_Glove", "Top Glove"),
            ("Rookie_of_the_Year", "Rookie of the Year"),
            ("Award_Winners_2", "Award Winners"),
        ],
        "homerun-kings": [("Home_Run_Kings", "")],
        "dennis-eckersley": [("Dennis_Eckersley", "")],
        "ultra-all-stars": [("All-Stars", "")],
        "all-rookie-team": [("All-Rookie_Team", "")],
        "strikeout-kings": [("Strikeout_Kings", "")],
    }
    for key, headings in insert_sources.items():
        rows = [(number, raw, subset) for heading, subset in headings
                for number, raw in source_rows(doc, heading)]
        if key == "dennis-eckersley":
            rows = [(number, raw, subset) for number, raw, subset in rows if int(number) <= 10]
        expected = next(count for k, _name, _kind, _odds, count in SETS if k == key)
        assert len(rows) == len({number for number, _raw, _subset in rows}) == expected, key
        for number, raw, subset in rows:
            if key == "dennis-eckersley":
                title = re.search(r'"([^"]+)"', raw)
                assert title, (key, number, raw)
                player, variant = "Dennis Eckersley", title[1]
            else:
                player, variant = clean(raw)
            if key == "award-winners" and int(number) >= 21:
                notes = {"21": "World Series MVP", "22": "NL Cy Young",
                         "23": "AL Cy Young and MVP", "24": "NL MVP",
                         "25": "Ultra Player of the Year"}
                player = re.sub(r"\s(?:WS MVP|NL CY|AL CY & MVP|NL MVP)$", "", player)
                variant = notes[number]
            team = TEAM_OVERRIDES.get((key, number))
            if team is None:
                teams = by_player[player]
                if len(teams) != 1:
                    raise ValueError(f"Ambiguous insert team for {key} #{number} {player}: {teams}")
                team = next(iter(teams))
            records.append(dict(setKey=key, cardNumber=number, player=player,
                                team=team, subset=subset, variant=variant))

    assert len(records) == 730
    assert len({(record["setKey"], record["cardNumber"]) for record in records}) == len(records)
    assert all(record["team"] or record["subset"] == "Checklist" for record in records)

    DEST.mkdir(parents=True, exist_ok=True)
    with (DEST / f"{STEM}.cards.csv").open("w", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writeheader()
        writer.writerows(records)

    bundle = {
        "schemaVersion": 2, "status": "DRAFT",
        "source": {"requestedUrl": "https://www.tcdb.com/ViewSet.cfm/sid/298/1993-Ultra",
                   "checklistReference": SOURCE,
                   "note": "TCDB used only for structure and spot checks; no TCDB data or images automatically extracted."},
        "decisions": {"combinePhysicalSeries": True,
                      "physicalSeriesRanges": ["1-300", "301-650"],
                      "equalBasePullProbability": True,
                      "canonicalPackFormat": "One universal four-card VCS pack",
                      "cardsPerPack": 4, "packsPerBox": 36,
                      "seriesWeighting": "Because all 650 base cards are equally available, Series One has a 300/650 share and Series Two a 350/650 share. Series-exclusive physical insert odds are divided by those weights and rounded to VCS integer denominators. Dennis Eckersley #1-10 appeared in both series at 1:18 and retains that rate.",
                      "excluded": "Promo, mail-in Ultra Performers, and Eckersley Career Highlights #11-12 were not pack-inserted. Dennis Eckersley autographs (2000 signed total) were pack-inserted, but a verified per-pack rate is unavailable; their addition is deferred rather than inventing odds."},
        "product": {"id": PRODUCT_ID, "year": 1993, "brand": "Ultra", "sport": "Baseball",
                    "cardsPerPack": 4, "packsPerBox": 36, "packPriceCents": 0,
                    "autoPackPricing": True, "packImageUrl": None, "boxImageUrl": None,
                    "released": False},
        "review": {"teamData": "COMPLETE", "packImage": "PENDING", "cardImages": "PENDING",
                   "pricing": "PENDING", "release": "BLOCKED"},
        "cardsFile": f"{STEM}.cards.csv",
        "productSets": [
            {"key": key, "id": f"{PRODUCT_ID}_{name.replace(' ', '_').replace('-', '_')}",
             "name": name, "kind": kind, "oddsPerPack": odds,
             "defaultGradeability": "COMMON", "expectedCards": count,
             **({"notes": "One equally weighted 650-card checklist combining both physical series."} if key == "base" else {})}
            for key, name, kind, odds, count in SETS
        ],
    }
    (DEST / f"{STEM}.bundle.json").write_text(json.dumps(bundle, indent=2) + "\n")
    print(f"Generated {len(records)} cards in {len(SETS)} Product Sets; team data complete")


if __name__ == "__main__":
    main()
