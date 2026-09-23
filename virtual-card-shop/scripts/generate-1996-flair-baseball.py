from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1996-flair-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/ViewSet.cfm/sid/672/1996-Flair"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/672/1996-Flair"

SOURCES = [
    {
        "key": "diamond-cuts",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/673/1996-Flair---Diamond-Cuts",
        "expected": 12,
        "subset": "Diamond Cuts",
    },
    {
        "key": "hot-gloves",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/674/1996-Flair---Hot-Gloves",
        "expected": 10,
        "subset": "Hot Gloves",
    },
    {
        "key": "powerline",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/675/1996-Flair---Powerline",
        "expected": 10,
        "subset": "Powerline",
    },
    {
        "key": "wave-of-the-future",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/676/1996-Flair---Wave-of-the-Future",
        "expected": 20,
        "subset": "Wave of the Future",
    },
]

EXPECTED_LOGICAL_BASE = 400
EXPECTED_BASE_ROWS = 800
EXPECTED_TRUE_RC_NUMBERS = {117, 141, 149, 208, 387}
EXPECTED_RC_ROWS = len(EXPECTED_TRUE_RC_NUMBERS) * 2
EXPECTED_EXPLICIT_ROWS = EXPECTED_BASE_ROWS + sum(int(s["expected"]) for s in SOURCES)
EXPECTED_PRODUCT_SETS = 1 + len(SOURCES)

VARIANTS = {
    "a": "Gold lettering; Silver background",
    "b": "Silver lettering; Gold background",
}


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
            number = value.strip()
            if not pattern.fullmatch(number):
                continue
            if i + 1 >= len(vals):
                continue

            raw_name = vals[i + 1].strip()
            if not raw_name or raw_name.lower() in {"options", "add", "edit"}:
                continue

            team = vals[i + 2].strip() if i + 2 < len(vals) else ""
            found.append((number, raw_name, team))
            break

    return found


def clean_player(raw_name: str) -> str:
    name = " ".join(raw_name.split()).strip()
    # TCDB ViewSet rows append RC/VAR/error metadata to the display text.
    name = re.split(
        r"\s+(?=(?:RC|ROO|VAR|UER|ERR|COR|PR\d+|SN\d+)\b)",
        name,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0].strip(" ,;")
    if not name:
        raise SystemExit(f"Could not derive clean player/subject from {raw_name!r}")
    return name


def normalize_team(card_number: str, player: str, raw_team: str) -> str:
    team = " ".join(raw_team.split()).strip()
    if not team:
        raise SystemExit(f"Card #{card_number} {player} is missing team data")
    return team


def validate_rookie_index() -> None:
    print("rookie-index:")
    rows = parse_rows(fetch(ROOKIES_URL), r"\d{1,3}")
    recognized = {
        int(number)
        for number, _raw_name, _team in rows
        if number.isdigit() and 1 <= int(number) <= EXPECTED_LOGICAL_BASE
    }
    print(
        f"  parsed {len(rows)} TCDB rookie records; "
        f"{len(recognized)} unique logical rookie numbers"
    )
    if recognized != EXPECTED_TRUE_RC_NUMBERS:
        raise SystemExit(
            "1996 Flair rookie index changed; "
            f"expected {sorted(EXPECTED_TRUE_RC_NUMBERS)}, found {sorted(recognized)}"
        )


def build_base_rows() -> list[list[str]]:
    print("base variations:")
    cards: dict[str, tuple[str, str]] = {}

    for page_index in range(1, 6):
        parsed = parse_rows(fetch(page_url(BASE_URL, page_index)), r"\d{1,3}[ab]")
        before = len(cards)
        for card_number, raw_name, raw_team in parsed:
            number = int(card_number[:-1])
            suffix = card_number[-1].lower()
            if not (1 <= number <= EXPECTED_LOGICAL_BASE) or suffix not in VARIANTS:
                continue
            player = clean_player(raw_name)
            team = normalize_team(card_number, player, raw_team)
            cards[f"{number}{suffix}"] = (player, team)

        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{len(cards) - before}; unique {len(cards)}"
        )
        if len(cards) == EXPECTED_BASE_ROWS:
            break
        if page_index > 1 and not parsed:
            break

    required = {
        f"{number}{suffix}"
        for number in range(1, EXPECTED_LOGICAL_BASE + 1)
        for suffix in ("a", "b")
    }
    actual = set(cards)
    if actual != required:
        missing = sorted(required - actual)[:30]
        extra = sorted(actual - required)[:30]
        raise SystemExit(
            f"Base variation numbering mismatch; missing={missing}, extra={extra}, "
            f"found={len(cards)} expected={EXPECTED_BASE_ROWS}"
        )

    rows: list[list[str]] = []
    for number in range(1, EXPECTED_LOGICAL_BASE + 1):
        for suffix in ("a", "b"):
            card_number = f"{number}{suffix}"
            player, team = cards[card_number]
            if number in EXPECTED_TRUE_RC_NUMBERS:
                player = f"{player} RC"
            rows.append(
                [
                    "base",
                    card_number,
                    player,
                    team,
                    "",
                    VARIANTS[suffix],
                ]
            )
    return rows


def fetch_numbered_set(url: str, expected: int) -> list[tuple[str, str, str]]:
    cards: dict[int, tuple[str, str, str]] = {}
    for page_index in range(1, 4):
        parsed = parse_rows(fetch(page_url(url, page_index)), r"\d{1,3}")
        before = len(cards)
        for raw_number, raw_name, raw_team in parsed:
            number = int(raw_number)
            if 1 <= number <= expected:
                player = clean_player(raw_name)
                team = normalize_team(raw_number, player, raw_team)
                cards[number] = (str(number), player, team)
        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{len(cards) - before}; unique {len(cards)}"
        )
        if len(cards) == expected:
            break
        if page_index > 1 and not parsed:
            break

    required = set(range(1, expected + 1))
    if set(cards) != required:
        missing = sorted(required - set(cards))
        extra = sorted(set(cards) - required)
        raise SystemExit(
            f"{url}: numbering mismatch; missing={missing[:30]}, extra={extra[:30]}"
        )
    return [cards[number] for number in range(1, expected + 1)]


def build_insert_rows(source: dict[str, object]) -> list[list[str]]:
    key = str(source["key"])
    url = str(source["url"])
    expected = int(source["expected"])
    subset = str(source["subset"])
    print(f"{key}:")

    rows: list[list[str]] = []
    for number, player, team in fetch_numbered_set(url, expected):
        rows.append([key, number, player, team, subset, ""])
    return rows


def main() -> None:
    validate_rookie_index()

    all_rows = build_base_rows()
    counts: dict[str, int] = {"base": len(all_rows)}

    for source in SOURCES:
        rows = build_insert_rows(source)
        all_rows.extend(rows)
        counts[str(source["key"])] = len(rows)

    if counts["base"] != EXPECTED_BASE_ROWS:
        raise SystemExit(
            f"Base expected {EXPECTED_BASE_ROWS} cards, found {counts['base']}"
        )

    for source in SOURCES:
        key = str(source["key"])
        expected = int(source["expected"])
        if counts.get(key) != expected:
            raise SystemExit(f"{key}: expected {expected}, found {counts.get(key, 0)}")

    if len(all_rows) != EXPECTED_EXPLICIT_ROWS:
        raise SystemExit(
            f"Expected {EXPECTED_EXPLICIT_ROWS} explicit rows, found {len(all_rows)}"
        )

    rc_rows = [row for row in all_rows if row[2].endswith(" RC")]
    if len(rc_rows) != EXPECTED_RC_ROWS:
        raise SystemExit(
            f"Expected {EXPECTED_RC_ROWS} RC rows from five logical rookie numbers, "
            f"found {len(rc_rows)}"
        )

    unexpected_insert_rcs = [row for row in rc_rows if row[0] != "base"]
    if unexpected_insert_rcs:
        raise SystemExit(f"RC leaked into insert rows: {unexpected_insert_rcs[:5]}")

    dirty_players = [
        row
        for row in all_rows
        if re.search(r"\b(?:VAR|UER|ERR|COR|PR\d+|SN\d+)\b", row[2], re.IGNORECASE)
    ]
    if dirty_players:
        raise SystemExit(f"Collector metadata leaked into Player: {dirty_players[:5]}")

    bad_odds = [
        row
        for row in all_rows
        if re.search(r"\b1\s*:\s*\d+\b", row[5], re.IGNORECASE)
    ]
    if bad_odds:
        raise SystemExit(f"Card-level odds leaked into Variant: {bad_odds[:5]}")

    missing_teams = [row for row in all_rows if not row[3].strip()]
    if missing_teams:
        raise SystemExit(f"Found cards missing team data: {missing_teams[:5]}")

    lookup = {(row[0], row[1]): row for row in all_rows}
    spot_checks = {
        ("base", "1a"): ("Roberto Alomar", "Baltimore Orioles", "Gold lettering; Silver background"),
        ("base", "1b"): ("Roberto Alomar", "Baltimore Orioles", "Silver lettering; Gold background"),
        ("base", "117a"): ("Matt Lawton RC", "Minnesota Twins", "Gold lettering; Silver background"),
        ("base", "384b"): ("Barry Bonds", "San Francisco Giants", "Silver lettering; Gold background"),
        ("diamond-cuts", "5"): ("Ken Griffey Jr.", "Seattle Mariners", ""),
        ("powerline", "4"): ("Ken Griffey Jr.", "Seattle Mariners", ""),
        ("wave-of-the-future", "1"): ("Bob Abreu", "Houston Astros", ""),
    }
    for key, (expected_player, expected_team, expected_variant) in spot_checks.items():
        row = lookup.get(key)
        if not row:
            raise SystemExit(f"Spot validation missing row {key}")
        if row[2] != expected_player or row[3] != expected_team or row[5] != expected_variant:
            raise SystemExit(
                f"Spot validation failed for {key}: {row}; expected "
                f"({expected_player!r}, {expected_team!r}, {expected_variant!r})"
            )

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 1996 FLAIR BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Logical flagship numbers: {EXPECTED_LOGICAL_BASE}")
    print(f"Base variation cards: {counts['base']}")
    print(f"Recognized true rookie numbers: {len(EXPECTED_TRUE_RC_NUMBERS)}")
    print(f"RC rows across a/b variations: {len(rc_rows)}")
    for source in SOURCES:
        key = str(source["key"])
        print(f"{key}: {counts[key]}")
    print(f"Explicit CSV rows: {len(all_rows)}")
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_EXPLICIT_ROWS}")


if __name__ == "__main__":
    main()
