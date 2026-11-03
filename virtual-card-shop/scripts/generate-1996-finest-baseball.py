"""Generate an unreleased 1996 Finest Baseball Set Factory bundle.

The 359 names, card numbers, and colors come from Radicards' public checklist.
Thematic subset numbers were reconciled with Midwest Cards' published checklist.
Most team names come from this repository's 1996 Ultra and Bowman base sets;
card-specific corrections were manually checked against the requested TCDB set.
The generator does not fetch TCDB or card images.
"""

from __future__ import annotations

import csv
import html
import json
import re
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "data" / "set-factory"
STEM = "1996-finest-baseball"
CHECKLIST_URL = "https://www.radicards.com/baseball/1996-finest-baseball-cards/"
REQUESTED_URL = "https://www.tcdb.com/ViewSet.cfm/sid/670/1996-Finest"
SUBSET_REFERENCE = "https://www.midwestcards.com/content/Checklists/Topps/Baseball/Older/1996%20Finest%20Baseball%20-%20Checklist.pdf.pdf"

# Manually reconciled numbers from the published 359-card thematic checklist.
SUBSETS = {
    "IN": ("Finest Intimidators", """1,3,5,13,14,17,22,23,27,29,31,35,40,44,46,54,56,60,64,68,71,74,77,79,81,84,86,88,90,91,93,99,111,113,115,117,120,123,125,126,129,130,132,134,135,139,142,146,161,164,166,167,169,171,175,177,178,179,180,186,188"""),
    "GAM": ("Finest Gamers", """2,6,8,10,12,19,21,25,26,28,32,34,36,37,39,43,45,47,49,50,53,55,57,58,62,63,65,67,69,70,72,78,80,83,85,87,89,94,96,98,100,101,103,104,106,107,108,110,112,114,116,118,124,131,133,136,137,143,144,147,150,152,154,155,157,158,160,163,170,172,173,174,176,181,183,185,187,189,190"""),
    "PHEN": ("Finest Phenoms", """4,15,20,30,38,41,51,52,59,73,75,76,82,92,95,102,109,119,121,122,127,128,138,140,141,148,153,156,159,168"""),
    "STER": ("Finest Sterling", """7,9,11,16,18,24,33,42,48,61,66,97,105,145,149,151,162,165,182,184,193,194,196,198,199,216,218,221,228,233,234,237,238,244,248,250,253,261,265,266,267,280,287,290,298,301,302,315,321,323,328,330,334,337,338,345,346,347,350,357"""),
    "CL": ("Checklist", "191,359"),
    "FR": ("Finest Franchises", """192,206,214,232,235,236,240,242,249,254,257,258,270,271,275,281,282,288,289,299,305,309,319,320,322,325,327,333,335,341,342,344,353,354,355"""),
    "AD": ("Finest Additions", """195,197,200,203,204,205,208,209,210,213,215,219,222,224,225,226,229,230,231,239,247,252,255,256,259,260,262,263,269,273,274,277,278,279,286,291,292,293,295,304,306,308,310,311,314,318,339"""),
    "PROD": ("Finest Prodigies", """201,202,207,211,212,217,220,223,227,241,243,245,246,251,264,268,272,276,283,284,285,294,296,297,300,303,307,312,313,316,317,324,326,329,331,332,336,340,343,348,349,351,352,356,358"""),
}

RC_NUMBERS = {207, 294, 300, 312, 317, 326, 343, 351, 358}
COLOR = {"B": "Bronze", "S": "Silver", "G": "Gold"}
EXPECTED_COLORS = {"Bronze": 220, "Silver": 91, "Gold": 48}

# These card-specific teams were checked against the 1996 Finest checklist.
# They resolve trades, names missing from the local 1996 sets, and two players
# whose teams differ between cards in this set (#54/#198 and #125/#318).
TEAM_OVERRIDES = {
    54: "Oakland Athletics", 75: "Houston Astros",
    125: "Philadelphia Phillies", 127: "Detroit Tigers",
    131: "Cleveland Indians", 138: "Detroit Tigers",
    194: "Minnesota Twins", 195: "New York Yankees",
    197: "Baltimore Orioles", 198: "St. Louis Cardinals",
    200: "New York Mets", 201: "Houston Astros",
    203: "Cleveland Indians", 215: "Los Angeles Dodgers",
    219: "San Francisco Giants", 224: "New York Yankees",
    226: "Pittsburgh Pirates", 228: "Baltimore Orioles",
    229: "San Diego Padres", 231: "New York Mets",
    239: "St. Louis Cardinals", 244: "St. Louis Cardinals",
    260: "New York Yankees", 263: "San Diego Padres",
    278: "St. Louis Cardinals", 279: "Minnesota Twins",
    286: "Florida Marlins",
    294: "Florida Marlins", 295: "Seattle Mariners",
    304: "Baltimore Orioles", 306: "St. Louis Cardinals",
    308: "St. Louis Cardinals", 318: "Boston Red Sox",
    326: "San Francisco Giants", 331: "Cincinnati Reds",
    339: "New York Mets", 343: "Pittsburgh Pirates",
    349: "Minnesota Twins", 351: "San Francisco Giants",
    352: "Oakland Athletics",
    357: "New York Yankees",
}

PLAYER_CORRECTIONS = {
    1: "Greg Maddux",       # A source UER note belongs in variant, not player.
    75: "Brian Hunter",     # Source uses a middle initial; TCDB display name.
    131: "Dennis Martinez", # Source nickname is Denny.
    239: "Todd Stottlemyre", # Typo in the source checklist.
}


def normalized(name: str) -> str:
    return unicodedata.normalize("NFKD", name.replace("’", "'")).casefold().strip()


def plain(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", "", fragment)).split())


def source_cards() -> dict[int, tuple[str, str]]:
    request = urllib.request.Request(CHECKLIST_URL, headers={"User-Agent": "Mozilla/5.0 (VCS checklist import)"})
    with urllib.request.urlopen(request, timeout=35) as response:
        doc = response.read().decode("utf-8", "replace")
    tables = re.findall(r"<table\b[^>]*>.*?</table>", doc, re.S)
    checklist = [table for table in tables if "<td>B297</td>" in table]
    if len(checklist) != 1:
        raise ValueError(f"Expected one checklist table, found {len(checklist)}")

    cards: dict[int, tuple[str, str]] = {}
    for tr in re.findall(r"<tr\b[^>]*>.*?</tr>", checklist[0], re.S):
        cells = [plain(cell) for cell in re.findall(r"<td\b[^>]*>(.*?)</td>", tr, re.S)]
        for label, player in zip(cells[::2], cells[1::2]):
            match = re.fullmatch(r"([BSG])(\d{1,3})", label)
            if not match:
                continue
            number = int(match[2])
            if number in cards:
                raise ValueError(f"Duplicate #{number}")
            player = PLAYER_CORRECTIONS.get(number, player.removesuffix(" RC"))
            if not player or " UER " in player or player.endswith(" RC"):
                raise ValueError(f"Unclean player value at #{number}: {player}")
            cards[number] = (player, COLOR[match[1]])
    if sorted(cards) != list(range(1, 360)):
        raise ValueError("Source must contain the full numbered 1-359 checklist")
    if Counter(color for _, color in cards.values()) != EXPECTED_COLORS:
        raise ValueError("Bronze, silver, or gold source totals changed")
    return cards


def subsets_by_number() -> dict[int, str]:
    result: dict[int, str] = {}
    for label, (name, numbers) in SUBSETS.items():
        for number in (int(value) for value in numbers.split(",")):
            if number in result:
                raise ValueError(f"Duplicate thematic subset number {number}")
            if (label == "CL") != (number in (191, 359)):
                raise ValueError(f"Checklist thematic subset mismatch at #{number}")
            result[number] = name
    if sorted(result) != list(range(1, 360)):
        raise ValueError("Thematic subsets do not cover all 359 numbers")
    return result


def local_teams() -> dict[str, set[str]]:
    result: dict[str, set[str]] = defaultdict(set)
    for filename in ("1996-ultra.cards.csv", "1996-bowman-baseball.cards.csv"):
        with (DEST / filename).open(newline="") as file:
            for row in csv.DictReader(file):
                if row["setKey"] == "base" and row["team"]:
                    result[normalized(row["player"].removesuffix(" RC"))].add(row["team"])
    return result


def build_rows() -> list[dict[str, str]]:
    cards = source_cards()
    subsets = subsets_by_number()
    teams = local_teams()
    output = []
    used_overrides = set()
    for number in range(1, 360):
        player, color = cards[number]
        subset = subsets[number]
        if number in (191, 359):
            if player != "Checklist":
                raise ValueError(f"Unexpected checklist subject at #{number}: {player}")
            player = "Checklist 1-190" if number == 191 else "Checklist 192-359"
            team = ""
        elif number in TEAM_OVERRIDES:
            team = TEAM_OVERRIDES[number]
            used_overrides.add(number)
        else:
            matches = teams[normalized(player)]
            if len(matches) != 1:
                raise ValueError(f"Ambiguous or missing 1996 team at #{number} {player}: {sorted(matches)}")
            team = next(iter(matches))

        if number in RC_NUMBERS:
            player += " RC"
        if not team and "Checklist" not in player:
            raise ValueError(f"Missing team at #{number}: {player}")
        error = "; UER: 1995 statistics list Mariners; should be Braves" if number == 1 else ""
        for set_key, suffix in (("base", ""), ("refractors", " Refractor")):
            output.append({
                "setKey": set_key, "cardNumber": str(number), "player": player,
                "team": team, "subset": subset, "variant": color + suffix + error,
            })
    if used_overrides != TEAM_OVERRIDES.keys():
        raise ValueError("Unused team override")
    if len(output) != 718:
        raise ValueError("Expected 359 base and 359 Refractors")
    return output


def main() -> None:
    rows = build_rows()
    DEST.mkdir(parents=True, exist_ok=True)
    with (DEST / f"{STEM}.cards.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=("setKey", "cardNumber", "player", "team", "subset", "variant"),
                                lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    product_id = "1996_Finest_Baseball"
    bundle = {
        "schemaVersion": 2, "status": "DRAFT",
        "source": {
            "requestedUrl": REQUESTED_URL, "baseChecklistReference": CHECKLIST_URL,
            "subsetReference": SUBSET_REFERENCE,
            "rookiesReference": "https://www.tcdb.com/Rookies.cfm/sid/670/1996-Finest",
            "insertsReference": "https://www.tcdb.com/Inserts.cfm/sid/670/1996-Finest",
            "note": "The generator fetches Radicards once for card numbers, names and printed color tier. It does not extract TCDB data or images. Teams are reconciled from local 1996 VCS datasets with manually researched card-specific overrides.",
        },
        "decisions": {
            "combinePhysicalSeries": True, "physicalSeriesRanges": ["1-191", "192-359"],
            "equalBasePullProbability": True, "canonicalPackFormat": "One universal VCS pack based on Series 1",
            "cardsPerPack": 4, "packsPerBox": 24,
            "historicalDistribution": "Original hobby boxes had 24 six-card packs; base bronze, silver, and gold were distributed at different frequencies. VCS flattens all 359 base cards for set completion.",
            "baseColorCounts": EXPECTED_COLORS,
            "trueRookieHandling": "RC is appended only to the nine numbers independently identified as true rookie cards.",
            "refractorOdds": "Bronze 1:12, silver 1:48, gold 1:288 historically. One 359-card collector checklist cannot express three color-specific rates with a single integer oddsPerPack; leave odds null pending review.",
            "excludeSeparatelyIssuedMaterial": "Landmark and Landmark Medallions were limited direct-to-consumer collectibles, not standard pack insertions.",
        },
        "product": {
            "id": product_id, "year": 1996, "brand": "Finest", "sport": "Baseball",
            "cardsPerPack": 4, "packsPerBox": 24, "packPriceCents": 0,
            "autoPackPricing": True, "packImageUrl": None, "boxImageUrl": None,
            "released": False,
        },
        "review": {"teamData": "COMPLETE", "packImage": "PENDING", "cardImages": "PENDING",
                   "pricing": "PENDING", "release": "BLOCKED"},
        "cardsFile": f"{STEM}.cards.csv",
        "productSets": [
            {
                "key": "base", "id": f"{product_id}_base", "name": "Base",
                "kind": "BASE", "oddsPerPack": None,
                "defaultGradeability": "COMMON", "expectedCards": 359,
                "sourceUrl": CHECKLIST_URL,
                "notes": "One equally weighted 1-359 checklist, including two teamless checklists. Color tier and thematic subset are retained on each card.",
            },
            {
                "key": "refractors", "id": f"{product_id}_refractors", "name": "Refractors",
                "kind": "PARALLEL", "oddsPerPack": None,
                "defaultGradeability": "COMMON", "expectedCards": 359,
                "sourceUrl": "https://www.tcdb.com/Checklist.cfm/sid/671/1996-Finest-Refractors",
                "notes": "Complete 359-card Refractor checklist; historical color rates were bronze 1:12, silver 1:48, gold 1:288. Effective VCS pool odds pending review.",
            },
        ],
    }
    (DEST / f"{STEM}.bundle.json").write_text(json.dumps(bundle, indent=2) + "\n")
    print("Generated 359 base, 359 Refractors, 9 verified RCs per checklist, 2 Product Sets")


if __name__ == "__main__":
    main()
