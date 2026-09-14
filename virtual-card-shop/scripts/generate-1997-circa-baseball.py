from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1997-circa-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/875/1997-Circa"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/875/1997-Circa"

# TCDB's linked rookie index is the card-level source of truth for this bundle.
# Beckett reports three RCs, while TCDB identifies these four cards.
EXPECTED_TRUE_RC_NUMBERS = {55, 124, 173, 335}

SOURCES = [
    {
        "key": "rave",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/882/1997-Circa---Rave",
        "expected": 400,
        "pattern": r"\d{1,3}",
        "extra": "Rave; SN150",
        "carry_base_rc": True,
    },
    {
        "key": "boss",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/876/1997-Circa---Boss",
        "expected": 20,
        "pattern": r"\d{1,2}",
        "extra": "",
        "carry_base_rc": False,
    },
    {
        "key": "super-boss",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/10872/1997-Circa---Super-Boss",
        "expected": 20,
        "pattern": r"\d{1,2}",
        "extra": "",
        "carry_base_rc": False,
    },
    {
        "key": "fast-track",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/879/1997-Circa---Fast-Track",
        "expected": 10,
        "pattern": r"\d{1,2}",
        "extra": "",
        "carry_base_rc": False,
    },
    {
        "key": "icon",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/880/1997-Circa---Icon",
        "expected": 12,
        "pattern": r"\d{1,2}",
        "extra": "",
        "carry_base_rc": False,
    },
    {
        "key": "rave-reviews",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/883/1997-Circa---Rave-Reviews",
        "expected": 12,
        "pattern": r"\d{1,2}",
        "extra": "",
        "carry_base_rc": False,
    },
    {
        "key": "emerald-autographs-exchange",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/878/1997-Circa-Emerald-Autographs-Exchange",
        "expected": 6,
        "pattern": r"\d{1,3}",
        "extra": "AU; EXCH",
        "carry_base_rc": False,
    },
]

EXPECTED_COUNTS = {
    "base": 400,
    **{str(source["key"]): int(source["expected"]) for source in SOURCES},
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
) -> list[tuple[str, str, str]]:
    cards: dict[str, tuple[str, str, str]] = {}

    print(f"{label}:")
    for page_index in range(1, 8):
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


# Pack odds belong on ProductSet only. Strip any odds language defensively from
# card metadata before writing the CSV.
ODDS_TEXT = re.compile(
    r"(?:,?\s*)?(?:inserted\s+)?(?:at\s+)?(?:a\s+rate\s+of\s+)?"
    r"1\s*:\s*\d+\s*(?:hobby\s+|retail\s+)?(?:packs?)?",
    re.IGNORECASE,
)
NOTE_START = re.compile(
    r"(?:^|\s)(?=(?:RC|UER|ERR|COR|VAR|CL|SP|AU|MEM|CUT|EXCH|RDM|"
    r"PR\d+|SN\d+)\b)",
    re.IGNORECASE,
)


def clean_player_and_notes(raw_name: str) -> tuple[str, str]:
    """Return display-clean Player plus collector metadata, never pack odds."""
    raw_name = " ".join(raw_name.split())
    match = NOTE_START.search(raw_name)
    if match:
        player = raw_name[: match.start()].strip().rstrip(",")
        notes = raw_name[match.start() :].strip(" ,;")
    else:
        player = raw_name.strip().rstrip(",")
        notes = ""

    notes = ODDS_TEXT.sub("", notes)
    # True RC is appended from the independently verified rookie index only.
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
        # TCDB commonly comma-separates annotations; normalize to semicolon
        # pieces so the display field stays tidy and deduplicated.
        normalized = cleaned.replace(", ", "; ")
        for piece in [item.strip() for item in normalized.split(";") if item.strip()]:
            if piece not in seen:
                seen.append(piece)
    return "; ".join(seen)


def load_true_rc_numbers() -> set[int]:
    rookie_numbers: set[int] = set()

    for page_index in range(1, 4):
        rows = parse_rows(fetch(page_url(ROOKIES_URL, page_index)), r"\d{1,3}")
        for card_number, _raw_name, _team in rows:
            number = int(card_number)
            if 1 <= number <= 400:
                rookie_numbers.add(number)
        print(
            f"Rookie index page {page_index}: cumulative recognized RCs "
            f"{len(rookie_numbers)}"
        )
        if rookie_numbers == EXPECTED_TRUE_RC_NUMBERS:
            break

    if rookie_numbers != EXPECTED_TRUE_RC_NUMBERS:
        raise SystemExit(
            "Recognized RC checklist changed. Expected "
            f"{sorted(EXPECTED_TRUE_RC_NUMBERS)}, found {sorted(rookie_numbers)}"
        )

    return rookie_numbers


def build_base_rows(true_rcs: set[int]) -> list[list[str]]:
    source_rows = fetch_set_rows(BASE_URL, r"\d{1,3}", 400, "base")
    cards: dict[int, tuple[str, str]] = {}

    for raw_number, raw_name, team in source_rows:
        number = int(raw_number)
        if 1 <= number <= 400:
            cards[number] = (raw_name, team)

    missing = [number for number in range(1, 401) if number not in cards]
    if missing:
        raise SystemExit(
            f"Base checklist incomplete; missing card numbers: {missing[:30]}"
        )

    rows: list[list[str]] = []
    for number in range(1, 401):
        raw_name, team = cards[number]
        player, source_notes = clean_player_and_notes(raw_name)
        if number in true_rcs:
            player = f"{player} RC"

        if not team:
            raise SystemExit(f"Base #{number} {player} is missing team data")

        rows.append(
            [
                "base",
                str(number),
                player,
                team,
                "",
                variant_text(source_notes),
            ]
        )

    return rows


def build_source_rows(
    source: dict[str, object],
    true_rcs: set[int],
) -> list[list[str]]:
    key = str(source["key"])
    url = str(source["url"])
    expected = int(source["expected"])
    pattern = str(source["pattern"])
    extra = str(source.get("extra", ""))
    carry_base_rc = bool(source.get("carry_base_rc", False))

    parsed = fetch_set_rows(url, pattern, expected, key)
    rows: list[list[str]] = []
    seen: set[str] = set()

    for card_number, raw_name, team in parsed:
        if card_number in seen:
            raise SystemExit(f"{key}: duplicate card number {card_number}")
        seen.add(card_number)

        player, source_notes = clean_player_and_notes(raw_name)

        if carry_base_rc:
            number = int(card_number)
            if number in true_rcs:
                player = f"{player} RC"

        if not team:
            raise SystemExit(f"{key} #{card_number} {player} is missing team data")

        rows.append(
            [
                key,
                card_number,
                player,
                team,
                "",
                variant_text(extra, source_notes),
            ]
        )

    return rows


def main() -> None:
    true_rcs = load_true_rc_numbers()

    all_rows = build_base_rows(true_rcs)
    actual_counts: dict[str, int] = {"base": len(all_rows)}

    for source in SOURCES:
        key = str(source["key"])
        rows = build_source_rows(source, true_rcs)
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

    print("=== 1997 CIRCA BASEBALL CHECKLIST GENERATED ===")
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
