from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1996-bowman-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/632/1996-Bowman"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/632/1996-Bowman"

SOURCES = {
    "bowmans-best-previews": (
        "https://www.tcdb.com/Checklist.cfm/sid/638/1996-Bowman---Bowmans-Best-Previews",
        r"BBP\s*\d{1,2}",
        30,
        "Bowman's Best Previews",
    ),
    "bowmans-best-previews-refractors": (
        "https://www.tcdb.com/Checklist.cfm/sid/639/1996-Bowman---Bowmans-Best-Previews-Refractors",
        r"BBP\s*\d{1,2}",
        30,
        "Bowman's Best Previews Refractors",
    ),
    "bowmans-best-previews-atomic-refractors": (
        "https://www.tcdb.com/Checklist.cfm/sid/10735/1996-Bowman---Bowmans-Best-Previews-Atomic-Refractors",
        r"BBP\s*\d{1,2}",
        30,
        "Bowman's Best Previews Atomic Refractors",
    ),
    "mickey-mantle-commemorative-reprint": (
        "https://www.tcdb.com/Checklist.cfm/sid/307373/1996-Bowman---Mickey-Mantle-Commemorative-Reprint",
        r"20",
        1,
        "Mickey Mantle Commemorative Reprint",
    ),
    "minor-league-player-of-the-year-candidates": (
        "https://www.tcdb.com/Checklist.cfm/sid/633/1996-Bowman---Minor-League-Player-of-the-Year-Candidates",
        r"POY\s*\d{1,2}",
        15,
        "Minor League Player of the Year Candidates",
    ),
}

CHECKLISTS_URL = "https://www.tcdb.com/Checklist.cfm/sid/307394/1996-Bowman---Checklists"
BASE_EXPECTED = 385
TRUE_RC_EXPECTED = 119
EXPECTED_EXPLICIT = BASE_EXPECTED + 30 + 30 + 30 + 2 + 1 + 15
EXPECTED_RESOLVED = EXPECTED_EXPLICIT + BASE_EXPECTED


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
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; VCS Set Factory research import)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def page_url(url: str, page_index: int) -> str:
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}PageIndex={page_index}"


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
            team = vals[-1].strip() if i + 2 < len(vals) else ""
            found.append((card_number.upper(), raw_name, team))
            break

    return found


def normalize_number(number: str) -> str:
    return re.sub(r"\s+", " ", number.strip().upper())


def fetch_set_rows(
    url: str,
    number_pattern: str,
    label: str,
    *,
    expected_unique: int | None = None,
    numeric_range: tuple[int, int] | None = None,
    max_pages: int = 8,
) -> list[tuple[str, str, str]]:
    rows: list[tuple[str, str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    print(f"{label}:")

    for page_index in range(1, max_pages + 1):
        parsed = parse_rows(fetch(page_url(url, page_index)), number_pattern)
        added = 0
        for row in parsed:
            normalized = (normalize_number(row[0]), row[1], row[2])
            if normalized in seen:
                continue
            seen.add(normalized)
            rows.append(normalized)
            added += 1

        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{added}; unique records {len(rows)}"
        )

        if numeric_range is not None:
            first, last = numeric_range
            numbers = {number for number, _name, _team in rows if number.isdigit()}
            required = {str(n) for n in range(first, last + 1)}
            if required.issubset(numbers):
                break
        elif expected_unique is not None:
            numbers = {number for number, _name, _team in rows}
            if len(numbers) >= expected_unique:
                break

        if page_index > 1 and (not parsed or added == 0):
            break

    return rows


METADATA_TAIL = re.compile(
    r"(?:,\s*|\s+)(?:ERR|COR|UER|VAR)(?:ERR|COR|UER|VAR)?\s*(?::\s*.*)?$",
    re.IGNORECASE,
)


def clean_subject(raw_name: str) -> str:
    raw = " ".join(raw_name.split()).strip()

    while True:
        cleaned = METADATA_TAIL.sub("", raw).strip(" ,;")
        if cleaned == raw:
            break
        raw = cleaned

    # RC status is controlled exclusively by the TCDB rookie index.
    raw = re.sub(r"(?:,\s*|\s+)\bRC\b", " ", raw, flags=re.IGNORECASE)

    # UER/ERR/COR/VAR are source metadata, never part of Player.
    raw = re.sub(
        r"(?:,\s*|\s+)\b(?:UER|ERR|COR|VAR)\b(?:\s*:\s*.*)?$",
        " ",
        raw,
        flags=re.IGNORECASE,
    )

    # Keep collector-facing abbreviations such as FBC and CL, but normalize
    # comma separators to the project's usual space-delimited form.
    raw = re.sub(r"\s*,\s*", " ", raw)
    raw = " ".join(raw.split()).strip(" ,;")
    raw = re.sub(r"\b(FBC|CL)\s+\1\b", r"\1", raw, flags=re.IGNORECASE)
    return raw


def load_true_rc_numbers() -> set[str]:
    rows = fetch_set_rows(
        ROOKIES_URL,
        r"\d{1,3}",
        "rookie-index",
        max_pages=6,
    )
    rc_numbers = {number for number, _name, _team in rows}
    print(
        f"Rookie index: {len(rows)} records; "
        f"{len(rc_numbers)} unique recognized RC card numbers"
    )
    if len(rc_numbers) != TRUE_RC_EXPECTED:
        raise SystemExit(
            f"Expected {TRUE_RC_EXPECTED} recognized RC card numbers, found {len(rc_numbers)}"
        )
    return rc_numbers


def is_checklist_card(player: str, subset: str = "") -> bool:
    return "checklist" in player.lower() or "checklist" in subset.lower()


def build_base(true_rcs: set[str]) -> list[list[str]]:
    source_rows = fetch_set_rows(
        BASE_URL,
        r"\d{1,3}",
        "base",
        expected_unique=BASE_EXPECTED,
        numeric_range=(1, BASE_EXPECTED),
    )

    grouped: dict[str, tuple[str, str]] = {}
    for number, raw_name, team in source_rows:
        if number in grouped:
            raise SystemExit(f"base: duplicate card number {number}")
        grouped[number] = (raw_name, team)

    expected_numbers = {str(n) for n in range(1, BASE_EXPECTED + 1)}
    if set(grouped) != expected_numbers:
        missing = sorted(expected_numbers - set(grouped), key=int)
        extra = sorted(set(grouped) - expected_numbers, key=int)
        raise SystemExit(
            f"base: numbering mismatch; missing={missing[:20]}, extra={extra[:20]}"
        )

    rows: list[list[str]] = []
    for number in sorted(grouped, key=int):
        raw_name, team = grouped[number]
        player = clean_subject(raw_name)

        if number in true_rcs:
            player = re.sub(r"(?:\s+RC)+$", "", player, flags=re.IGNORECASE).strip()
            player = f"{player} RC"

        if not team and not is_checklist_card(player, "Base"):
            raise SystemExit(f"base #{number} {player} is missing team data")

        rows.append(["base", number, player, team, "Base", ""])

    return rows


def build_regular_insert(
    key: str,
    url: str,
    pattern: str,
    expected: int,
    subset: str,
) -> list[list[str]]:
    source_rows = fetch_set_rows(
        url,
        pattern,
        key,
        expected_unique=expected,
        max_pages=4,
    )

    grouped: dict[str, tuple[str, str]] = {}
    for number, raw_name, team in source_rows:
        if number in grouped:
            raise SystemExit(f"{key}: duplicate card number {number}")
        grouped[number] = (raw_name, team)

    if len(grouped) != expected:
        raise SystemExit(
            f"{key}: expected {expected} unique card numbers, found {len(grouped)}"
        )

    def sort_key(card_number: str):
        match = re.search(r"(\d+)$", card_number)
        return (int(match.group(1)) if match else 999999, card_number)

    rows: list[list[str]] = []
    for number in sorted(grouped, key=sort_key):
        raw_name, team = grouped[number]
        player = clean_subject(raw_name)
        if not team and not is_checklist_card(player, subset):
            raise SystemExit(f"{key} #{number} {player} is missing team data")
        rows.append([key, number, player, team, subset, ""])

    return rows


def build_checklists() -> list[list[str]]:
    source_rows = fetch_set_rows(
        CHECKLISTS_URL,
        r"NNO",
        "checklists",
        max_pages=3,
    )

    # Both physical cards are NNO, so validate by source row rather than source
    # card number and assign deterministic unique VCS identifiers.
    if len(source_rows) != 2:
        raise SystemExit(f"checklists: expected 2 source rows, found {len(source_rows)}")

    cleaned = []
    for _number, raw_name, team in source_rows:
        player = clean_subject(raw_name)
        if not is_checklist_card(player, "Checklists"):
            raise SystemExit(f"checklists: unexpected non-checklist subject {player!r}")
        cleaned.append((player, team))

    cleaned.sort(key=lambda item: item[0])
    return [
        ["checklists", f"NNO-{index:02d}", player, team, "Checklists", ""]
        for index, (player, team) in enumerate(cleaned, start=1)
    ]


def main() -> None:
    true_rcs = load_true_rc_numbers()
    all_rows: list[list[str]] = []

    base_rows = build_base(true_rcs)
    all_rows.extend(base_rows)

    for key, (url, pattern, expected, subset) in SOURCES.items():
        all_rows.extend(build_regular_insert(key, url, pattern, expected, subset))

    checklist_rows = build_checklists()
    all_rows.extend(checklist_rows)

    counts: dict[str, int] = {}
    for row in all_rows:
        counts[row[0]] = counts.get(row[0], 0) + 1

    if len(all_rows) != EXPECTED_EXPLICIT:
        raise SystemExit(
            f"Expected {EXPECTED_EXPLICIT} explicit CSV rows, found {len(all_rows)}"
        )

    duplicate_rc = [row for row in base_rows if re.search(r"\bRC\s+RC\b", row[2])]
    if duplicate_rc:
        raise SystemExit(f"Duplicate RC label found; example: {duplicate_rc[0]}")

    metadata_leaks = [
        row
        for row in all_rows
        if re.search(r"\b(?:UER|ERR|COR|VAR|RDM|EXCH)\b", row[2], re.IGNORECASE)
    ]
    if metadata_leaks:
        raise SystemExit(f"Metadata leaked into Player; example: {metadata_leaks[0]}")

    odds_leaks = [
        row for row in all_rows if re.search(r"\b1\s*:\s*\d+", row[5] or "")
    ]
    if odds_leaks:
        raise SystemExit(f"Card-level odds leaked into Variant; example: {odds_leaks[0]}")

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

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 1996 BOWMAN BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    print(f"  base: {len(base_rows)}")
    print("  foil: 385 (derived from Base)")
    for key in SOURCES:
        print(f"  {key}: {counts.get(key, 0)}")
    print(f"  checklists: {len(checklist_rows)}")
    print(f"Recognized true RC cards labeled in Base player row: {len(true_rcs)}")
    print("Guaranteed Value Certificate request form: EXCLUDED")
    print("Roberto Alomar promo: EXCLUDED")
    print("Expected Product Sets: 8")
    print(f"Total resolved cards expected: {EXPECTED_RESOLVED}")
    print("Card-level odds in Variant: 0")
    print("Player metadata leakage: 0")
    print("Duplicate RC labels: 0")
    print("Team data: COMPLETE (checklist-card exception allowed)")


if __name__ == "__main__":
    main()
