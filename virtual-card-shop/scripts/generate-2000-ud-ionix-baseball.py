from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "2000-ud-ionix-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/1424/2000-UD-Ionix"
RECIPROCAL_URL = "https://www.tcdb.com/Checklist.cfm/sid/12424/2000-UD-Ionix-Reciprocal"

# TCDB's rookie index and Beckett both report zero recognized true rookie cards
# in 2000 UD Ionix Baseball. Futuristics/prospect wording alone must never add RC.
TRUE_RC_CARDS: set[int] = set()

INSERT_SOURCES = [
    {
        "key": "atomic",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12420/2000-UD-Ionix-Atomic",
        "expected": 15,
        "number_pattern": r"A\d{1,2}",
    },
    {
        "key": "awesome-powers",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12421/2000-UD-Ionix-Awesome-Powers",
        "expected": 15,
        "number_pattern": r"AP\d{1,2}",
    },
    {
        "key": "biorhythm",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12422/2000-UD-Ionix-BIOrhythm",
        "expected": 15,
        "number_pattern": r"B\d{1,2}",
    },
    {
        "key": "pyrotechnics",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12423/2000-UD-Ionix-Pyrotechnics",
        "expected": 15,
        "number_pattern": r"P\d{1,2}",
    },
    {
        "key": "shockwave",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12425/2000-UD-Ionix-Shockwave",
        "expected": 15,
        "number_pattern": r"S\d{1,2}",
    },
    {
        "key": "ud-authentics",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12426/2000-UD-Ionix-UD-Authentics",
        "expected": 13,
        "number_pattern": r"(?:AB|BD|CBE|DJ|JC|JR|MR|PB|RM|SC|SG|SR|VG)",
    },
    {
        "key": "warp-zone",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12427/2000-UD-Ionix-Warp-Zone",
        "expected": 15,
        "number_pattern": r"WZ\d{1,2}",
    },
    {
        "key": "clemente-3000-hit-club",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/12419/2000-UD-Ionix-A-Piece-of-History-3000-Hit-Club-Roberto-Clemente",
        "expected": 3,
        "number_pattern": r"RC-(?:B|BC|C)",
    },
]

EXPECTED_COUNTS = {
    "base": 90,
    "reciprocal": 60,
    "reciprocal-futuristics": 30,
    "atomic": 15,
    "awesome-powers": 15,
    "biorhythm": 15,
    "pyrotechnics": 15,
    "shockwave": 15,
    "ud-authentics": 13,
    "warp-zone": 15,
    "clemente-3000-hit-club": 3,
}
EXPECTED_TOTAL = sum(EXPECTED_COUNTS.values())


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


def parse_rows(html: str, number_pattern: str) -> list[tuple[str, str, str]]:
    parser = RowParser()
    parser.feed(html)
    pattern = re.compile(rf"^(?:{number_pattern})$", re.IGNORECASE)
    found: list[tuple[str, str, str]] = []

    for row in parser.rows:
        vals = [value for value in row if value]
        for i, value in enumerate(vals):
            if not pattern.fullmatch(value.strip()):
                continue
            if i + 1 >= len(vals):
                continue

            card_number = value.strip().upper()
            raw_name = vals[i + 1].strip()
            if not raw_name or raw_name.lower() in {"options", "add", "edit"}:
                continue

            team = vals[i + 2].strip() if i + 2 < len(vals) else ""
            found.append((card_number, raw_name, team))
            break

    return found


NOTE_PATTERN = re.compile(
    r"\b(?:RC|FUT|AU|MEM|CUT|EXCH|UER|ERR|COR|VAR|PR\d+|SN\d+)\b",
    re.IGNORECASE,
)


def clean_player(raw_name: str) -> tuple[str, list[str]]:
    """Keep Player display-clean; move source notes into variant metadata."""
    tags: list[str] = []
    for match in NOTE_PATTERN.finditer(raw_name):
        tag = match.group(0).upper()
        if tag not in tags:
            tags.append(tag)

    clean = re.split(
        r"(?:,?\s+)(?=(?:RC|FUT|AU|MEM|CUT|EXCH|UER|ERR|COR|VAR|PR\d+|SN\d+)\b)",
        raw_name,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0].strip().rstrip(",")

    return clean, tags


def variant_text(*parts: str) -> str:
    seen: list[str] = []
    for part in parts:
        for piece in [item.strip() for item in part.split(";") if item.strip()]:
            if piece not in seen:
                seen.append(piece)
    return "; ".join(seen)


def build_base_rows() -> list[list[str]]:
    parsed = parse_rows(fetch(BASE_URL), r"\d{1,2}")
    cards: dict[int, tuple[str, str]] = {}

    for raw_number, raw_name, team in parsed:
        number = int(raw_number)
        if 1 <= number <= 90:
            cards[number] = (raw_name, team)

    missing = [number for number in range(1, 91) if number not in cards]
    if missing:
        raise SystemExit(f"Base checklist incomplete; missing card numbers: {missing[:30]}")
    if len(cards) != 90:
        raise SystemExit(f"Expected 90 unique checklist cards, found {len(cards)}")

    rows: list[list[str]] = []
    for number in range(1, 91):
        raw_name, team = cards[number]
        player, source_tags = clean_player(raw_name)
        if number in TRUE_RC_CARDS:
            player = f"{player} RC"
            source_tags.append("RC")

        if not team:
            raise SystemExit(f"Base checklist card #{number} {player} is missing team data")

        subset = "Futuristics" if number >= 61 else ""
        variant = variant_text("FUT" if number >= 61 else "", *source_tags)

        # VCS intentionally keeps all 90 checklist cards in one Base ProductSet
        # with equal availability so collection-completion percentage reflects
        # the full physical 90-card set. Historical #61-90 1:4 scarcity is
        # retained only as reference metadata, not as VCS pull odds.
        rows.append([
            "base",
            str(number),
            player,
            team,
            subset,
            variant,
        ])

    return rows


def build_reciprocal_rows() -> list[list[str]]:
    parsed = parse_rows(fetch(RECIPROCAL_URL), r"R\d{1,2}")
    cards: dict[int, tuple[str, str, str]] = {}

    for card_number, raw_name, team in parsed:
        number = int(card_number[1:])
        if 1 <= number <= 90:
            cards[number] = (card_number, raw_name, team)

    missing = [number for number in range(1, 91) if number not in cards]
    if missing:
        raise SystemExit(f"Reciprocal checklist incomplete; missing card numbers: {missing[:30]}")
    if len(cards) != 90:
        raise SystemExit(f"Expected 90 Reciprocal cards, found {len(cards)}")

    rows: list[list[str]] = []
    for number in range(1, 91):
        card_number, raw_name, team = cards[number]
        player, source_tags = clean_player(raw_name)
        if not team:
            raise SystemExit(f"Reciprocal {card_number} {player} is missing team data")

        if number <= 60:
            rows.append([
                "reciprocal",
                card_number,
                player,
                team,
                "",
                variant_text("Reciprocal", *source_tags),
            ])
        else:
            rows.append([
                "reciprocal-futuristics",
                card_number,
                player,
                team,
                "Futuristics",
                variant_text("Reciprocal", "FUT", *source_tags),
            ])

    return rows


def build_insert_rows(source: dict[str, object]) -> list[list[str]]:
    key = str(source["key"])
    url = str(source["url"])
    expected = int(source["expected"])
    pattern = str(source["number_pattern"])

    parsed = parse_rows(fetch(url), pattern)
    if len(parsed) != expected:
        raise SystemExit(f"{key}: expected {expected} cards from TCDB, parsed {len(parsed)}")

    rows: list[list[str]] = []
    seen: set[str] = set()

    for card_number, raw_name, team in parsed:
        if card_number in seen:
            raise SystemExit(f"{key}: duplicate card number {card_number}")
        seen.add(card_number)

        player, source_tags = clean_player(raw_name)

        # TCDB's Clemente page can omit team in some renderings; the subject is
        # unambiguously a Pittsburgh Pirates card.
        if key == "clemente-3000-hit-club" and not team:
            team = "Pittsburgh Pirates"

        if not team:
            raise SystemExit(f"{key} #{card_number} {player} is missing team data")

        subset = ""
        extra_variant = ""

        if key == "ud-authentics":
            extra_variant = "AU"
            if card_number in {"BD", "DJ", "MR"}:
                extra_variant = "AU; EXCH"
        elif key == "clemente-3000-hit-club":
            if card_number == "RC-B":
                extra_variant = "MEM Bat; PR350"
            elif card_number == "RC-BC":
                extra_variant = "MEM Bat; AU CUT; SN5"
            elif card_number == "RC-C":
                extra_variant = "AU CUT; SN4"

        rows.append([
            key,
            card_number,
            player,
            team,
            subset,
            variant_text(extra_variant, *source_tags),
        ])

    return rows


def main() -> None:
    if TRUE_RC_CARDS:
        raise SystemExit("2000 UD Ionix Baseball should have zero recognized true RC cards")

    all_rows = build_base_rows()
    all_rows.extend(build_reciprocal_rows())

    actual_counts: dict[str, int] = {
        "base": 90,
        "reciprocal": 60,
        "reciprocal-futuristics": 30,
    }

    for source in INSERT_SOURCES:
        key = str(source["key"])
        rows = build_insert_rows(source)
        all_rows.extend(rows)
        actual_counts[key] = len(rows)
        print(f"{key}: parsed {len(rows)} cards")

    for key, expected in EXPECTED_COUNTS.items():
        actual = actual_counts.get(key, 0)
        if actual != expected:
            raise SystemExit(f"{key}: expected {expected} rows, found {actual}")

    if len(all_rows) != EXPECTED_TOTAL:
        raise SystemExit(f"Expected {EXPECTED_TOTAL} total rows, found {len(all_rows)}")

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 2000 UD IONIX BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    for key, expected in EXPECTED_COUNTS.items():
        print(f"  {key}: {expected}")
    print("Recognized true RC cards labeled in player row: 0")
    print("Expected Product Sets: 11")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")
    print("Team data: COMPLETE")


if __name__ == "__main__":
    main()
