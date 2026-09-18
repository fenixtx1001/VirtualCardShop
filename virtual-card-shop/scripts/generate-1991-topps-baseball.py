from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1991-topps-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/167/1991-Topps"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/167/1991-Topps"
GLOSSY_ROOKIES_URL = (
    "https://www.tcdb.com/Checklist.cfm/sid/8743/"
    "1991-Topps-1990-Rookies-Commemorative-Set-Glossy-Rookies"
)

EXPECTED_TRUE_RC_NUMBERS = {
    31, 32, 39, 74, 91, 103, 113, 114, 118, 149, 167, 189, 196, 197,
    205, 211, 222, 271, 333, 367, 374, 426, 428, 471, 474, 491, 508,
    523, 529, 555, 566, 573, 594, 596, 603, 653, 688, 692, 721, 731,
    753, 767, 769,
}

EXPECTED_COUNTS = {
    "base": 792,
    "glossy-rookies": 33,
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


def normalize_numeric_variant(number: str) -> str:
    raw = number.strip().upper()
    match = re.fullmatch(r"(\d{1,3})[A-Z]", raw)
    return match.group(1) if match else raw


def logical_numbers(rows: list[tuple[str, str, str]]) -> set[int]:
    out: set[int] = set()
    for number, _name, _team in rows:
        logical = normalize_numeric_variant(number)
        if logical.isdigit():
            value = int(logical)
            if 1 <= value <= 792:
                out.add(value)
    return out


def fetch_base_source_rows() -> list[tuple[str, str, str]]:
    rows: list[tuple[str, str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    required = set(range(1, 793))

    print("base:")
    for page_index in range(1, 17):
        parsed = parse_rows(
            fetch(page_url(BASE_URL, page_index)),
            r"\d{1,3}[A-Za-z]?",
        )
        added = 0
        for row in parsed:
            if row in seen:
                continue
            seen.add(row)
            rows.append(row)
            added += 1

        numbers = logical_numbers(rows)
        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{added}; logical numbers {len(numbers)}"
        )

        if required.issubset(numbers):
            break
        if page_index > 1 and (not parsed or added == 0):
            break

    numbers = logical_numbers(rows)
    missing = sorted(required - numbers)
    if missing:
        raise SystemExit(
            f"Base checklist incomplete; missing logical card numbers: {missing[:40]}"
        )

    return rows


ODDS_TEXT = re.compile(
    r"(?:,?\s*)?(?:inserted\s+)?(?:at\s+)?(?:a\s+rate\s+of\s+)?"
    r"1\s*:\s*\d+\s*(?:hobby\s+|retail\s+)?(?:packs?)?",
    re.IGNORECASE,
)

# TCDB occasionally concatenates repeated annotations in the displayed subject,
# e.g. "Darrin Fletcher VARVAR: No code...". Treat repeated core metadata
# markers as metadata just like a normal single VAR/ERR/COR/UER marker.
META_START = re.compile(
    r"(?:^|\s)(?=(?:(?:RC|ERR|COR|UER|VAR)+|RB|MGR|TL|FRDP|FS|ASR|AS|"
    r"LL|CL|DP|TBC|FTC|MG|CAPT|SP|AU|MEM|CUT|EXCH|RDM|PR\d+|SN\d+)\b)",
    re.IGNORECASE,
)


def clean_player(raw_name: str) -> str:
    raw = " ".join(raw_name.split())
    match = META_START.search(raw)
    if match:
        raw = raw[: match.start()]
    raw = re.sub(r"\s*,\s*$", "", raw).strip()
    if not raw:
        raise SystemExit(f"Could not derive clean player/subject from {raw_name!r}")
    return raw


def subset_from_source(raw_name: str) -> str:
    upper = f" {raw_name.upper()} "
    checks = [
        (r"\bFRDP\b", "First Round Draft Pick"),
        (r"\bTBC\b", "Turn Back the Clock"),
        (r"\bRB\b", "Record Breaker"),
        (r"\bMGR\b", "Manager"),
        (r"\bTL\b", "Team Leaders"),
        (r"\bFS\b", "Future Stars"),
        (r"\bASR\b", "All-Star Rookie"),
        (r"\bLL\b", "League Leaders"),
        (r"\bCL\b", "Checklist"),
        (r"\bAS\b", "All-Star"),
    ]
    for pattern, label in checks:
        if re.search(pattern, upper, re.IGNORECASE):
            return label
    return ""


def normalize_team(player: str, team: str, subset: str) -> str:
    team = " ".join(team.split()).strip()
    if team:
        return team

    if "checklist" in player.lower() or subset == "Checklist":
        return "MLB"

    # A small number of league-wide/multi-team subject cards can legitimately
    # carry no single club affiliation in the source checklist.
    if subset in {"League Leaders", "Record Breaker", "Turn Back the Clock"}:
        return "MLB"

    raise SystemExit(f"Missing team data for {player} ({subset or 'Base'})")


def choose_canonical(
    number: int,
    versions: list[tuple[str, str, str]],
) -> tuple[str, str, str]:
    plain = [
        version
        for version in versions
        if version[0].upper() == str(number)
    ]
    if plain:
        return plain[0]

    corrected = [
        version
        for version in versions
        if re.search(r"\bCOR\b", version[1], re.IGNORECASE)
    ]
    if corrected:
        return corrected[0]

    return sorted(versions, key=lambda item: item[0])[0]


def load_true_rc_numbers() -> set[int]:
    recognized: set[int] = set()
    record_count = 0

    print("rookie-index:")
    for page_index in range(1, 5):
        parsed = parse_rows(
            fetch(page_url(ROOKIES_URL, page_index)),
            r"\d{1,3}[A-Za-z]?",
        )
        record_count += len(parsed)
        for raw_number, _raw_name, _team in parsed:
            logical = normalize_numeric_variant(raw_number)
            if logical.isdigit():
                number = int(logical)
                if 1 <= number <= 792:
                    recognized.add(number)

        print(
            f"  page {page_index}: {record_count} records; "
            f"{len(recognized)} unique recognized RC card numbers"
        )

        if recognized == EXPECTED_TRUE_RC_NUMBERS:
            break

    if recognized != EXPECTED_TRUE_RC_NUMBERS:
        missing = sorted(EXPECTED_TRUE_RC_NUMBERS - recognized)
        extra = sorted(recognized - EXPECTED_TRUE_RC_NUMBERS)
        raise SystemExit(
            "Recognized RC checklist changed; "
            f"missing={missing}, extra={extra}"
        )

    return recognized


def build_base_rows(true_rcs: set[int]) -> list[list[str]]:
    source_rows = fetch_base_source_rows()
    grouped: dict[int, list[tuple[str, str, str]]] = {}

    for source_number, raw_name, team in source_rows:
        logical = normalize_numeric_variant(source_number)
        if not logical.isdigit():
            continue
        number = int(logical)
        if 1 <= number <= 792:
            grouped.setdefault(number, []).append(
                (source_number, raw_name, team)
            )

    if set(grouped) != set(range(1, 793)):
        missing = sorted(set(range(1, 793)) - set(grouped))
        extra = sorted(set(grouped) - set(range(1, 793)))
        raise SystemExit(
            f"Base numbering mismatch; missing={missing[:30]}, extra={extra[:30]}"
        )

    rows: list[list[str]] = []
    for number in range(1, 793):
        versions = grouped[number]
        _source_number, raw_name, raw_team = choose_canonical(number, versions)

        player = clean_player(raw_name)
        subset = subset_from_source(raw_name)
        team = normalize_team(player, raw_team, subset)

        # Variants collapse to one collector-facing VCS card. Validate that the
        # alternate source rows still represent the same canonical subject.
        for _alt_number, alt_name, alt_team in versions:
            alt_player = clean_player(alt_name)
            if alt_player != player:
                raise SystemExit(
                    f"Base #{number}: source variants disagree on subject: "
                    f"{player!r} vs {alt_player!r}"
                )
            alt_team = " ".join(alt_team.split()).strip()
            if raw_team.strip() and alt_team and alt_team != raw_team.strip():
                raise SystemExit(
                    f"Base #{number}: source variants disagree on team: "
                    f"{raw_team!r} vs {alt_team!r}"
                )

        if number in true_rcs:
            player = f"{player} RC"

        rows.append(
            [
                "base",
                str(number),
                player,
                team,
                subset,
                "",
            ]
        )

    return rows


def fetch_glossy_rows() -> list[tuple[str, str, str]]:
    rows: dict[int, tuple[str, str, str]] = {}

    print("glossy-rookies:")
    for page_index in range(1, 4):
        parsed = parse_rows(
            fetch(page_url(GLOSSY_ROOKIES_URL, page_index)),
            r"\d{1,2}",
        )
        before = len(rows)
        for raw_number, raw_name, team in parsed:
            number = int(raw_number)
            if 1 <= number <= 33:
                rows[number] = (raw_number, raw_name, team)

        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{len(rows) - before}; unique {len(rows)}"
        )

        if set(rows) == set(range(1, 34)):
            break
        if page_index > 1 and not parsed:
            break

    if set(rows) != set(range(1, 34)):
        missing = sorted(set(range(1, 34)) - set(rows))
        extra = sorted(set(rows) - set(range(1, 34)))
        raise SystemExit(
            f"Glossy Rookies numbering mismatch; missing={missing}, extra={extra}"
        )

    return [rows[number] for number in range(1, 34)]


def build_glossy_rows() -> list[list[str]]:
    rows: list[list[str]] = []

    for raw_number, raw_name, raw_team in fetch_glossy_rows():
        player = clean_player(raw_name)
        team = normalize_team(player, raw_team, "Glossy Rookies")

        # Do not apply RC solely because this commemorative insert is named
        # "Glossy Rookies"; true RC labeling is reserved for verified base RCs.
        rows.append(
            [
                "glossy-rookies",
                raw_number,
                player,
                team,
                "Glossy Rookies",
                "",
            ]
        )

    return rows


def main() -> None:
    true_rcs = load_true_rc_numbers()
    all_rows = build_base_rows(true_rcs)
    all_rows.extend(build_glossy_rows())

    counts: dict[str, int] = {key: 0 for key in EXPECTED_COUNTS}
    for row in all_rows:
        counts[row[0]] += 1

    for key, expected in EXPECTED_COUNTS.items():
        if counts[key] != expected:
            raise SystemExit(
                f"{key}: expected {expected} rows, found {counts[key]}"
            )

    if len(all_rows) != EXPECTED_TOTAL:
        raise SystemExit(
            f"Expected {EXPECTED_TOTAL} total rows, found {len(all_rows)}"
        )

    odds_leaks = [
        row
        for row in all_rows
        if re.search(r"\b1\s*:\s*\d+", row[5] or "")
    ]
    if odds_leaks:
        raise SystemExit(
            f"Card-level odds leaked into Variant; example: {odds_leaks[0]}"
        )

    suspicious_players = [
        row
        for row in all_rows
        if re.search(
            r"\b(?:ERR|COR|UER|VAR|PR\d+|SN\d+|Inserted)\b",
            row[2],
            re.IGNORECASE,
        )
    ]
    if suspicious_players:
        raise SystemExit(
            f"Metadata leaked into Player; example: {suspicious_players[0]}"
        )

    missing_teams = [row for row in all_rows if not row[3].strip()]
    if missing_teams:
        raise SystemExit(
            f"Found {len(missing_teams)} cards missing team data; "
            f"example: {missing_teams[0]}"
        )

    base_rows = {int(row[1]): row for row in all_rows if row[0] == "base"}
    if base_rows[333][2] != "Chipper Jones RC":
        raise SystemExit(
            f"Chipper Jones #333 RC normalization failed: {base_rows[333]}"
        )

    rc_rows = [
        row
        for row in all_rows
        if row[0] == "base" and row[2].endswith(" RC")
    ]
    if len(rc_rows) != len(EXPECTED_TRUE_RC_NUMBERS):
        raise SystemExit(
            f"Expected {len(EXPECTED_TRUE_RC_NUMBERS)} base RC rows, "
            f"found {len(rc_rows)}"
        )

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(
            ["setKey", "cardNumber", "player", "team", "subset", "variant"]
        )
        writer.writerows(all_rows)

    print("=== 1991 TOPPS BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    for key, expected in EXPECTED_COUNTS.items():
        print(f"  {key}: {expected}")
    print(
        "Recognized true RC cards labeled in Base player row: "
        f"{len(true_rcs)}"
    )
    print("Canonical base cards: 792 (source ERR/COR/VAR records collapsed)")
    print("Card-level odds in Variant: 0")
    print("Error/correction detail in Player or Variant: 0")
    print("Team data: COMPLETE")
    print("Expected Product Sets: 2")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")


if __name__ == "__main__":
    main()
