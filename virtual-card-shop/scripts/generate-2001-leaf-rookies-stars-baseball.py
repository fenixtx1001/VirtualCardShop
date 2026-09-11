from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "2001-leaf-rookies-stars-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/1473/2001-Leaf-Rookies-%26-Stars"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/1473/2001-Leaf-Rookies-%26-Stars"

# Collector-facing full checklists stay intact in VCS even when physical pack odds
# varied by card-number range. Odds belong on ProductSet only, never card Variant.
SOURCES = [
    {
        "key": "longevity",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12918/2001-Leaf-Rookies-%26-Stars---Longevity",
        "expected": 300,
        "pattern": r"\d{1,3}",
        "extra": "Longevity",
    },
    {
        "key": "autographs",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12909/2001-Leaf-Rookies-%26-Stars---Autographs",
        "expected": 76,
        "pattern": r"\d{1,3}",
        "extra": "AU",
    },
    {
        "key": "dress-for-success",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12910/2001-Leaf-Rookies-%26-Stars---Dress-for-Success",
        "expected": 25,
        "pattern": r"DFS-?\d{1,2}",
        "extra": "MEM",
    },
    {
        "key": "dress-for-success-autographs",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12911/2001-Leaf-Rookies-%26-Stars---Dress-for-Success-Autographs",
        "expected": 10,
        "pattern": r"DFS-?\d{1,2}",
        "extra": "MEM; AU",
    },
    {
        "key": "dress-for-success-prime-cuts",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12912/2001-Leaf-Rookies-%26-Stars---Dress-for-Success-Prime-Cuts",
        "expected": 25,
        "pattern": r"DFS-?\d{1,2}",
        "extra": "MEM; SN50",
    },
    {
        "key": "freshman-orientation",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12913/2001-Leaf-Rookies-%26-Stars---Freshman-Orientation",
        "expected": 25,
        "pattern": r"FO-?\d{1,2}",
        "extra": "MEM",
    },
    {
        "key": "freshman-orientation-autographs",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12914/2001-Leaf-Rookies-%26-Stars---Freshman-Orientation-Autographs",
        "expected": 21,
        "pattern": r"FO-?\d{1,2}",
        "extra": "MEM; AU",
    },
    {
        "key": "freshman-orientation-class-officers",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12915/2001-Leaf-Rookies-%26-Stars---Freshman-Orientation-Class-Officers",
        "expected": 25,
        "pattern": r"FO-?\d{1,2}",
        "extra": "MEM; SN50",
    },
    {
        "key": "great-american-treasures",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12916/2001-Leaf-Rookies-%26-Stars---Great-American-Treasures",
        "expected": 20,
        "pattern": r"GT-?\d{1,2}",
        "extra": "MEM",
    },
    {
        "key": "great-american-treasures-autographs",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12917/2001-Leaf-Rookies-%26-Stars---Great-American-Treasures-Autographs",
        "expected": 4,
        "pattern": r"GT-?\d{1,2}",
        "extra": "MEM; AU",
    },
    {
        "key": "players-collection",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12919/2001-Leaf-Rookies-%26-Stars---Players-Collection",
        "expected": 15,
        "pattern": r"PC-?\d{1,2}",
        "extra": "MEM",
    },
    {
        "key": "players-collection-autographs",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12920/2001-Leaf-Rookies-%26-Stars---Players-Collection-Autographs",
        "expected": 3,
        "pattern": r"PC-?\d{1,2}",
        "extra": "MEM; AU; SN100",
    },
    {
        "key": "slideshow",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12921/2001-Leaf-Rookies-%26-Stars---Slideshow",
        "expected": 30,
        "pattern": r"SS-?\d{1,2}",
        "extra": "MEM; SN100",
    },
    {
        "key": "slideshow-autographs",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12922/2001-Leaf-Rookies-%26-Stars---Slideshow-Autographs",
        "expected": 12,
        "pattern": r"S-?\d{1,2}",
        "extra": "MEM; AU; SN100",
    },
    {
        "key": "slideshow-view-master",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12923/2001-Leaf-Rookies-%26-Stars---Slideshow-View-Master",
        "expected": 30,
        "pattern": r"S-?\d{1,2}",
        "extra": "MEM; SN25",
    },
    {
        "key": "statistical-standouts",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12924/2001-Leaf-Rookies-%26-Stars---Statistical-Standouts",
        "expected": 25,
        "pattern": r"SS-?\d{1,2}",
        "extra": "MEM",
    },
    {
        "key": "statistical-standouts-autographs",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12925/2001-Leaf-Rookies-%26-Stars---Statistical-Standouts-Autographs",
        "expected": 10,
        "pattern": r"SS-?\d{1,2}",
        "extra": "MEM; AU",
    },
    {
        "key": "statistical-standouts-super",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12926/2001-Leaf-Rookies-%26-Stars---Statistical-Standouts-Super",
        "expected": 25,
        "pattern": r"SS-?\d{1,2}",
        "extra": "MEM; SN50",
    },
    {
        "key": "triple-threads",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12927/2001-Leaf-Rookies-%26-Stars---Triple-Threads",
        "expected": 10,
        "pattern": r"TT-?\d{1,2}",
        "extra": "MEM; SN100",
    },
]

EXPECTED_COUNTS = {"base": 300, **{str(source["key"]): int(source["expected"]) for source in SOURCES}}
EXPECTED_TOTAL = sum(EXPECTED_COUNTS.values())
EXPECTED_PRODUCT_SETS = len(EXPECTED_COUNTS)
EXPECTED_TRUE_RCS = 148


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


def fetch_set_rows(url: str, number_pattern: str, expected: int) -> list[tuple[str, str, str]]:
    cards: dict[str, tuple[str, str, str]] = {}

    for page_index in range(1, 8):
        parsed = parse_rows(fetch(page_url(url, page_index)), number_pattern)
        before = len(cards)
        for row in parsed:
            cards[row[0]] = row
        added = len(cards) - before
        print(f"  page {page_index}: parsed {len(parsed)} rows; +{added}; unique {len(cards)}")

        if len(cards) >= expected:
            break
        if page_index > 1 and not parsed:
            break

    if len(cards) != expected:
        raise SystemExit(f"{url}: expected {expected} unique cards, found {len(cards)}")

    return list(cards.values())


ODDS_TEXT = re.compile(
    r"(?:,?\s*)?(?:inserted\s+)?(?:at\s+)?(?:a\s+rate\s+of\s+)?1\s*:\s*\d+\s*(?:packs?)?",
    re.IGNORECASE,
)
NOTE_START = re.compile(
    r"(?:^|\s)(?=(?:RC|ROO|UER|ERR|COR|VAR|SP|MEM|AU|CUT|EXCH|PR\d+|SN\d+)\b)",
    re.IGNORECASE,
)


def clean_player_and_notes(raw_name: str) -> tuple[str, str]:
    """Return display-clean Player plus collector metadata; never card-level odds."""
    raw_name = " ".join(raw_name.split())
    match = NOTE_START.search(raw_name)
    if match:
        player = raw_name[: match.start()].strip().rstrip(",")
        notes = raw_name[match.start() :].strip(" ,;")
    else:
        player = raw_name.strip().rstrip(",")
        notes = ""

    notes = ODDS_TEXT.sub("", notes)
    notes = re.sub(r"\b(?:RC|ROO)\b\s*,?\s*", "", notes, flags=re.IGNORECASE)
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
    for page_index in range(1, 5):
        rows = parse_rows(fetch(page_url(ROOKIES_URL, page_index)), r"\d{1,3}")
        for card_number, _raw_name, _team in rows:
            number = int(card_number)
            if 1 <= number <= 300:
                rookie_numbers.add(number)
        print(f"Rookie index page {page_index}: cumulative recognized RCs {len(rookie_numbers)}")
        if len(rookie_numbers) >= EXPECTED_TRUE_RCS:
            break

    if len(rookie_numbers) != EXPECTED_TRUE_RCS:
        raise SystemExit(
            f"Expected {EXPECTED_TRUE_RCS} recognized true RC cards from TCDB rookie index, "
            f"found {len(rookie_numbers)}"
        )
    return rookie_numbers


def build_base_rows(true_rcs: set[int]) -> list[list[str]]:
    source_rows = fetch_set_rows(BASE_URL, r"\d{1,3}", 300)
    cards: dict[int, tuple[str, str]] = {}
    for raw_number, raw_name, team in source_rows:
        number = int(raw_number)
        if 1 <= number <= 300:
            cards[number] = (raw_name, team)

    missing = [number for number in range(1, 301) if number not in cards]
    if missing:
        raise SystemExit(f"Base checklist incomplete; missing card numbers: {missing[:30]}")

    rows: list[list[str]] = []
    for number in range(1, 301):
        raw_name, team = cards[number]
        player, source_notes = clean_player_and_notes(raw_name)
        if number in true_rcs:
            player = f"{player} RC"

        if not team:
            raise SystemExit(f"Base #{number} {player} is missing team data")

        subset = ""
        if 101 <= number <= 200:
            subset = "Tier 1"
        elif 201 <= number <= 300:
            subset = "Tier 2"

        rows.append([
            "base",
            str(number),
            player,
            team,
            subset,
            variant_text(source_notes),
        ])

    return rows


def source_subset(key: str) -> str:
    if key == "longevity":
        return ""
    return ""


def source_extra_variant(key: str, card_number: str, configured_extra: str) -> str:
    extras = [configured_extra]

    if key == "longevity":
        number = int(card_number)
        extras.append("SN50" if number <= 100 else "SN25")

    return variant_text(*extras)


def build_source_rows(source: dict[str, object]) -> list[list[str]]:
    key = str(source["key"])
    url = str(source["url"])
    expected = int(source["expected"])
    pattern = str(source["pattern"])
    extra = str(source.get("extra", ""))

    print(f"{key}:")
    parsed = fetch_set_rows(url, pattern, expected)
    rows: list[list[str]] = []

    for card_number, raw_name, team in parsed:
        player, source_notes = clean_player_and_notes(raw_name)

        if not team:
            raise SystemExit(f"{key} #{card_number} {player} is missing team data")

        subset = source_subset(key)
        if key == "longevity":
            number = int(card_number)
            if 101 <= number <= 200:
                subset = "Tier 1"
            elif 201 <= number <= 300:
                subset = "Tier 2"

        rows.append([
            key,
            card_number,
            player,
            team,
            subset,
            variant_text(source_extra_variant(key, card_number, extra), source_notes),
        ])

    return rows


def main() -> None:
    true_rcs = load_true_rc_numbers()

    print("base:")
    all_rows = build_base_rows(true_rcs)
    actual_counts: dict[str, int] = {"base": len(all_rows)}

    for source in SOURCES:
        key = str(source["key"])
        rows = build_source_rows(source)
        all_rows.extend(rows)
        actual_counts[key] = len(rows)

    for key, expected in EXPECTED_COUNTS.items():
        actual = actual_counts.get(key, 0)
        if actual != expected:
            raise SystemExit(f"{key}: expected {expected} rows, found {actual}")

    if len(all_rows) != EXPECTED_TOTAL:
        raise SystemExit(f"Expected {EXPECTED_TOTAL} explicit rows, found {len(all_rows)}")

    rc_labels = sum(
        1 for row in all_rows if row[0] == "base" and row[2].endswith(" RC")
    )
    if rc_labels != EXPECTED_TRUE_RCS:
        raise SystemExit(f"Expected {EXPECTED_TRUE_RCS} RC labels in Base, found {rc_labels}")

    # Enforce the current Set Factory odds-placement convention.
    bad_odds = [
        (row[0], row[1], row[5])
        for row in all_rows
        if re.search(r"\b(?:inserted\s+)?1\s*:\s*\d+\b", row[5], re.IGNORECASE)
    ]
    if bad_odds:
        raise SystemExit(f"Card-level odds leaked into Variant metadata: {bad_odds[:10]}")

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 2001 LEAF ROOKIES & STARS BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    for key, expected in EXPECTED_COUNTS.items():
        print(f"  {key}: {expected}")
    print(f"Recognized true RC cards labeled in Base player row: {rc_labels}")
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")
    print("Card-level odds in Variant: 0")
    print("Team data: COMPLETE")


if __name__ == "__main__":
    main()
