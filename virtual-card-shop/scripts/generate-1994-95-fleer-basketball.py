from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1994-95-fleer-basketball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/2234/1994-95-Fleer"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/2234/1994-95-Fleer"

SOURCES = [
    {
        "key": "first-year-phenoms",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2237/1994-95-Fleer-1st-Year-Phenoms",
        "expected": 10,
        "subset": "1st Year Phenoms",
    },
    {
        "key": "all-defensive-team",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2235/1994-95-Fleer-All-Defensive-Team",
        "expected": 10,
        "subset": "All-Defensive Team",
    },
    {
        "key": "all-star-weekend",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2239/1994-95-Fleer-All-Star-Weekend",
        "expected": 26,
        "subset": "All-Star Weekend",
    },
    {
        "key": "career-achievement-awards",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2236/1994-95-Fleer-Career-Achievement-Awards",
        "expected": 6,
        "subset": "Career Achievement Awards",
    },
    {
        "key": "nba-award-winners",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2240/1994-95-Fleer-NBA-Award-Winners",
        "expected": 4,
        "subset": "NBA Award Winners",
    },
    {
        "key": "nba-league-leaders",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2241/1994-95-Fleer-NBA-League-Leaders",
        "expected": 8,
        "subset": "NBA League Leaders",
    },
    {
        "key": "nba-rookie-sensations",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2243/1994-95-Fleer-NBA-Rookie-Sensations",
        "expected": 25,
        "subset": "NBA Rookie Sensations",
    },
    {
        "key": "pro-visions",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2242/1994-95-Fleer-Pro-Visions",
        "expected": 9,
        "subset": "Pro-Visions",
    },
    {
        "key": "sharpshooters",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2244/1994-95-Fleer-Sharpshooters",
        "expected": 10,
        "subset": "Sharpshooters",
    },
    {
        "key": "super-stars",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2245/1994-95-Fleer-Super-Stars",
        "expected": 6,
        "subset": "Super Stars",
    },
    {
        "key": "team-leaders",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2246/1994-95-Fleer-Team-Leaders",
        "expected": 9,
        "subset": "Team Leaders",
    },
    {
        "key": "total-d",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2247/1994-95-Fleer-Total-D",
        "expected": 10,
        "subset": "Total D",
    },
    {
        "key": "tower-of-power",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2248/1994-95-Fleer-Tower-of-Power",
        "expected": 10,
        "subset": "Tower of Power",
    },
    {
        "key": "triple-threats",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2249/1994-95-Fleer-Triple-Threats",
        "expected": 10,
        "subset": "Triple Threats",
    },
    {
        "key": "young-lions",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2250/1994-95-Fleer-Young-Lions",
        "expected": 6,
        "subset": "Young Lions",
    },
]

REDEMPTION = {
    "key": "draft-lottery-redemption",
    "url": "https://www.tcdb.com/Checklist.cfm/sid/280533/1994-95-Fleer-1994-NBA-Draft-Lottery-Set-Redemption",
    "subset": "1994 NBA Draft Lottery Set Redemption",
}

EXPECTED_BASE = 390
EXPECTED_TRUE_RCS = 49
EXPECTED_INSERTS = 1 + sum(int(source["expected"]) for source in SOURCES)
EXPECTED_TOTAL = EXPECTED_BASE + EXPECTED_INSERTS
EXPECTED_PRODUCT_SETS = 1 + 1 + len(SOURCES)


class RowParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self.in_tr = False
        self.in_td = False
        self.row: list[str] = []
        self.cell: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        if tag == "tr":
            self.in_tr = True
            self.row = []
        elif tag == "td" and self.in_tr:
            self.in_td = True
            self.cell = []
        elif tag == "br" and self.in_td:
            self.cell.append(" ")

    def handle_data(self, data: str) -> None:
        if self.in_td:
            self.cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "td" and self.in_td:
            self.row.append(" ".join("".join(self.cell).split()))
            self.in_td = False
            self.cell = []
        elif tag == "tr" and self.in_tr:
            if self.row:
                self.rows.append(self.row)
            self.in_tr = False
            self.row = []


def fetch(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; VCS Set Factory research import)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def page_url(url: str, page_index: int) -> str:
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}PageIndex={page_index}"


def parse_rows(html: str, number_pattern: str) -> list[tuple[str, str, str]]:
    parser = RowParser()
    parser.feed(html)
    pattern = re.compile(rf"^(?:{number_pattern})$", re.IGNORECASE)
    found: list[tuple[str, str, str]] = []

    for row in parser.rows:
        vals = [value for value in row if value]
        for i, value in enumerate(vals):
            card_number = value.strip()
            if not pattern.fullmatch(card_number):
                continue
            if i + 1 >= len(vals):
                continue

            raw_name = vals[i + 1].strip()
            if not raw_name or raw_name.lower() in {"options", "add", "edit"}:
                continue

            team = vals[i + 2].strip() if i + 2 < len(vals) else ""
            found.append((card_number, raw_name, team))
            break

    return found


def normalize_number(raw_number: str) -> int:
    match = re.fullmatch(r"(\d{1,3})[A-Za-z]?", raw_number.strip())
    if not match:
        raise SystemExit(f"Unexpected numbered card identifier: {raw_number!r}")
    return int(match.group(1))


GLUED_METADATA_TAIL = re.compile(
    r"\s+(?:UER|ERR|COR|VAR)(?:UER|ERR|COR|VAR)?\s*:\s*.*$",
    re.IGNORECASE,
)
META_SPLIT = re.compile(
    r"\s+(?=(?:RC|UER|ERR|COR|VAR|RDM|EXCH)\b)",
    re.IGNORECASE,
)
META_TOKEN = re.compile(r"\b(?:UER|ERR|COR|VAR|RDM|EXCH)\b", re.IGNORECASE)


def clean_player_and_variant(raw_name: str) -> tuple[str, str]:
    raw = " ".join(raw_name.split()).strip()
    metadata_source = raw
    raw = GLUED_METADATA_TAIL.sub("", raw).strip()

    pieces = META_SPLIT.split(raw, maxsplit=1)
    player = pieces[0].strip(" ,;")

    # RC comes only from the dedicated TCDB rookie index.
    player = re.sub(r",?\s+RC\b", "", player, flags=re.IGNORECASE).strip(" ,;")

    # Pro-Visions uses PV as set metadata. Keep the display-facing player clean.
    player = re.sub(r"\s+PV$", "", player, flags=re.IGNORECASE).strip(" ,;")
    player = " ".join(player.split())

    if not player:
        raise SystemExit(f"Could not derive clean player/subject from {raw_name!r}")

    notes: list[str] = []
    for token in META_TOKEN.findall(metadata_source):
        upper = token.upper()
        if upper not in notes:
            notes.append(upper)

    return player, "; ".join(notes)


def is_checklist_card(player: str, subset: str = "") -> bool:
    return "checklist" in player.lower() or "checklist" in subset.lower()


def validate_team(card_number: str, player: str, raw_team: str, subset: str) -> str:
    team = " ".join(raw_team.split()).strip()
    if not team and not is_checklist_card(player, subset):
        raise SystemExit(f"Card #{card_number} {player} is missing team data")
    return team


def choose_logical_version(
    label: str,
    number: int,
    versions: list[tuple[str, str, str]],
    subset: str,
) -> tuple[str, str, str]:
    cleaned: list[tuple[str, str, str]] = []
    for source_number, raw_name, raw_team in versions:
        player, variant = clean_player_and_variant(raw_name)
        team = validate_team(source_number, player, raw_team, subset)
        cleaned.append((player, team, variant))

    subjects = {(player, team) for player, team, _variant in cleaned}
    if len(subjects) != 1:
        raise SystemExit(
            f"{label} #{number}: physical variants resolve to different subjects/teams: "
            f"{sorted(subjects)!r}"
        )

    # Prefer corrected metadata when an ERR/COR pair exists; otherwise prefer
    # the cleanest version. VCS stores one logical checklist card, not both.
    corrected = [row for row in cleaned if "COR" in row[2].split("; ")]
    if corrected:
        return corrected[0]

    clean = [row for row in cleaned if not row[2]]
    if clean:
        return clean[0]

    return cleaned[0]


def fetch_numbered_set(
    url: str,
    expected: int,
    label: str,
    subset: str,
    *,
    max_pages: int = 8,
) -> dict[int, tuple[str, str, str]]:
    grouped: dict[int, list[tuple[str, str, str]]] = {}
    print(f"{label}:")

    for page_index in range(1, max_pages + 1):
        parsed = parse_rows(fetch(page_url(url, page_index)), r"\d{1,3}[A-Za-z]?")
        before = len(grouped)

        for source_number, raw_name, raw_team in parsed:
            number = normalize_number(source_number)
            if not (1 <= number <= expected):
                continue
            grouped.setdefault(number, []).append((source_number, raw_name, raw_team))

        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{len(grouped) - before}; logical cards {len(grouped)}"
        )

        if len(grouped) == expected:
            break
        if page_index > 1 and not parsed:
            break

    required = set(range(1, expected + 1))
    actual = set(grouped)
    if actual != required:
        missing = sorted(required - actual)
        extra = sorted(actual - required)
        raise SystemExit(
            f"{label}: numbering mismatch; missing={missing[:30]}, extra={extra[:30]}, "
            f"found={len(grouped)} expected={expected}"
        )

    return {
        number: choose_logical_version(label, number, grouped[number], subset)
        for number in range(1, expected + 1)
    }


def load_true_rc_numbers() -> set[int]:
    print("rookie-index:")
    seen: set[int] = set()

    for page_index in range(1, 4):
        parsed = parse_rows(fetch(page_url(ROOKIES_URL, page_index)), r"\d{1,3}")
        before = len(seen)
        for raw_number, _raw_name, _team in parsed:
            number = int(raw_number)
            if 1 <= number <= EXPECTED_BASE:
                seen.add(number)

        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{len(seen) - before}; unique RC numbers {len(seen)}"
        )

        if len(seen) == EXPECTED_TRUE_RCS:
            break
        if page_index > 1 and not parsed:
            break

    if len(seen) != EXPECTED_TRUE_RCS:
        raise SystemExit(
            f"Expected {EXPECTED_TRUE_RCS} TCDB true rookie cards, found {len(seen)}"
        )

    return seen


def build_base_rows(true_rcs: set[int]) -> list[list[str]]:
    cards = fetch_numbered_set(BASE_URL, EXPECTED_BASE, "base", "Base")
    rows: list[list[str]] = []

    for number in range(1, EXPECTED_BASE + 1):
        player, team, variant = cards[number]
        if number in true_rcs:
            player = f"{player} RC"

        subset = "Checklist" if is_checklist_card(player) else ""
        rows.append(["base", str(number), player, team, subset, variant])

    return rows


def build_insert_rows(source: dict[str, object]) -> list[list[str]]:
    key = str(source["key"])
    url = str(source["url"])
    expected = int(source["expected"])
    subset = str(source["subset"])
    cards = fetch_numbered_set(url, expected, key, subset)

    return [
        [key, str(number), cards[number][0], cards[number][1], subset, cards[number][2]]
        for number in range(1, expected + 1)
    ]


def build_redemption_row() -> list[str]:
    print("draft-lottery-redemption:")
    parsed = parse_rows(fetch(REDEMPTION["url"]), r"NNO")
    if len(parsed) != 1:
        raise SystemExit(
            f"draft-lottery-redemption: expected 1 NNO record, found {len(parsed)}"
        )

    _number, raw_name, raw_team = parsed[0]
    player, variant = clean_player_and_variant(raw_name)
    team = " ".join(raw_team.split()).strip()
    if team:
        raise SystemExit(
            f"draft-lottery-redemption: expected teamless redemption card, found team={team!r}"
        )

    if player != "1994 NBA Draft Lottery Set Exchange Card":
        raise SystemExit(
            f"Unexpected redemption-card subject: {player!r}"
        )

    notes = [piece for piece in [variant, "Physical NNO"] if piece]
    return [
        str(REDEMPTION["key"]),
        "NNO",
        player,
        "",
        str(REDEMPTION["subset"]),
        "; ".join(dict.fromkeys(notes)),
    ]


def main() -> None:
    true_rcs = load_true_rc_numbers()
    base_rows = build_base_rows(true_rcs)

    all_rows: list[list[str]] = list(base_rows)
    all_rows.append(build_redemption_row())

    counts: dict[str, int] = {
        "base": len(base_rows),
        str(REDEMPTION["key"]): 1,
    }

    for source in SOURCES:
        rows = build_insert_rows(source)
        all_rows.extend(rows)
        counts[str(source["key"])] = len(rows)

    if len(all_rows) != EXPECTED_TOTAL:
        raise SystemExit(
            f"Expected {EXPECTED_TOTAL} explicit CSV rows, found {len(all_rows)}"
        )

    rc_rows = [row for row in all_rows if row[2].endswith(" RC")]
    if len(rc_rows) != EXPECTED_TRUE_RCS:
        raise SystemExit(
            f"Expected {EXPECTED_TRUE_RCS} true RC labels, found {len(rc_rows)}"
        )
    if any(row[0] != "base" for row in rc_rows):
        raise SystemExit("RC label leaked outside Base")

    keys = {(row[0], row[1]) for row in all_rows}
    if len(keys) != len(all_rows):
        raise SystemExit("Duplicate ProductSet/cardNumber key detected")

    bad_odds = [
        row for row in all_rows if re.search(r"\b1\s*:\s*\d+\b", row[5] or "")
    ]
    if bad_odds:
        raise SystemExit(f"Card-level odds leaked into Variant: {bad_odds[:5]}")

    dirty_players = [
        row
        for row in all_rows
        if re.search(
            r"\b(?:UER|ERR|COR|VAR|RDM|EXCH|SN\d+|PR\d+)\b",
            row[2],
            re.IGNORECASE,
        )
    ]
    if dirty_players:
        raise SystemExit(f"Collector metadata leaked into Player: {dirty_players[:5]}")

    missing_teams = [
        row
        for row in all_rows
        if not row[3].strip()
        and row[0] != str(REDEMPTION["key"])
        and not is_checklist_card(row[2], row[4])
    ]
    if missing_teams:
        raise SystemExit(f"Unexpected missing team data: {missing_teams[:5]}")

    lookup = {(row[0], row[1]): row for row in all_rows}
    spot_checks = {
        ("base", "1"): ("Stacey Augmon", "Atlanta Hawks"),
        ("base", "268"): ("Jason Kidd RC", "Dallas Mavericks"),
        ("base", "280"): ("Grant Hill RC", "Detroit Pistons"),
        ("base", "320"): ("Glenn Robinson RC", "Milwaukee Bucks"),
        ("first-year-phenoms", "1"): ("Grant Hill", "Detroit Pistons"),
        ("all-star-weekend", "9"): ("Shaquille O'Neal", "Orlando Magic"),
        ("pro-visions", "5"): ("Chris Webber", "Golden State Warriors"),
        ("young-lions", "5"): ("Shaquille O'Neal", "Orlando Magic"),
    }
    for key, expected in spot_checks.items():
        row = lookup.get(key)
        if not row or tuple(row[2:4]) != expected:
            raise SystemExit(
                f"Spot validation failed for {key}: {row}; expected {expected!r}"
            )

    team_leaders_three = lookup[("team-leaders", "3")]
    if "COR" not in team_leaders_three[5].split("; "):
        raise SystemExit(
            f"Team Leaders #3 should prefer corrected metadata: {team_leaders_three}"
        )

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 1994-95 FLEER BASKETBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Base cards: {counts['base']}")
    print(f"Verified true RC cards: {len(rc_rows)}")
    print(f"{REDEMPTION['key']}: {counts[str(REDEMPTION['key'])]}")
    for source in SOURCES:
        key = str(source["key"])
        print(f"{key}: {counts[key]}")
    print(f"Explicit CSV rows: {len(all_rows)}")
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")
    print("Pack configuration: 12 cards per pack, 36 packs per box")


if __name__ == "__main__":
    main()
