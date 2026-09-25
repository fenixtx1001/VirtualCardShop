"""Build the 1992 Ultra draft from BaseballCardPedia's public checklist.

TCDB is a research cross-check only: its terms prohibit automated extraction.
No card or packaging images are downloaded by this generator.
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
SOURCE = "https://baseballcardpedia.com/index.php/1992_Ultra"
STEM = "1992-ultra-baseball"

# Each physical series is ordered in contiguous team blocks. The three
# checklist cards at the end of each series intentionally have no team.
BLOCKS = [
    (1, 11, "Baltimore Orioles"), (12, 23, "Boston Red Sox"),
    (24, 31, "California Angels"), (32, 44, "Chicago White Sox"),
    (45, 55, "Cleveland Indians"), (56, 65, "Detroit Tigers"),
    (66, 77, "Kansas City Royals"), (78, 87, "Milwaukee Brewers"),
    (88, 98, "Minnesota Twins"), (99, 108, "New York Yankees"),
    (109, 119, "Oakland Athletics"), (120, 130, "Seattle Mariners"),
    (131, 142, "Texas Rangers"), (143, 156, "Toronto Blue Jays"),
    (157, 171, "Atlanta Braves"), (172, 184, "Chicago Cubs"),
    (185, 197, "Cincinnati Reds"), (198, 208, "Houston Astros"),
    (209, 219, "Los Angeles Dodgers"), (220, 226, "Montreal Expos"),
    (227, 238, "New York Mets"), (239, 249, "Philadelphia Phillies"),
    (250, 262, "Pittsburgh Pirates"), (263, 273, "St. Louis Cardinals"),
    (274, 283, "San Diego Padres"), (284, 297, "San Francisco Giants"),
    (301, 310, "Baltimore Orioles"), (311, 320, "Boston Red Sox"),
    (321, 331, "California Angels"), (332, 343, "Chicago White Sox"),
    (344, 357, "Cleveland Indians"), (358, 368, "Detroit Tigers"),
    (369, 377, "Kansas City Royals"), (378, 392, "Milwaukee Brewers"),
    (393, 403, "Minnesota Twins"), (404, 417, "New York Yankees"),
    (418, 429, "Oakland Athletics"), (430, 436, "Seattle Mariners"),
    (437, 447, "Texas Rangers"), (448, 454, "Toronto Blue Jays"),
    (455, 465, "Atlanta Braves"), (466, 477, "Chicago Cubs"),
    (478, 487, "Cincinnati Reds"), (488, 498, "Houston Astros"),
    (499, 510, "Los Angeles Dodgers"), (511, 526, "Montreal Expos"),
    (527, 539, "New York Mets"), (540, 549, "Philadelphia Phillies"),
    (550, 561, "Pittsburgh Pirates"), (562, 574, "St. Louis Cardinals"),
    (575, 585, "San Diego Padres"), (586, 597, "San Francisco Giants"),
]

SETS = [
    ("base", "Base", "BASE", None, 600),
    ("award-winners", "Award Winners", "INSERT", 13, 25),
    ("tony-gwynn", "Tony Gwynn Commemorative Series", "INSERT", 26, 10),
    ("all-stars", "All Stars", "INSERT", 13, 20),
    ("all-rookie-team", "All-Rookie Team", "INSERT", 26, 10),
]

INSERT_TEAM_OVERRIDES = {("all-stars", "14"): "San Diego Padres"}


def source_rows(doc: str, heading: str) -> list[tuple[str, str]]:
    headings = list(re.finditer(rf'<h3 id="{re.escape(heading)}">', doc))
    if len(headings) != 1:
        raise ValueError(f"Missing or ambiguous source heading: {heading}")
    following = re.search(r"<ul\b[^>]*>(.*?)</ul>", doc[headings[0].end():], re.DOTALL)
    if following is None:
        raise ValueError(f"No checklist after {heading}")
    rows = []
    for li in re.findall(r"<li\b[^>]*>(.*?)</li>", following[1], re.DOTALL):
        value = " ".join(html.unescape(re.sub(r"<[^>]+>", "", li)).split())
        match = re.fullmatch(r"(\d+|S[12])\s+(.+)", value)
        if not match:
            raise ValueError(f"Unrecognized row in {heading}: {value}")
        rows.append((match[1], match[2]))
    return rows


def clean(raw: str) -> tuple[str, str]:
    # The source's RC marker applies to specific cards, never to an insert
    # headed "All-Rookies". Error notes belong in variant, not the name.
    rookie = bool(re.search(r"\sRC$", raw))
    raw = re.sub(r"\sRC$", "", raw)
    raw = re.sub(r"\sCL$", "", raw)
    raw = re.split(r"\s(?:UER|ERR|COR|RevNeg)\b", raw)[0].strip()
    return raw + (" RC" if rookie else ""), ""


def team_for(number: int) -> str:
    for first, last, team in BLOCKS:
        if first <= number <= last:
            return team
    if number in {298, 299, 300, 598, 599, 600}:
        return ""
    raise ValueError(f"No team block for #{number}")


def main() -> None:
    req = urllib.request.Request(SOURCE, headers={"User-Agent": "VCS checklist research (single page)"})
    with urllib.request.urlopen(req, timeout=30) as response:
        doc = response.read().decode("utf-8", errors="replace")

    first = source_rows(doc, "Series_One_2")
    second = source_rows(doc, "Series_Two_2")
    assert len(first) == len(second) == 300
    assert [int(n) for n, _ in first + second] == list(range(1, 601))
    records: list[dict[str, str]] = []
    by_player: dict[str, set[str]] = defaultdict(set)
    for number, raw in first + second:
        player, variant = clean(raw)
        checklist = int(number) in {298, 299, 300, 598, 599, 600}
        team = team_for(int(number))
        records.append(dict(setKey="base", cardNumber=number, player=player,
                            team=team, subset="Checklist" if checklist else "", variant=variant))
        if team:
            by_player[player.removesuffix(" RC")].add(team)

    source_headings = {
        "award-winners": "Award_Winners",
        "tony-gwynn": "Tony_Gwynn",
        "all-stars": "All-Stars",
        "all-rookie-team": "All-Rookies",
    }
    for key, heading in source_headings.items():
        source = source_rows(doc, heading)
        if key == "award-winners":
            # #21 exists as corrected and reversed-negative back variations.
            source = [(n, raw) for n, raw in source if not (n == "21" and "RevNeg" in raw)]
        if key == "tony-gwynn":
            source = [(n, raw) for n, raw in source if n.isdigit()]
        expected = next(count for k, _name, _kind, _odds, count in SETS if k == key)
        assert len(source) == expected, (key, len(source), expected)
        assert len({n for n, _ in source}) == expected
        for number, raw in source:
            player, variant = clean(raw)
            # Cross-set names occasionally have two different teams; the
            # insert's 1992 team is checked explicitly in this map.
            teams = by_player[player]
            override = INSERT_TEAM_OVERRIDES.get((key, number))
            if override:
                teams = {override}
            if len(teams) != 1:
                raise ValueError(f"Ambiguous insert team for {key} #{number} {player}: {teams}")
            records.append(dict(setKey=key, cardNumber=number, player=player,
                                team=next(iter(teams)), subset="", variant=variant))

    assert len(records) == 665
    assert all(r["team"] or r["subset"] == "Checklist" for r in records)
    assert len({(r["setKey"], r["cardNumber"]) for r in records}) == len(records)
    DEST.mkdir(parents=True, exist_ok=True)
    with (DEST / f"{STEM}.cards.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writeheader()
        writer.writerows(records)

    product_id = "1992_Ultra_Baseball"
    bundle = {
        "schemaVersion": 2, "status": "DRAFT",
        "source": {"requestedUrl": "https://www.tcdb.com/ViewSet.cfm/sid/216/1992-Ultra",
                   "checklistReference": SOURCE,
                   "note": "TCDB used only to cross-check totals and insert structure; its data/images were not automatically extracted."},
        "decisions": {"combinePhysicalSeries": True, "physicalSeriesRanges": ["1-300", "301-600"],
                      "equalBasePullProbability": True, "canonicalPackFormat": "One universal VCS pack",
                      "cardsPerPack": 4, "packsPerBox": 36,
                      "seriesInsertOdds": "Series-exclusive insert rates are weighted 50/50 in the combined pack. Award Winners and All Stars 1:13; Tony Gwynn and All-Rookie Team 1:26.",
                      "exclusions": "Mail-in cards, promotional issues and pre-production samples were not pack-inserted. Tony Gwynn signed cards were pack-inserted, but their per-pack rate is unverified, so they are held for a later, sourced addition. The reversed-negative Award Winners #21 is treated as a variation rather than an additional numbered checklist card."},
        "product": {"id": product_id, "year": 1992, "brand": "Ultra", "sport": "Baseball",
                    "cardsPerPack": 4, "packsPerBox": 36, "packPriceCents": 0,
                    "autoPackPricing": True, "packImageUrl": None, "boxImageUrl": None,
                    "released": False},
        "review": {"teamData": "COMPLETE", "packImage": "PENDING", "cardImages": "PENDING",
                   "pricing": "PENDING", "release": "BLOCKED"},
        "cardsFile": f"{STEM}.cards.csv",
        "productSets": [
            {"key": key, "id": f"{product_id}_{name.replace(' ', '_').replace('-', '_')}",
             "name": name, "kind": kind, "oddsPerPack": odds,
             "defaultGradeability": "COMMON", "expectedCards": count,
             **({"notes": "One equally weighted checklist from both physical series."} if key == "base" else {})}
            for key, name, kind, odds, count in SETS
        ],
    }
    (DEST / f"{STEM}.bundle.json").write_text(json.dumps(bundle, indent=2) + "\n")
    print(f"Generated {len(records)} cards across {len(SETS)} product sets; all team assignments complete")


if __name__ == "__main__":
    main()
