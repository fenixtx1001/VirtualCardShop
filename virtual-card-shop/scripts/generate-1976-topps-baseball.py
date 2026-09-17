from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1976-topps-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/77/1976-Topps"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/77/1976-Topps"
TRADED_URL = "https://www.tcdb.com/Checklist.cfm/sid/78/1976-Topps-Traded"

BASE_EXPECTED = 660
TRADED_EXPECTED = 44
TRUE_RC_EXPECTED = 72
EXPECTED_TOTAL = BASE_EXPECTED + TRADED_EXPECTED


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
            number = value.strip().upper()
            if not pattern.fullmatch(number):
                continue
            if i + 1 >= len(vals):
                continue

            raw_name = vals[i + 1].strip()
            if not raw_name or raw_name.lower() in {"options", "add", "edit"}:
                continue

            team = vals[-1].strip() if i + 2 < len(vals) else ""
            found.append((number, raw_name, team))
            break

    return found


def fetch_set_rows(
    url: str,
    number_pattern: str,
    label: str,
    *,
    expected_unique: int | None = None,
    numeric_range: tuple[int, int] | None = None,
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

        numbers = {number for number, _name, _team in rows}

        if numeric_range is not None:
            first, last = numeric_range
            required = {str(number) for number in range(first, last + 1)}
            if required.issubset(numbers):
                break
        elif expected_unique is not None and len(numbers) >= expected_unique:
            break

        if page_index > 1 and (not parsed or added == 0):
            break

    return rows


# TCDB may concatenate metadata and its explanatory note into the same table
# cell, e.g. "Player UERUER: detail". VCS does not surface that in Player.
METADATA_TAIL = re.compile(
    r"(?:,\s*|\s+)(?:UER|ERR|COR|VAR)(?:UER|ERR|COR|VAR)?\s*(?::\s*.*)?$",
    re.IGNORECASE,
)

# Validation should catch actual metadata tokens, not innocent letter sequences
# inside surnames such as Figueroa (which contains "UER").
METADATA_LEAK = re.compile(
    r"(?:^|[\s,;])(?:UER|ERR|COR|VAR)(?=$|[\s,;:])"
    r"|(?:^|[\s,;])(?:UERUER|ERRERR|CORCOR|VARVAR)(?=$|[\s,;:])",
    re.IGNORECASE,
)


def clean_subject(raw_name: str) -> str:
    raw = " ".join(raw_name.split()).strip()

    while True:
        cleaned = METADATA_TAIL.sub("", raw).strip(" ,;")
        if cleaned == raw:
            break
        raw = cleaned

    # Rookie status is controlled only by TCDB's rookie index.
    raw = re.sub(r"(?:,\s*|\s+)\bRC\b", " ", raw, flags=re.IGNORECASE)

    # Remove any remaining source-only error metadata.
    raw = re.sub(
        r"(?:,\s*|\s+)\b(?:UER|ERR|COR|VAR)\b(?:\s*:\s*.*)?$",
        " ",
        raw,
        flags=re.IGNORECASE,
    )

    # Short collector abbreviations stay display-safe in Player; only normalize
    # punctuation so values such as "ASR, RC" become clean tokens.
    raw = re.sub(r"\s*,\s*", " ", raw)
    raw = " ".join(raw.split()).strip(" ,;")

    # Collapse accidental duplicate short tags after TCDB cell concatenation.
    raw = re.sub(
        r"\b(RB|AS|ASR|TC|MGR|CL|LL|WS)\s+\1\b",
        r"\1",
        raw,
        flags=re.IGNORECASE,
    )
    return raw


def load_true_rc_numbers() -> set[str]:
    rows = fetch_set_rows(
        ROOKIES_URL,
        r"\d{1,3}",
        "rookie-index",
        expected_unique=TRUE_RC_EXPECTED,
        max_pages=5,
    )
    rc_numbers = {number for number, _name, _team in rows}
    print(
        f"Rookie index: {len(rows)} records; "
        f"{len(rc_numbers)} unique recognized RC card numbers"
    )
    if len(rc_numbers) != TRUE_RC_EXPECTED:
        raise SystemExit(
            f"Expected {TRUE_RC_EXPECTED} recognized RC card numbers, "
            f"found {len(rc_numbers)}"
        )
    return rc_numbers


def is_checklist_card(player: str, subset: str = "") -> bool:
    return "checklist" in player.lower() or "checklist" in subset.lower()


def classify_base_subset(number: int, player: str) -> str:
    if 1 <= number <= 6:
        return "Record Breakers"
    if 66 <= number <= 70:
        return "Father and Son"
    if 191 <= number <= 205:
        return "League Leaders"
    if 341 <= number <= 350:
        return "All-Time All-Stars"
    if 461 <= number <= 462:
        return "Postseason"
    if 589 <= number <= 599:
        return "Rookie Prospects"
    if re.search(r"\bTC\b", player):
        return "Team Card"
    if re.search(r"\bASR\b", player):
        return "All-Star Rookie"
    if re.search(r"\bAS\b", player):
        return "All-Star"
    if is_checklist_card(player):
        return "Checklist"
    return "Base"


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

    expected_numbers = {str(number) for number in range(1, BASE_EXPECTED + 1)}
    if set(grouped) != expected_numbers:
        missing = sorted(expected_numbers - set(grouped), key=int)
        extra = sorted(set(grouped) - expected_numbers, key=int)
        raise SystemExit(
            f"base: numbering mismatch; missing={missing[:20]}, extra={extra[:20]}"
        )

    rows: list[list[str]] = []
    for number in range(1, BASE_EXPECTED + 1):
        raw_name, team = grouped[str(number)]
        player = clean_subject(raw_name)

        if str(number) in true_rcs:
            player = re.sub(r"(?:\s+RC)+$", "", player, flags=re.IGNORECASE).strip()
            player = f"{player} RC"

        subset = classify_base_subset(number, player)
        if not team and not is_checklist_card(player, subset):
            raise SystemExit(f"base #{number} {player} is missing team data")

        rows.append(["base", str(number), player, team, subset, ""])

    return rows


def build_traded() -> list[list[str]]:
    source_rows = fetch_set_rows(
        TRADED_URL,
        r"(?:\d{1,3}T|NNO)",
        "traded",
        expected_unique=TRADED_EXPECTED,
        max_pages=4,
    )

    grouped: dict[str, tuple[str, str]] = {}
    for source_number, raw_name, team in source_rows:
        if source_number in grouped:
            raise SystemExit(f"traded: duplicate source card number {source_number}")
        grouped[source_number] = (raw_name, team)

    if len(grouped) != TRADED_EXPECTED:
        raise SystemExit(
            f"traded: expected {TRADED_EXPECTED} source cards, found {len(grouped)}"
        )

    rows: list[list[str]] = []
    for source_number, (raw_name, team) in grouped.items():
        player = clean_subject(raw_name)
        number = "NNO-01" if source_number == "NNO" else source_number
        subset = "Checklist" if source_number == "NNO" else "Traded"

        if source_number == "NNO" and not is_checklist_card(player, subset):
            raise SystemExit(f"traded NNO row is not a checklist: {player!r}")
        if not team and not is_checklist_card(player, subset):
            raise SystemExit(f"traded #{number} {player} is missing team data")

        rows.append(["traded", number, player, team, subset, ""])

    def sort_key(row: list[str]):
        number = row[1]
        match = re.match(r"(\d+)", number)
        return (0, int(match.group(1))) if match else (1, 999999)

    rows.sort(key=sort_key)
    return rows


def main() -> None:
    true_rcs = load_true_rc_numbers()
    base_rows = build_base(true_rcs)
    traded_rows = build_traded()
    all_rows = base_rows + traded_rows

    if len(base_rows) != BASE_EXPECTED:
        raise SystemExit(f"Expected {BASE_EXPECTED} Base rows, found {len(base_rows)}")
    if len(traded_rows) != TRADED_EXPECTED:
        raise SystemExit(
            f"Expected {TRADED_EXPECTED} Traded rows, found {len(traded_rows)}"
        )
    if len(all_rows) != EXPECTED_TOTAL:
        raise SystemExit(f"Expected {EXPECTED_TOTAL} total rows, found {len(all_rows)}")

    duplicate_rc = [row for row in base_rows if re.search(r"\bRC\s+RC\b", row[2])]
    if duplicate_rc:
        raise SystemExit(f"Duplicate RC label found; example: {duplicate_rc[0]}")

    metadata_leaks = [row for row in all_rows if METADATA_LEAK.search(row[2])]
    if metadata_leaks:
        raise SystemExit(f"Metadata leaked into Player; example: {metadata_leaks[0]}")

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

    nno_rows = [row for row in traded_rows if row[1] == "NNO-01"]
    if len(nno_rows) != 1 or not is_checklist_card(nno_rows[0][2], nno_rows[0][4]):
        raise SystemExit(f"Traded NNO checklist normalization failed: {nno_rows}")

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 1976 TOPPS BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    print(f"  base: {len(base_rows)}")
    print(f"  traded: {len(traded_rows)}")
    print(f"Recognized true RC cards labeled in Base player row: {len(true_rcs)}")
    print("Traded NNO checklist: normalized to VCS card number NNO-01")
    print("Mail-in Team Checklists: EXCLUDED")
    print("Traded exact pack odds: UNSET (late-production pack issue confirmed; precise ratio not documented)")
    print("Expected Product Sets: 2")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")
    print("Card-level odds in Variant: 0")
    print("Player metadata leakage: 0")
    print("Duplicate RC labels: 0")
    print("Team data: COMPLETE (checklist-card exception allowed)")


if __name__ == "__main__":
    main()
