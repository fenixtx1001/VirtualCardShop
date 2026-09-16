from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1995-bowman-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/457/1995-Bowman"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/457/1995-Bowman"
GOLD_URL = "https://www.tcdb.com/Checklist.cfm/sid/458/1995-Bowman-Gold-Foil"

EXPECTED_COUNTS = {
    "base": 439,
    "gold-foil": 54,
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
    expected: int | None,
    label: str,
    max_pages: int = 10,
) -> list[tuple[str, str, str]]:
    rows: list[tuple[str, str, str]] = []
    seen: set[tuple[str, str, str]] = set()

    print(f"{label}:")
    for page_index in range(1, max_pages + 1):
        parsed = parse_rows(fetch(page_url(url, page_index)), number_pattern)
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

        if expected is not None and len(rows) >= expected:
            break
        if page_index > 1 and not parsed:
            break
        if page_index > 1 and added == 0:
            break

    if expected is not None and len(rows) != expected:
        raise SystemExit(
            f"{label}: expected {expected} unique records, found {len(rows)}"
        )

    return rows


ODDS_TEXT = re.compile(
    r"(?:,?\s*)?(?:inserted\s+)?(?:at\s+)?(?:a\s+rate\s+of\s+)?"
    r"1\s*:\s*\d+\s*(?:hobby\s+|retail\s+|jumbo\s+|rack\s+)?(?:packs?)?",
    re.IGNORECASE,
)

# Anything after one of these collector abbreviations is metadata rather than
# part of a person's display name. RC itself is re-added only from the verified
# rookie index below.
NOTE_START = re.compile(
    r"(?:^|\s)(?=(?:RC|UER|ERR|COR|VAR|CL|SP|AU|MEM|CUT|EXCH|RDM|"
    r"MLM|PP|FOIL|MGR|CO|RB|AS|AR|DPK|FRDP|RCL|PR\d+|SN\d+)\b)",
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

    notes = ODDS_TEXT.sub("", notes)
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


def is_checklist_card(player: str, subset: str = "") -> bool:
    return "checklist" in player.lower() or "checklist" in subset.lower()


def logical_base_number(raw_number: str, raw_name: str, seen_294: int) -> tuple[int, int, str]:
    raw = raw_number.strip().upper()
    extra = ""

    if raw == "294":
        seen_294 += 1
        return 294, seen_294, extra

    if raw == "294B":
        seen_294 += 1
        return 394, seen_294, "UER: printed #294; TCDB 294b; intended #394"

    return int(raw), seen_294, extra


def load_true_rc_numbers() -> set[int]:
    rows = fetch_set_rows(
        ROOKIES_URL,
        r"\d{1,3}[A-Za-z]?",
        None,
        "rookie-index",
        max_pages=6,
    )

    if not rows:
        raise SystemExit("Rookie index returned no records")

    rookie_numbers: set[int] = set()
    seen_294 = 0
    for raw_number, raw_name, _team in rows:
        number, seen_294, _extra = logical_base_number(
            raw_number, raw_name, seen_294
        )
        if 1 <= number <= 439:
            rookie_numbers.add(number)

    print(
        f"Rookie index: {len(rows)} records; "
        f"{len(rookie_numbers)} unique recognized RC card numbers"
    )
    return rookie_numbers


def base_subset(number: int) -> str:
    if 1 <= number <= 220:
        return "Rookies & Prospects"
    if 221 <= number <= 274:
        return "Silver Foil"
    return "Veterans"


def build_base_rows(true_rcs: set[int]) -> list[list[str]]:
    source_rows = fetch_set_rows(BASE_URL, r"\d{1,3}[A-Za-z]?", 439, "base")
    cards: dict[int, tuple[str, str, str]] = {}
    seen_294 = 0

    for raw_number, raw_name, team in source_rows:
        number, seen_294, numbering_note = logical_base_number(
            raw_number, raw_name, seen_294
        )
        if number in cards:
            raise SystemExit(f"Base logical card number duplicated: {number}")
        cards[number] = (raw_name, team, numbering_note)

    expected_numbers = set(range(1, 440))
    actual_numbers = set(cards)
    if actual_numbers != expected_numbers:
        missing = sorted(expected_numbers - actual_numbers)
        extra = sorted(actual_numbers - expected_numbers)
        raise SystemExit(
            f"Base logical checklist mismatch; missing={missing[:20]}, extra={extra[:20]}"
        )

    if seen_294 != 2:
        raise SystemExit(
            f"Expected exactly two physical #294 cards, found {seen_294}"
        )

    rows: list[list[str]] = []
    for number in range(1, 440):
        raw_name, team, numbering_note = cards[number]
        player, source_notes = clean_player_and_notes(raw_name)
        subset = base_subset(number)

        if number in true_rcs:
            player = f"{player} RC"

        if not team and not is_checklist_card(player, subset):
            raise SystemExit(f"Base #{number} {player} is missing team data")

        rows.append(
            [
                "base",
                str(number),
                player,
                team,
                subset,
                variant_text(source_notes, numbering_note),
            ]
        )

    return rows


def build_gold_rows() -> list[list[str]]:
    parsed = fetch_set_rows(GOLD_URL, r"\d{1,3}", 54, "gold-foil")
    rows: list[list[str]] = []
    seen: set[str] = set()

    for card_number, raw_name, team in parsed:
        number = int(card_number)
        if not 221 <= number <= 274:
            raise SystemExit(
                f"Gold Foil expected #221-274, found #{card_number}"
            )
        if card_number in seen:
            raise SystemExit(f"gold-foil: duplicate card number {card_number}")
        seen.add(card_number)

        player, source_notes = clean_player_and_notes(raw_name)
        subset = "Gold Foil"

        if not team and not is_checklist_card(player, subset):
            raise SystemExit(
                f"gold-foil #{card_number} {player} is missing team data"
            )

        rows.append(
            [
                "gold-foil",
                card_number,
                player,
                team,
                subset,
                variant_text(source_notes),
            ]
        )

    if {int(row[1]) for row in rows} != set(range(221, 275)):
        raise SystemExit("Gold Foil checklist is not exactly #221-274")

    return rows


def main() -> None:
    true_rcs = load_true_rc_numbers()

    base_rows = build_base_rows(true_rcs)
    gold_rows = build_gold_rows()
    all_rows = base_rows + gold_rows

    actual_counts = {
        "base": len(base_rows),
        "gold-foil": len(gold_rows),
    }

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

    # Guard against descriptive source garbage leaking into Player. Player may
    # contain a clean name plus the verified RC suffix, but metadata belongs in
    # Subset/Variant.
    suspicious_players = [
        row
        for row in all_rows
        if re.search(
            r"\b(?:UER|ERR|COR|FOIL|MLM|PP|Inserted|Most|Leader|Award|Variation)\b",
            re.sub(r"\sRC$", "", row[2], flags=re.IGNORECASE),
            flags=re.IGNORECASE,
        )
    ]
    if suspicious_players:
        raise SystemExit(
            f"Metadata leaked into Player for {len(suspicious_players)} rows; "
            f"example: {suspicious_players[0]}"
        )

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(
            ["setKey", "cardNumber", "player", "team", "subset", "variant"]
        )
        writer.writerows(all_rows)

    print("=== 1995 BOWMAN BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    for key, expected in EXPECTED_COUNTS.items():
        print(f"  {key}: {expected}")
    print(
        "Recognized true RC cards labeled in Base player row: "
        f"{len(true_rcs)}"
    )
    print("Physical duplicate #294 normalized: Chuck Carr #294; Cliff Floyd #394")
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")
    print("Card-level odds in Variant: 0")
    print("Player metadata leakage: 0")
    print("Team data: COMPLETE (checklist-card exception allowed)")


if __name__ == "__main__":
    main()
