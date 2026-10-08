from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1973-topps-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/73/1973-Topps"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/73/1973-Topps"
TEAM_CHECKLISTS_URL = "https://www.tcdb.com/Checklist.cfm/sid/33471/1973-Topps-Team-Checklists"

BASE_EXPECTED = 660
TEAM_CHECKLISTS_EXPECTED = 24
TRUE_RC_CARD_EXPECTED = 57
TRUE_RC_PLAYER_LABEL_EXPECTED = 77
EXPECTED_TOTAL = BASE_EXPECTED + TEAM_CHECKLISTS_EXPECTED

# TCDB's current rookie notes identify these player-specific exceptions on the
# multi-player Rookie cards. Cards omitted from this mapping are ordinary
# single-subject RCs; multi-player cards listed here receive RC only for the
# players TCDB recognizes as true rookies.
MULTI_PLAYER_TRUE_RCS: dict[int, tuple[str, ...]] = {
    601: ("Sergio Robles", "George Pena"),
    602: ("Ralph Garcia", "Doug Rau"),
    603: ("Terry Hughes", "Bill McNulty", "Ken Reitz"),
    604: ("Jesse Jefferson", "Dennis O'Toole", "Bob Strampe"),
    605: ("Enos Cabell", "Pat Bourque"),
    606: ("Gary Matthews",),
    607: ("Pepe Frias", "Mario Guerrero"),
    608: ("Steve Busby", "Dick Colpaert", "George Medich"),
    609: ("Larvell Blanks", "Pedro Garcia", "Dave Lopes"),
    610: ("Jimmy Freeman", "Hank Webb"),
    611: ("Rich Coggins", "Jim Wohlford"),
    612: ("Steve Lawson", "Brent Strom"),
    613: ("Bob Boone", "Skip Jutze"),
    614: ("Alonza Bumbry", "Dwight Evans", "Charlie Spikes"),
    615: ("John Hilton", "Mike Schmidt"),
    616: ("Norm Angelini", "Steve Blateric"),
}

# TCDB displays these unnumbered insert cards in this order. VCS needs unique
# card numbers within a ProductSet, so we assign deterministic NNO-01...NNO-24
# identifiers. These are VCS identifiers, not printed card numbers.
TEAM_CHECKLIST_ORDER = [
    "Atlanta Braves",
    "Baltimore Orioles",
    "Boston Red Sox",
    "California Angels",
    "Chicago Cubs",
    "Chicago White Sox",
    "Cincinnati Reds",
    "Cleveland Indians",
    "Detroit Tigers",
    "Houston Astros",
    "Kansas City Royals",
    "Los Angeles Dodgers",
    "Milwaukee Brewers",
    "Minnesota Twins",
    "Montreal Expos",
    "New York Mets",
    "New York Yankees",
    "Oakland Athletics",
    "Philadelphia Phillies",
    "Pittsburgh Pirates",
    "St. Louis Cardinals",
    "San Diego Padres",
    "San Francisco Giants",
    "Texas Rangers",
]


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

            # TCDB variation/error notes can occupy cells between subject and team.
            # The final populated cell is the stable team value for numbered cards.
            team = vals[-1].strip() if i + 2 < len(vals) else ""
            if team == raw_name or re.match(r"^(?:VAR|ERR|COR|UER):", team, re.I):
                team = ""

            found.append((number, raw_name, team))
            break

    return found


def fetch_rows(
    url: str,
    number_pattern: str,
    label: str,
    *,
    max_pages: int,
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
            f"+{added}; unique source records {len(rows)}"
        )

        if page_index > 1 and (not parsed or added == 0):
            break

    return rows


SOURCE_NOTE_TAIL = re.compile(
    r"(?:\s+|,\s*)(?:UER|ERR|COR|VAR)(?:UER|ERR|COR|VAR)?"
    r"\s*(?::\s*.*)?$",
    re.IGNORECASE,
)

SOURCE_RC_NOTE = re.compile(r"\s+RC\s+for\s+.+?\s+only\s*$", re.IGNORECASE)

SOURCE_TAG = re.compile(
    r"(?:^|[\s,;])(?:RC|ROO|UER|ERR|COR|VAR|CL|MGR|CO|TC|LL|ATL|ALCS|NLCS|LCS|BP|ASR|AS|WS)"
    r"(?=$|[\s,;:])",
    re.IGNORECASE,
)


def clean_subject(raw_name: str) -> str:
    raw = " ".join(raw_name.split()).strip()

    # TCDB sometimes merges its RC label and ERR/COR annotation into one
    # string (e.g. "Jimmy Howarth RCERR: Gaps in borders"). Strip the whole
    # annotation; legitimate RC labels are reapplied from the rookie index.
    raw = re.sub(
        r"\s+RC(?:ERR|COR|UER|VAR)(?=\s*:|\s|$)",
        " ",
        raw,
        flags=re.IGNORECASE,
    ).strip(" ,;")
    raw = SOURCE_RC_NOTE.sub("", raw).strip(" ,;")
    while True:
        cleaned = SOURCE_NOTE_TAIL.sub("", raw).strip(" ,;")
        if cleaned == raw:
            break
        raw = cleaned

    # Remove source annotations from display-facing Player. Subset classification
    # happens from the uncleaned source string before this function is called.
    while True:
        cleaned = SOURCE_TAG.sub(" ", raw)
        cleaned = re.sub(r"\s*,\s*", " ", cleaned)
        cleaned = " ".join(cleaned.split()).strip(" ,;")
        if cleaned == raw:
            break
        raw = cleaned

    if not raw:
        raise SystemExit(f"Could not derive clean subject from {raw_name!r}")
    return raw


def canonical_base_number(raw_number: str) -> int:
    match = re.fullmatch(r"(\d{1,3})(?:[A-Z])?", raw_number.strip(), re.IGNORECASE)
    if not match:
        raise SystemExit(f"Unexpected base card number {raw_number!r}")
    return int(match.group(1))


def classify_base_subset(number: int, raw_name: str, clean_name: str) -> str:
    raw = raw_name.upper()

    if number == 1:
        return "All-Time Leaders"
    if 61 <= number <= 68:
        return "League Leaders"
    if 201 <= number <= 202:
        return "League Championship Series"
    if 203 <= number <= 210:
        return "World Series"
    if 341 <= number <= 346:
        return "Boyhood Photos"
    if 471 <= number <= 478:
        return "All-Time Leaders"
    if 601 <= number <= 616:
        return "Rookie Prospects"
    if clean_name.lower().startswith("checklist"):
        return "Checklist"
    if re.search(r"(?:^|[\s,])TC(?:$|[\s,])", raw):
        return "Team Card"
    if "FIELD LEADERS" in raw:
        return "Field Leaders"
    if re.search(r"(?:^|[\s,])MGR(?:$|[\s,])", raw):
        return "Manager"
    if re.search(r"(?:^|[\s,])ASR(?:$|[\s,])", raw):
        return "All-Star Rookie"
    return ""


def load_true_rc_numbers() -> set[int]:
    rows = fetch_rows(
        ROOKIES_URL,
        r"\d{1,3}",
        "rookie-index",
        max_pages=4,
    )
    rc_numbers = {
        int(number)
        for number, _name, _team in rows
        if number.isdigit() and 1 <= int(number) <= BASE_EXPECTED
    }

    if len(rc_numbers) != TRUE_RC_CARD_EXPECTED:
        raise SystemExit(
            "1973 Topps rookie index changed; "
            f"expected {TRUE_RC_CARD_EXPECTED} unique card numbers, "
            f"found {len(rc_numbers)}: {sorted(rc_numbers)}"
        )

    expected_multi = set(MULTI_PLAYER_TRUE_RCS)
    if not expected_multi.issubset(rc_numbers):
        raise SystemExit(
            "1973 Topps multi-player rookie index changed; missing expected cards "
            f"{sorted(expected_multi - rc_numbers)}"
        )

    print(
        f"Rookie index: {len(rows)} source records; "
        f"{len(rc_numbers)} unique recognized RC card numbers"
    )
    return rc_numbers


def apply_true_rc_labels(
    number: int,
    clean_name: str,
    true_rc_numbers: set[int],
) -> str:
    if number not in true_rc_numbers:
        return clean_name

    selected = MULTI_PLAYER_TRUE_RCS.get(number)
    if selected is None:
        return f"{clean_name} RC"

    match = re.fullmatch(r"(.+?)\s*\((.+)\)", clean_name)
    if not match:
        raise SystemExit(
            f"Expected multi-player parenthetical subject for RC card #{number}: "
            f"{clean_name!r}"
        )

    prefix, names_blob = match.groups()
    names = [name.strip() for name in names_blob.split("/") if name.strip()]
    selected_set = set(selected)
    missing = selected_set - set(names)
    if missing:
        raise SystemExit(
            f"RC player mapping mismatch for #{number}: missing {sorted(missing)} "
            f"from parsed names {names}"
        )

    labeled = [
        f"{name} RC" if name in selected_set else name
        for name in names
    ]
    return f"{prefix.strip()} ({' / '.join(labeled)})"


def build_base_rows(true_rc_numbers: set[int]) -> list[list[str]]:
    source_rows = fetch_rows(
        BASE_URL,
        r"\d{1,3}[A-Z]?",
        "base",
        max_pages=10,
    )

    grouped: dict[int, list[tuple[str, str, str]]] = {}
    for raw_number, raw_name, raw_team in source_rows:
        number = canonical_base_number(raw_number)
        if not (1 <= number <= BASE_EXPECTED):
            continue

        player = clean_subject(raw_name)
        team = " ".join(raw_team.split()).strip()
        grouped.setdefault(number, []).append((player, team, raw_name))

    required = set(range(1, BASE_EXPECTED + 1))
    actual = set(grouped)
    if actual != required:
        missing = sorted(required - actual)
        extra = sorted(actual - required)
        raise SystemExit(
            f"Base numbering mismatch; missing={missing[:30]}, extra={extra[:30]}"
        )

    rows: list[list[str]] = []
    for number in range(1, BASE_EXPECTED + 1):
        records = grouped[number]

        players = {player for player, _team, _raw in records}
        teams = {team for _player, team, _raw in records if team}
        if len(players) != 1:
            raise SystemExit(
                f"Base #{number} variations do not collapse to one subject: "
                f"{sorted(players)}"
            )
        if len(teams) > 1:
            raise SystemExit(
                f"Base #{number} variations do not collapse to one team value: "
                f"{sorted(teams)}"
            )

        clean_name = next(iter(players))
        team = next(iter(teams)) if teams else ""
        raw_name = records[0][2]
        subset = classify_base_subset(number, raw_name, clean_name)
        player = apply_true_rc_labels(number, clean_name, true_rc_numbers)

        if not team and subset != "Checklist":
            raise SystemExit(f"Base #{number} {player} is missing team data")

        rows.append(["base", str(number), player, team, subset, ""])

    return rows


def build_team_checklist_rows() -> list[list[str]]:
    source_rows = fetch_rows(
        TEAM_CHECKLISTS_URL,
        r"NNO",
        "team-checklists",
        max_pages=2,
    )

    by_team: dict[str, str] = {}
    for _number, raw_name, _raw_team in source_rows:
        team = clean_subject(raw_name)
        if team.lower().endswith(" team checklist"):
            team = team[: -len(" team checklist")].strip()
        if team in by_team:
            continue
        by_team[team] = raw_name

    expected = set(TEAM_CHECKLIST_ORDER)
    actual = set(by_team)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise SystemExit(
            "Team Checklists source changed; "
            f"missing={missing}, extra={extra}, sourceRows={len(source_rows)}"
        )

    rows: list[list[str]] = []
    for index, team in enumerate(TEAM_CHECKLIST_ORDER, start=1):
        rows.append(
            [
                "team-checklists",
                f"NNO-{index:02d}",
                f"{team} Team Checklist",
                team,
                "Team Checklist",
                "",
            ]
        )
    return rows


def validate_rows(rows: list[list[str]]) -> None:
    if len(rows) != EXPECTED_TOTAL:
        raise SystemExit(
            f"Expected {EXPECTED_TOTAL} explicit rows, found {len(rows)}"
        )

    by_set: dict[str, set[str]] = {}
    for row in rows:
        by_set.setdefault(row[0], set())
        if row[1] in by_set[row[0]]:
            raise SystemExit(f"Duplicate card number in {row[0]}: {row[1]}")
        by_set[row[0]].add(row[1])

    if len(by_set.get("base", set())) != BASE_EXPECTED:
        raise SystemExit("Base row count validation failed")
    if len(by_set.get("team-checklists", set())) != TEAM_CHECKLISTS_EXPECTED:
        raise SystemExit("Team Checklists row count validation failed")

    metadata_leaks = [
        row
        for row in rows
        if re.search(
            r"(?:^|[\s,;])(?:UER|ERR|COR|VAR|CL|MGR|CO|TC|LL|ATL|ALCS|NLCS|LCS|BP|ASR|AS|WS)"
            r"(?=$|[\s,;:])",
            row[2],
            re.IGNORECASE,
        )
    ]
    if metadata_leaks:
        raise SystemExit(
            f"Collector metadata leaked into Player; example: {metadata_leaks[0]}"
        )

    variant_rows = [row for row in rows if row[5].strip()]
    if variant_rows:
        raise SystemExit(
            f"Variation/error metadata should not be modeled; example: {variant_rows[0]}"
        )

    rc_label_count = sum(
        len(re.findall(r"\bRC\b", row[2]))
        for row in rows
        if row[0] == "base"
    )
    if rc_label_count != TRUE_RC_PLAYER_LABEL_EXPECTED:
        raise SystemExit(
            f"Expected {TRUE_RC_PLAYER_LABEL_EXPECTED} player-level RC labels, "
            f"found {rc_label_count}"
        )

    # Critical multi-player rookie checks.
    lookup = {(row[0], row[1]): row for row in rows}
    schmidt = lookup[("base", "615")][2]
    if (
        "Ron Cey RC" in schmidt
        or "John Hilton RC" not in schmidt
        or "Mike Schmidt RC" not in schmidt
    ):
        raise SystemExit(f"Base #615 rookie labeling failed: {schmidt!r}")

    hough = lookup[("base", "610")][2]
    if (
        "Charlie Hough RC" in hough
        or "Jimmy Freeman RC" not in hough
        or "Hank Webb RC" not in hough
    ):
        raise SystemExit(f"Base #610 rookie labeling failed: {hough!r}")


def main() -> None:
    true_rc_numbers = load_true_rc_numbers()
    base_rows = build_base_rows(true_rc_numbers)
    team_checklist_rows = build_team_checklist_rows()
    all_rows = base_rows + team_checklist_rows

    validate_rows(all_rows)

    DATA.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(
            ["setKey", "cardNumber", "player", "team", "subset", "variant"]
        )
        writer.writerows(all_rows)

    print("=== 1973 TOPPS BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    print(f"  base: {len(base_rows)}")
    print(f"  team-checklists: {len(team_checklist_rows)}")
    print(
        f"Recognized true RC cards: {len(true_rc_numbers)}; "
        f"player-level RC labels: {TRUE_RC_PLAYER_LABEL_EXPECTED}"
    )
    print("Five physical base series: COMBINED into one equal-availability Base pool")
    print("Base ERR/COR/UER/VAR print records: COLLAPSED to card #1-660")
    print("Team Checklist one-star/two-star backs: COLLAPSED")
    print("Team Checklist pack odds: UNSET (limited Series Five/test distribution)")
    print("Card-level Variant text: 0")
    print("Team data: COMPLETE (base checklist-card exception allowed)")
    print("Expected Product Sets: 2")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")


if __name__ == "__main__":
    main()
