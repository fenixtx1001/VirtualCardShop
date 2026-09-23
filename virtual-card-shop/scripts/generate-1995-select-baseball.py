from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1995-select-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/549/1995-Select"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/549/1995-Select"

SOURCES = [
    {
        "key": "big-sticks",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/550/1995-Select---Big-Sticks",
        "expected": 12,
        "pattern": r"BS\d{1,2}",
        "subset": "Big Sticks",
    },
    {
        "key": "cant-miss",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/551/1995-Select---Can%27t-Miss",
        "expected": 12,
        "pattern": r"CM\d{1,2}",
        "subset": "Can't Miss",
    },
    {
        "key": "sure-shots",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/555/1995-Select---Sure-Shots",
        "expected": 10,
        "pattern": r"SS\d{1,2}",
        "subset": "Sure Shots",
    },
]

EXPECTED_BASE = 250
EXPECTED_TRUE_RCS = {169, 195, 197, 199, 200, 208, 209}
EXPECTED_EXPLICIT = 250 + 12 + 12 + 10
EXPECTED_RESOLVED = EXPECTED_EXPLICIT + 250  # Artist's Proofs derive from Base.
EXPECTED_PRODUCT_SETS = 5


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
            card_number = value.strip()
            if not pattern.fullmatch(card_number):
                continue
            if i + 1 >= len(vals):
                continue

            raw_name = vals[i + 1].strip()
            if not raw_name or raw_name.lower() in {"options", "add", "edit"}:
                continue

            team = vals[i + 2].strip() if i + 2 < len(vals) else ""
            found.append((card_number.upper(), raw_name, team))
            break

    return found


def fetch_base() -> list[tuple[str, str, str]]:
    cards: dict[int, tuple[str, str, str]] = {}

    for page_index in range(1, 5):
        parsed = parse_rows(page_url_fetch(BASE_URL, page_index), r"\d{1,3}")
        before = len(cards)
        for raw_number, raw_name, team in parsed:
            number = int(raw_number)
            if 1 <= number <= EXPECTED_BASE:
                cards[number] = (raw_number, raw_name, team)
        print(
            f"base page {page_index}: parsed {len(parsed)} rows; "
            f"+{len(cards) - before}; unique {len(cards)}"
        )
        if len(cards) == EXPECTED_BASE:
            break

    required = set(range(1, EXPECTED_BASE + 1))
    if set(cards) != required:
        missing = sorted(required - set(cards))
        extra = sorted(set(cards) - required)
        raise SystemExit(
            f"Base numbering mismatch; missing={missing[:30]}, extra={extra[:30]}"
        )

    return [cards[number] for number in range(1, EXPECTED_BASE + 1)]


def page_url_fetch(url: str, page_index: int) -> str:
    return fetch(page_url(url, page_index))


def fetch_prefixed_set(source: dict[str, object]) -> list[tuple[str, str, str]]:
    key = str(source["key"])
    url = str(source["url"])
    expected = int(source["expected"])
    pattern = str(source["pattern"])

    rows = parse_rows(fetch(page_url(url, 1)), pattern)
    unique: dict[str, tuple[str, str, str]] = {}
    for number, raw_name, team in rows:
        unique[number.upper()] = (number.upper(), raw_name, team)

    if len(unique) != expected:
        raise SystemExit(
            f"{key}: expected {expected} unique cards, found {len(unique)}: "
            f"{sorted(unique)[:30]}"
        )

    prefix = re.match(r"^[A-Z]+", next(iter(unique))).group(0)  # type: ignore[union-attr]
    expected_numbers = {f"{prefix}{number}" for number in range(1, expected + 1)}
    if set(unique) != expected_numbers:
        missing = sorted(expected_numbers - set(unique))
        extra = sorted(set(unique) - expected_numbers)
        raise SystemExit(
            f"{key}: numbering mismatch; missing={missing[:30]}, extra={extra[:30]}"
        )

    return [unique[f"{prefix}{number}"] for number in range(1, expected + 1)]


SOURCE_MARKER = re.compile(
    r"(?:^|\s)(?=(?:SR|ST|CL|UER|ERR|COR|VAR|RC|ROO|PR\d+|SN\d+)\b)",
    re.IGNORECASE,
)


def clean_player_and_notes(raw_name: str) -> tuple[str, str]:
    raw = " ".join(raw_name.split())
    match = SOURCE_MARKER.search(raw)

    if match:
        player = raw[: match.start()].strip().rstrip(",")
        notes = raw[match.start() :].strip(" ,;")
    else:
        player = raw.strip().rstrip(",")
        notes = ""

    if not player:
        raise SystemExit(f"Could not derive clean player/subject from {raw_name!r}")

    notes = re.sub(r"\b(?:RC|ROO)\b\s*,?\s*", "", notes, flags=re.IGNORECASE)
    notes = re.sub(r"\s*,\s*", "; ", notes)
    notes = re.sub(r"^[,;\s]+|[,;\s]+$", "", notes)
    return player, notes


def is_checklist_card(player: str, subset: str = "") -> bool:
    return "checklist" in player.lower() or "checklist" in subset.lower()


def validate_team(set_key: str, card_number: str, player: str, team: str, subset: str) -> None:
    if team.strip() or is_checklist_card(player, subset):
        return
    raise SystemExit(f"{set_key} #{card_number} {player} is missing team data")


def fetch_true_rookies() -> set[int]:
    html = fetch(page_url(ROOKIES_URL, 1))
    rows = parse_rows(html, r"\d{1,3}")
    recognized = {
        int(card_number)
        for card_number, _raw_name, _team in rows
        if card_number.isdigit() and 1 <= int(card_number) <= EXPECTED_BASE
    }
    if recognized != EXPECTED_TRUE_RCS:
        raise SystemExit(
            "1995 Select rookie index changed; "
            f"expected {sorted(EXPECTED_TRUE_RCS)}, found {sorted(recognized)}"
        )
    return recognized


def build_base_rows(true_rookies: set[int]) -> list[list[str]]:
    rows: list[list[str]] = []

    for raw_number, raw_name, raw_team in fetch_base():
        number = int(raw_number)
        player, source_notes = clean_player_and_notes(raw_name)
        subset = "Checklist" if "checklist" in player.lower() else ""
        team = " ".join(raw_team.split()).strip()

        if number in true_rookies:
            player = f"{player} RC"

        validate_team("base", raw_number, player, team, subset)
        rows.append(["base", raw_number, player, team, subset, source_notes])

    return rows


def build_insert_rows(source: dict[str, object]) -> list[list[str]]:
    key = str(source["key"])
    subset = str(source["subset"])
    rows: list[list[str]] = []

    for card_number, raw_name, raw_team in fetch_prefixed_set(source):
        player, source_notes = clean_player_and_notes(raw_name)
        team = " ".join(raw_team.split()).strip()
        validate_team(key, card_number, player, team, subset)
        rows.append([key, card_number, player, team, subset, source_notes])

    return rows


def main() -> None:
    true_rookies = fetch_true_rookies()
    print(f"rookie-index: verified {len(true_rookies)} true RCs")

    all_rows = build_base_rows(true_rookies)
    counts: dict[str, int] = {"base": len(all_rows)}

    for source in SOURCES:
        key = str(source["key"])
        rows = build_insert_rows(source)
        all_rows.extend(rows)
        counts[key] = len(rows)
        print(f"{key}: {len(rows)} cards")

    if len(all_rows) != EXPECTED_EXPLICIT:
        raise SystemExit(
            f"Expected {EXPECTED_EXPLICIT} explicit rows, found {len(all_rows)}"
        )

    base_rows = [row for row in all_rows if row[0] == "base"]
    rc_rows = [row for row in base_rows if row[2].endswith(" RC")]
    if len(rc_rows) != len(EXPECTED_TRUE_RCS):
        raise SystemExit(
            f"Expected {len(EXPECTED_TRUE_RCS)} Base RC labels, found {len(rc_rows)}"
        )

    insert_rc_rows = [row for row in all_rows if row[0] != "base" and row[2].endswith(" RC")]
    if insert_rc_rows:
        raise SystemExit(f"Insert rows incorrectly labeled RC: {insert_rc_rows[:5]}")

    dirty_players = [
        row
        for row in all_rows
        if re.search(r"\b(?:SR|ST|CL|UER|ERR|COR|VAR|PR\d+|SN\d+)\b", row[2], re.IGNORECASE)
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

    missing_teams = [
        row
        for row in all_rows
        if not row[3].strip() and not is_checklist_card(row[2], row[4])
    ]
    if missing_teams:
        raise SystemExit(f"Missing team data: {missing_teams[:5]}")

    lookup = {(row[0], row[1]): row for row in all_rows}
    expected_spots = {
        ("base", "1"): ("Cal Ripken Jr.", "Baltimore Orioles"),
        ("base", "169"): ("Tim Unroe RC", "Milwaukee Brewers"),
        ("base", "195"): ("Ernie Young RC", "Oakland Athletics"),
        ("base", "241"): ("Alex Rodriguez", "Seattle Mariners"),
        ("big-sticks", "BS1"): ("Frank Thomas", "Chicago White Sox"),
        ("cant-miss", "CM10"): ("Alex Rodriguez", "Seattle Mariners"),
    }
    for key, expected in expected_spots.items():
        row = lookup.get(key)
        if not row or (row[2], row[3]) != expected:
            raise SystemExit(
                f"Spot validation failed for {key}: {row}; expected {expected}"
            )

    if ("base", "251") in lookup:
        raise SystemExit("Dealer-only Hideo Nomo #251 must not be included in Base")

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 1995 SELECT BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Explicit CSV rows: {len(all_rows)}")
    print(f"Base cards: {counts['base']}")
    print(f"Recognized true RC cards labeled in Base: {len(rc_rows)}")
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_RESOLVED}")
    print("Dealer-only #251 and Samples promo intentionally excluded")


if __name__ == "__main__":
    main()
