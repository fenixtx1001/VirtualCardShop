"""Create the 1991 Stadium Club draft from BaseballCardPedia's public checklist.

TCDB is consulted manually for structure and rookie verification; its terms
prohibit automated extraction. No card or packaging images are downloaded.
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
SOURCE = "https://baseballcardpedia.com/index.php/1991_Stadium_Club"
STEM = "1991-stadium-club-baseball"

# Printed-number rookie cards checked against the TCDB rookies index. Its 56
# entries represent two printer-code versions of each of these 28 cards.
ROOKIES = {
    44, 114, 122, 178, 215, 271, 281, 317, 318, 326, 330, 370, 381, 388,
    459, 478, 483, 557, 565, 566, 568, 569, 576, 578, 585, 587, 593, 596,
}
CHECKLISTS = {298, 299, 300, 598, 599, 600}

# BCP contains a duplicate, identical #45 line and incorrectly calls #347
# Charlie Haag; PSA and other checklists identify #347 as Atlee Hammaker.
NAME_FIXES = {347: "Atlee Hammaker"}

# Existing VCS checklists provide team metadata for most subjects. These
# aliases join equivalent names used by the two products, not fuzzy matches.
ALIASES = {
    "davidjustice": "davejustice", "davidwest": "davewest",
    "tedhiguera": "teddyhiguera", "sandyalomarjr": "sandyalomar",
    "dwightgooden": "docgooden", "lennydykstra": "lendykstra",
    "dennismartinez": "dennymartinez", "kengriffeysr": "kengriffey",
    "calripkenjr": "calripken", "albertbelle": "joeybelle",
    "timraines": "rockraines", "davesmith": "davidsmith",
}

# Card-specific assignments for players absent from the reference checklists,
# ambiguous shared names, and known 1990-91 transactions. These assignments
# are checked against card/team listings and 1991 rosters.
TEAMS = {
    105: "San Diego Padres",
    137: "Houston Astros",
    138: "Oakland Athletics",
    205: "San Diego Padres",
    246: "San Diego Padres",
    301: "Los Angeles Dodgers",
    302: "San Francisco Giants",
    304: "Toronto Blue Jays",
    306: "Kansas City Royals",
    307: "San Francisco Giants",
    318: "Minnesota Twins",
    324: "Boston Red Sox",
    325: "New York Mets",
    327: "Atlanta Braves",
    328: "Cleveland Indians",
    329: "Minnesota Twins",
    335: "San Francisco Giants",
    338: "Minnesota Twins",
    343: "Houston Astros",
    344: "Kansas City Royals",
    345: "Chicago Cubs",
    347: "San Diego Padres",
    348: "Texas Rangers",
    350: "Milwaukee Brewers",
    351: "Baltimore Orioles",
    353: "California Angels",
    356: "San Francisco Giants",
    357: "San Diego Padres",
    362: "San Francisco Giants",
    368: "Philadelphia Phillies",
    376: "Houston Astros",
    378: "Oakland Athletics",
    379: "St. Louis Cardinals",
    381: "New York Yankees",
    382: "Chicago White Sox",
    383: "Montreal Expos",
    385: "Pittsburgh Pirates",
    387: "Toronto Blue Jays",
    388: "Houston Astros",
    389: "Los Angeles Dodgers",
    390: "San Diego Padres",
    391: "Baltimore Orioles",
    393: "Atlanta Braves",
    394: "Boston Red Sox",
    397: "Minnesota Twins",
    400: "Kansas City Royals",
    401: "New York Yankees",
    403: "San Diego Padres",
    404: "Atlanta Braves",
    406: "Toronto Blue Jays",
    407: "Chicago Cubs",
    412: "Detroit Tigers",
    419: "New York Yankees",
    424: "Los Angeles Dodgers",
    426: "Boston Red Sox",
    427: "Atlanta Braves",
    432: "Oakland Athletics",
    433: "Chicago Cubs",
    441: "Baltimore Orioles",
    442: "Atlanta Braves",
    444: "Toronto Blue Jays",
    445: "Detroit Tigers",
    447: "Minnesota Twins",
    448: "Pittsburgh Pirates",
    449: "Los Angeles Dodgers",
    450: "San Diego Padres",
    457: "California Angels",
    460: "Atlanta Braves",
    461: "Milwaukee Brewers",
    481: "St. Louis Cardinals",
    487: "Oakland Athletics",
    488: "Chicago White Sox",
    490: "Montreal Expos",
    492: "Cleveland Indians",
    493: "San Diego Padres",
    496: "Toronto Blue Jays",
    498: "New York Mets",
    500: "Boston Red Sox",
    504: "Chicago Cubs",
    507: "California Angels",
    511: "New York Mets",
    512: "Pittsburgh Pirates",
    513: "Toronto Blue Jays",
    515: "San Diego Padres",
    522: "Minnesota Twins",
    523: "Chicago White Sox",
    530: "San Diego Padres",
    531: "Minnesota Twins",
    538: "Los Angeles Dodgers",
    539: "Detroit Tigers",
    542: "California Angels",
    543: "Boston Red Sox",
    545: "Milwaukee Brewers",
    548: "Minnesota Twins",
    551: "Montreal Expos",
    552: "Toronto Blue Jays",
    553: "Milwaukee Brewers",
    554: "Los Angeles Dodgers",
    557: "San Diego Padres",
    563: "California Angels",
    568: "New York Yankees",
    569: "San Francisco Giants",
    570: "St. Louis Cardinals",
    576: "Houston Astros",
    578: "Kansas City Royals",
    579: "Chicago White Sox",
    585: "Toronto Blue Jays",
    590: "New York Yankees",
    595: "Milwaukee Brewers",
    596: "Chicago Cubs",
}


def key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def source_rows(doc: str, heading: str) -> list[tuple[int, str]]:
    headings = list(re.finditer(rf'<h3 id="{heading}">', doc))
    if len(headings) != 1:
        raise ValueError(f"Missing or ambiguous heading: {heading}")
    following = re.search(r"<ul\b[^>]*>(.*?)</ul>", doc[headings[0].end():], re.DOTALL)
    if not following:
        raise ValueError(f"No checklist after {heading}")
    rows = []
    for item in re.findall(r"<li\b[^>]*>(.*?)</li>", following[1], re.DOTALL):
        label = " ".join(html.unescape(re.sub(r"<[^>]+>", "", item)).split())
        match = re.fullmatch(r"(\d{1,3}) (.+)", label)
        if not match:
            raise ValueError(f"Unrecognized source row: {label}")
        rows.append((int(match[1]), match[2]))
    return rows


def reference_teams() -> dict[str, str]:
    result: dict[str, str] = {}
    for filename in ("1991-topps-baseball.cards.csv", "1990-topps-baseball.cards.csv"):
        candidates: dict[str, set[str]] = defaultdict(set)
        with (DEST / filename).open(newline="") as file:
            for row in csv.DictReader(file):
                if row["setKey"] == "base" and row["team"]:
                    candidates[key(row["player"].removesuffix(" RC"))].add(row["team"])
        # Prefer the contemporaneous 1991 checklist. Keep ambiguous names
        # unresolved so a card-specific mapping is required.
        for name, teams in candidates.items():
            if len(teams) == 1:
                result.setdefault(name, next(iter(teams)))
    return result


def clean(number: int, raw: str) -> tuple[str, str, str]:
    if number in NAME_FIXES:
        raw = NAME_FIXES[number]
    variant = ""
    if " ERR " in raw:
        raw, note = raw.split(" ERR ", 1)
        variant = "Error: " + note.strip("()")
    elif " UER " in raw:
        raw, note = raw.split(" UER ", 1)
        variant = "Uncorrected error: " + note.strip("()")
    raw = re.sub(r"\s+(?:RC|UER|TUX)$", "", raw).strip()
    if raw.endswith(" RC"):
        raw = raw[:-3]
    if number in CHECKLISTS:
        return raw, "Checklist", variant
    if number in {1, 200}:
        variant = (variant + "; " if variant else "") + "Tuxedo portrait"
    return raw + (" RC" if number in ROOKIES else ""), "", variant


def main() -> None:
    request = urllib.request.Request(SOURCE, headers={"User-Agent": "VCS checklist research (single page)"})
    with urllib.request.urlopen(request, timeout=30) as response:
        doc = response.read().decode("utf-8", errors="replace")
    rows = source_rows(doc, "Series_One") + source_rows(doc, "Series_Two")
    unique: dict[int, str] = {}
    for number, raw in rows:
        if number in unique and unique[number] != raw:
            raise ValueError(f"Conflicting entries for #{number}: {unique[number]!r}, {raw!r}")
        unique[number] = raw
    if len(rows) != 601 or list(unique) != list(range(1, 601)):
        raise ValueError("Expected numbers 1-600 with one identical duplicate #45")
    teams = reference_teams()
    records = []
    for number, raw in unique.items():
        player, subset, variant = clean(number, raw)
        lookup = key(player.removesuffix(" RC"))
        team = "" if number in CHECKLISTS else TEAMS.get(number, teams.get(ALIASES.get(lookup, lookup), ""))
        if not team and number not in CHECKLISTS:
            raise ValueError(f"Missing team for #{number} {player}")
        records.append(dict(setKey="base", cardNumber=str(number), player=player,
                            team=team, subset=subset, variant=variant))
    if {int(row["cardNumber"]) for row in records if row["player"].endswith(" RC")} != ROOKIES:
        raise ValueError("Rookie count does not match the verified rookie index")

    DEST.mkdir(parents=True, exist_ok=True)
    with (DEST / f"{STEM}.cards.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=["setKey", "cardNumber", "player", "team", "subset", "variant"], lineterminator="\n")
        writer.writeheader()
        writer.writerows(records)

    product_id = "1991_Stadium_Club_Baseball"
    bundle = {
        "schemaVersion": 2, "status": "DRAFT",
        "source": {
            "requestedUrl": "https://www.tcdb.com/ViewSet.cfm/sid/165/1991-Stadium-Club",
            "checklistReference": SOURCE,
            "rookieReference": "https://www.tcdb.com/Rookies.cfm/sid/165/1991-Stadium-Club",
            "teamReference": "https://www.laststicker.com/cards/topps_stadium_club_mlb_1991/",
            "distributionReference": SOURCE,
            "note": "BCP supplies the checklist; TCDB is a manual structure and RC cross-check only. No TCDB data or images are automatically extracted.",
        },
        "decisions": {
            "combinePhysicalSeries": True, "physicalSeriesRanges": ["1-300", "301-600"],
            "equalBasePullProbability": True, "canonicalPackFormat": "One universal VCS pack",
            "cardsPerPack": 4, "packsPerBox": 36,
            "excludeMinorPrinterVariations": True,
            "variationHandling": "Printer-code variants collapse to one card per printed number; BCP's duplicate #45 is removed. Error descriptions remain in Variant.",
            "trueRookieHandling": "Only the 28 unique printed numbers confirmed on the TCDB rookie index display RC.",
            "exclusions": "Pre-production sales and press promos, jumbo press proofs, and separately distributed members-only cards are not standard pack pulls.",
        },
        "product": {
            "id": product_id, "year": 1991, "brand": "Stadium Club", "sport": "Baseball",
            "cardsPerPack": 4, "packsPerBox": 36, "packPriceCents": 0,
            "autoPackPricing": True, "packImageUrl": None, "boxImageUrl": None,
            "released": False,
        },
        "review": {
            "teamData": "COMPLETE", "packImage": "PENDING", "cardImages": "PENDING",
            "pricing": "PENDING", "release": "BLOCKED",
        },
        "cardsFile": f"{STEM}.cards.csv",
        "productSets": [{
            "key": "base", "id": f"{product_id}_Base", "name": "Base",
            "kind": "BASE", "oddsPerPack": None, "defaultGradeability": "COMMON",
            "sourceUrl": SOURCE, "expectedCards": 600,
            "notes": "One equally weighted numbered checklist including six teamless checklist cards; all 28 verified rookie numbers are marked RC.",
        }],
    }
    (DEST / f"{STEM}.bundle.json").write_text(json.dumps(bundle, indent=2) + "\n")
    print(f"Generated {len(records)} cards; {len(ROOKIES)} rookie cards; one unreleased Product Set")


if __name__ == "__main__":
    main()
