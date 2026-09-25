"""Build an unreleased 1992 Ultra Football draft from a public shop checklist.

TCDB is used only for manual structure and rookie cross-checks. Its terms
prohibit automated extraction. No images are downloaded by this generator.
"""

from __future__ import annotations

import csv
import html
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "data" / "set-factory"
STEM = "1992-ultra-football"
BASE_SOURCE = "https://footballcardshop.com/by-set/1992-ultra"
TCDB = "https://www.tcdb.com/ViewSet.cfm/sid/3311/1992-Ultra"
INSERTS = "https://www.tcdb.com/Inserts.cfm/sid/3311/1992-Ultra"

# Historical team names corresponding to the shop's current franchise codes.
TEAMS = {
    "ATL": "Atlanta Falcons", "BUF": "Buffalo Bills",
    "CHI": "Chicago Bears", "CIN": "Cincinnati Bengals",
    "CLE": "Cleveland Browns", "DAL": "Dallas Cowboys",
    "DEN": "Denver Broncos", "DET": "Detroit Lions",
    "GB": "Green Bay Packers", "TEN": "Houston Oilers",
    "IND": "Indianapolis Colts", "KC": "Kansas City Chiefs",
    "LV": "Los Angeles Raiders", "LAR": "Los Angeles Rams",
    "MIA": "Miami Dolphins", "MIN": "Minnesota Vikings",
    "NE": "New England Patriots", "NO": "New Orleans Saints",
    "NYG": "New York Giants", "NYJ": "New York Jets",
    "PHI": "Philadelphia Eagles", "ARI": "Phoenix Cardinals",
    "PIT": "Pittsburgh Steelers", "LAC": "San Diego Chargers",
    "SF": "San Francisco 49ers", "SEA": "Seattle Seahawks",
    "TB": "Tampa Bay Buccaneers", "WAS": "Washington Redskins",
}

# True rookie cards manually cross-checked against the TCDB rookie index.
# Source category "Ultra - Rookie" includes #416, which is not on that index.
ROOKIES = {
    17, 51, 61, 65, 66, 89, 114, 153, 176, 180, 267, 290, 328, 350, 357,
    414, *range(417, 447),
}
assert len(ROOKIES) == 46

# Shop disambiguators identify positions, schools, or later franchise names,
# rather than words printed as part of the player's display name.
DISAMBIGUATORS = {"WR", "DB", "DL", "WASH", "DE", "AUB", "USC", "DT",
                  "LOU", "MVS", "RB", "TE", "FVS", "MEM", "MIA"}
ERROR_NOTES = {
    52: "Uncorrected error: David Fulcher pictured on back; birth date should read December 18",
    54: "Uncorrected error: Eddie Brown pictured on back",
    449: "Uncorrected error: printed checklist starts at 230, leaving cards 225-229 out of the printed ranges",
}

AWARD_WINNERS = [
    ("Mark Rypien", "Washington Redskins"),
    ("Cornelius Bennett", "Buffalo Bills"),
    ("Anthony Munoz", "Cincinnati Bengals"),
    ("Lawrence Dawsey", "Tampa Bay Buccaneers"),
    ("Thurman Thomas", "Buffalo Bills"),
    ("Michael Irvin", "Dallas Cowboys"),
    ("Mike Croel", "Denver Broncos"),
    ("Barry Sanders", "Detroit Lions"),
    ("Pat Swilling", "New Orleans Saints"),
    ("Leonard Russell", "New England Patriots"),
]


def plain(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]*>", "", fragment)).split())


def source_rows(doc: str) -> list[tuple[int, str, str, str]]:
    tables = re.findall(r'<table\b[^>]*class="[^"]*min-w-full\b[^"]*"[^>]*>(.*?)</table>', doc, re.S)
    if len(tables) != 1:
        raise ValueError(f"Expected exactly one checklist table, found {len(tables)}")
    rows = []
    for row in re.findall(r"<tr\b[^>]*>(.*?)</tr>", tables[0], re.S):
        cells = re.findall(r"<td\b[^>]*>(.*?)</td>", row, re.S)
        if len(cells) != 9:
            continue  # Table header has no <td> cells.
        player, label = plain(cells[2]), plain(cells[3])
        number, code = plain(cells[5]), plain(cells[6])
        if not number.isdigit():
            raise ValueError(f"Unexpected card number {number!r}")
        rows.append((int(number), player, code, label))
    return rows


def base_cards(rows: list[tuple[int, str, str, str]]) -> list[dict[str, str]]:
    if len(rows) != 450 or [n for n, *_ in rows] != list(range(1, 451)):
        raise ValueError("Expected exactly one card at each base number 1-450")
    cards = []
    for number, player, code, label in rows:
        if number >= 447:
            if code or not player.lower().startswith("checklist"):
                raise ValueError(f"Unexpected checklist metadata for #{number}")
            # Four actual numbered checklist cards, each without a single team.
            match = re.fullmatch(r"Ultra - Checklist (\d+-\d+)", label)
            if not match:
                raise ValueError(f"Unexpected checklist range: {label}")
            player = "Checklist " + match[1]
            subset = "Checklist"
            team = ""
        else:
            suffix = player.rsplit(" ", 1)[-1]
            if suffix in DISAMBIGUATORS:
                player = player.rsplit(" ", 1)[0]
            if code not in TEAMS or not player:
                raise ValueError(f"Unknown team or blank player for #{number}: {player!r}, {code!r}")
            team, subset = TEAMS[code], "Draft Picks" if 417 <= number <= 446 else ""
            if (label == "Ultra - Rookie") != (number in ROOKIES or number == 416):
                raise ValueError(f"Unexpected source rookie category at #{number}: {label}")
        cards.append(dict(setKey="base", cardNumber=str(number),
                          player=player + (" RC" if number in ROOKIES else ""),
                          team=team, subset=subset, variant=ERROR_NOTES.get(number, "")))
    if {int(c["cardNumber"]) for c in cards if c["player"].endswith(" RC")} != ROOKIES:
        raise ValueError("True rookie index mismatch")
    return cards


def main() -> None:
    request = urllib.request.Request(BASE_SOURCE, headers={"User-Agent": "Mozilla/5.0 (VCS single-page checklist research)"})
    with urllib.request.urlopen(request, timeout=30) as response:
        doc = response.read().decode("utf-8", errors="replace")
    cards = base_cards(source_rows(doc))

    for number, (player, team) in enumerate(AWARD_WINNERS, start=1):
        cards.append(dict(setKey="award-winners", cardNumber=str(number),
                          player=player, team=team, subset="", variant=""))
    for key, player, team in (
        ("chris-miller", "Chris Miller", "Atlanta Falcons"),
        ("reggie-white", "Reggie White", "Philadelphia Eagles"),
    ):
        for number in range(1, 11):
            cards.append(dict(setKey=key, cardNumber=str(number),
                              player=player, team=team, subset="", variant=""))
    if len(cards) != 480 or any(not c["team"] and "Checklist" not in c["player"] for c in cards):
        raise ValueError("Unexpected card count or missing team")

    DEST.mkdir(parents=True, exist_ok=True)
    with (DEST / f"{STEM}.cards.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=["setKey", "cardNumber", "player", "team", "subset", "variant"], lineterminator="\n")
        writer.writeheader()
        writer.writerows(cards)

    product_id = "1992_Ultra_Football"
    sets = [
        ("base", "Base", "BASE", 450, BASE_SOURCE),
        ("award-winners", "Award Winners", "INSERT", 10, "https://www.tcdb.com/Checklist.cfm/sid/3312/1992-Ultra---Award-Winners"),
        ("chris-miller", "Chris Miller: Performance Highlights", "INSERT", 10, "https://www.tcdb.com/Checklist.cfm/sid/33580/1992-Ultra---Chris-Miller:-Performance-Highlights"),
        ("reggie-white", "Reggie White: Career Highlights", "INSERT", 10, "https://www.tcdb.com/Checklist.cfm/sid/33581/1992-Ultra-Reggie-White-Career-Highlights"),
        ("chris-miller-autographed", "Chris Miller: Performance Highlights Autographed", "PARALLEL", 10, "https://www.tcdb.com/Checklist.cfm/sid/314429/1992-Ultra-Chris-Miller-Performance-Highlights-Autographed"),
        ("reggie-white-autographed", "Reggie White: Career Highlights Autographed", "PARALLEL", 10, "https://www.tcdb.com/Checklist.cfm/sid/33582/1992-Ultra-Reggie-White-Career-Highlights-Autographed"),
    ]
    product_sets = []
    for key, name, kind, count, url in sets:
        item = dict(key=key, id=f"{product_id}_{key.replace('-', '_')}", name=name,
                    kind=kind, oddsPerPack=None, defaultGradeability="COMMON",
                    expectedCards=count, sourceUrl=url)
        if kind == "PARALLEL":
            item["deriveCardsFrom"] = key.removesuffix("-autographed")
            item["derivedVariant"] = "Autographed; embossed Fleer insignia"
        if key == "base":
            item["notes"] = "One equally weighted checklist 1-450 including four teamless checklist cards."
        else:
            item["notes"] = "Pack-issued cards; numeric odds unverified. Odds must be reviewed before release."
        product_sets.append(item)

    bundle = {
        "schemaVersion": 2, "status": "DRAFT",
        "source": {
            "requestedUrl": TCDB,
            "checklistReference": BASE_SOURCE,
            "rookieReference": "https://www.tcdb.com/Rookies.cfm/sid/3311/1992-Ultra",
            "insertsReference": INSERTS,
            "note": "The public shop page supplies the base checklist. TCDB is a manual research cross-check only; its data and images are not automatically extracted.",
        },
        "decisions": {
            "combinePhysicalSeries": True, "physicalSeriesRanges": ["1-450"],
            "equalBasePullProbability": True, "canonicalPackFormat": "One universal VCS pack",
            "cardsPerPack": 4, "packsPerBox": 36,
            "historicalFranchiseNames": "The source uses current team abbreviations, mapped to 1992 Oilers, Raiders, Rams, Chargers, Cardinals, and Redskins names.",
            "trueRookieHandling": "RC appears only on the 46 printed numbers independently verified by the rookie index; the generic Rookie category for #416 is not treated as a true RC.",
            "insertOdds": "No reliable numeric pull rates found. Five pack-issued insert/parallel groups are cataloged with null odds and need review before pack release.",
            "excludeNonStandardPackMaterial": "Chris Miller and Reggie White highlights #11-12 were mail-in cards. Stockholder and Super Bowl promo cards were distributed separately.",
        },
        "product": {
            "id": product_id, "year": 1992, "brand": "Ultra", "sport": "Football",
            "cardsPerPack": 4, "packsPerBox": 36, "packPriceCents": 0,
            "autoPackPricing": True, "packImageUrl": None, "boxImageUrl": None,
            "released": False,
        },
        "review": {"teamData": "COMPLETE", "packImage": "PENDING", "cardImages": "PENDING",
                   "pricing": "PENDING", "release": "BLOCKED"},
        "cardsFile": f"{STEM}.cards.csv",
        "productSets": product_sets,
    }
    (DEST / f"{STEM}.bundle.json").write_text(json.dumps(bundle, indent=2) + "\n")
    print(f"Generated {len(cards)} explicit cards and 20 derived autographs: 500 cards, 6 Product Sets, {len(ROOKIES)} verified RCs")


if __name__ == "__main__":
    main()
