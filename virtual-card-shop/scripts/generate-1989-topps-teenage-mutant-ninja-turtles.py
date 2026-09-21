from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1989-topps-teenage-mutant-ninja-turtles.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/75162/1989-Topps-Teenage-Mutant-Ninja-Turtles"
STICKERS_SERIES_ONE_URL = "https://www.tcdb.com/Checklist.cfm/sid/78625/1989-Topps-Teenage-Mutant-Ninja-Turtles-Stickers-Series-One"
STICKERS_SERIES_TWO_URL = "https://www.tcdb.com/Checklist.cfm/sid/105611/1989-Topps-Teenage-Mutant-Ninja-Turtles-Stickers-Series-Two"

FRANCHISE = "Teenage Mutant Ninja Turtles"
EXPECTED_COUNTS = {"base": 176, "stickers": 22}
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


def parse_rows(html: str, number_pattern: str) -> list[tuple[str, str]]:
    parser = RowParser()
    parser.feed(html)
    pattern = re.compile(rf"^(?:{number_pattern})$", re.IGNORECASE)
    found: list[tuple[str, str]] = []

    for row in parser.rows:
        vals = [value for value in row if value]
        for i, value in enumerate(vals):
            card_number = value.strip()
            if not pattern.fullmatch(card_number):
                continue
            if i + 1 >= len(vals):
                continue

            subject = vals[i + 1].strip()
            if not subject or subject.lower() in {"options", "add", "edit"}:
                continue

            found.append((card_number.upper(), subject))
            break

    return found


def fetch_numbered_set(url: str, expected: int, *, max_pages: int = 4) -> dict[int, str]:
    cards: dict[int, str] = {}

    for page_index in range(1, max_pages + 1):
        parsed = parse_rows(fetch(page_url(url, page_index)), r"\d{1,3}")
        before = len(cards)

        for raw_number, subject in parsed:
            number = int(raw_number)
            if 1 <= number <= expected:
                cards[number] = subject

        added = len(cards) - before
        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{added}; unique {len(cards)}"
        )

        if len(cards) == expected:
            break
        if page_index > 1 and not parsed:
            break

    required = set(range(1, expected + 1))
    actual = set(cards)
    if actual != required:
        missing = sorted(required - actual)
        extra = sorted(actual - required)
        raise SystemExit(
            f"{url}: numbering mismatch; missing={missing[:30]}, extra={extra[:30]}"
        )

    return cards


def clean_subject(raw: str) -> str:
    subject = " ".join(raw.split()).strip()
    if not subject:
        raise SystemExit(f"Could not derive clean card subject from {raw!r}")
    return subject


def build_base_rows() -> list[list[str]]:
    print("base:")
    cards = fetch_numbered_set(BASE_URL, 176)
    rows: list[list[str]] = []

    for number in range(1, 177):
        subject = clean_subject(cards[number])
        subset = "Series One" if number <= 88 else "Series Two"
        rows.append([
            "base",
            str(number),
            subject,
            FRANCHISE,
            subset,
            "",
        ])

    return rows


def build_sticker_series_rows(url: str, prefix: str, subset: str) -> list[list[str]]:
    print(f"stickers-{prefix.lower()}:")
    cards = fetch_numbered_set(url, 11, max_pages=2)
    rows: list[list[str]] = []

    for number in range(1, 12):
        subject = clean_subject(cards[number])
        rows.append([
            "stickers",
            f"{prefix}-{number}",
            subject,
            FRANCHISE,
            subset,
            "",
        ])

    return rows


def validate_spots(rows: list[list[str]]) -> None:
    lookup = {(row[0], row[1]): row for row in rows}
    expected = {
        ("base", "1"): ("The Epic Begins", "Series One"),
        ("base", "88"): ("Savoring Their Reward", "Series One"),
        ("base", "89"): ("Our Story Opens", "Series Two"),
        ("base", "176"): ("Saved by Science!", "Series Two"),
        ("stickers", "S1-1"): ("Raphael", "Series One"),
        ("stickers", "S2-1"): ("Krang", "Series Two"),
        ("stickers", "S2-11"): ("April O'Neil", "Series Two"),
    }

    for key, (expected_subject, expected_subset) in expected.items():
        row = lookup.get(key)
        if not row:
            raise SystemExit(f"Spot validation missing row {key}")
        if row[2] != expected_subject or row[4] != expected_subset:
            raise SystemExit(
                f"Spot validation failed for {key}: {row}; "
                f"expected subject={expected_subject!r}, subset={expected_subset!r}"
            )


def main() -> None:
    base_rows = build_base_rows()
    sticker_rows = [
        *build_sticker_series_rows(STICKERS_SERIES_ONE_URL, "S1", "Series One"),
        *build_sticker_series_rows(STICKERS_SERIES_TWO_URL, "S2", "Series Two"),
    ]

    all_rows = [*base_rows, *sticker_rows]
    actual_counts = {
        "base": len(base_rows),
        "stickers": len(sticker_rows),
    }

    for key, expected in EXPECTED_COUNTS.items():
        actual = actual_counts.get(key, 0)
        if actual != expected:
            raise SystemExit(f"{key}: expected {expected} rows, found {actual}")

    if len(all_rows) != EXPECTED_TOTAL:
        raise SystemExit(f"Expected {EXPECTED_TOTAL} explicit rows, found {len(all_rows)}")

    duplicate_keys: set[tuple[str, str]] = set()
    seen: set[tuple[str, str]] = set()
    for row in all_rows:
        key = (row[0], row[1])
        if key in seen:
            duplicate_keys.add(key)
        seen.add(key)
    if duplicate_keys:
        raise SystemExit(f"Duplicate ProductSet/card numbers found: {sorted(duplicate_keys)[:10]}")

    if any(row[3] != FRANCHISE for row in all_rows):
        bad = next(row for row in all_rows if row[3] != FRANCHISE)
        raise SystemExit(f"Non-sport franchise metadata mismatch: {bad}")

    bad_odds = [
        (row[0], row[1], row[5])
        for row in all_rows
        if re.search(r"\b(?:inserted\s+)?1\s*:\s*\d+\b", row[5], re.IGNORECASE)
    ]
    if bad_odds:
        raise SystemExit(f"Card-level odds leaked into Variant metadata: {bad_odds[:10]}")

    rc_labels = [row for row in all_rows if row[2].endswith(" RC")]
    if rc_labels:
        raise SystemExit(f"Unexpected sports-style RC labels in non-sport set: {rc_labels[:5]}")

    validate_spots(all_rows)

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 1989 TOPPS TEENAGE MUTANT NINJA TURTLES CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    print("  base: 176")
    print("  stickers: 22")
    print("Base series combined: Series One #1-88 + Series Two #89-176")
    print("Sticker series combined: S1-1..S1-11 + S2-1..S2-11")
    print("Guaranteed sticker ProductSet odds: 1 per VCS pack")
    print("Factory-set-only Bonus/Collector's Edition issues: excluded")
    print("Card-level odds in Variant: 0")
    print(f"Franchise metadata: COMPLETE ({FRANCHISE})")
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")


if __name__ == "__main__":
    main()
