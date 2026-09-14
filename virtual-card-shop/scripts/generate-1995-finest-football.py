from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1995-finest-football.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/3504/1995-Finest"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/3504/1995-Finest"
REFRACTORS_URL = "https://www.tcdb.com/Checklist.cfm/sid/3506/1995-Finest---Refractors"
FAN_FAVORITES_URL = "https://www.tcdb.com/Checklist.cfm/sid/3505/1995-Finest---Fan-Favorites"

EXPECTED_TRUE_RCS = 18
EXPECTED_COUNTS = {
    "base": 275,
    "refractors": 275,
    "fan-favorites": 25,
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
    label: str,
    url: str,
    number_pattern: str,
    expected: int,
) -> list[tuple[str, str, str]]:
    cards: dict[str, tuple[str, str, str]] = {}

    for page_index in range(1, 8):
        parsed = parse_rows(fetch(page_url(url, page_index)), number_pattern)
        before = len(cards)
        for row in parsed:
            cards[row[0]] = row
        added = len(cards) - before
        print(
            f"{label} page {page_index}: parsed {len(parsed)} rows; "
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
    r"(?:,?\s*)?(?:inserted\s+)?(?:at\s+)?(?:a\s+rate\s+of\s+)?1\s*:\s*\d+\s*(?:packs?)?",
    re.IGNORECASE,
)
NOTE_START = re.compile(
    r"(?:^|\s)(?=(?:RC|ROO|UER|ERR|COR|VAR|CL|SP|AU|MEM|EXCH|PR\d+|SN\d+)\b)",
    re.IGNORECASE,
)


def clean_player_and_notes(raw_name: str) -> tuple[str, str]:
    """Return a display-clean Player and non-odds collector metadata."""
    raw_name = " ".join(raw_name.split())
    match = NOTE_START.search(raw_name)
    if match:
        player = raw_name[: match.start()].strip().rstrip(",")
        notes = raw_name[match.start() :].strip(" ,;")
    else:
        player = raw_name.strip().rstrip(",")
        notes = ""

    notes = ODDS_TEXT.sub("", notes)
    # RC is controlled only by the verified base rookie index. ROO is a source
    # checklist annotation and should never leak into Player.
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
        for piece in [item.strip() for item in cleaned.split(";") if item.strip()]:
            if piece not in seen:
                seen.append(piece)
    return "; ".join(seen)


def load_true_rc_numbers() -> set[int]:
    rookie_numbers: set[int] = set()

    for page_index in range(1, 4):
        rows = parse_rows(fetch(page_url(ROOKIES_URL, page_index)), r"\d{1,3}")
        for card_number, _raw_name, _team in rows:
            number = int(card_number)
            if 1 <= number <= 275:
                rookie_numbers.add(number)
        print(
            f"Rookie index page {page_index}: cumulative recognized RCs "
            f"{len(rookie_numbers)}"
        )
        if len(rookie_numbers) >= EXPECTED_TRUE_RCS:
            break

    if len(rookie_numbers) != EXPECTED_TRUE_RCS:
        raise SystemExit(
            f"Expected {EXPECTED_TRUE_RCS} recognized true RC cards from TCDB "
            f"rookie index, found {len(rookie_numbers)}"
        )

    return rookie_numbers


def series_subset(number: int) -> str:
    return "Series 1" if number <= 165 else "Series 2"


def build_base_rows(true_rcs: set[int]) -> list[list[str]]:
    source_rows = fetch_set_rows("base", BASE_URL, r"\d{1,3}", 275)
    cards: dict[int, tuple[str, str]] = {}

    for raw_number, raw_name, team in source_rows:
        number = int(raw_number)
        if 1 <= number <= 275:
            cards[number] = (raw_name, team)

    missing = [number for number in range(1, 276) if number not in cards]
    if missing:
        raise SystemExit(f"Base checklist incomplete; missing card numbers: {missing[:30]}")

    rows: list[list[str]] = []
    for number in range(1, 276):
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
                series_subset(number),
                variant_text(source_notes),
            ]
        )

    return rows


def build_refractor_rows() -> list[list[str]]:
    source_rows = fetch_set_rows(
        "refractors",
        REFRACTORS_URL,
        r"\d{1,3}",
        275,
    )
    cards: dict[int, tuple[str, str]] = {}

    for raw_number, raw_name, team in source_rows:
        number = int(raw_number)
        if 1 <= number <= 275:
            cards[number] = (raw_name, team)

    missing = [number for number in range(1, 276) if number not in cards]
    if missing:
        raise SystemExit(
            f"Refractors checklist incomplete; missing card numbers: {missing[:30]}"
        )

    rows: list[list[str]] = []
    for number in range(1, 276):
        raw_name, team = cards[number]
        player, source_notes = clean_player_and_notes(raw_name)

        if not team:
            raise SystemExit(f"Refractor #{number} {player} is missing team data")

        rows.append(
            [
                "refractors",
                str(number),
                player,
                team,
                series_subset(number),
                variant_text("Refractor", source_notes),
            ]
        )

    return rows


def build_fan_favorites_rows() -> list[list[str]]:
    source_rows = fetch_set_rows(
        "fan-favorites",
        FAN_FAVORITES_URL,
        r"FF\d{1,2}",
        25,
    )

    rows: list[list[str]] = []
    seen: set[str] = set()
    for card_number, raw_name, team in source_rows:
        if card_number in seen:
            raise SystemExit(f"Fan Favorites duplicate card number {card_number}")
        seen.add(card_number)

        player, source_notes = clean_player_and_notes(raw_name)
        if not team:
            raise SystemExit(
                f"Fan Favorites #{card_number} {player} is missing team data"
            )

        rows.append(
            [
                "fan-favorites",
                card_number,
                player,
                team,
                "",
                variant_text(source_notes),
            ]
        )

    if len(rows) != 25:
        raise SystemExit(f"Fan Favorites expected 25 cards, found {len(rows)}")

    return rows


def main() -> None:
    true_rcs = load_true_rc_numbers()

    all_rows: list[list[str]] = []
    all_rows.extend(build_base_rows(true_rcs))
    all_rows.extend(build_refractor_rows())
    all_rows.extend(build_fan_favorites_rows())

    actual_counts: dict[str, int] = {}
    for row in all_rows:
        actual_counts[row[0]] = actual_counts.get(row[0], 0) + 1

    for key, expected in EXPECTED_COUNTS.items():
        actual = actual_counts.get(key, 0)
        if actual != expected:
            raise SystemExit(f"{key}: expected {expected} rows, found {actual}")

    if len(all_rows) != EXPECTED_TOTAL:
        raise SystemExit(f"Expected {EXPECTED_TOTAL} total rows, found {len(all_rows)}")

    card_level_odds = [
        row for row in all_rows if row[5] and re.search(r"\b1\s*:\s*\d+\b", row[5])
    ]
    if card_level_odds:
        example = card_level_odds[0]
        raise SystemExit(
            "Card-level odds leaked into Variant; "
            f"example {example[0]} #{example[1]}: {example[5]}"
        )

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(
            ["setKey", "cardNumber", "player", "team", "subset", "variant"]
        )
        writer.writerows(all_rows)

    print("=== 1995 FINEST FOOTBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    for key, expected in EXPECTED_COUNTS.items():
        print(f"  {key}: {expected}")
    print(
        f"Recognized true RC cards labeled in Base player row: {len(true_rcs)}"
    )
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")
    print("Card-level odds in Variant: 0")
    print("Team data: COMPLETE")


if __name__ == "__main__":
    main()
