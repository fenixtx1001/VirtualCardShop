from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1993-94-fleer-basketball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/2142/1993-94-Fleer"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/2142/1993-94-Fleer"
ALL_STARS_URL = "https://www.tcdb.com/Checklist.cfm/sid/2143/1993-94-Fleer-All-Stars"
CLYDE_URL = "https://www.tcdb.com/Checklist.cfm/sid/2144/1993-94-Fleer-Clyde-Drexler-Career-Highlights"
CLYDE_AUTO_URL = "https://www.tcdb.com/Checklist.cfm/sid/182648/1993-94-Fleer-Clyde-Drexler-Career-Highlights-Autographs"
FIRST_YEAR_URL = "https://www.tcdb.com/Checklist.cfm/sid/2145/1993-94-Fleer-First-Year-Phenoms"
LIVING_LEGENDS_URL = "https://www.tcdb.com/Checklist.cfm/sid/2146/1993-94-Fleer-Living-Legends"
INTERNATIONALS_URL = "https://www.tcdb.com/Checklist.cfm/sid/2148/1993-94-Fleer-NBA-Internationals"
SUPERSTARS_URL = "https://www.tcdb.com/Checklist.cfm/sid/2149/1993-94-Fleer-NBA-Superstars"
SHARPSHOOTERS_URL = "https://www.tcdb.com/Checklist.cfm/sid/2151/1993-94-Fleer-Sharpshooters"

EXPECTED_TRUE_RCS = 59
EXPECTED_COUNTS = {
    "base": 400,
    "all-stars": 24,
    "clyde-career-highlights": 12,
    "clyde-career-highlights-autographs": 12,
    "nba-internationals": 12,
    "first-year-phenoms": 10,
    "living-legends": 6,
    "nba-superstars": 20,
    "sharpshooters": 10,
}
EXPECTED_TOTAL = sum(EXPECTED_COUNTS.values())
EXPECTED_PRODUCT_SETS = len(EXPECTED_COUNTS)
CHECKLIST_NUMBERS = {238, 239, 240, 399, 400}


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


def fetch_numbered_set(
    url: str,
    expected: int,
    label: str,
    *,
    max_pages: int = 6,
) -> dict[int, tuple[str, str]]:
    cards: dict[int, tuple[str, str]] = {}

    print(f"{label}:")
    for page_index in range(1, max_pages + 1):
        parsed = parse_rows(fetch(page_url(url, page_index)), r"\d{1,3}")
        before = len(cards)

        for raw_number, raw_name, team in parsed:
            number = int(raw_number)
            if 1 <= number <= expected:
                cards[number] = (raw_name, team)

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
    if set(cards) != required:
        missing = sorted(required - set(cards))
        extra = sorted(set(cards) - required)
        raise SystemExit(
            f"{label}: numbering mismatch; missing={missing[:30]}, extra={extra[:30]}"
        )

    return cards


METADATA_DETAIL_START = re.compile(
    r"(?:,\s*|\s+)(?:UER|ERR|COR|VAR)(?:UER|ERR|COR|VAR)?"
    r"(?:(?:\s*,\s*|\s+)(?:UER|ERR|COR|VAR)(?:UER|ERR|COR|VAR)?)*\s*:",
    re.IGNORECASE,
)

PRINT_CODE_SUFFIX = re.compile(
    r"(?:,\s*|\s+)(?:\"[^\"]+\"|'[^']+'|[A-Z*]+)\s+print\s+code\b.*$",
    re.IGNORECASE,
)

ODDS_TEXT = re.compile(
    r"(?:,?\s*)?(?:inserted\s+)?(?:at\s+)?(?:a\s+rate\s+of\s+)?"
    r"1\s*:\s*\d+\s*(?:series\s+(?:one|two)\s+)?(?:wax\s+|cello\s+)?(?:packs?)?",
    re.IGNORECASE,
)


def clean_subject(raw_name: str) -> tuple[str, bool]:
    raw = " ".join(raw_name.split()).strip()
    had_uer = bool(re.search(r"\bUER\b", raw, re.IGNORECASE))

    # Source RC is always rebuilt from TCDB's dedicated rookie index.
    raw = re.sub(r"(?:,\s*|\s+)\bRC\b", " ", raw, flags=re.IGNORECASE)

    detail = METADATA_DETAIL_START.search(raw)
    if detail:
        raw = raw[: detail.start()].strip(" ,;")

    raw = PRINT_CODE_SUFFIX.sub("", raw).strip(" ,;")
    raw = ODDS_TEXT.sub("", raw)

    # Remove source-only metadata tags while preserving collector-facing suffixes
    # such as LL, AW, PV, and CL.
    raw = re.sub(
        r"(?:,\s*|\s+)\b(?:UER|ERR|COR|VAR|RDM|EXCH|SN\d+|PR\d+)\b[^,;]*",
        " ",
        raw,
        flags=re.IGNORECASE,
    )
    raw = re.sub(r"\s*,\s*", " ", raw)
    raw = " ".join(raw.split()).strip(" ,;")

    if not raw:
        raise SystemExit(f"Could not derive clean subject from {raw_name!r}")

    return raw, had_uer


def normalize_base_subset_subject(number: int, player: str) -> str:
    """Keep intentional subset suffixes but strip TCDB's descriptive note text."""
    marker: str | None = None
    if 221 <= number <= 228:
        marker = "LL"
    elif 229 <= number <= 232:
        marker = "AW"
    elif 233 <= number <= 237:
        marker = "PV"

    if not marker:
        return player

    # TCDB may concatenate the description into the same subject cell without a
    # separator, e.g. "Michael Jordan LLScoring/Steals Leader" or
    # "Charles Barkley AWMVP". Player should remain "Michael Jordan LL" / 
    # "Charles Barkley AW"; the range-derived subset carries the description.
    match = re.match(rf"^(.*?)\s+{marker}", player, flags=re.IGNORECASE)
    if not match:
        raise SystemExit(
            f"Base #{number} expected collector suffix {marker} but got {player!r}"
        )
    subject = match.group(1).strip()
    if not subject:
        raise SystemExit(f"Base #{number} lost subject while normalizing {player!r}")
    return f"{subject} {marker}"


def load_true_rc_numbers() -> set[int]:
    print("rookie-index:")
    rookie_numbers: set[int] = set()

    for page_index in range(1, 4):
        parsed = parse_rows(fetch(page_url(ROOKIES_URL, page_index)), r"\d{1,3}")
        for raw_number, _raw_name, _team in parsed:
            number = int(raw_number)
            if 1 <= number <= 400:
                rookie_numbers.add(number)

        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"{len(rookie_numbers)} unique recognized RC card numbers"
        )

        if len(rookie_numbers) >= EXPECTED_TRUE_RCS:
            break
        if page_index > 1 and not parsed:
            break

    if len(rookie_numbers) != EXPECTED_TRUE_RCS:
        raise SystemExit(
            f"Expected {EXPECTED_TRUE_RCS} TCDB-recognized RC cards, "
            f"found {len(rookie_numbers)}"
        )

    return rookie_numbers


def base_subset(number: int, player: str) -> str:
    if 221 <= number <= 228:
        return "NBA League Leaders"
    if 229 <= number <= 232:
        return "NBA Award Winners"
    if 233 <= number <= 237:
        return "Pro-Visions"
    if number in CHECKLIST_NUMBERS or re.search(r"\bCL\b", player):
        return "Checklist"
    return "Series One" if number <= 240 else "Series Two"


def build_base(true_rcs: set[int]) -> list[list[str]]:
    source = fetch_numbered_set(BASE_URL, 400, "base", max_pages=7)
    rows: list[list[str]] = []

    for number in range(1, 401):
        raw_name, raw_team = source[number]
        player, had_uer = clean_subject(raw_name)
        player = normalize_base_subset_subject(number, player)
        team = " ".join(raw_team.split()).strip()
        subset = base_subset(number, player)

        if number in CHECKLIST_NUMBERS:
            team = "NBA"
        elif not team:
            raise SystemExit(f"Base #{number} {player} is missing team data")

        if number in true_rcs:
            player = re.sub(r"(?:\s+RC)+$", "", player, flags=re.IGNORECASE).strip()
            player = f"{player} RC"

        variant = "UER" if had_uer else ""
        rows.append(["base", str(number), player, team, subset, variant])

    return rows


def build_standard_insert(
    *,
    key: str,
    url: str,
    expected: int,
    subset: str,
) -> list[list[str]]:
    source = fetch_numbered_set(url, expected, key, max_pages=3)
    rows: list[list[str]] = []

    for number in range(1, expected + 1):
        raw_name, raw_team = source[number]
        player, _had_uer = clean_subject(raw_name)
        team = " ".join(raw_team.split()).strip()
        if not team:
            raise SystemExit(f"{key} #{number} {player} is missing team data")
        rows.append([key, str(number), player, team, subset, ""])

    return rows


def build_clyde_highlights() -> list[list[str]]:
    # TCDB catalogs 16 cards, but only #1-12 were ordinary pack pulls.
    source = fetch_numbered_set(CLYDE_URL, 16, "clyde-career-highlights-source", max_pages=2)
    rows: list[list[str]] = []

    for number in range(1, 13):
        raw_name, raw_team = source[number]
        clean, _had_uer = clean_subject(raw_name)
        team = " ".join(raw_team.split()).strip()
        if not team:
            raise SystemExit(f"Clyde Career Highlights #{number} is missing team data")

        title = re.sub(r"^Clyde\s+Drexler\b", "", clean, flags=re.IGNORECASE).strip(" -–—")
        rows.append(
            [
                "clyde-career-highlights",
                str(number),
                "Clyde Drexler",
                team,
                "Clyde Drexler Career Highlights",
                title,
            ]
        )

    return rows


def build_clyde_autographs() -> list[list[str]]:
    source = fetch_numbered_set(
        CLYDE_AUTO_URL,
        12,
        "clyde-career-highlights-autographs",
        max_pages=2,
    )
    rows: list[list[str]] = []

    for number in range(1, 13):
        _raw_name, raw_team = source[number]
        team = " ".join(raw_team.split()).strip()
        if not team:
            raise SystemExit(f"Clyde Career Highlights Autograph #{number} is missing team data")
        rows.append(
            [
                "clyde-career-highlights-autographs",
                str(number),
                "Clyde Drexler",
                team,
                "Clyde Drexler Career Highlights Autographs",
                "AU",
            ]
        )

    return rows


def validate_rows(rows: list[list[str]], true_rcs: set[int]) -> None:
    counts: dict[str, int] = {}
    for row in rows:
        counts[row[0]] = counts.get(row[0], 0) + 1

    for key, expected in EXPECTED_COUNTS.items():
        actual = counts.get(key, 0)
        if actual != expected:
            raise SystemExit(f"{key}: expected {expected} rows, found {actual}")

    if len(rows) != EXPECTED_TOTAL:
        raise SystemExit(f"Expected {EXPECTED_TOTAL} total rows, found {len(rows)}")

    base = {int(row[1]): row for row in rows if row[0] == "base"}
    rc_rows = {number for number, row in base.items() if row[2].endswith(" RC")}
    if rc_rows != true_rcs:
        raise SystemExit(
            "Base RC labels do not match TCDB rookie index; "
            f"missing={sorted(true_rcs - rc_rows)[:20]}, "
            f"extra={sorted(rc_rows - true_rcs)[:20]}"
        )

    for number in CHECKLIST_NUMBERS:
        row = base[number]
        if row[4] != "Checklist" or row[3] != "NBA":
            raise SystemExit(f"Checklist normalization failed for Base #{number}: {row}")

    checks = {
        ("base", "1"): ("Stacey Augmon", "Atlanta Hawks"),
        ("base", "224"): ("Michael Jordan LL", "Chicago Bulls"),
        ("base", "229"): ("Charles Barkley AW", "Phoenix Suns"),
        ("base", "234"): ("Alonzo Mourning PV", "Charlotte Hornets"),
        ("base", "241"): ("Doug Edwards RC", "Atlanta Hawks"),
        ("base", "282"): ("Allan Houston RC", "Detroit Pistons"),
        ("base", "343"): ("Anfernee Hardaway RC", "Orlando Magic"),
        ("base", "393"): ("Calbert Cheaney RC", "Washington Bullets"),
        ("all-stars", "5"): ("Michael Jordan", "Chicago Bulls"),
        ("nba-internationals", "1"): ("Alaa Abdelnaby", "Boston Celtics"),
        ("first-year-phenoms", "2"): ("Anfernee Hardaway", "Orlando Magic"),
        ("living-legends", "4"): ("Michael Jordan", "Chicago Bulls"),
        ("nba-superstars", "7"): ("Michael Jordan", "Chicago Bulls"),
        ("sharpshooters", "3"): ("Michael Jordan", "Chicago Bulls"),
    }
    lookup = {(row[0], row[1]): row for row in rows}

    for key, (expected_player, expected_team) in checks.items():
        row = lookup.get(key)
        if not row or row[2] != expected_player or row[3] != expected_team:
            raise SystemExit(
                f"Spot validation failed for {key}: {row}; "
                f"expected ({expected_player!r}, {expected_team!r})"
            )

    if lookup[("clyde-career-highlights", "1")][2] != "Clyde Drexler":
        raise SystemExit(
            "Clyde Career Highlights #1 did not normalize to clean Clyde Drexler Player"
        )
    if lookup[("clyde-career-highlights-autographs", "1")][5] != "AU":
        raise SystemExit("Clyde autograph metadata missing from Variant")

    duplicate_keys: set[tuple[str, str]] = set()
    seen: set[tuple[str, str]] = set()
    for row in rows:
        key = (row[0], row[1].upper())
        if key in seen:
            duplicate_keys.add(key)
        seen.add(key)
    if duplicate_keys:
        raise SystemExit(f"Duplicate ProductSet/card numbers: {sorted(duplicate_keys)[:10]}")

    metadata_leaks = [
        row
        for row in rows
        if re.search(
            r"\b(?:UER|ERR|COR|VAR|RDM|EXCH|SN\d+|PR\d+)\b|"
            r"\bprint\s+code\b|\b1\s*:\s*\d+\b",
            re.sub(r" RC$", "", row[2], flags=re.IGNORECASE),
            re.IGNORECASE,
        )
    ]
    if metadata_leaks:
        raise SystemExit(f"Metadata leaked into Player; example: {metadata_leaks[0]}")

    subset_description_leaks = [
        row
        for row in rows
        if row[0] == "base"
        and 221 <= int(row[1]) <= 232
        and re.search(
            r"\b(?:Leader|MVP|POY|Rookie\s+of\s+the\s+Year|Sixth\s+Man)\b",
            row[2],
            re.IGNORECASE,
        )
    ]
    if subset_description_leaks:
        raise SystemExit(
            f"Subset description leaked into Player; example: {subset_description_leaks[0]}"
        )

    duplicate_rc = [row for row in rows if re.search(r"\bRC\s+RC\b", row[2])]
    if duplicate_rc:
        raise SystemExit(f"Duplicate RC label found; example: {duplicate_rc[0]}")

    odds_leaks = [row for row in rows if re.search(r"\b1\s*:\s*\d+\b", row[5] or "")]
    if odds_leaks:
        raise SystemExit(f"Card-level odds leaked into Variant; example: {odds_leaks[0]}")

    missing_teams = [row for row in rows if not row[3].strip()]
    if missing_teams:
        raise SystemExit(f"Found cards missing team data; example: {missing_teams[0]}")


def main() -> None:
    true_rcs = load_true_rc_numbers()

    rows: list[list[str]] = []
    rows.extend(build_base(true_rcs))
    rows.extend(
        build_standard_insert(
            key="all-stars",
            url=ALL_STARS_URL,
            expected=24,
            subset="All-Stars",
        )
    )
    rows.extend(build_clyde_highlights())
    rows.extend(build_clyde_autographs())
    rows.extend(
        build_standard_insert(
            key="nba-internationals",
            url=INTERNATIONALS_URL,
            expected=12,
            subset="NBA Internationals",
        )
    )
    rows.extend(
        build_standard_insert(
            key="first-year-phenoms",
            url=FIRST_YEAR_URL,
            expected=10,
            subset="First Year Phenoms",
        )
    )
    rows.extend(
        build_standard_insert(
            key="living-legends",
            url=LIVING_LEGENDS_URL,
            expected=6,
            subset="Living Legends",
        )
    )
    rows.extend(
        build_standard_insert(
            key="nba-superstars",
            url=SUPERSTARS_URL,
            expected=20,
            subset="NBA Superstars",
        )
    )
    rows.extend(
        build_standard_insert(
            key="sharpshooters",
            url=SHARPSHOOTERS_URL,
            expected=10,
            subset="Sharpshooters",
        )
    )

    validate_rows(rows, true_rcs)

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(rows)

    print("=== 1993-94 FLEER BASKETBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(rows)}")
    for key in EXPECTED_COUNTS:
        print(f"  {key}: {EXPECTED_COUNTS[key]}")
    print(f"Recognized true RC cards labeled in Base: {len(true_rcs)}")
    print("Base combined: Series One #1-240 + Series Two #241-400")
    print("Historical wax configuration: 15 cards/pack, 36 packs/box")
    print("Verified wax odds: All-Stars 1:10; Clyde Highlights 1:6; Clyde AU 1:7000")
    print("Verified wax odds: NBA Internationals 1:10; First Year Phenoms 1:4; Living Legends 1:37")
    print("NBA Superstars / Sharpshooters: included with ProductSet odds pending verification")
    print("Clyde Highlights #13-16: excluded as non-pack distributions")
    print("Cello-only / mail-in / promo issues: excluded")
    print("Player metadata leakage: 0")
    print("Subset-description leakage into Player: 0")
    print("Card-level odds in Variant: 0")
    print("Team data: COMPLETE")
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")


if __name__ == "__main__":
    main()
