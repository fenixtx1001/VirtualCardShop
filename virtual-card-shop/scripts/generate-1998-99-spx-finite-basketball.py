from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1998-99-spx-finite-basketball.cards.csv"

SOURCES = [
    {
        "key": "base",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2784/1998-99-SPx-Finite",
        "expected": 210,
        "pattern": r"\d{1,3}[A-Za-z]?",
    },
    {
        "key": "radiance",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/25996/1998-99-SPx-Finite---Radiance",
        "expected": 210,
        "pattern": r"\d{1,3}[A-Za-z]?",
    },
    {
        "key": "spectrum",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/25997/1998-99-SPx-Finite---Spectrum",
        "expected": 210,
        "pattern": r"\d{1,3}[A-Za-z]?",
    },
    {
        "key": "extreme",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/25995/1998-99-SPx-Finite---Extreme",
        "expected": 90,
        "pattern": r"\d{1,3}[A-Za-z]?",
    },
]

EXPECTED_COUNTS = {
    "base": 210,
    "radiance": 210,
    "spectrum": 210,
    "extreme": 90,
    "mj-autographed-game-jersey": 1,
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


def fetch_set_rows(source: dict[str, object]) -> list[tuple[str, str, str]]:
    key = str(source["key"])
    url = str(source["url"])
    expected = int(source["expected"])
    pattern = str(source["pattern"])

    rows: list[tuple[str, str, str]] = []
    seen: set[tuple[str, str, str]] = set()

    print(f"{key}:")
    for page_index in range(1, 10):
        parsed = parse_rows(fetch(page_url(url, page_index)), pattern)
        added = 0
        for row in parsed:
            if row in seen:
                continue
            seen.add(row)
            rows.append(row)
            added += 1

        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{added}; unique records {len(rows)}"
        )

        if len(rows) >= expected:
            break
        if page_index > 1 and not parsed:
            break
        if page_index > 1 and added == 0:
            break

    if len(rows) != expected:
        raise SystemExit(
            f"{key}: expected {expected} unique records, found {len(rows)}"
        )

    return rows


# Short collector markers may appear in source names, but Set Factory keeps the
# Player column clean. These markers are moved to Subset/Variant as appropriate.
NOTE_START = re.compile(
    r"(?:^|\s)(?=(?:RC|STP|SPX|TF|FE|SN\d+|AU|MEM|UER|ERR|COR|VAR|CL|SP|"
    r"EXCH|RDM|PR\d+)\b)",
    re.IGNORECASE,
)


def clean_player_and_notes(raw_name: str) -> tuple[str, str]:
    raw_name = " ".join(raw_name.split())
    match = NOTE_START.search(raw_name)
    if match:
        player = raw_name[: match.start()].strip().rstrip(",")
        notes = raw_name[match.start() :].strip(" ,;")
    else:
        player = raw_name.strip().rstrip(",")
        notes = ""

    # No #1-210 card is treated as an RC for this product. Remove any raw RC
    # marker rather than blindly copying it into Player.
    notes = re.sub(r"\bRC\b\s*,?\s*", "", notes, flags=re.IGNORECASE)
    notes = re.sub(r"\s*,\s*,+", ", ", notes)
    notes = re.sub(r"^[,;\s]+|[,;\s]+$", "", notes)
    return player, notes


def subset_for_number(number: int) -> str:
    if 1 <= number <= 90:
        return ""
    if 91 <= number <= 150:
        return "Star Power"
    if 151 <= number <= 180:
        return "SPx 2000"
    if 181 <= number <= 200:
        return "Top Flight"
    if 201 <= number <= 210:
        return "Finite Excellence"
    raise SystemExit(f"Unexpected SPx Finite card number: {number}")


def strip_subset_code(notes: str) -> str:
    # TCDB commonly encodes subset designators inline as STP/SPX/TF/FE. The
    # actual subset name is stored separately, so do not duplicate those codes
    # in Variant.
    notes = re.sub(r"\b(?:STP|SPX|TF|FE)\b\s*,?\s*", "", notes, flags=re.IGNORECASE)
    notes = re.sub(r"\s*,\s*,+", ", ", notes)
    return notes.strip(" ,;")


def variant_text(*parts: str) -> str:
    seen: list[str] = []
    for part in parts:
        cleaned = (part or "").strip(" ,;")
        if not cleaned:
            continue
        normalized = cleaned.replace(", ", "; ")
        for piece in [item.strip() for item in normalized.split(";") if item.strip()]:
            if piece not in seen:
                seen.append(piece)
    return "; ".join(seen)


def is_checklist_card(player: str, subset: str = "") -> bool:
    return "checklist" in player.lower() or "checklist" in subset.lower()


def build_source_rows(source: dict[str, object]) -> list[list[str]]:
    key = str(source["key"])
    parsed = fetch_set_rows(source)
    rows: list[list[str]] = []
    seen_numbers: set[str] = set()

    for raw_number, raw_name, team in parsed:
        if not raw_number.isdigit():
            raise SystemExit(f"{key}: unexpected non-numeric card number {raw_number}")
        number = int(raw_number)

        if key == "extreme":
            if not 1 <= number <= 90:
                raise SystemExit(f"Extreme expected #1-90 only; found #{number}")
        elif not 1 <= number <= 210:
            raise SystemExit(f"{key}: expected #1-210; found #{number}")

        card_number = str(number)
        if card_number in seen_numbers:
            raise SystemExit(f"{key}: duplicate card number {card_number}")
        seen_numbers.add(card_number)

        player, source_notes = clean_player_and_notes(raw_name)
        subset = subset_for_number(number)
        source_notes = strip_subset_code(source_notes)

        if not team and not is_checklist_card(player, subset):
            raise SystemExit(f"{key} #{number} {player} is missing team data")

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

    expected_numbers = set(range(1, 91 if key == "extreme" else 211))
    actual_numbers = {int(row[1]) for row in rows}
    if actual_numbers != expected_numbers:
        missing = sorted(expected_numbers - actual_numbers)
        extra = sorted(actual_numbers - expected_numbers)
        raise SystemExit(
            f"{key}: logical checklist mismatch; "
            f"missing={missing[:20]}, extra={extra[:20]}"
        )

    return rows


def build_mj_game_jersey_row() -> list[list[str]]:
    # TCDB identifies this SPx Finite-specific card as SPx-GJ, Michael Jordan,
    # Chicago Bulls, hand numbered to 23, autograph + game-worn 1992-93 jersey.
    return [
        [
            "mj-autographed-game-jersey",
            "SPx-GJ",
            "Michael Jordan",
            "Chicago Bulls",
            "",
            "AU; MEM: Jersey (1992-93); SN23",
        ]
    ]


def main() -> None:
    all_rows: list[list[str]] = []
    actual_counts: dict[str, int] = {}

    for source in SOURCES:
        key = str(source["key"])
        rows = build_source_rows(source)
        all_rows.extend(rows)
        actual_counts[key] = len(rows)

    mj_rows = build_mj_game_jersey_row()
    all_rows.extend(mj_rows)
    actual_counts["mj-autographed-game-jersey"] = len(mj_rows)

    for key, expected in EXPECTED_COUNTS.items():
        actual = actual_counts.get(key, 0)
        if actual != expected:
            raise SystemExit(f"{key}: expected {expected} rows, found {actual}")

    if len(all_rows) != EXPECTED_TOTAL:
        raise SystemExit(
            f"Expected {EXPECTED_TOTAL} total rows, found {len(all_rows)}"
        )

    missing_teams = [
        row
        for row in all_rows
        if not row[3].strip() and not is_checklist_card(row[2], row[4])
    ]
    if missing_teams:
        raise SystemExit(
            f"Found {len(missing_teams)} non-checklist cards missing team data; "
            f"example: {missing_teams[0]}"
        )

    # Protect the display-facing Player field from serial-number and long source
    # metadata. Short source subset codes are also intentionally not retained in
    # Player because their readable names are in Subset.
    suspicious_players = [
        row
        for row in all_rows
        if re.search(
            r"\b(?:SN\d+|STP|SPX|TF|FE|AU|MEM|UER|ERR|COR|Inserted|Variation)\b",
            row[2],
            flags=re.IGNORECASE,
        )
    ]
    if suspicious_players:
        raise SystemExit(
            f"Metadata leaked into Player for {len(suspicious_players)} rows; "
            f"example: {suspicious_players[0]}"
        )

    rc_players = [row for row in all_rows if re.search(r"\bRC\b", row[2])]
    if rc_players:
        raise SystemExit(
            f"Unexpected RC labels inside SPx Finite product: {rc_players[:5]}"
        )

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(
            ["setKey", "cardNumber", "player", "team", "subset", "variant"]
        )
        writer.writerows(all_rows)

    print("=== 1998-99 SPX FINITE BASKETBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    for key, expected in EXPECTED_COUNTS.items():
        print(f"  {key}: {expected}")
    print("Recognized true RC cards labeled in this SPx Finite product: 0")
    print("Rookie Update #211-240: EXCLUDED (distributed with Upper Deck Series Two)")
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")
    print("Card-level odds in Variant: 0")
    print("Player metadata leakage: 0")
    print("Team data: COMPLETE (checklist-card exception allowed)")


if __name__ == "__main__":
    main()
