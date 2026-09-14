from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1990-topps-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/147/1990-Topps"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/147/1990-Topps"

SOURCES = [
    {
        "key": "glossy-all-stars",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/8740/1990-Topps-1989-All-Star-Game-Commemorative-Set-Glossy-All-Stars-",
        "expected": 22,
        "pattern": r"\d{1,2}",
    },
    {
        "key": "glossy-rookies",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/8741/1990-Topps-1989-Rookies-Commemorative-Set-Glossy-Rookies-",
        "expected": 33,
        "pattern": r"\d{1,2}",
    },
    {
        "key": "batting-leaders",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/33343/1990-Topps-Batting-Leaders",
        "expected": 22,
        "pattern": r"\d{1,2}",
    },
]

# TCDB's linked rookie index contains 75 records because Frank Thomas #414 is
# represented by the regular card plus two variations. Those records resolve to
# 73 unique base card numbers. Only these verified base cards receive " RC" in
# the VCS Player field.
EXPECTED_TRUE_RC_NUMBERS = {
    14, 16, 34, 44, 52, 57, 72, 74, 87, 89, 91, 111, 134, 137, 142,
    146, 164, 167, 187, 199, 203, 221, 227, 237, 249, 274, 283, 284,
    302, 309, 314, 317, 331, 344, 348, 354, 361, 374, 377, 413, 414,
    416, 419, 428, 433, 444, 461, 491, 493, 536, 552, 557, 564, 576,
    584, 594, 608, 631, 641, 649, 654, 684, 692, 694, 701, 703, 704,
    713, 714, 744, 757, 769, 774,
}

EXPECTED_COUNTS = {
    "base": 792,
    "glossy-all-stars": 22,
    "glossy-rookies": 33,
    "batting-leaders": 22,
}
EXPECTED_TOTAL = sum(EXPECTED_COUNTS.values())
EXPECTED_PRODUCT_SETS = len(EXPECTED_COUNTS)


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


def fetch_set_rows(
    url: str,
    number_pattern: str,
    expected: int,
    label: str,
    max_pages: int = 12,
) -> list[tuple[str, str, str]]:
    cards: dict[str, tuple[str, str, str]] = {}

    print(f"{label}:")
    for page_index in range(1, max_pages + 1):
        parsed = parse_rows(fetch(page_url(url, page_index)), number_pattern)
        before = len(cards)
        for row in parsed:
            cards[row[0]] = row
        added = len(cards) - before
        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{added}; unique {len(cards)}"
        )

        if len(cards) >= expected:
            break
        if page_index > 1 and not parsed:
            break

    if len(cards) != expected:
        raise SystemExit(
            f"{label}: expected {expected} unique cards, found {len(cards)}"
        )

    return list(cards.values())


ODDS_TEXT = re.compile(
    r"(?:,?\s*)?(?:inserted\s+)?(?:at\s+)?(?:a\s+rate\s+of\s+)?"
    r"1\s*:\s*\d+\s*(?:hobby\s+|retail\s+)?(?:packs?)?",
    re.IGNORECASE,
)
NOTE_START = re.compile(
    r"(?:^|\s)(?=(?:RC|UER|ERR|COR|VAR|CL|SP|AU|MEM|CUT|EXCH|RDM|"
    r"RB|ASR|AS|FS|FRDP|MG|CAPT|TBC|FTC|PR\d+|SN\d+)\b)",
    re.IGNORECASE,
)


def clean_player_and_notes(raw_name: str) -> tuple[str, str]:
    raw_name = " ".join(raw_name.split())

    # TCDB describes the Nolan Ryan tribute cards as "Nolan Ryan 5000K". Keep
    # the card subject clean and carry that descriptor as metadata instead.
    if raw_name.lower().startswith("nolan ryan 5000k"):
        return "Nolan Ryan", "5000K"

    match = NOTE_START.search(raw_name)
    if match:
        player = raw_name[: match.start()].strip().rstrip(",")
        notes = raw_name[match.start() :].strip(" ,;")
    else:
        player = raw_name.strip().rstrip(",")
        notes = ""

    notes = ODDS_TEXT.sub("", notes)
    # RC status is applied only from the independently verified rookie index.
    notes = re.sub(r"\bRC\b\s*,?\s*", "", notes, flags=re.IGNORECASE)
    notes = re.sub(r"\s*,\s*,+", ", ", notes)
    notes = re.sub(r"^[,;\s]+|[,;\s]+$", "", notes)
    return player, notes


def variant_text(*parts: str) -> str:
    seen: list[str] = []
    for part in parts:
        cleaned = ODDS_TEXT.sub("", part or "").strip(" ,;")
        if not cleaned:
            continue
        normalized = cleaned.replace(", ", "; ")
        for piece in [item.strip() for item in normalized.split(";") if item.strip()]:
            if piece not in seen:
                seen.append(piece)
    return "; ".join(seen)


def load_true_rc_numbers() -> set[int]:
    rookie_numbers: set[int] = set()
    rookie_records = 0

    for page_index in range(1, 5):
        rows = parse_rows(fetch(page_url(ROOKIES_URL, page_index)), r"\d{1,3}")
        rookie_records += len(rows)
        for card_number, _raw_name, _team in rows:
            number = int(card_number)
            if 1 <= number <= 792:
                rookie_numbers.add(number)
        print(
            f"Rookie index page {page_index}: {rookie_records} records; "
            f"{len(rookie_numbers)} unique recognized RC card numbers"
        )
        if rookie_numbers == EXPECTED_TRUE_RC_NUMBERS:
            break

    if rookie_numbers != EXPECTED_TRUE_RC_NUMBERS:
        raise SystemExit(
            "Recognized RC checklist changed. Expected "
            f"{sorted(EXPECTED_TRUE_RC_NUMBERS)}, found {sorted(rookie_numbers)}"
        )

    return rookie_numbers


def normalize_team(player: str, team: str) -> str:
    team = team.strip()
    if team:
        return team

    # Checklist/memorial/non-club subjects can legitimately have no club team.
    lowered = player.lower()
    if "checklist" in lowered or "giamatti" in lowered:
        return "MLB"

    raise SystemExit(f"Missing team data for {player}")


def build_base_rows(true_rcs: set[int]) -> list[list[str]]:
    source_rows = fetch_set_rows(BASE_URL, r"\d{1,3}", 792, "base")
    cards: dict[int, tuple[str, str]] = {}

    for raw_number, raw_name, team in source_rows:
        number = int(raw_number)
        if 1 <= number <= 792:
            cards[number] = (raw_name, team)

    missing = [number for number in range(1, 793) if number not in cards]
    if missing:
        raise SystemExit(
            f"Base checklist incomplete; missing card numbers: {missing[:30]}"
        )

    rows: list[list[str]] = []
    for number in range(1, 793):
        raw_name, raw_team = cards[number]
        player, source_notes = clean_player_and_notes(raw_name)
        team = normalize_team(player, raw_team)

        if number in true_rcs:
            player = f"{player} RC"

        subset = "Nolan Ryan 5000K Tribute" if 2 <= number <= 5 else ""

        rows.append(
            [
                "base",
                str(number),
                player,
                team,
                subset,
                variant_text(source_notes),
            ]
        )

    return rows


def build_insert_rows(source: dict[str, object]) -> list[list[str]]:
    key = str(source["key"])
    parsed = fetch_set_rows(
        str(source["url"]),
        str(source["pattern"]),
        int(source["expected"]),
        key,
        max_pages=4,
    )

    rows: list[list[str]] = []
    seen: set[str] = set()
    for card_number, raw_name, raw_team in parsed:
        if card_number in seen:
            raise SystemExit(f"{key}: duplicate card number {card_number}")
        seen.add(card_number)

        player, source_notes = clean_player_and_notes(raw_name)
        team = normalize_team(player, raw_team)

        # These insert families are not treated as true base rookie cards even
        # when the set name says "Rookies".
        rows.append(
            [
                key,
                card_number,
                player,
                team,
                "",
                variant_text(source_notes),
            ]
        )

    return rows


def main() -> None:
    true_rcs = load_true_rc_numbers()

    all_rows = build_base_rows(true_rcs)
    actual_counts: dict[str, int] = {"base": len(all_rows)}

    for source in SOURCES:
        key = str(source["key"])
        rows = build_insert_rows(source)
        all_rows.extend(rows)
        actual_counts[key] = len(rows)

    for key, expected in EXPECTED_COUNTS.items():
        actual = actual_counts.get(key, 0)
        if actual != expected:
            raise SystemExit(f"{key}: expected {expected} rows, found {actual}")

    if len(all_rows) != EXPECTED_TOTAL:
        raise SystemExit(
            f"Expected {EXPECTED_TOTAL} total rows, found {len(all_rows)}"
        )

    odds_leaks = [
        row for row in all_rows if re.search(r"\b1\s*:\s*\d+", row[5] or "")
    ]
    if odds_leaks:
        raise SystemExit(
            f"Card-level odds leaked into Variant for {len(odds_leaks)} rows; "
            f"example: {odds_leaks[0]}"
        )

    missing_teams = [row for row in all_rows if not row[3].strip()]
    if missing_teams:
        raise SystemExit(
            f"Found {len(missing_teams)} cards missing team data; "
            f"example: {missing_teams[0]}"
        )

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(
            ["setKey", "cardNumber", "player", "team", "subset", "variant"]
        )
        writer.writerows(all_rows)

    print("=== 1990 TOPPS BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    for key, expected in EXPECTED_COUNTS.items():
        print(f"  {key}: {expected}")
    print(
        "Recognized true RC cards labeled in Base player row: "
        f"{len(true_rcs)}"
    )
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")
    print("Card-level odds in Variant: 0")
    print("Team data: COMPLETE")


if __name__ == "__main__":
    main()
