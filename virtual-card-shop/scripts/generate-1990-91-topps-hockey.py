from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1990-91-topps-hockey.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/4877/1990-91-Topps"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/4877/1990-91-Topps"
SCORING_LEADERS_URL = (
    "https://www.tcdb.com/Checklist.cfm/sid/8784/"
    "1990-91-Topps---Team-Scoring-Leaders"
)

BASE_EXPECTED = 396
SCORING_LEADERS_EXPECTED = 21
EXPECTED_TOTAL = BASE_EXPECTED + SCORING_LEADERS_EXPECTED


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
            card_number = value.strip().upper()
            if not pattern.fullmatch(card_number):
                continue
            if i + 1 >= len(vals):
                continue

            raw_name = vals[i + 1].strip()
            if not raw_name or raw_name.lower() in {"options", "add", "edit"}:
                continue

            team = vals[-1].strip() if i + 2 < len(vals) else ""
            found.append((card_number, raw_name, team))
            break

    return found


def normalize_numeric_variant(number: str) -> str:
    raw = number.strip().upper()
    match = re.fullmatch(r"(\d{1,3})[A-Z]", raw)
    return match.group(1) if match else raw


def logical_numbers(rows: list[tuple[str, str, str]]) -> set[str]:
    return {normalize_numeric_variant(number) for number, _name, _team in rows}


def fetch_set_rows(
    url: str,
    number_pattern: str,
    label: str,
    *,
    numeric_range: tuple[int, int] | None = None,
    expected_unique: int | None = None,
    normalize_variants: bool = False,
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

        logical = logical_numbers(rows) if normalize_variants else {
            number for number, _name, _team in rows
        }
        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{added}; unique source records {len(rows)}; "
            f"logical card numbers {len(logical)}"
        )

        if numeric_range is not None:
            first, last = numeric_range
            required = {str(number) for number in range(first, last + 1)}
            if required.issubset(logical):
                break
        elif expected_unique is not None and len(logical) >= expected_unique:
            break

        if page_index > 1 and (not parsed or added == 0):
            break

    return rows


# TCDB can concatenate metadata tags and their descriptions into the same cell,
# e.g. "Jari Kurri HL, UER, VARVAR: C* print code; UER: ...". Everything from
# the metadata-description section onward is source detail, not Player text.
METADATA_DETAIL_START = re.compile(
    r"(?:,\s*|\s+)(?:UER|ERR|COR|VAR)(?:UER|ERR|COR|VAR)?"
    r"(?:(?:\s*,\s*|\s+)(?:UER|ERR|COR|VAR)(?:UER|ERR|COR|VAR)?)*\s*:",
    re.IGNORECASE,
)

# TCDB also sometimes appends a print-code note directly to the subject without
# a VAR/UER prefix, e.g. 'Adam Creighton "B*" print code' or
# 'Al Iafrate "A*B*" print code'. This is source metadata, never Player text.
PRINT_CODE_SUFFIX = re.compile(
    r"(?:,\s*|\s+)(?:\"[^\"]+\"|'[^']+'|[A-Z*]+)\s+print\s+code\b.*$",
    re.IGNORECASE,
)


def clean_subject(raw_name: str) -> str:
    raw = " ".join(raw_name.split()).strip()

    detail = METADATA_DETAIL_START.search(raw)
    if detail:
        raw = raw[: detail.start()].strip(" ,;")

    # Strip unprefixed trailing print-code notes before any other display cleanup.
    raw = PRINT_CODE_SUFFIX.sub("", raw).strip(" ,;")

    # RC status is controlled exclusively by TCDB's rookie index.
    raw = re.sub(r"(?:,\s*|\s+)\bRC\b", " ", raw, flags=re.IGNORECASE)

    # Strip standalone source-only metadata tags that remain after detail cleanup.
    raw = re.sub(
        r"(?:,\s*|\s+)\b(?:UER|ERR|COR|VAR)\b",
        " ",
        raw,
        flags=re.IGNORECASE,
    )

    # Handle TCDB concatenations without a colon, e.g. "UERStamped ...".
    raw = re.sub(
        r"(?:,\s*|\s+)(?:UER|ERR|COR|VAR)(?=[A-Z])[^,;]*$",
        "",
        raw,
        flags=re.IGNORECASE,
    )

    raw = re.sub(r"\s*,\s*", " ", raw)
    raw = " ".join(raw.split()).strip(" ,;")

    # Preserve short collector-facing labels, but never duplicate them because
    # variation markup was repeated inside the source cell.
    raw = re.sub(
        r"\b(HL|TP|TL|AS|MGR|CL)\s+\1\b",
        r"\1",
        raw,
        flags=re.IGNORECASE,
    )
    return raw


def load_true_rc_numbers() -> set[str]:
    rows = fetch_set_rows(
        ROOKIES_URL,
        r"\d{1,3}[A-Za-z]?",
        "rookie-index",
        normalize_variants=True,
        max_pages=6,
    )
    rc_numbers = logical_numbers(rows)
    expected_base = {str(number) for number in range(1, BASE_EXPECTED + 1)}
    unexpected = sorted(rc_numbers - expected_base, key=lambda value: int(value))
    if unexpected:
        raise SystemExit(f"Rookie index returned unexpected card numbers: {unexpected[:20]}")
    if not rc_numbers:
        raise SystemExit("Rookie index returned no recognized rookie cards")

    print(
        f"Rookie index: {len(rows)} source records; "
        f"{len(rc_numbers)} unique recognized RC card numbers"
    )
    return rc_numbers


def is_checklist_card(player: str, subset: str = "") -> bool:
    return "checklist" in player.lower() or "checklist" in subset.lower()


def classify_base_subset(number: int, player: str) -> str:
    if 1 <= number <= 3:
        return "Wayne Gretzky Tribute"
    if re.search(r"\bHL\b", player):
        return "Highlights"
    if re.search(r"\bTP\b", player):
        return "Top Prospects"
    if re.search(r"\bTL\b", player):
        return "Team Leaders"
    if re.search(r"\bAS\b", player):
        return "All-Star"
    if is_checklist_card(player):
        return "Checklist"
    return "Base"


def build_base(true_rcs: set[str]) -> tuple[list[list[str]], int]:
    source_rows = fetch_set_rows(
        BASE_URL,
        r"\d{1,3}[A-Za-z]?",
        "base",
        numeric_range=(1, BASE_EXPECTED),
        normalize_variants=True,
        max_pages=10,
    )

    grouped: dict[str, list[tuple[str, str, str]]] = {}
    for source_number, raw_name, team in source_rows:
        number = normalize_numeric_variant(source_number)
        grouped.setdefault(number, []).append((source_number, raw_name, team))

    expected_numbers = {str(number) for number in range(1, BASE_EXPECTED + 1)}
    if set(grouped) != expected_numbers:
        missing = sorted(expected_numbers - set(grouped), key=int)
        extra = sorted(set(grouped) - expected_numbers, key=int)
        raise SystemExit(
            f"base: numbering mismatch; missing={missing[:20]}, extra={extra[:20]}"
        )

    rows: list[list[str]] = []
    collapsed_variation_records = 0

    for number in sorted(grouped, key=int):
        versions = grouped[number]
        cleaned_versions = [
            (source_number, clean_subject(raw_name), team)
            for source_number, raw_name, team in versions
        ]

        subjects = {player for _source, player, _team in cleaned_versions}
        teams = {team for _source, _player, team in cleaned_versions if team}
        if len(subjects) != 1:
            raise SystemExit(
                f"base #{number}: print-code versions resolved to different subjects: "
                f"{sorted(subjects)!r}"
            )
        if len(teams) > 1:
            raise SystemExit(
                f"base #{number}: print-code versions resolved to different teams: "
                f"{sorted(teams)!r}"
            )

        _source_number, player, source_team = cleaned_versions[0]
        team = source_team or (next(iter(teams)) if teams else "")
        collapsed_variation_records += max(0, len(versions) - 1)

        if number in true_rcs:
            player = re.sub(r"(?:\s+RC)+$", "", player, flags=re.IGNORECASE).strip()
            player = f"{player} RC"

        subset = classify_base_subset(int(number), player)
        if not team and not is_checklist_card(player, subset):
            raise SystemExit(f"base #{number} {player} is missing team data")

        rows.append(["base", number, player, team, subset, ""])

    return rows, collapsed_variation_records


def build_scoring_leaders() -> list[list[str]]:
    source_rows = fetch_set_rows(
        SCORING_LEADERS_URL,
        r"\d{1,2}",
        "team-scoring-leaders",
        numeric_range=(1, SCORING_LEADERS_EXPECTED),
        max_pages=3,
    )

    grouped: dict[str, tuple[str, str]] = {}
    for number, raw_name, team in source_rows:
        if number in grouped:
            raise SystemExit(f"team-scoring-leaders: duplicate card number {number}")
        grouped[number] = (raw_name, team)

    expected_numbers = {
        str(number) for number in range(1, SCORING_LEADERS_EXPECTED + 1)
    }
    if set(grouped) != expected_numbers:
        missing = sorted(expected_numbers - set(grouped), key=int)
        extra = sorted(set(grouped) - expected_numbers, key=int)
        raise SystemExit(
            "team-scoring-leaders: numbering mismatch; "
            f"missing={missing[:20]}, extra={extra[:20]}"
        )

    rows: list[list[str]] = []
    for number in sorted(grouped, key=int):
        raw_name, team = grouped[number]
        player = clean_subject(raw_name)
        if not team:
            raise SystemExit(f"team-scoring-leaders #{number} {player} is missing team data")
        rows.append(
            [
                "team-scoring-leaders",
                number,
                player,
                team,
                "Team Scoring Leaders",
                "",
            ]
        )

    return rows


def main() -> None:
    true_rcs = load_true_rc_numbers()
    base_rows, collapsed_variations = build_base(true_rcs)
    scoring_rows = build_scoring_leaders()
    all_rows = base_rows + scoring_rows

    if len(base_rows) != BASE_EXPECTED:
        raise SystemExit(f"Expected {BASE_EXPECTED} Base rows, found {len(base_rows)}")
    if len(scoring_rows) != SCORING_LEADERS_EXPECTED:
        raise SystemExit(
            f"Expected {SCORING_LEADERS_EXPECTED} Team Scoring Leaders rows, "
            f"found {len(scoring_rows)}"
        )
    if len(all_rows) != EXPECTED_TOTAL:
        raise SystemExit(f"Expected {EXPECTED_TOTAL} total rows, found {len(all_rows)}")

    duplicate_rc = [row for row in base_rows if re.search(r"\bRC\s+RC\b", row[2])]
    if duplicate_rc:
        raise SystemExit(f"Duplicate RC label found; example: {duplicate_rc[0]}")

    metadata_leaks = [
        row
        for row in all_rows
        if re.search(r"\b(?:UER|ERR|COR|VAR)\b|\bprint\s+code\b", row[2], re.IGNORECASE)
    ]
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

    odds_leaks = [
        row for row in all_rows if re.search(r"\b1\s*:\s*\d+", row[5] or "")
    ]
    if odds_leaks:
        raise SystemExit(f"Card-level odds leaked into Variant; example: {odds_leaks[0]}")

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 1990-91 TOPPS HOCKEY CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    print(f"  base: {len(base_rows)}")
    print(f"  team-scoring-leaders: {len(scoring_rows)}")
    print(f"Recognized true RC cards labeled in Base player row: {len(true_rcs)}")
    print(f"Duplicate print-code source records collapsed: {collapsed_variations}")
    print("C*/D*/C*D* print-code variations: one logical VCS card per number")
    print("Print-code notes in Player: 0")
    print("Team Scoring Leaders glossy inserts: 1 per pack")
    print("Box Bottoms / Box Bottom Panels: EXCLUDED")
    print("Collector's Edition (Tiffany) issues: EXCLUDED")
    print("Expected Product Sets: 2")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")
    print("Card-level odds in Variant: 0")
    print("Player metadata leakage: 0")
    print("Duplicate RC labels: 0")
    print("Team data: COMPLETE (checklist-card exception allowed)")


if __name__ == "__main__":
    main()
