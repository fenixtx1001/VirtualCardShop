from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1995-score-summit-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/589/1995-Score-Summit"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/589/1995-Score-Summit"
NTH_DEGREE_URL = (
    "https://www.tcdb.com/Checklist.cfm/sid/593/1995-Score-Summit---Nth-Degree"
)
NEW_AGE_URL = (
    "https://www.tcdb.com/Checklist.cfm/sid/592/1995-Score-Summit---New-Age"
)
CLUB_21_URL = (
    "https://www.tcdb.com/Checklist.cfm/sid/590/1995-Score-Summit---21-Club"
)
BIG_BANG_URL = (
    "https://www.tcdb.com/Checklist.cfm/sid/591/1995-Score-Summit---Big-Bang"
)

SOURCES = [
    {
        "key": "new-age",
        "url": NEW_AGE_URL,
        "expected": 15,
        "pattern": r"NA\d{1,2}",
        "subset": "New Age",
    },
    {
        "key": "21-club",
        "url": CLUB_21_URL,
        "expected": 9,
        "pattern": r"TC\d{1,2}",
        "subset": "21 Club",
    },
    {
        "key": "big-bang",
        "url": BIG_BANG_URL,
        "expected": 20,
        "pattern": r"BB\d{1,2}",
        "subset": "Big Bang",
    },
]

EXPECTED_COUNTS = {
    "base": 200,
    "nth-degree": 200,
    "new-age": 15,
    "21-club": 9,
    "big-bang": 20,
}
EXPECTED_TOTAL = sum(EXPECTED_COUNTS.values())
EXPECTED_PRODUCT_SETS = len(EXPECTED_COUNTS)
EXPECTED_TRUE_RC_NUMBERS = {
    114,
    124,
    129,
    134,
    136,
    141,
    149,
    150,
    155,
    156,
    160,
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
    *,
    max_pages: int = 5,
) -> list[tuple[str, str, str]]:
    cards: dict[str, tuple[str, str, str]] = {}

    for page_index in range(1, max_pages + 1):
        parsed = parse_rows(fetch(page_url(url, page_index)), number_pattern)
        before = len(cards)
        for row in parsed:
            cards[row[0].upper()] = row
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
            f"{url}: expected {expected} unique cards, found {len(cards)}"
        )

    return list(cards.values())


ODDS_TEXT = re.compile(
    r"(?:,?\s*)?(?:inserted\s+)?(?:at\s+)?(?:a\s+rate\s+of\s+)?"
    r"1\s*:\s*\d+\s*(?:hobby\s+|retail\s+)?(?:packs?)?",
    re.IGNORECASE,
)

NOTE_START = re.compile(
    r"(?:^|\s)(?=(?:(?:RC|ROO|UER|ERR|COR|VAR|SP|MEM|AU|CUT|EXCH)+|"
    r"PR\d+|SN\d+)\b)",
    re.IGNORECASE,
)


def normalize_repeated_markers(text: str) -> str:
    for marker in ("MEM", "AU", "VAR", "ERR", "COR", "UER", "RC", "ROO"):
        text = re.sub(
            rf"\b(?:{marker}){{2,}}\b",
            marker,
            text,
            flags=re.IGNORECASE,
        )
    return text


def clean_player_and_notes(raw_name: str) -> tuple[str, str]:
    raw = " ".join(raw_name.split())
    match = NOTE_START.search(raw)

    if match:
        player = raw[: match.start()].strip().rstrip(",")
        notes = raw[match.start() :].strip(" ,;")
    else:
        player = raw.strip().rstrip(",")
        notes = ""

    if not player:
        raise SystemExit(f"Could not derive clean player/subject from {raw_name!r}")

    notes = normalize_repeated_markers(notes)
    notes = ODDS_TEXT.sub("", notes)
    notes = re.sub(r"\b(?:RC|ROO)\b\s*,?\s*", "", notes, flags=re.IGNORECASE)
    notes = re.sub(r"\s*,\s*,+", ", ", notes)
    notes = re.sub(r"^[,;\s]+|[,;\s]+$", "", notes)
    return player, notes


def variant_text(*parts: str) -> str:
    seen: list[str] = []
    for part in parts:
        cleaned = ODDS_TEXT.sub("", part or "").strip(" ,;")
        cleaned = normalize_repeated_markers(cleaned)
        if not cleaned:
            continue
        cleaned = re.sub(r"\s*,\s*", "; ", cleaned)
        for piece in [item.strip() for item in cleaned.split(";") if item.strip()]:
            if piece not in seen:
                seen.append(piece)
    return "; ".join(seen)


def normalize_team(player: str, raw_team: str) -> str:
    team = " ".join(raw_team.split()).strip()
    if team:
        return team

    if player.lower().startswith("checklist"):
        return "MLB"

    raise SystemExit(f"{player} is missing team data")


def subset_for_base_number(number: int) -> str:
    if 112 <= number <= 173:
        return "Rookies"
    if 174 <= number <= 188:
        return "Bat Speed"
    if 189 <= number <= 193:
        return "Special Delivery"
    if 194 <= number <= 200:
        return "Checklist"
    return ""


def load_true_rc_numbers() -> set[int]:
    print("rookie-index:")
    rows = parse_rows(fetch(page_url(ROOKIES_URL, 1)), r"\d{1,3}")
    recognized = {
        int(card_number)
        for card_number, _raw_name, _team in rows
        if card_number.isdigit() and 1 <= int(card_number) <= 200
    }
    print(
        f"  page 1: parsed {len(rows)} rows; "
        f"{len(recognized)} unique recognized RC card numbers"
    )

    if recognized != EXPECTED_TRUE_RC_NUMBERS:
        raise SystemExit(
            "1995 Score Summit rookie index changed; "
            f"expected={sorted(EXPECTED_TRUE_RC_NUMBERS)}, "
            f"found={sorted(recognized)}"
        )

    return recognized


def build_base_rows(true_rcs: set[int]) -> list[list[str]]:
    print("base:")
    parsed = fetch_set_rows(BASE_URL, r"\d{1,3}", 200)
    source: dict[int, tuple[str, str]] = {}

    for raw_number, raw_name, raw_team in parsed:
        number = int(raw_number)
        if 1 <= number <= 200:
            source[number] = (raw_name, raw_team)

    required = set(range(1, 201))
    if set(source) != required:
        missing = sorted(required - set(source))
        extra = sorted(set(source) - required)
        raise SystemExit(
            f"Base numbering mismatch; missing={missing[:30]}, extra={extra[:30]}"
        )

    rows: list[list[str]] = []
    for number in range(1, 201):
        raw_name, raw_team = source[number]
        player, source_notes = clean_player_and_notes(raw_name)
        try:
            team = normalize_team(player, raw_team)
        except SystemExit as exc:
            raise SystemExit(f"Base #{number} {exc}") from None

        if number in true_rcs:
            player = f"{player} RC"

        rows.append(
            [
                "base",
                str(number),
                player,
                team,
                subset_for_base_number(number),
                variant_text(source_notes),
            ]
        )

    return rows


def build_nth_degree_rows(base_rows: list[list[str]]) -> list[list[str]]:
    print("nth-degree:")
    parsed = fetch_set_rows(NTH_DEGREE_URL, r"\d{1,3}", 200)
    source: dict[int, tuple[str, str]] = {}

    for raw_number, raw_name, raw_team in parsed:
        number = int(raw_number)
        if 1 <= number <= 200:
            source[number] = (raw_name, raw_team)

    required = set(range(1, 201))
    if set(source) != required:
        missing = sorted(required - set(source))
        extra = sorted(set(source) - required)
        raise SystemExit(
            f"Nth Degree numbering mismatch; missing={missing[:30]}, extra={extra[:30]}"
        )

    base_by_number = {int(row[1]): row for row in base_rows}
    rows: list[list[str]] = []

    for number in range(1, 201):
        raw_name, raw_team = source[number]
        player, source_notes = clean_player_and_notes(raw_name)
        try:
            team = normalize_team(player, raw_team)
        except SystemExit as exc:
            raise SystemExit(f"Nth Degree #{number} {exc}") from None

        base = base_by_number[number]
        base_player = re.sub(r" RC$", "", base[2]).strip()
        if player != base_player or team != base[3]:
            raise SystemExit(
                f"Nth Degree #{number} does not match Base #{number}: "
                f"parallel=({player!r}, {team!r}), "
                f"base=({base_player!r}, {base[3]!r})"
            )

        rows.append(
            [
                "nth-degree",
                str(number),
                player,
                team,
                base[4],
                variant_text(source_notes),
            ]
        )

    return rows


def build_insert_rows(source: dict[str, object]) -> list[list[str]]:
    key = str(source["key"])
    url = str(source["url"])
    expected = int(source["expected"])
    pattern = str(source["pattern"])
    subset = str(source["subset"])

    print(f"{key}:")
    parsed = fetch_set_rows(url, pattern, expected, max_pages=3)
    rows: list[list[str]] = []

    for card_number, raw_name, raw_team in parsed:
        player, source_notes = clean_player_and_notes(raw_name)
        try:
            team = normalize_team(player, raw_team)
        except SystemExit as exc:
            raise SystemExit(f"{key} #{card_number} {exc}") from None

        rows.append(
            [
                key,
                card_number,
                player,
                team,
                subset,
                variant_text(source_notes),
            ]
        )

    return rows


def validate_subsets(rows: list[list[str]]) -> None:
    base = {int(row[1]): row for row in rows if row[0] == "base"}
    nth = {int(row[1]): row for row in rows if row[0] == "nth-degree"}

    expected = {
        111: "",
        112: "Rookies",
        173: "Rookies",
        174: "Bat Speed",
        188: "Bat Speed",
        189: "Special Delivery",
        193: "Special Delivery",
        194: "Checklist",
        200: "Checklist",
    }

    for number, subset in expected.items():
        if base[number][4] != subset:
            raise SystemExit(
                f"Base #{number} subset mismatch: {base[number][4]!r} != {subset!r}"
            )
        if nth[number][4] != subset:
            raise SystemExit(
                f"Nth Degree #{number} subset mismatch: "
                f"{nth[number][4]!r} != {subset!r}"
            )


def validate_spot_cards(rows: list[list[str]]) -> None:
    lookup = {(row[0], row[1]): row for row in rows}
    expected = {
        ("base", "1"): ("Ken Griffey Jr.", "Seattle Mariners"),
        ("base", "141"): ("Hideo Nomo RC", "Los Angeles Dodgers"),
        ("nth-degree", "1"): ("Ken Griffey Jr.", "Seattle Mariners"),
        ("new-age", "NA4"): ("Alex Rodriguez", "Seattle Mariners"),
        ("21-club", "TC1"): ("Bob Abreu", "Houston Astros"),
        ("big-bang", "BB3"): ("Cal Ripken Jr.", "Baltimore Orioles"),
    }

    for key, (expected_player, expected_team) in expected.items():
        row = lookup.get(key)
        if not row or row[2] != expected_player or row[3] != expected_team:
            raise SystemExit(
                f"Spot validation failed for {key}: {row}; "
                f"expected ({expected_player!r}, {expected_team!r})"
            )


def main() -> None:
    true_rcs = load_true_rc_numbers()

    base_rows = build_base_rows(true_rcs)
    nth_rows = build_nth_degree_rows(base_rows)

    all_rows = [*base_rows, *nth_rows]
    actual_counts: dict[str, int] = {
        "base": len(base_rows),
        "nth-degree": len(nth_rows),
    }

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
            f"Expected {EXPECTED_TOTAL} explicit rows, found {len(all_rows)}"
        )

    rc_labels = [
        row for row in all_rows if row[0] == "base" and row[2].endswith(" RC")
    ]
    if len(rc_labels) != len(EXPECTED_TRUE_RC_NUMBERS):
        raise SystemExit(
            f"Expected {len(EXPECTED_TRUE_RC_NUMBERS)} RC labels in Base, "
            f"found {len(rc_labels)}"
        )

    bad_odds = [
        (row[0], row[1], row[5])
        for row in all_rows
        if re.search(r"\b(?:inserted\s+)?1\s*:\s*\d+\b", row[5], re.IGNORECASE)
    ]
    if bad_odds:
        raise SystemExit(f"Card-level odds leaked into Variant metadata: {bad_odds[:10]}")

    dirty_players = [
        (row[0], row[1], row[2])
        for row in all_rows
        if re.search(
            r"\b(?:ROO|UER|ERR|COR|VAR|MEM|AU|PR\d+|SN\d+)\b",
            row[2],
            re.IGNORECASE,
        )
    ]
    if dirty_players:
        raise SystemExit(
            f"Collector metadata leaked into Player; example: {dirty_players[0]}"
        )

    missing_teams = [row for row in all_rows if not row[3].strip()]
    if missing_teams:
        raise SystemExit(
            f"Found {len(missing_teams)} cards missing team data; "
            f"example: {missing_teams[0]}"
        )

    validate_subsets(all_rows)
    validate_spot_cards(all_rows)

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(
            ["setKey", "cardNumber", "player", "team", "subset", "variant"]
        )
        writer.writerows(all_rows)

    print("=== 1995 SCORE SUMMIT BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    for key, expected in EXPECTED_COUNTS.items():
        print(f"  {key}: {expected}")
    print(f"Recognized true RC cards labeled in Base player row: {len(rc_labels)}")
    print("Base collector checklist: 200 cards, kept intact")
    print("Nth Degree subjects validated against all 200 Base cards")
    print("Dealer Samples promo excluded from sealed-pack product")
    print("Card-level odds in Variant: 0")
    print("Team data: COMPLETE")
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")


if __name__ == "__main__":
    main()
