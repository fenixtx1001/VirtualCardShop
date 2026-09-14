from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "2001-02-fleer-shoebox.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/9453/2001-02-Fleer-Shoebox?PageIndex={}"

# TCDB and Beckett both identify the final 30 base cards as the set's true RCs.
# Do not infer RC from generic rookie-themed wording elsewhere.
TRUE_RC_CARDS = set(range(151, 181))

INSERT_SOURCES = [
    {
        "key": "checklists",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/370972/2001-02-Fleer-Shoebox-Checklists",
        "expected": 2,
        "numbering": "nno",
    },
    {
        "key": "nba-flight-school",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/27135/2001-02-Fleer-Shoebox-NBA-Flight-School",
        "expected": 20,
        "numbering": "numeric",
    },
    {
        "key": "nba-flight-school-cadet",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/27136/2001-02-Fleer-Shoebox-NBA-Flight-School-Cadet",
        "expected": 15,
        "numbering": "nno",
    },
    {
        "key": "nba-flight-school-captain",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/27137/2001-02-Fleer-Shoebox-NBA-Flight-School-Captain",
        "expected": 15,
        "numbering": "nno",
    },
    {
        "key": "sole-of-the-game",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/27138/2001-02-Fleer-Shoebox-Sole-of-the-Game",
        "expected": 15,
        "numbering": "numeric",
    },
    {
        "key": "sole-of-the-game-ball",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/27139/2001-02-Fleer-Shoebox-Sole-of-the-Game-Ball",
        "expected": 11,
        "numbering": "nno",
    },
    {
        "key": "sole-of-the-game-jersey",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/27140/2001-02-Fleer-Shoebox-Sole-of-the-Game-Jersey",
        "expected": 11,
        "numbering": "nno",
    },
    {
        "key": "sole-of-the-game-shoe",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/27141/2001-02-Fleer-Shoebox-Sole-of-the-Game-Shoe",
        "expected": 11,
        "numbering": "nno",
    },
    {
        "key": "sole-of-the-game-triple",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/27142/2001-02-Fleer-Shoebox-Sole-of-the-Game-Triple",
        "expected": 9,
        "numbering": "nno",
    },
    {
        "key": "tougher-than-leather",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/27143/2001-02-Fleer-Shoebox-Tougher-Than-Leather",
        "expected": 20,
        "numbering": "numeric",
    },
    {
        "key": "tougher-than-leather-shoes",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/27144/2001-02-Fleer-Shoebox-Tougher-Than-Leather-Shoes",
        "expected": 19,
        "numbering": "nno",
    },
]

EXPECTED_EXPLICIT_COUNTS = {
    "base": 180,
    "checklists": 2,
    "nba-flight-school": 20,
    "nba-flight-school-cadet": 15,
    "nba-flight-school-captain": 15,
    "sole-of-the-game": 15,
    "sole-of-the-game-ball": 11,
    "sole-of-the-game-jersey": 11,
    "sole-of-the-game-shoe": 11,
    "sole-of-the-game-triple": 9,
    "tougher-than-leather": 20,
    "tougher-than-leather-shoes": 19,
}

DERIVED_FOOTPRINTS = 180
EXPECTED_EXPLICIT_TOTAL = sum(EXPECTED_EXPLICIT_COUNTS.values())
EXPECTED_RESOLVED_TOTAL = EXPECTED_EXPLICIT_TOTAL + DERIVED_FOOTPRINTS


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


def candidate_number(value: str) -> tuple[str, str] | None:
    value = value.strip()
    if value.upper() == "NNO":
        return ("NNO", "nno")
    match = re.fullmatch(r"(\d{1,3})(?:\s+[A-Z]{1,5})?", value)
    if match:
        return (match.group(1), "numeric")
    return None


def parse_rows(html: str) -> list[tuple[str, str, str]]:
    parser = RowParser()
    parser.feed(html)
    found: list[tuple[str, str, str]] = []

    for row in parser.rows:
        vals = [value for value in row if value]
        for i, value in enumerate(vals):
            parsed = candidate_number(value)
            if not parsed or i + 1 >= len(vals):
                continue

            raw_number, _ = parsed
            raw_name = vals[i + 1].strip()
            if not raw_name or raw_name.lower() in {"options", "add", "edit"}:
                continue

            team = vals[i + 2].strip() if i + 2 < len(vals) else ""
            found.append((raw_number, raw_name, team))
            break

    return found


def strip_card_notes(raw_name: str) -> tuple[str, list[str]]:
    tags: list[str] = []
    for token in re.findall(r"\b(?:RC|MEM|AU|CL|SN\d+)\b", raw_name):
        if token not in tags:
            tags.append(token)

    clean = re.split(
        r"(?:,?\s+)(?=(?:RC|MEM|AU|CL|SN\d+)\b)",
        raw_name,
        maxsplit=1,
    )[0].strip().rstrip(",")
    return clean, tags


def append_variant(*parts: str) -> str:
    seen: list[str] = []
    for part in parts:
        for item in [piece.strip() for piece in part.split(";") if piece.strip()]:
            if item not in seen:
                seen.append(item)
    return "; ".join(seen)


def build_base_rows() -> list[list[str]]:
    cards: dict[int, tuple[str, str]] = {}

    for page_index in (1, 2):
        url = BASE_URL.format(page_index)
        parsed = parse_rows(fetch(url))
        page_count = 0
        for raw_number, raw_name, team in parsed:
            number = int(raw_number)
            if not 1 <= number <= 180:
                continue
            cards[number] = (raw_name, team)
            page_count += 1
        print(f"Base page {page_index}: parsed {page_count} rows; cumulative unique {len(cards)}")

    missing = [number for number in range(1, 181) if number not in cards]
    if missing:
        raise SystemExit(f"Base checklist incomplete; missing card numbers: {missing[:30]}")
    if len(cards) != 180:
        raise SystemExit(f"Expected 180 base cards, found {len(cards)}")

    rows: list[list[str]] = []
    rc_count = 0
    for number in range(1, 181):
        raw_name, team = cards[number]
        clean_name, source_tags = strip_card_notes(raw_name)
        is_rc = number in TRUE_RC_CARDS
        if is_rc:
            rc_count += 1
            player = f"{clean_name} RC"
            variant = append_variant("RC", "SN2500")
            subset = "Rookie"
        else:
            player = clean_name
            variant = append_variant(*source_tags)
            subset = ""

        if not team:
            raise SystemExit(f"Base card #{number} {player} is missing team data")
        rows.append(["base", str(number), player, team, subset, variant])

    if rc_count != 30:
        raise SystemExit(f"Expected 30 recognized true RC cards, found {rc_count}")
    return rows


def build_insert_rows(source: dict[str, object]) -> list[list[str]]:
    key = str(source["key"])
    url = str(source["url"])
    expected = int(source["expected"])
    numbering = str(source["numbering"])

    parsed = parse_rows(fetch(url))
    if len(parsed) != expected:
        raise SystemExit(f"{key}: expected {expected} cards from TCDB, parsed {len(parsed)}")

    rows: list[list[str]] = []
    seen_numbers: set[str] = set()

    for index, (raw_number, raw_name, team) in enumerate(parsed, start=1):
        clean_name, source_tags = strip_card_notes(raw_name)

        if numbering == "nno":
            card_number = f"NNO-{index:02d}"
            variant = append_variant("NNO", *source_tags)
        else:
            if raw_number == "NNO":
                raise SystemExit(f"{key}: unexpected NNO card at row {index}")
            card_number = raw_number
            variant = append_variant(*source_tags)

        if card_number in seen_numbers:
            raise SystemExit(f"{key}: duplicate generated card number {card_number}")
        seen_numbers.add(card_number)

        # The two checklist inserts legitimately do not have a team.
        if key != "checklists" and not team:
            raise SystemExit(f"{key} #{card_number} {clean_name} is missing team data")

        rows.append([key, card_number, clean_name, team, "", variant])

    return rows


def main() -> None:
    if len(TRUE_RC_CARDS) != 30:
        raise SystemExit("True RC configuration must contain exactly 30 cards")

    all_rows = build_base_rows()
    actual_counts = {"base": 180}

    for source in INSERT_SOURCES:
        key = str(source["key"])
        rows = build_insert_rows(source)
        all_rows.extend(rows)
        actual_counts[key] = len(rows)
        print(f"{key}: parsed {len(rows)} cards")

    for key, expected in EXPECTED_EXPLICIT_COUNTS.items():
        actual = actual_counts.get(key, 0)
        if actual != expected:
            raise SystemExit(f"{key}: expected {expected} explicit rows, found {actual}")

    if len(all_rows) != EXPECTED_EXPLICIT_TOTAL:
        raise SystemExit(
            f"Expected {EXPECTED_EXPLICIT_TOTAL} explicit CSV rows, found {len(all_rows)}"
        )

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 2001-02 FLEER SHOEBOX CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Explicit CSV rows: {len(all_rows)}")
    for key, expected in EXPECTED_EXPLICIT_COUNTS.items():
        print(f"  {key}: {expected}")
    print("Recognized true RC cards labeled in base player row: 30")
    print(f"Derived Footprints rows expected from bundle: {DERIVED_FOOTPRINTS}")
    print(f"Total resolved cards expected: {EXPECTED_RESOLVED_TOTAL}")
    print("Team data: COMPLETE")


if __name__ == "__main__":
    main()
